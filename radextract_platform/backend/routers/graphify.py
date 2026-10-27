"""Graphify web integration API router.

Serves two graph types:
1. Code graph (for developers): serves the Graphify code-dependency graph from graphify-out/graph.json
   with explicit path precedence, snapshot metadata, file-identity cache invalidation,
   full-corpus community aggregation, neighborhood/path exploration, and verified workflow node mapping.
2. Review data graph (for researchers): builds a live graph from the database showing review data structure.

Endpoints:
  GET /api/graphify/code/graph            – filtered/paginated code graph with full-corpus & snapshot metadata
  GET /api/graphify/code/stats            – full-corpus code graph statistics & snapshot metadata
  GET /api/graphify/code/communities      – full-corpus community overview & inter-community links (no node cap)
  GET /api/graphify/code/file             – subgraph for a source file (query: path, limit, offset, include_neighbors)
  GET /api/graphify/code/community        – subgraph for a community (query: id, limit, offset, include_neighbors)
  GET /api/graphify/code/neighborhood     – ego-network subgraph around a node across the full corpus
  GET /api/graphify/code/path             – shortest verified relationship path between two nodes across the full corpus
  GET /api/graphify/code/workflow-mapping – maps Mermaid workflow overview nodes to verified Graphify symbols/files
  GET /api/projects/{project_id}/graphify/review/graph – review data graph
  GET /api/projects/{project_id}/graphify/review/stats – review graph statistics
"""
from __future__ import annotations

from collections import Counter, deque
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.params import Param

try:
    from database import get_db
    from services.db_backend import DBBackend
    from dependencies import get_current_user_optional, check_project_access
except ImportError:  # Allows standalone router unit testing outside full backend package
    def get_db():  # type: ignore[misc]
        return None

    class DBBackend:  # type: ignore[no-redef]
        pass

    def get_current_user_optional():  # type: ignore[misc]
        return None

    def check_project_access(project_id: str, user: Any, conn: Any) -> None:
        return None

router = APIRouter(prefix="/api", tags=["graphify"])


def _unwrap_param(value: Any, default: Any = None) -> Any:
    """Unwrap FastAPI Query/Param objects when endpoint functions are invoked directly in Python tests."""
    if isinstance(value, Param):
        return default if value.default is ... else value.default
    return value


# -- Code Graph Configuration & Snapshot Cache --------------------------------

_DEFAULT_GRAPH_PATH = (
    Path(__file__).resolve().parent.parent.parent.parent / "graphify-out" / "graph.json"
)
_FALLBACK_RELATIVE_GRAPH_PATH = Path("graphify-out/graph.json")

# Maintain backward-compatible module attribute for existing callers/tests
_GRAPH_PATH = _DEFAULT_GRAPH_PATH
_GRAPH_CACHE: Optional[dict] = None
_SNAPSHOT_STATE: Optional[Dict[str, Any]] = None

