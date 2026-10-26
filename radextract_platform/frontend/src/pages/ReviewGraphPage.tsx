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
  study: { color: "#3a0f34", bg: "#eee7ec", icon: FileText },
  variable: { color: "#814d75", bg: "#fbf9f4", icon: VariableIcon },
  extraction: { color: "#7c5800", bg: "#ffdea6", icon: Table2 },
  meta_analysis: { color: "#3a0f34", bg: "#fbf9f4", icon: BarChart3 },
};

const EDGE_COLORS: Record<string, string> = {
  has_extraction: "#814d75",
  value_of: "#7c5800",
  includes_study: "#3a0f34",
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
      const valueOfTargetsBySource = new Map<string, string[]>();
      graph.links.forEach((l) => {
        if (l.relation === "value_of") {
          const list = valueOfTargetsBySource.get(l.source) || [];
          list.push(l.target);
          valueOfTargetsBySource.set(l.source, list);
        }
      });

      graph.links.forEach((l) => {
        if (l.relation === "has_extraction") {
          const studyId = l.source;
          const varIds = valueOfTargetsBySource.get(l.target);
          if (varIds) {
            varIds.forEach((varId) => {
              const key = `${studyId}->${varId}`;
              if (!studyVarPairs.has(key)) {
                studyVarPairs.add(key);
                filteredLinks.push({
                  source: studyId,
                  target: varId,
                  relation: "extracts",
                });
              }
            });
          }
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
        stroke: EDGE_COLORS[l.relation] || "#d2c2cb",
        strokeWidth: 1.5,
      },
    }));

    return { nodes: flowNodes, edges: flowEdges };
  }, [graph, nodeTypeFilter, showExtractions]);

  const nodeTypes: NodeTypes = useMemo(() => ({ reviewNode: ReviewGraphNodeComponent }), []);

  return (
    <div className="p-8 max-w-[1400px] mx-auto bg-[#fbf9f4] min-h-screen text-[#4f444b]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-serif font-bold text-[#3a0f34] flex items-center gap-2">
          <Share2 className="h-7 w-7 text-[#814d75]" />
          Review Data Graph
        </h1>
        <p className="text-sm text-[#62535d] mt-1 font-serif">
          Interactive graph of the review data structure — studies, variables, extractions,
          and meta-analyses and their relationships.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatCard label="Total Nodes" value={stats.total_nodes} />
          <StatCard label="Total Links" value={stats.total_links} />
          <StatCard label="Studies" value={stats.node_types.study || 0} />
          <StatCard label="Variables" value={stats.node_types.variable || 0} />
          <StatCard label="Meta-Analyses" value={stats.node_types.meta_analysis || 0} />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-[#d2c2cb] p-5 mb-6 shadow-xs">
        <div className="flex items-center gap-2 mb-3 border-b border-[#eee7ec] pb-2">
          <Filter className="h-4 w-4 text-[#814d75]" />
          <span className="text-sm font-semibold text-[#3a0f34] font-sans">Filters</span>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <div>
            <label className="text-xs text-[#62535d] mb-1 block font-sans font-medium">Node Type</label>
            <select
              value={nodeTypeFilter}
              onChange={(e) => setNodeTypeFilter(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-lg border border-[#d2c2cb] bg-white text-[#3a0f34] focus:outline-none focus:ring-2 focus:ring-[#814d75]"
            >
              <option value="">All Types</option>
              <option value="study">Studies</option>
              <option value="variable">Variables</option>
              <option value="extraction">Extractions</option>
              <option value="meta_analysis">Meta-Analyses</option>
            </select>
          </div>
          <div className="flex items-end pt-5">
            <label className="flex items-center gap-2 text-sm text-[#4f444b] cursor-pointer font-sans">
              <input
                type="checkbox"
                checked={showExtractions}
                onChange={(e) => setShowExtractions(e.target.checked)}
                className="rounded border-[#d2c2cb] text-[#3a0f34] focus:ring-[#814d75]"
              />
              Show extraction nodes
            </label>
          </div>
        </div>
        {graph && (
          <p className="text-xs text-[#81737b] mt-3 font-sans">
            Showing {nodes.length} nodes and {edges.length} links
          </p>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-4 bg-white/70 p-3 rounded-lg border border-[#d2c2cb]">
        {Object.entries(NODE_STYLES).map(([type, style]) => (
          <div key={type} className="flex items-center gap-2">
            <div
              className="w-3.5 h-3.5 rounded border"
              style={{ borderColor: style.color, backgroundColor: style.bg }}
            />
            <span className="text-xs font-sans text-[#62535d] capitalize">{type.replace("_", " ")}</span>
          </div>
        ))}
      </div>

      {/* Graph */}
      <div
        className="bg-white rounded-xl border border-[#d2c2cb] overflow-hidden shadow-xs"
        style={{ height: "600px" }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 text-[#814d75] animate-spin" />
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
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d2c2cb" />
            <Controls />
            <MiniMap
              nodeColor={(n) => {
                const type = (n.data as unknown as ReviewGraphNode)?.type || "study";
                return NODE_STYLES[type]?.color || "#3a0f34";
              }}
              style={{ width: 150, height: 100, backgroundColor: "#fbf9f4", borderColor: "#d2c2cb" }}
            />
          </ReactFlow>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-[#81737b]">
            <Share2 className="h-12 w-12 mb-3 text-[#d2c2cb]" />
            <p className="text-sm font-serif">No review data found. Add studies and variables to see the graph.</p>
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
      className="px-3 py-2 rounded-lg border shadow-xs text-xs cursor-pointer hover:shadow-md transition-shadow font-sans"
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
        <span className="truncate font-medium text-[#3a0f34]">{shortLabel}</span>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
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
