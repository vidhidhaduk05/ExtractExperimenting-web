import React, { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
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
  Share2,
  FileText,
  Variable as VariableIcon,
  Table2,
  BarChart3,
} from "lucide-react";
import { api } from "../lib/api";
import type { ReviewGraph, ReviewGraphNode, ReviewGraphStats } from "../lib/api";

const NODE_STYLES: Record<
  string,
  { color: string; bg: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }
> = {
  study: { color: "#3b82f6", bg: "#eff6ff", icon: FileText },
  variable: { color: "#f59e0b", bg: "#fffbeb", icon: VariableIcon },
  extraction: { color: "#10b981", bg: "#ecfdf5", icon: Table2 },
  meta_analysis: { color: "#8b5cf6", bg: "#f5f3ff", icon: BarChart3 },
};

const EDGE_COLORS: Record<string, string> = {
  has_extraction: "#10b981",
  value_of: "#f59e0b",
  includes_study: "#8b5cf6",
};

export function ReviewGraphPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [nodeTypeFilter, setNodeTypeFilter] = useState<string>("");
  const [showExtractions, setShowExtractions] = useState(true);

  const { data: graph, isLoading } = useQuery<ReviewGraph>({
    queryKey: ["review-graph", projectId],
    queryFn: () => api.getReviewGraph(projectId!),
    enabled: !!projectId,
  });

  const { data: stats } = useQuery<ReviewGraphStats>({
    queryKey: ["review-graph-stats", projectId],
    queryFn: () => api.getReviewGraphStats(projectId!),
    enabled: !!projectId,
  });

  // Convert to React Flow format
  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [] as Node[], edges: [] as Edge[] };

    let filteredNodes = graph.nodes;
    let filteredLinks = graph.links;

    // Optionally hide extraction nodes (they can be numerous)
    if (!showExtractions) {
      const extractionIds = new Set(
        filteredNodes.filter((n) => n.type === "extraction").map((n) => n.id)
      );
      filteredNodes = filteredNodes.filter((n) => n.type !== "extraction");
      filteredLinks = filteredLinks.filter(
        (l) => !extractionIds.has(l.source) && !extractionIds.has(l.target)
      );
      // Add direct study→variable links when extractions are hidden
      const studyVarPairs = new Set<string>();
      graph.links.forEach((l) => {
        if (l.relation === "has_extraction") {
          // study → extraction
          const studyId = l.source;
          graph.links.forEach((l2) => {
            if (l2.source === l.target && l2.relation === "value_of") {
              const varId = l2.target;
              const key = `${studyId}->${varId}`;
              if (!studyVarPairs.has(key)) {
                studyVarPairs.add(key);
                filteredLinks.push({
                  source: studyId,
                  target: varId,
                  relation: "extracts",
                });
              }
            }
          });
        }
      });
    }

    // Filter by node type
    if (nodeTypeFilter) {
      filteredNodes = filteredNodes.filter((n) => n.type === nodeTypeFilter);
      const nodeIds = new Set(filteredNodes.map((n) => n.id));
      filteredLinks = filteredLinks.filter(
        (l) => nodeIds.has(l.source) && nodeIds.has(l.target)
      );
    }

    // Layout: group by type in columns
    const typeOrder = ["study", "extraction", "variable", "meta_analysis"];
    const typeCounts: Record<string, number> = {};
    filteredNodes.forEach((n) => {
      typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
    });

    const typeIndices: Record<string, number> = {};
    const colWidth = 350;
    const rowHeight = 70;

    const flowNodes: Node[] = filteredNodes.map((n) => {
      const typeIdx = typeOrder.indexOf(n.type);
      if (typeIndices[n.type] === undefined) typeIndices[n.type] = 0;
      const rowIdx = typeIndices[n.type]++;
      return {
        id: n.id,
        type: "reviewNode",
        position: {
          x: typeIdx * colWidth,
          y: rowIdx * rowHeight,
        },
        data: n as unknown as Record<string, unknown>,
      };
    });

    const flowEdges: Edge[] = filteredLinks.map((l, i) => ({
      id: `re-${i}`,
      source: l.source,
      target: l.target,
      type: "smoothstep",
      style: {
        stroke: EDGE_COLORS[l.relation] || "#94a3b8",
        strokeWidth: 1,
      },
    }));

    return { nodes: flowNodes, edges: flowEdges };
  }, [graph, nodeTypeFilter, showExtractions]);

  const nodeTypes: NodeTypes = useMemo(() => ({ reviewNode: ReviewGraphNodeComponent }), []);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Share2 className="2h-7 w-7 text-phylo-blue" />
          Review Data Graph
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Interactive graph of the review data structure — studies, variables, extractions,
          and meta-analyses and their relationships.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <StatCard label="Total Nodes" value={stats.total_nodes} />
          <StatCard label="Total Links" value={stats.total_links} />
          <StatCard label="Studies" value={stats.node_types.study || 0} />
          <StatCard label="Variables" value={stats.node_types.variable || 0} />
          <StatCard label="Meta-Analyses" value={stats.node_types.meta_analysis || 0} />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">Filters</span>
        </div>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Node Type</label>
            <select
              value={nodeTypeFilter}
              onChange={(e) => setNodeTypeFilter(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-phylo-blue"
            >
              <option value="">All Types</option>
              <option value="study">Studies</option>
              <option value="variable">Variables</option>
              <option value="extraction">Extractions</option>
              <option value="meta_analysis">Meta-Analyses</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showExtractions}
                onChange={(e) => setShowExtractions(e.target.checked)}
                className="rounded border-slate-300"
              />
              Show extraction nodes
            </label>
          </div>
        </div>
        {graph && (
          <p className="text-xs text-slate-400 mt-3">
            Showing {nodes.length} nodes and {edges.length} links
          </p>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-4">
        {Object.entries(NODE_STYLES).map(([type, style]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded border-2"
              style={{ borderColor: style.color, backgroundColor: style.bg }}
            />
            <span className="text-xs text-slate-500 capitalize">{type.replace("_", " ")}</span>
          </div>
        ))}
      </div>

      {/* Graph */}
      <div
        className="bg-white rounded-xl border border-slate-200 overflow-hidden"
        style={{ height: "600px" }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 text-phylo-blue animate-spin" />
          </div>
        ) : graph && graph.nodes.length > 0 ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.05}
            maxZoom={3}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Controls />
            <MiniMap
              nodeColor={(n) => {
                const type = (n.data as unknown as ReviewGraphNode)?.type || "study";
                return NODE_STYLES[type]?.color || "#3b82f6";
              }}
              style={{ width: 150, height: 100 }}
            />
          </ReactFlow>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Share2 className="h-12 w-12 mb-3" />
            <p className="text-sm">No review data found. Add studies and variables to see the graph.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Custom node component ──

function ReviewGraphNodeComponent({ data }: { data: any }) {
  const nodeData = data as ReviewGraphNode;
  const style = NODE_STYLES[nodeData.type] || NODE_STYLES.study;
  const Icon = style.icon;
  const shortLabel = nodeData.label.length > 30 ? nodeData.label.slice(0, 30) + "…" : nodeData.label;

  const tooltip = (() => {
    switch (nodeData.type) {
      case "study":
        return `${nodeData.title || nodeData.label}\nYear: ${nodeData.year || "?"}\nJournal: ${nodeData.journal || "?"}\nStatus: ${nodeData.screening_status || "?"}`;
      case "variable":
        return `${nodeData.label}\nSection: ${nodeData.section || "?"}\nType: ${nodeData.field_type || "?"}`;
      case "extraction":
        return `Value: ${nodeData.value || "?"}\nConfidence: ${nodeData.confidence ?? "?"}`;
      case "meta_analysis":
        return `${nodeData.label}\nMeasure: ${nodeData.effect_measure || "?"}\nN Studies: ${nodeData.n_studies ?? "?"}`;
      default:
        return nodeData.label;
    }
  })();

  return (
    <div
      className="px-3 py-2 rounded-lg border-2 shadow-sm text-xs cursor-pointer hover:shadow-md transition-shadow"
      style={{
        borderColor: style.color,
        backgroundColor: style.bg,
        minWidth: 90,
        maxWidth: 200,
      }}
      title={tooltip}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: style.color }} />
        <span className="truncate font-medium text-slate-700">{shortLabel}</span>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
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