# Verified workflow node mapping targets (never invents edges; checks live snapshot)
WORKFLOW_NODE_TARGETS: Dict[str, Dict[str, Any]] = {
    "P": {
        "title": "Upload existing protocol",
        "status": "implemented",
        "candidate_terms": ["protocol", "upload_protocol", "ProtocolUpload"],
        "description": "Protocol document intake endpoint and upload handler.",
    },
    "PE": {
        "title": "Protocol parser (Section/pattern extraction + LLM fallback)",
        "status": "implemented",
        "candidate_terms": ["protocol_parser", "parse_protocol", "extract_protocol"],
        "description": "Extracts PICO and exclusion rules using section/pattern matching with LLM fallback.",
    },
    "C": {
        "title": "Editable project PICO and exclusion settings",
        "status": "implemented",
        "candidate_terms": ["pico", "criteria", "exclusion", "project_settings"],
        "description": "Project-level PICO and eligibility configuration stored in database.",
    },
    "R": {
        "title": "Import references or fetch literature",
        "status": "implemented",
        "candidate_terms": ["import_references", "literature", "ris", "pubmed"],
        "description": "Reference import and literature retrieval pipeline.",
    },
    "D": {
        "title": "Duplicate detection (DOI, PMID, title and author/year)",
        "status": "implemented",
        "candidate_terms": ["dedup", "duplicate", "find_duplicates"],
        "description": "Automated duplicate matching across DOI, PMID, normalized title, and author/year.",
    },
    "DR": {
        "title": "Reviewer duplicate resolution",
        "status": "implemented",
        "candidate_terms": ["resolve_duplicate", "duplicate_resolution", "merge_studies"],
        "description": "Reviewer actions to keep, merge, keep both, or revert duplicate pairs.",
    },
    "S": {
        "title": "Multi-stage screening service",
        "status": "implemented",
        "candidate_terms": ["AIScreeningPipeline", "jev_screener", "screening"],
        "description": "Coordinates multi-stage title, abstract, and full-text screening.",
    },
    "T": {
        "title": "Title screening",
        "status": "implemented",
        "candidate_terms": ["AIScreeningPipeline", "jev_screener", "screen_title"],
        "description": "First-stage title eligibility evaluation.",
    },
    "A": {
        "title": "Abstract screening",
        "status": "implemented",
        "candidate_terms": ["AIScreeningPipeline", "jev_screener", "screen_abstract"],
        "description": "Second-stage abstract eligibility evaluation for pending/uncertain records.",
    },
    "F": {
        "title": "Full-text screening",
        "status": "implemented",
        "candidate_terms": ["AIScreeningPipeline", "jev_screener", "full_text"],
        "description": "Eligible stage and full-text document eligibility verification.",
    },
    "E": {
        "title": "Screening engine routing",
        "status": "implemented",
        "candidate_terms": ["jev_screener", "jev_client", "AIScreeningPipeline"],
        "description": "Routes screening requests to local Laya ONNX or configured provider fallback.",
    },
    "L": {
        "title": "Local Laya ONNX",
        "status": "implemented",
        "candidate_terms": ["LayaModel", "jev_client", "jev_screener"],
        "description": "Intended primary local ONNX screening model when configured.",
    },
    "O": {
        "title": "Other configured provider or LLM fallback",
        "status": "implemented",
        "candidate_terms": ["jev_client", "llm", "provider"],
        "description": "Configured secondary provider or LLM fallback path.",
    },
    "J": {
        "title": "Composed recommendation (Include, exclude or uncertain)",
        "status": "implemented",
        "candidate_terms": ["jev_screener", "AIScreeningPipeline", "recommendation"],
        "description": "Aggregates criterion-level judgments into an overall screening recommendation.",
    },
    "H": {
        "title": "Reviewer decisions and clarification answers",
        "status": "implemented",
        "candidate_terms": ["screening_decision", "reviewer_decision", "clarification"],
        "description": "Human reviewer override, confirmation, and clarification persistence.",
    },
    "PDF": {
        "title": "Upload or retrieve full text",
        "status": "implemented",
        "candidate_terms": ["pdf", "fulltext", "upload_pdf"],
        "description": "Full-text PDF upload and retrieval management.",
    },
    "DP": {
        "title": "PDF parsing (Docling or fallback)",
        "status": "implemented",
        "candidate_terms": ["docling", "pdf_parser", "parse_pdf"],
        "description": "Extracts structured text and tables from PDFs via Docling or fallback parser.",
    },
    "X": {
        "title": "Extraction service (Configured generator and rules)",
        "status": "implemented",
        "candidate_terms": ["coded_extraction_service", "extraction_service", "extract"],
        "description": "Runs structured data extraction using configured generator and rules.",
    },
    "V": {
        "title": "Quote and value checks (Laya evidence tracing)",
        "status": "implemented",
        "candidate_terms": ["laya_extraction_tracer", "evidence_tracer", "trace_evidence"],
        "description": "Verifies extracted quotes and values against source text with local Laya tracing.",
    },
    "HR": {
        "title": "Reviewer edits and verification",
        "status": "implemented",
        "candidate_terms": ["extractions", "verify_extraction", "update_extraction"],
        "description": "Reviewer manual edits and verification of extracted study values.",
    },
    "DB": {
        "title": "Project database",
        "status": "implemented",
        "candidate_terms": ["db_backend", "database", "DBBackend"],
        "description": "Persistent relational store for records, decisions, documents, and extractions.",
    },
    "RB": {
        "title": "Risk-of-bias assessment",
        "status": "implemented",
        "candidate_terms": ["risk_of_bias", "rob", "appraisal"],
        "description": "Reviewer or optional batch risk-of-bias assessment workflow.",
    },
    "AN": {
        "title": "Analysis and synthesis actions",
        "status": "implemented",
        "candidate_terms": ["meta_analysis", "synthesis", "analysis"],
        "description": "Quantitative meta-analysis and qualitative synthesis services.",
    },
    "PR": {
        "title": "PRISMA counting services",
        "status": "implemented",
        "candidate_terms": ["prisma2020_sync", "prisma", "prisma_counts"],
        "description": "Synchronizes screening and study counts into PRISMA 2020 flow metrics.",
    },
    "EX": {
        "title": "Diagrams and exports",
        "status": "implemented",
        "candidate_terms": ["prisma2020_sync", "export", "report"],
        "description": "Generates PRISMA flow diagrams and study data exports.",
    },
    "API": {
        "title": "Existing Graphify API (Graph, stats, file, community)",
        "status": "implemented",
        "candidate_terms": ["routers/graphify.py", "get_code_graph", "get_code_graph_stats"],
        "description": "FastAPI router serving persistent Graphify snapshots and community drill-down.",
    },
    "UI": {
        "title": "Dependency graph view (Community overview and drill-down)",
        "status": "implemented",
        "candidate_terms": ["CodeGraphPage.tsx", "CodeGraphPage"],
        "description": "Frontend interactive code graph explorer and workflow overview.",
    },
    "SL": {
        "title": "Planned: optional SLIDERS adapter",
        "status": "planned",
        "candidate_terms": ["sliders_adapter", "SLIDERS"],
        "description": "Planned optional adapter; requires clinical benchmark before adoption.",
    },
    "VR": {
        "title": "Planned: versioned approved criteria",
        "status": "planned",
        "candidate_terms": ["versioned_criteria", "reusable_reviewer_interpretations"],
        "description": "Planned versioning for approved criteria and reusable reviewer interpretations.",
    },
    "IH": {
        "title": "Planned: real Import History and source-column duplicate matrix",
        "status": "planned",
        "candidate_terms": ["import_history_matrix", "source_column_duplicate_matrix"],
        "description": "Planned import batch tracking and cross-source duplicate matrix.",
    },
}


def reset_graph_cache() -> None:
    """Clear in-memory graph cache (used by tests and explicit cache reset)."""
    global _GRAPH_CACHE, _SNAPSHOT_STATE
    _GRAPH_CACHE = None
    _SNAPSHOT_STATE = None


def _resolve_graph_path() -> Tuple[Path, str]:
    """Resolve graph.json path with explicit RADEXTRACT_GRAPH_PATH precedence.

    Precedence:
    1. If RADEXTRACT_GRAPH_PATH is explicitly set in the environment (non-empty),
       use it exclusively. Do NOT silently ignore a supplied path by falling back
       to _GRAPH_PATH when RADEXTRACT_GRAPH_PATH is missing on disk.
    2. Otherwise, check _GRAPH_PATH (default repo location).
    3. Otherwise, check relative 'graphify-out/graph.json'.
    """
    env_raw = os.environ.get("RADEXTRACT_GRAPH_PATH", "").strip()
    if env_raw:
        env_path = Path(env_raw).expanduser()
        if not env_path.exists():
            raise FileNotFoundError(
                f"Configured RADEXTRACT_GRAPH_PATH does not exist: {env_path}"
            )
        return env_path.resolve(), "env:RADEXTRACT_GRAPH_PATH"

    if _GRAPH_PATH.exists():
        return _GRAPH_PATH.resolve(), "default"

    if _FALLBACK_RELATIVE_GRAPH_PATH.exists():
        return _FALLBACK_RELATIVE_GRAPH_PATH.resolve(), "relative_fallback"

    raise FileNotFoundError(
        f"Graph file not found at default path {_GRAPH_PATH} or {_FALLBACK_RELATIVE_GRAPH_PATH}. "
        "Set RADEXTRACT_GRAPH_PATH to the deployed graph.json location."
    )


