"""Deterministic unit tests for radextract_platform/backend/routers/graphify.py.

Verifies all acceptance criteria in CODE_GRAPH_DUAL_VIEW_PLAN.md:
1. Explicit RADEXTRACT_GRAPH_PATH precedence (never silently falls back when configured path is missing).
2. Snapshot metadata consistency between /graphify/code/graph and /graphify/code/stats.
3. Automatic cache invalidation when graph.json is updated on disk (without server restart),
   plus explicit stale labeling if allow_stale=True when reload fails.
4. Full-corpus totals vs. returned subset totals, zero dangling visible edges, and extracted vs. inferred provenance.
5. Discovery of nodes beyond the former 2,685 cap via pagination, community aggregation, neighborhood, and path drill-down.
6. Honest workflow-mapping endpoint (verified nodes mapped; planned nodes marked available=False without invented edges).
"""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest

from fastapi import HTTPException

# Import router under test
from routers import graphify as graphify_router  # noqa: E402


def _make_corpus_fixture(num_nodes: int = 3100, commit: str = "abc1234") -> dict:
    """Create a realistic Graphify fixture exceeding the former 2,685-node cap."""
    nodes = []
    links = []

    # Add key application symbols referenced by the workflow diagram
    core_symbols = [
        ("backend/services/jev_screener.py::AIScreeningPipeline", "AIScreeningPipeline", "backend/services/jev_screener.py", 1, "code"),
        ("backend/services/jev_client.py::LayaModel", "LayaModel", "backend/services/jev_client.py", 1, "code"),
        ("backend/services/coded_extraction_service.py::coded_extraction_service", "coded_extraction_service", "backend/services/coded_extraction_service.py", 2, "code"),
        ("backend/services/laya_extraction_tracer.py::laya_extraction_tracer", "laya_extraction_tracer", "backend/services/laya_extraction_tracer.py", 2, "code"),
        ("backend/services/prisma2020_sync.py::prisma2020_sync", "prisma2020_sync", "backend/services/prisma2020_sync.py", 3, "code"),
        ("backend/routers/graphify.py::get_code_graph", "get_code_graph", "backend/routers/graphify.py", 4, "code"),
        ("frontend/src/pages/CodeGraphPage.tsx::CodeGraphPage", "CodeGraphPage", "frontend/src/pages/CodeGraphPage.tsx", 4, "code"),
    ]
    for nid, label, sfile, comm, ftype in core_symbols:
        nodes.append({
            "id": nid,
            "label": label,
            "source_file": sfile,
            "community": comm,
            "file_type": ftype,
        })

    # Link core symbols with both extracted and inferred relationships
    links.append({
        "source": "backend/services/jev_screener.py::AIScreeningPipeline",
        "target": "backend/services/jev_client.py::LayaModel",
        "relation": "calls",
        "provenance": "extracted",
    })
    links.append({
        "source": "backend/services/coded_extraction_service.py::coded_extraction_service",
        "target": "backend/services/laya_extraction_tracer.py::laya_extraction_tracer",
        "relation": "indirect_call",
        "inferred": True,
    })

    # Populate up to num_nodes across 6 communities so nodes > 2685 exist
    for idx in range(len(core_symbols), num_nodes):
        comm_id = idx % 6
        sfile = f"backend/module_{comm_id}/file_{idx // 50}.py"
        nid = f"{sfile}::symbol_{idx}"
        nodes.append({
            "id": nid,
            "label": f"symbol_{idx}",
            "source_file": sfile,
            "community": comm_id,
            "file_type": "code" if idx % 10 != 0 else "concept",
        })
        if idx > len(core_symbols):
            prev_id = nodes[idx - 1]["id"]
            links.append({
                "source": prev_id,
                "target": nid,
                "relation": "calls" if idx % 3 != 0 else "imports",
                "provenance": "extracted" if idx % 4 != 0 else "inferred",
            })

    return {
        "built_at_commit": commit,
        "schema_version": "2.1",
        "nodes": nodes,
        "links": links,
    }


