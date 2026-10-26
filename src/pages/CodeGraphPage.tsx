import React, { useState, useMemo } from "react";
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
  Loader2,
  Filter,
  Network,
} from "lucide-react";
import { api } from "../lib/api";
import type { CodeGraph, CodeGraphStats, CodeGraphNode } from "../lib/api";

const NODE_COLORS: Record<string, string> = {
  code: "#3a0f34",
  rationale: "#814d75",
  concept: "#7c5800",
  package: "#66365c",
};

const EDGE_COLORS: Record<string, string> = {
  calls: "#814d75",
  contains: "#3a0f34",
  imports: "#66365c",
  imports_from: "#4f444b",
  inherits: "#7c5800",
  extends: "#7c5800",
  references: "#814d75",
  uses: "#3a0f34",
  method: "#81737b",
  rationale_for: "#7c5800",
  indirect_call: "#d2c2cb",
  re_exports: "#62535d",
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

  const { data: graph, isLoading: graphLoading, error: graphError, refetch } = useQuery<CodeGraph>({
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
        stroke: EDGE_COLORS[l.relation] || "#d2c2cb",
        strokeWidth: 1.5,
      },
      label: l.relation,
      labelStyle: { fontSize: 9, fill: "#62535d", fontFamily: "Work Sans" },
      labelBgStyle: { fill: "#fbf9f4", stroke: "#d2c2cb", strokeWidth: 1 },
    }));

    return { nodes: flowNodes, edges: flowEdges };
  }, [graph]);

  const nodeTypes: NodeTypes = useMemo(() => ({ codeNode: CodeGraphNodeComponent }), []);

  return (
    <div className="p-8 max-w-[1400px] mx-auto bg-[#fbf9f4] min-h-screen text-[#4f444b]">
      {graphError && (
        <div role="alert" className="mb-6 rounded-xl border border-[#814d75] bg-[#eee7ec] p-4 text-[#3a0f34]">
          <p className="font-serif">Could not load the code graph: {graphError.message}</p>
          <button onClick={() => refetch()} className="btn-primary mt-3 text-xs">Retry</button>
        </div>
      )}
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-serif font-bold text-[#3a0f34] flex items-center gap-2">
          <Network className="h-7 w-7 text-[#814d75]" />
          Code Dependency Graph
        </h1>
        <p className="text-sm text-[#62535d] mt-1 font-serif">
          Interactive visualization of the Graphify code graph — classes, functions, modules,
          and their relationships (calls, imports, contains, inherits).
        </p>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatCard label="Total Nodes" value={stats.total_nodes} />
          <StatCard label="Total Links" value={stats.total_links} />
          <StatCard label="Communities" value={stats.num_communities} />
          <StatCard label="Source Files" value={stats.top_source_files.length} />
          <StatCard label="Commit" value={stats.built_at_commit?.slice(0, 7) || "—"} />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-[#d2c2cb] p-5 mb-6 shadow-xs">
        <div className="flex items-center gap-2 mb-3 border-b border-[#eee7ec] pb-2">
          <Filter className="h-4 w-4 text-[#814d75]" />
          <span className="text-sm font-semibold text-[#3a0f34] font-sans">Filters</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-[#62535d] mb-1 block font-sans font-medium">Source File</label>
            <input
              type="text"
              value={sourceFile}
              onChange={(e) => setSourceFile(e.target.value)}
              placeholder="e.g. models.py"
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-[#d2c2cb] bg-white text-[#3a0f34] focus:outline-none focus:ring-2 focus:ring-[#814d75]"
            />
          </div>
          <div>
            <label className="text-xs text-[#62535d] mb-1 block font-sans font-medium">Community ID</label>
            <input
              type="number"
              value={community}
              onChange={(e) => setCommunity(e.target.value)}
              placeholder="e.g. 0"
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-[#d2c2cb] bg-white text-[#3a0f34] focus:outline-none focus:ring-2 focus:ring-[#814d75]"
            />
          </div>
          <div>
            <label className="text-xs text-[#62535d] mb-1 block font-sans font-medium">Relation</label>
            <select
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-[#d2c2cb] bg-white text-[#3a0f34] focus:outline-none focus:ring-2 focus:ring-[#814d75]"
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
            <label className="text-xs text-[#62535d] mb-1 block font-sans font-medium">File Type</label>
            <select
              value={fileType}
              onChange={(e) => setFileType(e.target.value)}
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-[#d2c2cb] bg-white text-[#3a0f34] focus:outline-none focus:ring-2 focus:ring-[#814d75]"
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
            <label className="text-xs text-[#62535d] mb-1 block font-sans font-medium">Max Nodes</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-[#d2c2cb] bg-white text-[#3a0f34] focus:outline-none focus:ring-2 focus:ring-[#814d75]"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </div>
        </div>
        {graph && (
          <p className="text-xs text-[#81737b] mt-3 font-sans">
            Showing {graph.node_count} nodes and {graph.link_count} links
          </p>
        )}
      </div>

      {/* Legend */}
      {stats && (
        <div className="flex flex-wrap gap-3 mb-4 bg-white/70 p-3 rounded-lg border border-[#d2c2cb]">
          {Object.keys(EDGE_COLORS).map((r) => (
            <div key={r} className="flex items-center gap-1.5">
              <div
                className="w-3.5 h-1 rounded"
                style={{ backgroundColor: EDGE_COLORS[r] }}
              />
              <span className="text-xs text-[#62535d] font-sans">{r}</span>
            </div>
          ))}
        </div>
      )}

      {/* Graph */}
      <div className="bg-white rounded-xl border border-[#d2c2cb] overflow-hidden shadow-xs" style={{ height: "600px" }}>
        {graphLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 text-[#814d75] animate-spin" />
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
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d2c2cb" />
            <Controls />
            <MiniMap
              nodeColor={(n) => NODE_COLORS[(n.data as unknown as CodeGraphNode)?.file_type || "code"] || "#3a0f34"}
              style={{ width: 150, height: 100, backgroundColor: "#fbf9f4", borderColor: "#d2c2cb" }}
            />
          </ReactFlow>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-[#81737b]">
            <Network className="h-12 w-12 mb-3 text-[#d2c2cb]" />
            <p className="text-sm font-serif">No graph data. Adjust filters or check graph.json.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Custom node component ──

function CodeGraphNodeComponent({ data }: { data: CodeGraphNode }) {
  const color = NODE_COLORS[data.file_type || "code"] || "#3a0f34";
  const shortLabel = data.label.length > 25 ? data.label.slice(0, 25) + "…" : data.label;

  return (
    <div
      className="px-3 py-1.5 rounded-lg border bg-white shadow-xs text-xs font-medium text-[#3a0f34] cursor-pointer hover:shadow-md transition-shadow font-sans"
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
    <div className="bg-white p-3.5 rounded-xl border border-[#d2c2cb] shadow-xs">
      <p className="text-xs text-[#62535d] font-sans">{label}</p>
      <p className="text-lg font-serif font-bold text-[#3a0f34] mt-0.5">{value}</p>
    </div>
  );
}