def _normalize_link_provenance(link: Dict[str, Any]) -> str:
    """Determine whether a relationship is extracted or inferred."""
    prov = str(link.get("provenance") or link.get("confidence") or "").lower()
    if prov in ("inferred", "heuristic", "indirect"):
        return "inferred"
    if link.get("inferred") is True:
        return "inferred"
    if str(link.get("relation", "")).lower() in ("indirect_call", "inferred_call"):
        return "inferred"
    return "extracted"


def _compute_snapshot_metadata(
    graph: dict,
    resolved_path: Path,
    path_source: str,
    mtime_ns: int,
    file_size: int,
    freshness_status: str = "fresh",
    stale_reason: Optional[str] = None,
) -> Dict[str, Any]:
    """Build deterministic snapshot metadata shared by graph and stats endpoints."""
    nodes = graph.get("nodes", [])
    links = graph.get("links", [])
    built_at_commit = graph.get("built_at_commit") or graph.get("commit") or "unknown"
    schema_version = str(graph.get("schema_version") or graph.get("version") or "1.0")

    fingerprint_input = f"{resolved_path}|{mtime_ns}|{file_size}|{built_at_commit}|{len(nodes)}|{len(links)}"
    snapshot_id = hashlib.sha256(fingerprint_input.encode("utf-8")).hexdigest()[:16]
    file_mtime_iso = datetime.fromtimestamp(
        mtime_ns / 1_000_000_000, tz=timezone.utc
    ).isoformat()

    return {
        "snapshot_id": snapshot_id,
        "built_at_commit": built_at_commit,
        "schema_version": schema_version,
        "file_mtime": file_mtime_iso,
        "file_size_bytes": file_size,
        "graph_path_source": path_source,
        "freshness_status": freshness_status,
        "stale_reason": stale_reason,
        "corpus_total_nodes": len(nodes),
        "corpus_total_links": len(links),
    }


def _load_graph_with_metadata(allow_stale_on_error: bool = False) -> Tuple[dict, Dict[str, Any]]:
    """Load and cache graph.json keyed by file identity (path, mtime_ns, size).

    Automatically invalidates and reloads when the underlying file changes after
    `graphify update` without requiring an API server restart.
    """
    global _GRAPH_CACHE, _SNAPSHOT_STATE

    try:
        resolved_path, path_source = _resolve_graph_path()
        stat_result = resolved_path.stat()
        file_key = (str(resolved_path), stat_result.st_mtime_ns, stat_result.st_size)
    except FileNotFoundError as exc:
        if allow_stale_on_error and _GRAPH_CACHE is not None and _SNAPSHOT_STATE is not None:
            stale_meta = dict(_SNAPSHOT_STATE["metadata"])
            stale_meta["freshness_status"] = "stale"
            stale_meta["stale_reason"] = str(exc)
            return _GRAPH_CACHE, stale_meta
        raise

    if (
        _GRAPH_CACHE is not None
        and _SNAPSHOT_STATE is not None
        and _SNAPSHOT_STATE.get("file_key") == file_key
    ):
        return _GRAPH_CACHE, dict(_SNAPSHOT_STATE["metadata"])

    try:
        with open(resolved_path, "r", encoding="utf-8") as f:
            raw_data = json.load(f)
        if not isinstance(raw_data, dict) or not isinstance(raw_data.get("nodes", []), list) or not isinstance(raw_data.get("links", []), list):
            raise ValueError(f"Invalid graph.json structure at {resolved_path}: expected object with 'nodes' and 'links' lists.")
    except (json.JSONDecodeError, ValueError, OSError) as exc:
        if allow_stale_on_error and _GRAPH_CACHE is not None and _SNAPSHOT_STATE is not None:
            stale_meta = dict(_SNAPSHOT_STATE["metadata"])
            stale_meta["freshness_status"] = "stale"
            stale_meta["stale_reason"] = f"Reload failed ({type(exc).__name__}): {exc}"
            return _GRAPH_CACHE, stale_meta
        raise ValueError(f"Corrupt or unreadable graph.json at {resolved_path}: {exc}") from exc

    metadata = _compute_snapshot_metadata(
        graph=raw_data,
        resolved_path=resolved_path,
        path_source=path_source,
        mtime_ns=stat_result.st_mtime_ns,
        file_size=stat_result.st_size,
        freshness_status="fresh",
        stale_reason=None,
    )
    _GRAPH_CACHE = raw_data
    _SNAPSHOT_STATE = {
        "file_key": file_key,
        "metadata": metadata,
    }
    return _GRAPH_CACHE, dict(metadata)


def _load_graph() -> dict:
    """Backward-compatible helper returning the loaded graph dict."""
    graph, _ = _load_graph_with_metadata(allow_stale_on_error=False)
    return graph


def _enrich_node(node: Dict[str, Any]) -> Dict[str, Any]:
    """Preserve all original node attributes while guaranteeing standard keys."""
    enriched = dict(node)
    node_id = str(enriched.get("id", ""))
    enriched["id"] = node_id
    if "label" not in enriched or not enriched["label"]:
        enriched["label"] = enriched.get("name") or node_id.split("::")[-1] or node_id
    if "file_type" not in enriched or not enriched["file_type"]:
        enriched["file_type"] = enriched.get("type") or "code"
    if "type" not in enriched or not enriched["type"]:
        enriched["type"] = enriched["file_type"]
    if "provenance" not in enriched:
        enriched["provenance"] = "inferred" if enriched.get("inferred") else "extracted"
    return enriched


def _enrich_link(link: Dict[str, Any]) -> Dict[str, Any]:
    """Preserve all original link attributes while adding explicit provenance & direction."""
    enriched = dict(link)
    relation = str(enriched.get("relation") or enriched.get("type") or "references")
    enriched["relation"] = relation
    if "type" not in enriched:
        enriched["type"] = relation
    enriched["provenance"] = _normalize_link_provenance(enriched)
    if "direction" not in enriched:
        enriched["direction"] = "directed"
    return enriched