class TestGraphifyRouter(unittest.TestCase):
    def setUp(self) -> None:
        import uuid
        base = Path(__file__).parent / ".test_tmp"
        base.mkdir(parents=True, exist_ok=True)
        self.tmp_path = base / f"graphify_{uuid.uuid4().hex[:8]}"
        self.tmp_path.mkdir(parents=True, exist_ok=True)
        self.orig_env = os.environ.get("RADEXTRACT_GRAPH_PATH")
        self.orig_default_path = graphify_router._GRAPH_PATH
        graphify_router.reset_graph_cache()

    def tearDown(self) -> None:
        import shutil
        if self.orig_env is None:
            os.environ.pop("RADEXTRACT_GRAPH_PATH", None)
        else:
            os.environ["RADEXTRACT_GRAPH_PATH"] = self.orig_env
        graphify_router._GRAPH_PATH = self.orig_default_path
        graphify_router.reset_graph_cache()
        shutil.rmtree(self.tmp_path, ignore_errors=True)

    def test_explicit_radextract_graph_path_precedence_and_missing_error(self) -> None:
        """RADEXTRACT_GRAPH_PATH must take precedence over _GRAPH_PATH and never silently fall back."""
        default_file = self.tmp_path / "default_graph.json"
        env_file = self.tmp_path / "env_graph.json"

        default_file.write_text(
            json.dumps(_make_corpus_fixture(num_nodes=50, commit="default_commit")),
            encoding="utf-8",
        )
        env_file.write_text(
            json.dumps(_make_corpus_fixture(num_nodes=80, commit="env_commit")),
            encoding="utf-8",
        )

        graphify_router._GRAPH_PATH = default_file
        os.environ["RADEXTRACT_GRAPH_PATH"] = str(env_file)

        stats = asyncio.run(graphify_router.get_code_graph_stats())
        self.assertEqual(stats["built_at_commit"], "env_commit")
        self.assertEqual(stats["total_nodes"], 80)
        self.assertEqual(stats["snapshot"]["graph_path_source"], "env:RADEXTRACT_GRAPH_PATH")

        # Point RADEXTRACT_GRAPH_PATH to a non-existent path; must raise 404 even when default_file exists
        os.environ["RADEXTRACT_GRAPH_PATH"] = str(self.tmp_path / "does_not_exist.json")
        graphify_router.reset_graph_cache()
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(graphify_router.get_code_graph_stats())
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("RADEXTRACT_GRAPH_PATH", ctx.exception.detail)

    def test_cache_invalidation_on_file_update_and_stale_retention(self) -> None:
        """Updating graph.json on disk invalidates cache automatically without API restart."""
        graph_file = self.tmp_path / "graph.json"
        graph_file.write_text(
            json.dumps(_make_corpus_fixture(num_nodes=100, commit="commit_v1")),
            encoding="utf-8",
        )
        os.environ["RADEXTRACT_GRAPH_PATH"] = str(graph_file)

        res_v1 = asyncio.run(graphify_router.get_code_graph(limit=25))
        stats_v1 = asyncio.run(graphify_router.get_code_graph_stats())
        self.assertEqual(res_v1["built_at_commit"], "commit_v1")
        self.assertEqual(res_v1["snapshot"]["snapshot_id"], stats_v1["snapshot"]["snapshot_id"])
        self.assertEqual(res_v1["corpus_total_nodes"], 100)
        self.assertEqual(res_v1["node_count"], 25)
        self.assertTrue(res_v1["is_subset"])

        # Modify file on disk (simulate `graphify update .`)
        time.sleep(0.01)
        graph_file.write_text(
            json.dumps(_make_corpus_fixture(num_nodes=145, commit="commit_v2")),
            encoding="utf-8",
        )
        # Ensure mtime_ns advances even on coarse filesystems
        st = graph_file.stat()
        os.utime(graph_file, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000))

        res_v2 = asyncio.run(graphify_router.get_code_graph(limit=25))
        stats_v2 = asyncio.run(graphify_router.get_code_graph_stats())
        self.assertEqual(res_v2["built_at_commit"], "commit_v2")
        self.assertEqual(stats_v2["built_at_commit"], "commit_v2")
        self.assertEqual(stats_v2["total_nodes"], 145)
        self.assertNotEqual(res_v1["snapshot"]["snapshot_id"], res_v2["snapshot"]["snapshot_id"])

        # Corrupt file on disk: default call must raise 422; allow_stale=True returns retained snapshot labelled stale
        graph_file.write_text("{corrupt json", encoding="utf-8")
        os.utime(graph_file, ns=(st.st_atime_ns, st.st_mtime_ns + 2_000_000))

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(graphify_router.get_code_graph(limit=10, allow_stale=False))
        self.assertEqual(ctx.exception.status_code, 422)

        stale_res = asyncio.run(graphify_router.get_code_graph(limit=10, allow_stale=True))
        self.assertEqual(stale_res["snapshot"]["freshness_status"], "stale")
        self.assertEqual(stale_res["built_at_commit"], "commit_v2")

    def test_beyond_2685_cap_discoverability_and_no_dangling_edges(self) -> None:
        """Nodes beyond index 2685 are reachable via offset, community, neighborhood, and path endpoints."""
        graph_file = self.tmp_path / "large_graph.json"
        graph_file.write_text(
            json.dumps(_make_corpus_fixture(num_nodes=3100, commit="large_corpus")),
            encoding="utf-8",
        )
        os.environ["RADEXTRACT_GRAPH_PATH"] = str(graph_file)

        # 1. Full-corpus communities endpoint covers all 3,100 nodes
        comm_overview = asyncio.run(graphify_router.get_code_graph_communities())
        total_across_communities = sum(c["node_count"] for c in comm_overview["communities"])
        self.assertEqual(total_across_communities, 3100)
        self.assertEqual(comm_overview["corpus_total_nodes"], 3100)

        # 2. Offset pagination reaches nodes beyond 2,685 with zero dangling edges
        page_beyond_cap = asyncio.run(graphify_router.get_code_graph(offset=2800, limit=200))
        self.assertEqual(page_beyond_cap["node_count"], 200)
        self.assertEqual(page_beyond_cap["corpus_total_nodes"], 3100)
        returned_ids = {n["id"] for n in page_beyond_cap["nodes"]}
        self.assertIn("backend/module_5/file_59.py::symbol_2999", returned_ids)
        for link in page_beyond_cap["links"]:
            self.assertIn(link["source"], returned_ids)
            self.assertIn(link["target"], returned_ids)
            self.assertIn(link["provenance"], ("extracted", "inferred"))

        # 3. Neighborhood drill-down finds symbol_3050 (beyond 2685)
        nbr = asyncio.run(
            graphify_router.get_code_graph_neighborhood(
                node_id="symbol_3050", hops=2, limit=50
            )
        )
        self.assertTrue(nbr["focal_node_id"].endswith("symbol_3050"))
        nbr_ids = {n["id"] for n in nbr["nodes"]}
        for link in nbr["links"]:
            self.assertIn(link["source"], nbr_ids)
            self.assertIn(link["target"], nbr_ids)

        # 4. Path endpoint finds verified path and never invents disconnected paths
        path_found = asyncio.run(
            graphify_router.get_code_graph_path(
                source="AIScreeningPipeline", target="LayaModel", max_depth=4
            )
        )
        self.assertTrue(path_found["found"])
        self.assertEqual(path_found["hop_count"], 1)

        path_missing = asyncio.run(
            graphify_router.get_code_graph_path(
                source="AIScreeningPipeline", target="NonExistentSymbolXYZ", max_depth=4
            )
        )
        self.assertFalse(path_missing["found"])
        self.assertEqual(path_missing["links"], [])

    def test_workflow_mapping_distinguishes_implemented_and_planned(self) -> None:
        """Workflow mapping links verified nodes and marks planned nodes unavailable without fabricating edges."""
        graph_file = self.tmp_path / "workflow_graph.json"
        graph_file.write_text(
            json.dumps(_make_corpus_fixture(num_nodes=120, commit="wf_commit")),
            encoding="utf-8",
        )
        os.environ["RADEXTRACT_GRAPH_PATH"] = str(graph_file)

        wf = asyncio.run(graphify_router.get_workflow_overview_mapping())
        mappings = wf["mappings"]
        # Verified implemented symbols
        self.assertTrue(mappings["S"]["available"])
        self.assertEqual(mappings["S"]["primary_source_file"], "backend/services/jev_screener.py")
        self.assertTrue(mappings["L"]["available"])
        self.assertTrue(mappings["V"]["available"])
        self.assertTrue(mappings["PR"]["available"])

        # Planned additions must never be fabricated as available
        self.assertFalse(mappings["SL"]["available"])
        self.assertEqual(mappings["SL"]["status"], "planned")
        self.assertFalse(mappings["VR"]["available"])
        self.assertFalse(mappings["IH"]["available"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
