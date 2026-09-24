"""Graphify web integration API router.

Serves two graph types:

1. **Code graph** (for developers): serves the Graphify code-dependency graph
   from graphify-out/graph.json. Nodes are code entities (classes, functions,
   modules); links are relationships (calls, imports, contains, inherits, etc.).

2. **Review data graph** (for researchers): builds a live graph from the
   database showing the review data structure — studies, variables, extractions,
   and meta-analyses as nodes with relationships as edges.

Endpoints:
  GET  /api/graphify/code/graph              — full code graph (with optional filters)
  GET  /api/graphify/code/stats              — code graph statistics
  GET  /api/graphify/code/file               — subgraph for a source file (query: path)
  GET  /api/graphify/code/community          — subgraph for a community (query: id)
  GET  /api/projects/{project_id}/graphify/review/graph — review data graph
  GET  /api/projects/{project_id}/graphify/review/stats — review graph statistics
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
import sqlite3

from fastapi import APIRouter, HTTPException, Query, Depends

from database import get_db
from services.db_backend import DBBackend
from dependencies import get_current_user_optional, check_project_access

router = APIRouter(prefix="/api", tags=["graphify"])

# ── Code Graph ───────────────────────────────────────────────

_GRAPH_CACHE: Optional[dict] = None
_GRAPH_PATH = Path(__file__).resolve().parent.parent.parent.parent / "graphify-out" / "graph.json"


def _load_graph() -> dict:
    """Load and cache the graphify graph.json."""
    global _GRAPH_CACHE
    if _GRAPH_CACHE is not None:
        return _GRAPH_CACHE

    if not _GRAPH_PATH.exists():
        # Try alternate path (when running from backend dir)
        alt = Path(os.environ.get("RADEXTRACT_GRAPH_PATH", "graphify-out/graph.json"))
        if alt.exists():
            path = alt
        else:
            raise FileNotFoundError(f"Graph file not found at {_GRAPH_PATH} or {alt}")
    else:
        path = _GRAPH_PATH

    with open(path, "r", encoding="utf-8") as f:
        _GRAPH_CACHE = json.load(f)
    return _GRAPH_CACHE


def _filter_graph(
    graph: dict,
    source_file: Optional[str] = None,
    community: Optional[int] = None,
    relation: Optional[str] = None,
    file_type: Optional[str] = None,
    limit: int = 500,
) -> dict:
    """Filter graph nodes and links by criteria."""
    nodes = graph.get("nodes", [])
    links = graph.get("links", [])

    # Filter nodes
    filtered_nodes = nodes
    if source_file:
        filtered_nodes = [n for n in filtered_nodes if n.get("source_file", "") == source_file]
    if community is not None:
        filtered_nodes = [n for n in filtered_nodes if n.get("community") == community]
    if file_type:
        filtered_nodes = [n for n in filtered_nodes if n.get("file_type") == file_type]

    # Build node ID set for link filtering
    node_ids = {n["id"] for n in filtered_nodes}

    # Filter links
    filtered_links = links
    if relation:
        filtered_links = [l for l in filtered_links if l.get("relation") == relation]
    # Only keep links where both endpoints are in the filtered node set
    filtered_links = [
        l for l in filtered_links
        if l.get("source") in node_ids and l.get("target") in node_ids
    ]

    # Limit for performance
    if len(filtered_nodes) > limit:
        filtered_nodes = filtered_nodes[:limit]
        node_ids = {n["id"] for n in filtered_nodes}
        filtered_links = [
            l for l in filtered_links
            if l.get("source") in node_ids and l.get("target") in node_ids
        ]

    return {
        "nodes": filtered_nodes,
        "links": filtered_links,
        "node_count": len(filtered_nodes),
        "link_count": len(filtered_links),
    }


@router.get("/graphify/code/graph")
async def get_code_graph(
    source_file: Optional[str] = Query(None, description="Filter by source file path"),
    community: Optional[int] = Query(None, description="Filter by community ID"),
    relation: Optional[str] = Query(None, description="Filter by relation type (calls, imports, contains, etc.)"),
    file_type: Optional[str] = Query(None, description="Filter by file type (code, rationale, concept)"),
    limit: int = Query(500, ge=1, le=2685, description="Max nodes to return"),
):
    """Get the code dependency graph, optionally filtered."""
    try:
        graph = _load_graph()
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    result = _filter_graph(graph, source_file, community, relation, file_type, limit)
    result["built_at_commit"] = graph.get("built_at_commit")
    return result


@router.get("/graphify/code/stats")
async def get_code_graph_stats():
    """Get statistics about the code graph."""
    try:
        graph = _load_graph()
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    nodes = graph.get("nodes", [])
    links = graph.get("links", [])

    from collections import Counter

    file_types = Counter(n.get("file_type", "unknown") for n in nodes)
    relations = Counter(l.get("relation", "unknown") for l in links)
    communities = Counter(n.get("community", -1) for n in nodes)
    source_files = Counter(n.get("source_file", "") for n in nodes)

    return {
        "total_nodes": len(nodes),
        "total_links": len(links),
        "file_types": dict(file_types.most_common()),
        "relations": dict(relations.most_common()),
        "num_communities": len(communities),
        "top_communities": dict(communities.most_common(10)),
        "top_source_files": [
            {"path": f, "node_count": c}
            for f, c in source_files.most_common(20)
            if f  # skip empty paths
        ],
        "built_at_commit": graph.get("built_at_commit"),
    }


@router.get("/graphify/code/file")
async def get_code_graph_for_file(
    path: str = Query(..., description="Source file path"),
    limit: int = Query(500, ge=1, le=2685),
):
    """Get the subgraph for a specific source file."""
    try:
        graph = _load_graph()
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    result = _filter_graph(graph, source_file=path, limit=limit)
    if result["node_count"] == 0:
        raise HTTPException(status_code=404, detail=f"No nodes found for file: {path}")
    return result


@router.get("/graphify/code/community")
async def get_code_graph_for_community(
    id: int = Query(..., description="Community ID"),
    limit: int = Query(500, ge=1, le=2685),
):
    """Get the subgraph for a specific community."""
    try:
        graph = _load_graph()
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    result = _filter_graph(graph, community=id, limit=limit)
    if result["node_count"] == 0:
        raise HTTPException(status_code=404, detail=f"No nodes found for community: {id}")
    return result


# ── Review Data Graph ────────────────────────────────────────


def _build_review_graph(project_id: str, conn: sqlite3.Connection) -> Dict[str, Any]:
    """Build a graph from the review database data.

    Node types:
      - study: {id, label, type='study', title, year, journal, screening_status}
      - variable: {id, label, type='variable', name, section, field_type}
      - extraction: {id, label, type='extraction', value, confidence}
      - meta_analysis: {id, label, type='meta_analysis', outcome, effect_measure}

    Edge types:
      - study → variable: 'extracts' (study has extraction for variable)
      - variable → extraction: 'has_value'
      - study → meta_analysis: 'included_in'
      - meta_analysis → study: 'includes'
    """
    # Verify project
    proj = conn.execute(
        "SELECT project_id, name FROM projects WHERE project_id = ?", (project_id,)
    ).fetchone()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    nodes: List[Dict[str, Any]] = []
    links: List[Dict[str, Any]] = []

    # ── Study nodes ──
    studies = conn.execute(
        "SELECT study_id, title, publication_year, journal, screening_status "
        "FROM studies WHERE project_id = ? ORDER BY title",
        (project_id,),
    ).fetchall()

    study_ids = set()
    for s in studies:
        sid = s["study_id"]
        study_ids.add(sid)
        title = s["title"] or sid
        short = title[:40] + ("…" if len(title) > 40 else "")
        nodes.append({
            "id": f"study:{sid}",
            "label": short,
            "type": "study",
            "title": title,
            "year": s["publication_year"],
            "journal": s["journal"],
            "screening_status": s["screening_status"],
        })

    # ── Variable nodes ──
    variables = conn.execute(
        "SELECT variable_id, name, section, field_type "
        "FROM variables WHERE project_id = ? ORDER BY section, name",
        (project_id,),
    ).fetchall()

    var_ids = set()
    for v in variables:
        vid = v["variable_id"]
        var_ids.add(vid)
        nodes.append({
            "id": f"variable:{vid}",
            "label": v["name"],
            "type": "variable",
            "section": v["section"],
            "field_type": v["field_type"],
        })

    # ── Extraction nodes + links ──
    extractions = conn.execute(
        """SELECT e.extraction_id, e.study_id, e.variable_id, e.value, e.confidence
           FROM extractions e
           JOIN variables v ON e.variable_id = v.variable_id
           WHERE v.project_id = ?
           ORDER BY e.study_id, e.variable_id""",
        (project_id,),
    ).fetchall()

    for ext in extractions:
        ext_id = ext["extraction_id"]
        value = ext["value"] or ""
        short_val = value[:30] + ("…" if len(value) > 30 else "")
        nodes.append({
            "id": f"extraction:{ext_id}",
            "label": short_val,
            "type": "extraction",
            "value": value,
            "confidence": ext["confidence"],
        })
        # study → extraction (study extracts this value)
        if ext["study_id"] in study_ids:
            links.append({
                "source": f"study:{ext['study_id']}",
                "target": f"extraction:{ext_id}",
                "relation": "has_extraction",
            })
        # extraction → variable (this extraction is for this variable)
        if ext["variable_id"] in var_ids:
            links.append({
                "source": f"extraction:{ext_id}",
                "target": f"variable:{ext['variable_id']}",
                "relation": "value_of",
            })

    # ── Meta-analysis nodes + links ──
    metas = conn.execute(
        "SELECT meta_id, outcome_label, effect_measure, n_studies "
        "FROM meta_analyses WHERE project_id = ? ORDER BY created_at DESC",
        (project_id,),
    ).fetchall()

    for m in metas:
        mid = m["meta_id"]
        nodes.append({
            "id": f"meta:{mid}",
            "label": m["outcome_label"],
            "type": "meta_analysis",
            "effect_measure": m["effect_measure"],
            "n_studies": m["n_studies"],
        })

        # Link meta-analysis to included studies
        ma_studies = conn.execute(
            "SELECT study_id, study_label FROM meta_analysis_studies "
            "WHERE meta_id = ? AND included = 1",
            (mid,),
        ).fetchall()

        for ms in ma_studies:
            if ms["study_id"] and ms["study_id"] in study_ids:
                links.append({
                    "source": f"meta:{mid}",
                    "target": f"study:{ms['study_id']}",
                    "relation": "includes_study",
                })

    return {
        "project_id": project_id,
        "project_name": proj["name"],
        "nodes": nodes,
        "links": links,
        "node_count": len(nodes),
        "link_count": len(links),
    }


@router.get("/projects/{project_id}/graphify/review/graph")
async def get_review_graph(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Get the review data graph for a project."""
    return _build_review_graph(project_id, conn)


@router.get("/projects/{project_id}/graphify/review/stats")
async def get_review_graph_stats(project_id: str, user: Optional[dict] = Depends(get_current_user_optional),
    conn: DBBackend = Depends(get_db)):
    """Get statistics about the review data graph."""
    check_project_access(conn, project_id, user)
    graph = _build_review_graph(project_id, conn)

    from collections import Counter

    node_types = Counter(n["type"] for n in graph["nodes"])
    link_types = Counter(l["relation"] for l in graph["links"])

    return {
        "project_id": project_id,
        "project_name": graph["project_name"],
        "total_nodes": graph["node_count"],
        "total_links": graph["link_count"],
        "node_types": dict(node_types),
        "link_types": dict(link_types),
    }