def _filter_graph(
    graph: dict,
    source_file: Optional[str] = None,
    community: Optional[int] = None,
    relation: Optional[str] = None,
    file_type: Optional[str] = None,
    limit: int = 500,
    offset: int = 0,
    provenance: Optional[str] = None,
    search: Optional[str] = None,
    snapshot_meta: Optional[Dict[str, Any]] = None,
) -> dict:
    """Filter graph nodes and links by criteria with pagination and zero dangling edges."""
    source_file = _unwrap_param(source_file, None)
    community = _unwrap_param(community, None)
    relation = _unwrap_param(relation, None)
    file_type = _unwrap_param(file_type, None)
    limit = int(_unwrap_param(limit, 500))
    offset = int(_unwrap_param(offset, 0))
    provenance = _unwrap_param(provenance, None)
    search = _unwrap_param(search, None)

    all_nodes = graph.get("nodes", [])
    all_links = graph.get("links", [])

    filtered_nodes = all_nodes
    if source_file:
        filtered_nodes = [
            n for n in filtered_nodes if n.get("source_file", "") == source_file
        ]
    if community is not None:
        filtered_nodes = [
            n for n in filtered_nodes if n.get("community") == community
        ]
    if file_type:
        filtered_nodes = [
            n for n in filtered_nodes
            if (n.get("file_type") or n.get("type")) == file_type
        ]
    if search:
        q = str(search).strip().lower()
        if q:
            filtered_nodes = [
                n for n in filtered_nodes
                if q in str(n.get("id", "")).lower()
                or q in str(n.get("label", "")).lower()
                or q in str(n.get("name", "")).lower()
                or q in str(n.get("source_file", "")).lower()
            ]

    # Pre-filter links by relation and provenance if requested
    candidate_links = all_links
    if relation:
        candidate_links = [
            l for l in candidate_links
            if (l.get("relation") or l.get("type")) == relation
        ]
    if provenance:
        prov_norm = str(provenance).strip().lower()
        candidate_links = [
            l for l in candidate_links
            if _normalize_link_provenance(l) == prov_norm
        ]

    matched_node_ids = {n["id"] for n in filtered_nodes if "id" in n}
    matched_links = [
        l for l in candidate_links
        if l.get("source") in matched_node_ids and l.get("target") in matched_node_ids
    ]

    matched_total_nodes = len(filtered_nodes)
    matched_total_links = len(matched_links)

    # Apply offset + limit slice so nodes beyond index 2685 are reachable
    paged_nodes = [_enrich_node(n) for n in filtered_nodes[offset : offset + limit]]
    paged_node_ids = {n["id"] for n in paged_nodes}

    # Guarantee zero dangling visible edges
    paged_links = [
        _enrich_link(l)
        for l in matched_links
        if l.get("source") in paged_node_ids and l.get("target") in paged_node_ids
    ]

    corpus_total_nodes = len(all_nodes)
    corpus_total_links = len(all_links)
    built_at_commit = (
        snapshot_meta.get("built_at_commit")
        if snapshot_meta
        else graph.get("built_at_commit")
    )

    result: Dict[str, Any] = {
        "nodes": paged_nodes,
        "links": paged_links,
        "node_count": len(paged_nodes),
        "link_count": len(paged_links),
        "offset": offset,
        "limit": limit,
        "matched_total_nodes": matched_total_nodes,
        "matched_total_links": matched_total_links,
        "corpus_total_nodes": corpus_total_nodes,
        "corpus_total_links": corpus_total_links,
        "is_subset": len(paged_nodes) < corpus_total_nodes,
        "is_truncated": (offset + len(paged_nodes)) < matched_total_nodes,
        "has_more": (offset + len(paged_nodes)) < matched_total_nodes,
        "built_at_commit": built_at_commit,
    }
    if snapshot_meta:
        result["snapshot"] = snapshot_meta
    return result


def _load_or_raise_http(allow_stale: bool = False) -> Tuple[dict, Dict[str, Any]]:
    """Load graph snapshot or convert file/parse errors into explicit HTTPExceptions."""
    allow_stale = bool(_unwrap_param(allow_stale, False))
    try:
        return _load_graph_with_metadata(allow_stale_on_error=allow_stale)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/graphify/code/graph")
async def get_code_graph(
    source_file: Optional[str] = Query(None, description="Filter by source file path"),
    community: Optional[int] = Query(None, description="Filter by community ID"),
    relation: Optional[str] = Query(None, description="Filter by relation type (calls, imports, contains, etc.)"),
    file_type: Optional[str] = Query(None, description="Filter by file type (code, rationale, concept)"),
    provenance: Optional[str] = Query(None, description="Filter links by provenance (extracted or inferred)"),
    search: Optional[str] = Query(None, description="Case-insensitive search across node ID, label, or source file"),
    offset: int = Query(0, ge=0, description="Pagination offset into matched nodes (enables reaching beyond 2685)"),
    limit: int = Query(500, ge=1, le=5000, description="Max nodes to return in this page"),
    allow_stale: bool = Query(False, description="Allow returning a retained snapshot labelled stale if reload fails"),
):
    graph, snapshot_meta = _load_or_raise_http(allow_stale=allow_stale)
    return _filter_graph(
        graph=graph,
        source_file=source_file,
        community=community,
        relation=relation,
        file_type=file_type,
        limit=limit,
        offset=offset,
        provenance=provenance,
        search=search,
        snapshot_meta=snapshot_meta,
    )


