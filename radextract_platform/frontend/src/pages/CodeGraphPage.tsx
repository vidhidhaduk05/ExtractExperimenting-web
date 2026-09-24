import React, { useState, useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  Position,
  Handle,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery } from "@tanstack/react-query";
import {
  GitBranch,
  Loader2,
  Filter,
  Network,
  FileCode,
  Layers,
  Search,
} from "lucide-react";
import { api } from "../lib/api";
import type { CodeGraph, CodeGraphStats, CodeGraphNode, CodeGraphLink } from "../lib/api";

const NODE_COLORS: Record<string, string> = {
  code: "#3b82f6",
  rationale: "#f59e0b",
  concept: "#10b981",
  package: "#8b5cf6",
};

const EDGE_COLORS: Record<string, string> = {
  calls: "#3b82f6",
  contains: "#6366f1",
  imports: "#10b981",
  imports_from: "#059669",
  inherits: "#ef4444",
  extends: "#dc2626",
  references: "#f59e0b",
  uses: "#8b5cf6",
  method: "#ec4899",
  rationale_for: "#f97316",
  indirect_call: "#64748b",
  re_exports: "#0891b2",
};

export function CodeGraphPage() {
  const [sourceFile, setSourceFile] = useState("");
  const [community, setCommunity] = useState("");
  const [relation, setRelation] = useState("");
  const [fileType, setFileType] = useState("");
  const [limit, setLimit] = useState(200);

  // Build query params
  const params = useMemo(() => {
    const p: Record<string, string | number> = { limit };
    if (sourceFile) p.source_file = sourceFile;
    if (community) p.community = community;
    if (relation) p.relation = relation;
    if (fileType) p.file_type = fileType;
    return p;
  }, [sourceFile, community, relation, fileType, limit]);

  const { data: graph, isLoading: graphLoading } = useQuery<CodeGraph>({
    queryKey: ["code-graph", params],
    queryFn: () => api.getCodeGraph(params as any),
  });

  const { data: stats } = useQuery<CodeGraphStats>({
    queryKey: ["code-graph-stats"],
    queryFn: () => api.getCodeGraphStats(),
  });

  // Convert graph data to React Flow nodes/edges
  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [] as Node[], edges: [] as Edge[] };

    // Simple circular layout
    const nodeCount = graph.nodes.length;
    const radius = Math.max(200, nodeCount * 15);
    const centerX = 400;
    const centerY = 300;

    const flowNodes: Node[] = graph.nodes.map((n, i) => {
      const angle = (i / nodeCount) * 2 * Math.PI;
      return {
        id: n.id,
        type: "codeNode",
        position: {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        },
        data: n as unknown as Record<string, unknown>,
      };
    });

    const flowEdges: Edge[] = graph.links.map((l, i) => ({
      id: `e-${i}`,
      source: l.source,
      target: l.target,
      type: "smoothstep",
      animated: l.relation === "calls",
      style: {
        stroke: EDGE_COLORS[l.relation] || "#94a3b8",
        strokeWidth: 1,
      },
      label: l.relation,
      labelStyle: { fontSize: 9, fill: "#64748b" },
      labelBgStyle: { fill: "#f1f5f9" },
    }));

    return { nodes: flowNodes, edges: flowEdges };
  }, [graph]);

  const nodeTypes: NodeTypes = useMemo(() => ({ codeNode: CodeGraphNodeComponent }), []);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Network className="h-7 w-7 text-phylo-blue" />
          Code Dependency Graph
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Interactive visualization of the Graphify code graph — classes, functions, modules,
          and their relationships (calls, imports, contains, inherits).
        </p>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <StatCard label="Total Nodes" value={stats.total_nodes} />
          <StatCard label="Total Links" value={stats.total_links} />
          <StatCard label="Communities" value={stats.num_communities} />
          <StatCard label="Source Files" value={stats.top_source_files.length} />
          <StatCard label="Commit" value={stats.built_at_commit?.slice(0, 7) || "—"} />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">Filters</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Source File</label>
            <input
              type="text"
              value={sourceFile}
              onChange={(e) => setSourceFile(e.target.value)}
              placeholder="e.g. models.py"
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-phylo-blue"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Community ID</label>
            <input
              type="number"
              value={community}
              onChange={(e) => setCommunity(e.target.value)}
              placeholder="e.g. 0"
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-phylo-blue"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Relation</label>
            <select
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-phylo-blue"
            >
              <option value="">All</option>
              {stats &&
                Object.keys(stats.relations).map((r) => (
                  <option key={r} value={r}>
                    {r} ({stats.relations[r]})
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">File Type</label>
            <select
              value={fileType}
              onChange={(e) => setFileType(e.target.value)}
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-phylo-blue"
            >
              <option value="">All</option>
              {stats &&
                Object.keys(stats.file_types).map((t) => (
                  <option key={t} value={t}>
                    {t} ({stats.file_types[t]})
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Max Nodes</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-phylo-blue"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </div>
        </div>
        {graph && (
          <p className="text-xs text-slate-400 mt-3">
            Showing {graph.node_count} nodes and {graph.link_count} links
          </p>
        )}
      </div>

      {/* Legend */}
      {stats && (
        <div className="flex flex-wrap gap-3 mb-4">
          {Object.keys(EDGE_COLORS).map((r) => (
            <div key={r} className="flex items-center gap-1.5">
              <div
                className="w-3 h-0.5 rounded"
                style={{ backgroundColor: EDGE_COLORS[r] }}
              />
              <span className="text-xs text-slate-500">{r}</span>
            </div>
          ))}
        </div>
      )}

      {/* Graph */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ height: "600px" }}>
        {graphLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 text-phylo-blue animate-spin" />
          </div>
        ) : graph && graph.nodes.length > 0 ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.1}
            maxZoom={3}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Controls />
            <MiniMap
              nodeColor={(n) => NODE_COLORS[(n.data as unknown as CodeGraphNode)?.file_type || "code"] || "#3b82f6"}
              style={{ width: 150, height: 100 }}
            />
          </ReactFlow>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Network className="h-12 w-12 mb-3" />
            <p className="text-sm">No graph data. Adjust filters or check graph.json.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Custom node component ──

function CodeGraphNodeComponent({ data }: { data: CodeGraphNode }) {
  const color = NODE_COLORS[data.file_type || "code"] || "#3b82f6";
  const shortLabel = data.label.length > 25 ? data.label.slice(0, 25) + "…" : data.label;

  return (
    <div
      className="px-3 py-1.5 rounded-lg border-2 bg-white shadow-sm text-xs font-medium text-slate-700 cursor-pointer hover:shadow-md transition-shadow"
      style={{ borderColor: color, minWidth: 80, maxWidth: 180 }}
      title={`${data.label}\nFile: ${data.source_file || "?"}\nLocation: ${data.source_location || "?"}`}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="truncate">{shortLabel}</span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

// ── Helpers ──

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white p-3 rounded-lg border border-slate-200">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold text-slate-900 mt-0.5">{value}</p>
    </div>
  );
}