@router.get("/graphify/code/stats")
async def get_code_graph_stats(
    allow_stale: bool = Query(False, description="Allow returning a retained snapshot labelled stale if reload fails"),
):
    graph, snapshot_meta = _load_or_raise_http(allow_stale=allow_stale)

    nodes = graph.get("nodes", [])
    links = graph.get("links", [])

    file_types = Counter((n.get("file_type") or n.get("type") or "unknown") for n in nodes)
    relations = Counter((l.get("relation") or l.get("type") or "unknown") for l in links)
    provenance_counts = Counter(_normalize_link_provenance(l) for l in links)
    communities = Counter(n.get("community", -1) for n in nodes)
    source_files = Counter(n.get("source_file", "") for n in nodes)

    return {
        "total_nodes": len(nodes),
        "total_links": len(links),
        "corpus_total_nodes": len(nodes),
        "corpus_total_links": len(links),
        "file_types": dict(file_types.most_common()),
        "node_types": dict(file_types.most_common()),
        "relations": dict(relations.most_common()),
        "link_types": dict(relations.most_common()),
        "provenance_counts": {
            "extracted": provenance_counts.get("extracted", 0),
            "inferred": provenance_counts.get("inferred", 0),
        },
        "num_communities": len(communities),
        "top_communities": {str(k): v for k, v in communities.most_common(25)},
        "top_source_files": [
            {"path": f, "node_count": c}
            for f, c in source_files.most_common(30)
            if f
        ],
        "built_at_commit": snapshot_meta["built_at_commit"],
        "schema_version": snapshot_meta["schema_version"],
        "snapshot": snapshot_meta,
    }


@router.get("/graphify/code/communities")
async def get_code_graph_communities(
    allow_stale: bool = Query(False, description="Allow returning a retained snapshot labelled stale if reload fails"),
):
    """Aggregate the full corpus into communities and inter-community links without any arbitrary node cap."""
    graph, snapshot_meta = _load_or_raise_http(allow_stale=allow_stale)
    nodes = graph.get("nodes", [])
    links = graph.get("links", [])

    node_to_comm: Dict[str, int] = {}
    comm_nodes: Dict[int, List[Dict[str, Any]]] = {}
    degree_counter: Counter = Counter()

    for n in nodes:
        nid = n.get("id")
        if not nid:
            continue
        cid = int(n.get("community", -1))
        node_to_comm[nid] = cid
        comm_nodes.setdefault(cid, []).append(n)

    internal_links: Counter = Counter()
    external_links: Counter = Counter()
    inter_comm_edges: Dict[Tuple[int, int], Dict[str, Any]] = {}

    for l in links:
        src = l.get("source")
        tgt = l.get("target")
        if src not in node_to_comm or tgt not in node_to_comm:
            continue
        degree_counter[src] += 1
        degree_counter[tgt] += 1
        c_src = node_to_comm[src]
        c_tgt = node_to_comm[tgt]
        prov = _normalize_link_provenance(l)
        rel = str(l.get("relation") or l.get("type") or "references")

        if c_src == c_tgt:
            internal_links[c_src] += 1
        else:
            external_links[c_src] += 1
            external_links[c_tgt] += 1
            edge_key = (c_src, c_tgt)
            if edge_key not in inter_comm_edges:
                inter_comm_edges[edge_key] = {
                    "source_community": c_src,
                    "target_community": c_tgt,
                    "link_count": 0,
                    "extracted_count": 0,
                    "inferred_count": 0,
                    "relations": Counter(),
                }
            entry = inter_comm_edges[edge_key]
            entry["link_count"] += 1
            if prov == "inferred":
                entry["inferred_count"] += 1
            else:
                entry["extracted_count"] += 1
            entry["relations"][rel] += 1

    communities_list: List[Dict[str, Any]] = []
    for cid, cnodes in sorted(comm_nodes.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        files_counter = Counter(
            n.get("source_file", "") for n in cnodes if n.get("source_file")
        )
        types_counter = Counter(
            (n.get("file_type") or n.get("type") or "code") for n in cnodes
        )
        top_hubs = sorted(
            cnodes,
            key=lambda n: (-degree_counter.get(n.get("id", ""), 0), str(n.get("id", ""))),
        )[:5]
        top_file = files_counter.most_common(1)[0][0] if files_counter else ""
        label_prefix = Path(top_file).stem if top_file else f"Community {cid}"

        communities_list.append({
            "community_id": cid,
            "label": f"Community {cid} ({label_prefix})" if top_file else f"Community {cid}",
            "node_count": len(cnodes),
            "internal_link_count": internal_links.get(cid, 0),
            "external_link_count": external_links.get(cid, 0),
            "file_types": dict(types_counter.most_common()),
            "top_source_files": [
                {"path": fp, "node_count": cnt}
                for fp, cnt in files_counter.most_common(5)
            ],
            "hub_nodes": [
                {
                    "id": h.get("id"),
                    "label": h.get("label") or h.get("name") or h.get("id"),
                    "source_file": h.get("source_file", ""),
                    "degree": degree_counter.get(h.get("id", ""), 0),
                }
                for h in top_hubs
            ],
        })

    community_links_list = [
        {
            "source_community": item["source_community"],
            "target_community": item["target_community"],
            "link_count": item["link_count"],
            "extracted_count": item["extracted_count"],
            "inferred_count": item["inferred_count"],
            "relations": dict(item["relations"].most_common(5)),
        }
        for item in sorted(
            inter_comm_edges.values(), key=lambda x: -x["link_count"]
        )
    ]

    return {
        "communities": communities_list,
        "community_links": community_links_list,
        "num_communities": len(communities_list),
        "corpus_total_nodes": len(nodes),
        "corpus_total_links": len(links),
        "built_at_commit": snapshot_meta["built_at_commit"],
        "snapshot": snapshot_meta,
    }


@router.get("/graphify/code/file")
async def get_code_graph_for_file(
    path: str = Query(..., description="Source file path"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(500, ge=1, le=5000, description="Max nodes to return"),
    include_neighbors: bool = Query(False, description="Include immediate cross-file neighbor nodes"),
):
    path = str(_unwrap_param(path, ""))
    offset = int(_unwrap_param(offset, 0))
    limit = int(_unwrap_param(limit, 500))
    include_neighbors = bool(_unwrap_param(include_neighbors, False))

    graph, snapshot_meta = _load_or_raise_http(allow_stale=False)

    if not include_neighbors:
        result = _filter_graph(
            graph, source_file=path, limit=limit, offset=offset, snapshot_meta=snapshot_meta
        )
        if result["matched_total_nodes"] == 0:
            raise HTTPException(status_code=404, detail=f"No nodes found for file: {path}")
        return result

    all_nodes = graph.get("nodes", [])
    all_links = graph.get("links", [])
    node_map = {n["id"]: n for n in all_nodes if "id" in n}
    file_nodes = [n for n in all_nodes if n.get("source_file", "") == path]
    if not file_nodes:
        raise HTTPException(status_code=404, detail=f"No nodes found for file: {path}")

    core_ids = {n["id"] for n in file_nodes}
    neighbor_ids: Set[str] = set()
    for l in all_links:
        s, t = l.get("source"), l.get("target")
        if s in core_ids and t in node_map:
            neighbor_ids.add(t)
        elif t in core_ids and s in node_map:
            neighbor_ids.add(s)

    combined_ids = list(core_ids) + [nid for nid in neighbor_ids if nid not in core_ids]
    matched_total_nodes = len(combined_ids)
    selected_ids = set(combined_ids[offset : offset + limit])
    selected_nodes = [_enrich_node(node_map[nid]) for nid in combined_ids[offset : offset + limit]]
    selected_links = [
        _enrich_link(l)
        for l in all_links
        if l.get("source") in selected_ids and l.get("target") in selected_ids
    ]

    return {
        "nodes": selected_nodes,
        "links": selected_links,
        "node_count": len(selected_nodes),
        "link_count": len(selected_links),
        "offset": offset,
        "limit": limit,
        "matched_total_nodes": matched_total_nodes,
        "matched_total_links": len(selected_links),
        "corpus_total_nodes": len(all_nodes),
        "corpus_total_links": len(all_links),
        "is_subset": len(selected_nodes) < len(all_nodes),
        "is_truncated": (offset + len(selected_nodes)) < matched_total_nodes,
        "has_more": (offset + len(selected_nodes)) < matched_total_nodes,
        "built_at_commit": snapshot_meta["built_at_commit"],
        "snapshot": snapshot_meta,
    }


@router.get("/graphify/code/community")
async def get_code_graph_for_community(
    id: int = Query(..., description="Community ID"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(500, ge=1, le=5000, description="Max nodes to return"),
):
    cid = int(_unwrap_param(id, 0))
    offset = int(_unwrap_param(offset, 0))
    limit = int(_unwrap_param(limit, 500))
    graph, snapshot_meta = _load_or_raise_http(allow_stale=False)

    result = _filter_graph(
        graph, community=cid, limit=limit, offset=offset, snapshot_meta=snapshot_meta
    )
    if result["matched_total_nodes"] == 0:
        raise HTTPException(status_code=404, detail=f"No nodes found for community: {cid}")
    return result


@router.get("/graphify/code/neighborhood")
async def get_code_graph_neighborhood(
    node_id: str = Query(..., description="Target node ID or exact symbol name across full corpus"),
    hops: int = Query(1, ge=1, le=3, description="Number of relationship hops to traverse"),
    relation: Optional[str] = Query(None, description="Optional relation filter"),
    limit: int = Query(250, ge=1, le=2000, description="Max nodes in neighborhood subgraph"),
):
    """Drill down to a symbol/node neighborhood anywhere in the full corpus (no 2685 cap)."""
    node_id = str(_unwrap_param(node_id, ""))
    hops = int(_unwrap_param(hops, 1))
    relation = _unwrap_param(relation, None)
    limit = int(_unwrap_param(limit, 250))

    graph, snapshot_meta = _load_or_raise_http(allow_stale=False)
    all_nodes = graph.get("nodes", [])
    all_links = graph.get("links", [])

    node_map: Dict[str, Dict[str, Any]] = {n["id"]: n for n in all_nodes if "id" in n}
    target_id = node_id
    if target_id not in node_map:
        q_lower = node_id.strip().lower()
        exact_matches = [
            n["id"]
            for n in all_nodes
            if "id" in n
            and (
                str(n.get("label", "")).lower() == q_lower
                or str(n.get("name", "")).lower() == q_lower
                or str(n["id"]).lower().endswith(f"::{q_lower}")
                or str(n["id"]).lower().endswith(f".{q_lower}")
            )
        ]
        if exact_matches:
            target_id = exact_matches[0]
        else:
            raise HTTPException(
                status_code=404,
                detail=f"Node '{node_id}' not found in full Graphify corpus ({len(all_nodes)} nodes).",
            )

    adjacency: Dict[str, List[Tuple[str, Dict[str, Any]]]] = {}
    for l in all_links:
        if relation and (l.get("relation") or l.get("type")) != relation:
            continue
        s, t = l.get("source"), l.get("target")
        if s in node_map and t in node_map:
            adjacency.setdefault(s, []).append((t, l))
            adjacency.setdefault(t, []).append((s, l))

    visited: Dict[str, int] = {target_id: 0}
    queue: deque[Tuple[str, int]] = deque([(target_id, 0)])

    while queue and len(visited) < limit:
        curr, depth = queue.popleft()
        if depth >= hops:
            continue
        for nbr, _ in adjacency.get(curr, []):
            if nbr not in visited:
                visited[nbr] = depth + 1
                queue.append((nbr, depth + 1))
                if len(visited) >= limit:
                    break

    selected_ids = set(visited.keys())
    subgraph_nodes = []
    for nid, hop_dist in visited.items():
        enriched = _enrich_node(node_map[nid])
        enriched["hop_distance"] = hop_dist
        enriched["is_focal"] = nid == target_id
        subgraph_nodes.append(enriched)

    subgraph_links = [
        _enrich_link(l)
        for l in all_links
        if (not relation or (l.get("relation") or l.get("type")) == relation)
        and l.get("source") in selected_ids
        and l.get("target") in selected_ids
    ]

    return {
        "focal_node_id": target_id,
        "hops": hops,
        "nodes": subgraph_nodes,
        "links": subgraph_links,
        "node_count": len(subgraph_nodes),
        "link_count": len(subgraph_links),
        "corpus_total_nodes": len(all_nodes),
        "corpus_total_links": len(all_links),
        "is_subset": len(subgraph_nodes) < len(all_nodes),
        "built_at_commit": snapshot_meta["built_at_commit"],
        "snapshot": snapshot_meta,
    }


@router.get("/graphify/code/path")
async def get_code_graph_path(
    source: str = Query(..., description="Source node ID or symbol name"),
    target: str = Query(..., description="Target node ID or symbol name"),
    max_depth: int = Query(6, ge=1, le=12, description="Maximum path length in hops"),
):
    """Find a verified relationship path between two symbols/nodes in the full corpus.

    Never invents call edges; returns found=False with empty path if no path exists.
    """
    source = str(_unwrap_param(source, ""))
    target = str(_unwrap_param(target, ""))
    max_depth = int(_unwrap_param(max_depth, 6))

    graph, snapshot_meta = _load_or_raise_http(allow_stale=False)
    all_nodes = graph.get("nodes", [])
    all_links = graph.get("links", [])
    node_map: Dict[str, Dict[str, Any]] = {n["id"]: n for n in all_nodes if "id" in n}

    def _resolve_symbol(sym: str) -> Optional[str]:
        if sym in node_map:
            return sym
        q = sym.strip().lower()
        for n in all_nodes:
            nid = str(n.get("id", ""))
            if (
                str(n.get("label", "")).lower() == q
                or str(n.get("name", "")).lower() == q
                or nid.lower().endswith(f"::{q}")
                or nid.lower().endswith(f".{q}")
            ):
                return nid
        return None

    src_id = _resolve_symbol(source)
    tgt_id = _resolve_symbol(target)
    if not src_id or not tgt_id:
        return {
            "found": False,
            "source_resolved": src_id,
            "target_resolved": tgt_id,
            "nodes": [],
            "links": [],
            "hop_count": 0,
            "built_at_commit": snapshot_meta["built_at_commit"],
            "snapshot": snapshot_meta,
        }

    if src_id == tgt_id:
        return {
            "found": True,
            "source_resolved": src_id,
            "target_resolved": tgt_id,
            "nodes": [_enrich_node(node_map[src_id])],
            "links": [],
            "hop_count": 0,
            "built_at_commit": snapshot_meta["built_at_commit"],
            "snapshot": snapshot_meta,
        }

    adjacency: Dict[str, List[Tuple[str, Dict[str, Any]]]] = {}
    for l in all_links:
        s, t = l.get("source"), l.get("target")
        if s in node_map and t in node_map:
            adjacency.setdefault(s, []).append((t, l))
            adjacency.setdefault(t, []).append((s, l))

    parent: Dict[str, Tuple[str, Dict[str, Any]]] = {}
    visited: Set[str] = {src_id}
    queue: deque[Tuple[str, int]] = deque([(src_id, 0)])
    found = False

    while queue:
        curr, depth = queue.popleft()
        if depth >= max_depth:
            continue
        for nbr, link_obj in adjacency.get(curr, []):
            if nbr not in visited:
                visited.add(nbr)
                parent[nbr] = (curr, link_obj)
                if nbr == tgt_id:
                    found = True
                    break
                queue.append((nbr, depth + 1))
        if found:
            break

    if not found:
        return {
            "found": False,
            "source_resolved": src_id,
            "target_resolved": tgt_id,
            "nodes": [],
            "links": [],
            "hop_count": 0,
            "built_at_commit": snapshot_meta["built_at_commit"],
            "snapshot": snapshot_meta,
        }

    path_node_ids: List[str] = [tgt_id]
    path_links: List[Dict[str, Any]] = []
    curr_node = tgt_id
    while curr_node != src_id:
        prev_node, link_used = parent[curr_node]
        path_links.append(_enrich_link(link_used))
        path_node_ids.append(prev_node)
        curr_node = prev_node

    path_node_ids.reverse()
    path_links.reverse()

    return {
        "found": True,
        "source_resolved": src_id,
        "target_resolved": tgt_id,
        "nodes": [_enrich_node(node_map[nid]) for nid in path_node_ids],
        "links": path_links,
        "hop_count": len(path_links),
        "built_at_commit": snapshot_meta["built_at_commit"],
        "snapshot": snapshot_meta,
    }


@router.get("/graphify/code/workflow-mapping")
async def get_workflow_overview_mapping():
    """Verify which Mermaid workflow overview nodes map to real Graphify symbols/files.

    Never fabricates a node or call edge: planned or unmapped nodes return available=False.
    """
    graph, snapshot_meta = _load_or_raise_http(allow_stale=False)
    all_nodes = graph.get("nodes", [])

    mappings: Dict[str, Dict[str, Any]] = {}
    for diagram_node_id, spec in WORKFLOW_NODE_TARGETS.items():
        if spec["status"] == "planned":
            mappings[diagram_node_id] = {
                "diagram_node_id": diagram_node_id,
                "title": spec["title"],
                "status": "planned",
                "available": False,
                "matched_nodes": [],
                "primary_node_id": None,
                "primary_source_file": None,
                "primary_community": None,
                "reason": "Planned architectural addition; not implemented in current graph snapshot.",
            }
            continue

        matched: List[Dict[str, Any]] = []
        terms_lower = [t.lower() for t in spec.get("candidate_terms", [])]
        for n in all_nodes:
            nid = str(n.get("id", ""))
            label = str(n.get("label") or n.get("name") or "")
            sfile = str(n.get("source_file", ""))
            haystack = f"{nid} {label} {sfile}".lower()
            if any(term in haystack for term in terms_lower):
                matched.append(n)
                if len(matched) >= 10:
                    break

        if matched:
            primary = matched[0]
            mappings[diagram_node_id] = {
                "diagram_node_id": diagram_node_id,
                "title": spec["title"],
                "status": spec["status"],
                "available": True,
                "matched_count": len(matched),
                "primary_node_id": primary.get("id"),
                "primary_label": primary.get("label") or primary.get("name") or primary.get("id"),
                "primary_source_file": primary.get("source_file"),
                "primary_community": primary.get("community"),
                "matched_nodes": [
                    {
                        "id": m.get("id"),
                        "label": m.get("label") or m.get("name") or m.get("id"),
                        "source_file": m.get("source_file", ""),
                        "community": m.get("community"),
                    }
                    for m in matched[:5]
                ],
                "reason": None,
            }
        else:
            mappings[diagram_node_id] = {
                "diagram_node_id": diagram_node_id,
                "title": spec["title"],
                "status": spec["status"],
                "available": False,
                "matched_count": 0,
                "primary_node_id": None,
                "primary_source_file": None,
                "primary_community": None,
                "matched_nodes": [],
                "reason": "No matching symbol or file found in current graph.json snapshot.",
            }

    return {
        "mappings": mappings,
        "built_at_commit": snapshot_meta["built_at_commit"],
        "snapshot": snapshot_meta,
    }


# -- Review Data Graph (Preserved for Researchers) ----------------------------

def _build_review_graph(project_id: str, conn: DBBackend) -> dict:
    """Build a live review data graph from project studies, variables, extractions, and meta-analyses."""
    proj_row = conn.execute(
        "SELECT project_id, name FROM projects WHERE project_id = ?",
        (project_id,),
    ).fetchone()
    if not proj_row:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    project_name = proj_row["name"] if isinstance(proj_row, dict) or hasattr(proj_row, "keys") else proj_row[1]

    nodes: List[Dict[str, Any]] = []
    links: List[Dict[str, Any]] = []

    project_node_id = f"project:{project_id}"
    nodes.append({
        "id": project_node_id,
        "label": project_name,
        "type": "project",
        "details": {"project_id": project_id},
    })

    studies = conn.execute(
        "SELECT study_id, title, publication_year, journal, screening_status FROM studies WHERE project_id = ? ORDER BY title",
        (project_id,),
    ).fetchall()
    for s in studies:
        s_dict = dict(s) if hasattr(s, "keys") else {
            "study_id": s[0], "title": s[1], "publication_year": s[2], "journal": s[3], "screening_status": s[4]
        }
        sid = f"study:{s_dict['study_id']}"
        nodes.append({
            "id": sid,
            "label": s_dict.get("title") or s_dict["study_id"],
            "type": "study",
            "details": {
                "study_id": s_dict["study_id"],
                "publication_year": s_dict.get("publication_year"),
                "journal": s_dict.get("journal"),
                "screening_status": s_dict.get("screening_status"),
            },
        })
        links.append({
            "source": project_node_id,
            "target": sid,
            "relation": "has_study",
            "type": "has_study",
        })

    variables = conn.execute(
        "SELECT variable_id, name, section, field_type FROM variables WHERE project_id = ? ORDER BY section, name",
        (project_id,),
    ).fetchall()
    for v in variables:
        v_dict = dict(v) if hasattr(v, "keys") else {
            "variable_id": v[0], "name": v[1], "section": v[2], "field_type": v[3]
        }
        vid = f"variable:{v_dict['variable_id']}"
        nodes.append({
            "id": vid,
            "label": v_dict.get("name") or v_dict["variable_id"],
            "type": "variable",
            "details": {
                "variable_id": v_dict["variable_id"],
                "section": v_dict.get("section"),
                "field_type": v_dict.get("field_type"),
            },
        })
        links.append({
            "source": project_node_id,
            "target": vid,
            "relation": "defines_variable",
            "type": "defines_variable",
        })

    extractions = conn.execute(
        "SELECT e.extraction_id, e.study_id, e.variable_id, e.value, e.confidence "
        "FROM extractions e JOIN variables v ON e.variable_id = v.variable_id "
        "WHERE v.project_id = ? ORDER BY e.study_id, e.variable_id",
        (project_id,),
    ).fetchall()
    for e in extractions:
        e_dict = dict(e) if hasattr(e, "keys") else {
            "extraction_id": e[0], "study_id": e[1], "variable_id": e[2], "value": e[3], "confidence": e[4]
        }
        links.append({
            "source": f"study:{e_dict['study_id']}",
            "target": f"variable:{e_dict['variable_id']}",
            "relation": "extracted_value",
            "type": "extracted_value",
            "details": {
                "extraction_id": e_dict["extraction_id"],
                "value": e_dict.get("value"),
                "confidence": e_dict.get("confidence"),
            },
        })

    try:
        metas = conn.execute(
            "SELECT meta_id, outcome_label, effect_measure, n_studies FROM meta_analyses WHERE project_id = ? ORDER BY created_at DESC",
            (project_id,),
        ).fetchall()
        for m in metas:
            m_dict = dict(m) if hasattr(m, "keys") else {
                "meta_id": m[0], "outcome_label": m[1], "effect_measure": m[2], "n_studies": m[3]
            }
            mid = f"meta:{m_dict['meta_id']}"
            nodes.append({
                "id": mid,
                "label": m_dict.get("outcome_label") or m_dict["meta_id"],
                "type": "meta_analysis",
                "details": {
                    "meta_id": m_dict["meta_id"],
                    "effect_measure": m_dict.get("effect_measure"),
                    "n_studies": m_dict.get("n_studies"),
                },
            })
            links.append({
                "source": project_node_id,
                "target": mid,
                "relation": "has_meta_analysis",
                "type": "has_meta_analysis",
            })
            included = conn.execute(
                "SELECT study_id, study_label FROM meta_analysis_studies WHERE meta_id = ? AND included = 1",
                (m_dict["meta_id"],),
            ).fetchall()
            for inc in included:
                inc_sid = inc["study_id"] if hasattr(inc, "keys") else inc[0]
                links.append({
                    "source": mid,
                    "target": f"study:{inc_sid}",
                    "relation": "includes_study",
                    "type": "includes_study",
                })
    except Exception:
        # Optional table in older schemas
        pass

    return {
        "project_id": project_id,
        "project_name": project_name,
        "nodes": nodes,
        "links": links,
        "node_count": len(nodes),
        "link_count": len(links),
    }


@router.get("/projects/{project_id}/graphify/review/graph")
async def get_review_graph(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    check_project_access(conn, project_id, user)
    return _build_review_graph(project_id, conn)


@router.get("/projects/{project_id}/graphify/review/stats")
async def get_review_graph_stats(
    project_id: str,
    user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db),
):
    check_project_access(conn, project_id, user)
    graph = _build_review_graph(project_id, conn)
    from collections import Counter

    node_types = Counter(n.get("type", "unknown") for n in graph["nodes"])
    link_types = Counter(l.get("type") or l.get("relation", "unknown") for l in graph["links"])
    return {
        "project_id": project_id,
        "project_name": graph["project_name"],
        "total_nodes": graph["node_count"],
        "total_links": graph["link_count"],
        "node_types": dict(node_types.most_common()),
        "link_types": dict(link_types.most_common()),
    }
