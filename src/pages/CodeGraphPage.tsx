import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  Position,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
   Compass,
  Copy,
  Download,
  Eye,
  FileCode,
  Filter,
  GitBranch,
  GitCommit,
  Info,
  Layers,
  Loader2,
  Maximize2,
  Network,
  RefreshCw,
  Route,
  Search,
  ShieldAlert,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types & Interfaces (Compatible with existing api.ts + extended Dual-View API)
// ---------------------------------------------------------------------------

export interface SnapshotMetadata {
  snapshot_id: string;
  built_at_commit: string;
  schema_version: string;
  file_mtime: string;
  file_size_bytes?: number;
  graph_path_source: string;
  freshness_status: "fresh" | "stale" | "sample";
  stale_reason?: string | null;
  corpus_total_nodes: number;
  corpus_total_links: number;
}

export interface CodeGraphNode {
  id: string;
  label?: string;
  name?: string;
  type?: string;
  file_type?: string;
  source_file?: string;
  path?: string;
  community?: number;
  provenance?: "extracted" | "inferred";
  hop_distance?: number;
  is_focal?: boolean;
  degree?: number;
  details?: Record<string, unknown>;
}

export interface CodeGraphLink {
  source: string;
  target: string;
  relation?: string;
  type?: string;
  provenance?: "extracted" | "inferred";
  inferred?: boolean;
  direction?: string;
  weight?: number;
}

export interface CodeGraphResponse {
  nodes: CodeGraphNode[];
  links: CodeGraphLink[];
  node_count: number;
  link_count: number;
  offset?: number;
  limit?: number;
  matched_total_nodes?: number;
  matched_total_links?: number;
  corpus_total_nodes?: number;
  corpus_total_links?: number;
  is_subset?: boolean;
  is_truncated?: boolean;
  has_more?: boolean;
  built_at_commit?: string;
  snapshot?: SnapshotMetadata;
  focal_node_id?: string;
  hops?: number;
}

export interface CodeGraphStatsResponse {
  total_nodes: number;
  total_links: number;
  corpus_total_nodes?: number;
  corpus_total_links?: number;
  file_types?: Record<string, number>;
  node_types?: Record<string, number>;
  relations?: Record<string, number>;
  link_types?: Record<string, number>;
  provenance_counts?: {
    extracted: number;
    inferred: number;
  };
  num_communities?: number;
  top_communities?: Record<string, number>;
  top_source_files?: Array<{ path: string; node_count: number }>;
  built_at_commit?: string;
  schema_version?: string;
  snapshot?: SnapshotMetadata;
}

export interface CommunitySummaryItem {
  community_id: number;
  label: string;
  node_count: number;
  internal_link_count: number;
  external_link_count: number;
  file_types: Record<string, number>;
  top_source_files: Array<{ path: string; node_count: number }>;
  hub_nodes: Array<{
    id: string;
    label: string;
    source_file: string;
    degree: number;
  }>;
}

export interface InterCommunityLink {
  source_community: number;
  target_community: number;
  link_count: number;
  extracted_count: number;
  inferred_count: number;
  relations: Record<string, number>;
}

export interface CommunitiesOverviewResponse {
  communities: CommunitySummaryItem[];
  community_links: InterCommunityLink[];
  num_communities: number;
  corpus_total_nodes: number;
  corpus_total_links: number;
  built_at_commit: string;
  snapshot?: SnapshotMetadata;
}

export interface PathResponse {
  found: boolean;
  source_resolved: string | null;
  target_resolved: string | null;
  nodes: CodeGraphNode[];
  links: CodeGraphLink[];
  hop_count: number;
  built_at_commit: string;
  snapshot?: SnapshotMetadata;
}

export interface WorkflowNodeMapping {
  diagram_node_id: string;
  title: string;
  status: "implemented" | "planned";
  available: boolean;
  matched_count?: number;
  primary_node_id?: string | null;
  primary_label?: string | null;
  primary_source_file?: string | null;
  primary_community?: number | null;
  matched_nodes: Array<{
    id: string;
    label: string;
    source_file: string;
    community?: number;
  }>;
  reason?: string | null;
}

export interface WorkflowMappingResponse {
  mappings: Record<string, WorkflowNodeMapping>;
  built_at_commit: string;
  snapshot?: SnapshotMetadata;
}

// ---------------------------------------------------------------------------
// Master Theme Palette & Typography Tokens (No arbitrary blue/neon Tailwind)
// ---------------------------------------------------------------------------

const THEME = {
  wine: "#3a0f34",
  wineDark: "#280924",
  plum: "#814d75",
  plumDeep: "#66365c",
  plumMuted: "#62535d",
  plumOutline: "#d2c2cb",
  paper: "#fbf9f4",
  paperWarm: "#f4efe6",
  cardWhite: "#ffffff",
  amber: "#7c5800",
  amberBg: "#fdf8ec",
  ink: "#2b1d28",
};

const NODE_COLORS: Record<string, string> = {
  code: "#3a0f34",
  rationale: "#814d75",
  concept: "#7c5800",
  package: "#66365c",
  community: "#3a0f34",
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
  indirect_call: "#a68b9f",
  re_exports: "#62535d",
};

// ---------------------------------------------------------------------------
// Direct Truthful API Client (Never silently substitutes demo fallback)
// ---------------------------------------------------------------------------

function getApiBaseUrl(): string {
  const envUrl = (import.meta as unknown as { env?: Record<string, string> })?.env?.VITE_API_URL;
  if (envUrl) {
    return envUrl.replace(/\/+$/, "");
  }
  return "/api";
}

async function fetchGraphifyEndpoint<T>(pathWithQuery: string): Promise<T> {
  const base = getApiBaseUrl();
  const normalizedPath = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  const url = base.endsWith("/api") && normalizedPath.startsWith("/api/")
    ? `${base}${normalizedPath.slice(4)}`
    : `${base}${normalizedPath}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  try {
    const token =
      localStorage.getItem("radextract_token") ||
      localStorage.getItem("token") ||
      localStorage.getItem("auth_token");
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // Ignore storage access errors in restricted contexts
  }

  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (networkErr) {
    throw new Error(
      `Backend unreachable (${networkErr instanceof Error ? networkErr.message : "network error"}). ` +
      `Real Graphify data cannot be loaded without an active backend connection.`
    );
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status} ${response.statusText}`;
    try {
      const errBody = await response.json();
      if (errBody?.detail) {
        detail = String(errBody.detail);
      }
    } catch {
      // Ignore non-JSON error body
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Authorization failure (${response.status}): ${detail}`);
    }
    if (response.status === 404) {
      throw new Error(`Graph snapshot missing (404): ${detail}`);
    }
    if (response.status === 422) {
      throw new Error(`Corrupt or invalid graph.json snapshot (422): ${detail}`);
    }
    throw new Error(`Graphify API error (${response.status}): ${detail}`);
  }

  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Explicit, Labelled Sample Data (Used ONLY when user manually enables Sample Mode)
// ---------------------------------------------------------------------------

const EXPLICIT_SAMPLE_SNAPSHOT: SnapshotMetadata = {
  snapshot_id: "sample-demo-only",
  built_at_commit: "sample-not-real-repo",
  schema_version: "sample-1.0",
  file_mtime: "2026-10-27T00:00:00Z",
  graph_path_source: "manual_sample_mode",
  freshness_status: "sample",
  stale_reason: "Explicitly enabled sample mode — not loaded from graphify-out/graph.json",
  corpus_total_nodes: 8,
  corpus_total_links: 8,
};

const EXPLICIT_SAMPLE_GRAPH: CodeGraphResponse = {
  nodes: [
    { id: "backend/services/jev_screener.py::AIScreeningPipeline", label: "AIScreeningPipeline", file_type: "code", source_file: "backend/services/jev_screener.py", community: 1, provenance: "extracted" },
    { id: "backend/services/jev_client.py::LayaModel", label: "LayaModel", file_type: "code", source_file: "backend/services/jev_client.py", community: 1, provenance: "extracted" },
    { id: "backend/services/coded_extraction_service.py::coded_extraction_service", label: "coded_extraction_service", file_type: "code", source_file: "backend/services/coded_extraction_service.py", community: 2, provenance: "extracted" },
    { id: "backend/services/laya_extraction_tracer.py::laya_extraction_tracer", label: "laya_extraction_tracer", file_type: "code", source_file: "backend/services/laya_extraction_tracer.py", community: 2, provenance: "extracted" },
    { id: "backend/services/prisma2020_sync.py::prisma2020_sync", label: "prisma2020_sync", file_type: "code", source_file: "backend/services/prisma2020_sync.py", community: 3, provenance: "extracted" },
    { id: "backend/routers/graphify.py::get_code_graph", label: "get_code_graph", file_type: "code", source_file: "backend/routers/graphify.py", community: 4, provenance: "extracted" },
    { id: "frontend/src/pages/CodeGraphPage.tsx::CodeGraphPage", label: "CodeGraphPage", file_type: "code", source_file: "frontend/src/pages/CodeGraphPage.tsx", community: 4, provenance: "extracted" },
    { id: "docs/rationale::DualViewArchitecture", label: "DualViewArchitecture", file_type: "rationale", source_file: "CODE_GRAPH_DUAL_VIEW_PLAN.md", community: 4, provenance: "inferred" },
  ],
  links: [
    { source: "backend/services/jev_screener.py::AIScreeningPipeline", target: "backend/services/jev_client.py::LayaModel", relation: "calls", provenance: "extracted" },
    { source: "backend/services/coded_extraction_service.py::coded_extraction_service", target: "backend/services/laya_extraction_tracer.py::laya_extraction_tracer", relation: "calls", provenance: "extracted" },
    { source: "backend/services/jev_screener.py::AIScreeningPipeline", target: "backend/services/coded_extraction_service.py::coded_extraction_service", relation: "references", provenance: "inferred" },
    { source: "backend/services/coded_extraction_service.py::coded_extraction_service", target: "backend/services/prisma2020_sync.py::prisma2020_sync", relation: "calls", provenance: "extracted" },
    { source: "frontend/src/pages/CodeGraphPage.tsx::CodeGraphPage", target: "backend/routers/graphify.py::get_code_graph", relation: "calls", provenance: "extracted" },
    { source: "docs/rationale::DualViewArchitecture", target: "frontend/src/pages/CodeGraphPage.tsx::CodeGraphPage", relation: "rationale_for", provenance: "inferred" },
  ],
  node_count: 8,
  link_count: 6,
  offset: 0,
  limit: 200,
  matched_total_nodes: 8,
  matched_total_links: 6,
  corpus_total_nodes: 8,
  corpus_total_links: 6,
  is_subset: false,
  is_truncated: false,
  built_at_commit: "sample-not-real-repo",
  snapshot: EXPLICIT_SAMPLE_SNAPSHOT,
};

// ---------------------------------------------------------------------------
// Reviewed Mermaid Diagrams & Structured Metadata (from CODE_GRAPH_DUAL_VIEW_PLAN.md)
// ---------------------------------------------------------------------------

export interface WorkflowNodeSpec {
  id: string;
  labelLines: string[];
  subgraph?: string;
  status: "implemented" | "planned" | "storage";
  sourceHint: string;
  description: string;
}

export interface WorkflowEdgeSpec {
  from: string;
  to: string;
  label?: string;
  style: "solid" | "dashed";
}

export interface ReviewedDiagramDefinition {
  id: string;
  title: string;
  subtitle: string;
  lastReviewedDate: string;
  revisionLabel: string;
  direction: "TB" | "LR";
  mermaidSource: string;
  summaryNote: string;
  nodes: WorkflowNodeSpec[];
  edges: WorkflowEdgeSpec[];
}

export const WORKFLOW_QUALIFICATIONS: string[] = [
  "Protocol extraction is not currently established as Laya-only; the inspected implementation uses sections/patterns and an LLM fallback.",
  "Laya is the required intended primary screening engine, but actual runtime settings/provider and fallback must be shown truthfully. Do not infer deployed provider from documentation alone.",
  "Screening has known accuracy concerns: search-string veto, incomplete criterion composition and text truncation. Diagram existence does not certify correctness.",
  "Structured extraction still has generator dependencies. Local evidence-tracer guardrails were patched earlier with mocked regression tests; a clinical accuracy benchmark remains pending.",
  "PRISMA has known pending-state and report-versus-study counting gaps.",
  "Rigor Scan is a separate reporting-check tool, not the screening engine. Its synthetic reader/chart/software-check gaps are tracked separately in the main handoff.",
  "Reference deduplication differs from SLIDERS reconciliation of extracted rows.",
  "Import History, source-column duplicate review and SLIDERS are planned/unverified, not completed workflow nodes.",
];

export const REVIEWED_DIAGRAMS: ReviewedDiagramDefinition[] = [
  {
    id: "app-overview",
    title: "Current Application Overview",
    subtitle: "Functional source-based workflow across protocol intake, multi-stage screening, extraction, and PRISMA",
    lastReviewedDate: "2026-10-27",
    revisionLabel: "CODE_GRAPH_DUAL_VIEW_PLAN v1.0",
    direction: "TB",
    summaryNote:
      "Solid arrows show implemented functional flow or data dependencies. They do not imply every step is automatic or verified. Reviewer actions and extraction/appraisal/export can be invoked separately; the full screening action itself runs title → abstract → full text. Dashed boxes show planned additions, not current integration.",
    mermaidSource: `flowchart TB
  subgraph Inputs["Inputs and project settings"]
    P["Upload existing protocol"] --> PE["Protocol parser
Section and pattern extraction
LLM fallback"]
    PE --> C["Editable project PICO
and exclusion settings"]
    R["Import references
or fetch literature"] --> D["Duplicate detection
DOI, PMID, title and author/year"]
    D --> DR["Reviewer duplicate resolution
Keep, merge, keep both or revert"]
  end

  subgraph Review["Screening and reviewer decisions"]
    C --> S["Multi-stage screening service"]
    DR --> S
    S --> T["Title screening"]
    T --> A["Abstract screening
Pending and uncertain records"]
    A --> F["Full-text screening
Eligible stage and document checks"]
    T --> E["Screening engine routing"]
    A --> E
    F --> E
    E --> L["Local Laya ONNX
When configured as primary"]
    E --> O["Other configured provider
or LLM fallback"]
    L --> J["Composed recommendation
Include, exclude or uncertain"]
    O --> J
    J --> H["Reviewer decisions
and clarification answers"]
  end

  subgraph Extraction["Documents and extraction"]
    PDF["Upload or retrieve full text"] --> DP["PDF parsing
Docling or fallback"]
    DP --> F
    DP --> X["Extraction service
Configured generator and rules"]
    X --> V["Quote and value checks
Laya evidence tracing"]
    V --> HR["Reviewer edits
and verification"]
  end

  DB[("Project database
Records, decisions, documents
and extraction values")]
  C --> DB
  DR --> DB
  H --> DB
  DP --> DB
  HR --> DB
  DB --> S
  DB --> X
  DB --> RB["Risk-of-bias assessment
Reviewer or optional batch action"]
  DB --> AN["Analysis and synthesis actions"]
  DB --> PR["PRISMA counting services"]
  PR --> EX["Diagrams and exports"]
  AN --> EX
  RB --> EX

  SL["Planned: optional SLIDERS adapter
Benchmark before adoption"] -.-> X
  VR["Planned: versioned approved criteria
and reusable reviewer interpretations"] -.-> C
  IH["Planned: real Import History
and source-column duplicate matrix"] -.-> DR

  classDef planned fill:#fbf9f4,stroke:#814d75,stroke-dasharray:5 4,color:#62535d;
  class SL,VR,IH planned;`,
    nodes: [
      { id: "P", labelLines: ["Upload existing protocol"], subgraph: "Inputs and project settings", status: "implemented", sourceHint: "protocol upload router", description: "Uploads existing review protocol file for parsing." },
      { id: "PE", labelLines: ["Protocol parser", "Section & pattern extraction", "LLM fallback"], subgraph: "Inputs and project settings", status: "implemented", sourceHint: "protocol_parser", description: "Uses section/pattern extraction with an LLM fallback (not Laya-only)." },
      { id: "C", labelLines: ["Editable project PICO", "and exclusion settings"], subgraph: "Inputs and project settings", status: "implemented", sourceHint: "project_settings / PICO", description: "Stores editable PICO criteria and exclusion settings." },
      { id: "R", labelLines: ["Import references", "or fetch literature"], subgraph: "Inputs and project settings", status: "implemented", sourceHint: "import_references", description: "Imports bibliographic records or fetches literature." },
      { id: "D", labelLines: ["Duplicate detection", "DOI, PMID, title & author/year"], subgraph: "Inputs and project settings", status: "implemented", sourceHint: "duplicate_detection", description: "Detects candidate duplicates by DOI, PMID, title, and author/year." },
      { id: "DR", labelLines: ["Reviewer duplicate resolution", "Keep, merge, keep both or revert"], subgraph: "Inputs and project settings", status: "implemented", sourceHint: "duplicate_resolution", description: "Interactive duplicate resolution decisions by reviewers." },
      { id: "S", labelLines: ["Multi-stage screening service"], subgraph: "Screening and reviewer decisions", status: "implemented", sourceHint: "AIScreeningPipeline / jev_screener", description: "Orchestrates title, abstract, and full-text screening stages." },
      { id: "T", labelLines: ["Title screening"], subgraph: "Screening and reviewer decisions", status: "implemented", sourceHint: "AIScreeningPipeline", description: "Stage 1 title-level screening." },
      { id: "A", labelLines: ["Abstract screening", "Pending and uncertain records"], subgraph: "Screening and reviewer decisions", status: "implemented", sourceHint: "AIScreeningPipeline", description: "Stage 2 abstract-level screening for pending/uncertain records." },
      { id: "F", labelLines: ["Full-text screening", "Eligible stage & doc checks"], subgraph: "Screening and reviewer decisions", status: "implemented", sourceHint: "AIScreeningPipeline", description: "Stage 3 full-text eligibility verification." },
      { id: "E", labelLines: ["Screening engine routing"], subgraph: "Screening and reviewer decisions", status: "implemented", sourceHint: "jev_screener / jev_client", description: "Routes screening evaluation to primary Laya ONNX or configured fallback." },
      { id: "L", labelLines: ["Local Laya ONNX", "When configured as primary"], subgraph: "Screening and reviewer decisions", status: "implemented", sourceHint: "LayaModel / jev_client", description: "Local ONNX inference engine when configured as primary provider." },
      { id: "O", labelLines: ["Other configured provider", "or LLM fallback"], subgraph: "Screening and reviewer decisions", status: "implemented", sourceHint: "jev_client", description: "Alternative configured provider or LLM fallback." },
      { id: "J", labelLines: ["Composed recommendation", "Include, exclude or uncertain"], subgraph: "Screening and reviewer decisions", status: "implemented", sourceHint: "jev_screener", description: "Composes criterion outputs into include/exclude/uncertain recommendation." },
      { id: "H", labelLines: ["Reviewer decisions", "and clarification answers"], subgraph: "Screening and reviewer decisions", status: "implemented", sourceHint: "reviewer_decisions", description: "Records reviewer screening decisions and clarifications." },
      { id: "PDF", labelLines: ["Upload or retrieve full text"], subgraph: "Documents and extraction", status: "implemented", sourceHint: "pdf_upload", description: "Retrieves or uploads study full-text PDFs." },
      { id: "DP", labelLines: ["PDF parsing", "Docling or fallback"], subgraph: "Documents and extraction", status: "implemented", sourceHint: "docling / pdf_parser", description: "Parses full-text PDF documents via Docling or fallback." },
      { id: "X", labelLines: ["Extraction service", "Configured generator & rules"], subgraph: "Documents and extraction", status: "implemented", sourceHint: "coded_extraction_service", description: "Extracts study variables using configured generator and rules." },
      { id: "V", labelLines: ["Quote and value checks", "Laya evidence tracing"], subgraph: "Documents and extraction", status: "implemented", sourceHint: "laya_extraction_tracer", description: "Traces and verifies extracted quotes and values against source text." },
      { id: "HR", labelLines: ["Reviewer edits", "and verification"], subgraph: "Documents and extraction", status: "implemented", sourceHint: "extractions", description: "Persists reviewer edits and verification status." },
      { id: "DB", labelLines: ["Project database", "Records, decisions, documents", "and extraction values"], status: "storage", sourceHint: "DBBackend / database.py", description: "Central project database storing records, decisions, parsed docs, and extractions." },
      { id: "RB", labelLines: ["Risk-of-bias assessment", "Reviewer or batch action"], status: "implemented", sourceHint: "risk_of_bias", description: "Risk-of-bias domain assessment and synthesis." },
      { id: "AN", labelLines: ["Analysis and synthesis actions"], status: "implemented", sourceHint: "meta_analysis", description: "Meta-analysis and evidence synthesis calculations." },
      { id: "PR", labelLines: ["PRISMA counting services"], status: "implemented", sourceHint: "prisma2020_sync", description: "Computes PRISMA 2020 stage counts from project database records." },
      { id: "EX", labelLines: ["Diagrams and exports"], status: "implemented", sourceHint: "prisma2020_sync / export", description: "Exports PRISMA flow diagrams, tables, and review reports." },
      { id: "VR", labelLines: ["Planned: versioned approved criteria", "and reusable interpretations"], status: "planned", sourceHint: "Planned addition (unmapped)", description: "Planned versioning for PICO criteria and reusable reviewer interpretations." },
      { id: "IH", labelLines: ["Planned: real Import History", "and source-column duplicate matrix"], status: "planned", sourceHint: "Planned addition (unmapped)", description: "Planned import batch history and cross-source duplicate matrix." },
      { id: "SL", labelLines: ["Planned: optional SLIDERS adapter", "Benchmark before adoption"], status: "planned", sourceHint: "Planned addition (unmapped)", description: "Planned optional SLIDERS extraction adapter pending clinical accuracy benchmark." },
    ],
    edges: [
      { from: "P", to: "PE", style: "solid" },
      { from: "PE", to: "C", style: "solid" },
      { from: "R", to: "D", style: "solid" },
      { from: "D", to: "DR", style: "solid" },
      { from: "C", to: "S", style: "solid" },
      { from: "DR", to: "S", style: "solid" },
      { from: "S", to: "T", style: "solid" },
      { from: "T", to: "A", style: "solid" },
      { from: "A", to: "F", style: "solid" },
      { from: "T", to: "E", style: "solid" },
      { from: "A", to: "E", style: "solid" },
      { from: "F", to: "E", style: "solid" },
      { from: "E", to: "L", style: "solid" },
      { from: "E", to: "O", style: "solid" },
      { from: "L", to: "J", style: "solid" },
      { from: "O", to: "J", style: "solid" },
      { from: "J", to: "H", style: "solid" },
      { from: "PDF", to: "DP", style: "solid" },
      { from: "DP", to: "F", style: "solid" },
      { from: "DP", to: "X", style: "solid" },
      { from: "X", to: "V", style: "solid" },
      { from: "V", to: "HR", style: "solid" },
      { from: "C", to: "DB", style: "solid" },
      { from: "DR", to: "DB", style: "solid" },
      { from: "H", to: "DB", style: "solid" },
      { from: "DP", to: "DB", style: "solid" },
      { from: "HR", to: "DB", style: "solid" },
      { from: "DB", to: "S", style: "solid" },
      { from: "DB", to: "X", style: "solid" },
      { from: "DB", to: "RB", style: "solid" },
      { from: "DB", to: "AN", style: "solid" },
      { from: "DB", to: "PR", style: "solid" },
      { from: "PR", to: "EX", style: "solid" },
      { from: "AN", to: "EX", style: "solid" },
      { from: "RB", to: "EX", style: "solid" },
      { from: "SL", to: "X", style: "dashed" },
      { from: "VR", to: "C", style: "dashed" },
      { from: "IH", to: "DR", style: "dashed" },
    ],
  },
  {
    id: "graphify-dataflow",
    title: "Graphify Data Flow & Dual-View Synchronization",
    subtitle: "How persistent Graphify indexing feeds both the Dependency Graph explorer and the reviewed Workflow Overview",
    lastReviewedDate: "2026-10-27",
    revisionLabel: "CODE_GRAPH_DUAL_VIEW_PLAN v1.0",
    direction: "LR",
    summaryNote:
      "The Mermaid overview is maintained from verified source and graph evidence; automatic summarization is optional and must not be presented as verified without review.",
    mermaidSource: `flowchart LR
  SRC["Repository sources"] --> IDX["Graphify indexing
query and path navigation"]
  IDX --> SNAP["graphify-out/graph.json
Actual persistent graph"]
  SNAP --> API["Existing Graphify API
Graph, stats, file, community"]
  API --> UI["Dependency graph view
Community overview and drill-down"]
  SNAP --> CHECK["Source and relationship review"]
  CHECK --> MD["Reviewed Mermaid overview
Versioned explanatory artifact"]
  MD --> OVER["Workflow overview view"]
  OVER -. "Open matching symbol or module" .-> UI`,
    nodes: [
      { id: "SRC", labelLines: ["Repository sources"], status: "implemented", sourceHint: "radextract_platform/", description: "Backend Python and Frontend TypeScript source files." },
      { id: "IDX", labelLines: ["Graphify indexing", "query and path navigation"], status: "implemented", sourceHint: "graphify CLI", description: "Graphify indexer extracting symbols, communities, and relationships." },
      { id: "SNAP", labelLines: ["graphify-out/graph.json", "Actual persistent graph"], status: "storage", sourceHint: "graphify-out/graph.json", description: "Authoritative persistent dependency snapshot on disk." },
      { id: "API", labelLines: ["Existing Graphify API", "Graph, stats, file, community"], status: "implemented", sourceHint: "backend/routers/graphify.py", description: "FastAPI router with file-identity cache invalidation and snapshot metadata." },
      { id: "UI", labelLines: ["Dependency graph view", "Community overview & drill-down"], status: "implemented", sourceHint: "frontend/src/pages/CodeGraphPage.tsx", description: "Interactive Graphify explorer covering the full corpus." },
      { id: "CHECK", labelLines: ["Source and relationship review"], status: "implemented", sourceHint: "AGENTS.md / source audit", description: "Verification of actual symbol and workflow connections against source." },
      { id: "MD", labelLines: ["Reviewed Mermaid overview", "Versioned explanatory artifact"], status: "implemented", sourceHint: "CODE_GRAPH_DUAL_VIEW_PLAN.md", description: "Reviewed Mermaid diagram definitions with explicit qualifications." },
      { id: "OVER", labelLines: ["Workflow overview view"], status: "implemented", sourceHint: "frontend/src/pages/CodeGraphPage.tsx", description: "Local SVG Mermaid renderer linked to verified Graphify symbols." },
    ],
    edges: [
      { from: "SRC", to: "IDX", style: "solid" },
      { from: "IDX", to: "SNAP", style: "solid" },
      { from: "SNAP", to: "API", style: "solid" },
      { from: "API", to: "UI", style: "solid" },
      { from: "SNAP", to: "CHECK", style: "solid" },
      { from: "CHECK", to: "MD", style: "solid" },
      { from: "MD", to: "OVER", style: "solid" },
      { from: "OVER", to: "UI", label: "Open matching symbol or module", style: "dashed" },
    ],
  },
  {
    id: "screening-drilldown",
    title: "Screening Pipeline Drill-Down",
    subtitle: "Detailed flow through AIScreeningPipeline, jev_screener, jev_client, and LayaModel with known accuracy boundaries",
    lastReviewedDate: "2026-10-27",
    revisionLabel: "CODE_GRAPH_DUAL_VIEW_PLAN v1.0",
    direction: "TB",
    summaryNote:
      "Laya is the intended primary screening engine, but runtime provider configuration and fallback must be inspected truthfully. Known screening accuracy concerns (search-string veto, incomplete criterion composition, text truncation) are tracked in the main handoff.",
    mermaidSource: `flowchart TB
  subgraph ScreeningFlow["Multi-Stage Screening Execution"]
    C["Editable project PICO
and exclusion settings"] --> S["AIScreeningPipeline
Multi-stage coordinator"]
    S --> T["Stage 1: Title screening"]
    T --> A["Stage 2: Abstract screening"]
    A --> F["Stage 3: Full-text screening"]
    T --> E["jev_screener
Engine routing & prompt assembly"]
    A --> E
    F --> E
    E --> L["LayaModel (Local ONNX)
Intended primary engine"]
    E --> O["jev_client Fallback
Configured secondary / LLM provider"]
    L --> J["Criterion aggregation
Include / Exclude / Uncertain"]
    O --> J
    J --> H["Reviewer decision & override"]
  end
  VR["Planned: versioned approved criteria"] -.-> C
  classDef planned fill:#fbf9f4,stroke:#814d75,stroke-dasharray:5 4,color:#62535d;
  class VR planned;`,
    nodes: [
      { id: "C", labelLines: ["Editable project PICO", "and exclusion settings"], subgraph: "Multi-Stage Screening Execution", status: "implemented", sourceHint: "project_settings", description: "Project PICO criteria and exclusion rules." },
      { id: "S", labelLines: ["AIScreeningPipeline", "Multi-stage coordinator"], subgraph: "Multi-Stage Screening Execution", status: "implemented", sourceHint: "AIScreeningPipeline", description: "Coordinates title → abstract → full-text progression." },
      { id: "T", labelLines: ["Stage 1: Title screening"], subgraph: "Multi-Stage Screening Execution", status: "implemented", sourceHint: "AIScreeningPipeline", description: "Evaluates study title against PICO rules." },
      { id: "A", labelLines: ["Stage 2: Abstract screening"], subgraph: "Multi-Stage Screening Execution", status: "implemented", sourceHint: "AIScreeningPipeline", description: "Evaluates abstract text for pending/uncertain studies." },
      { id: "F", labelLines: ["Stage 3: Full-text screening"], subgraph: "Multi-Stage Screening Execution", status: "implemented", sourceHint: "AIScreeningPipeline", description: "Evaluates parsed full-text document for eligible studies." },
      { id: "E", labelLines: ["jev_screener", "Engine routing & prompt assembly"], subgraph: "Multi-Stage Screening Execution", status: "implemented", sourceHint: "jev_screener", description: "Routes screening requests and handles criterion formatting." },
      { id: "L", labelLines: ["LayaModel (Local ONNX)", "Intended primary engine"], subgraph: "Multi-Stage Screening Execution", status: "implemented", sourceHint: "LayaModel", description: "Local ONNX model execution path." },
      { id: "O", labelLines: ["jev_client Fallback", "Configured secondary / LLM"], subgraph: "Multi-Stage Screening Execution", status: "implemented", sourceHint: "jev_client", description: "Fallback provider client when configured." },
      { id: "J", labelLines: ["Criterion aggregation", "Include / Exclude / Uncertain"], subgraph: "Multi-Stage Screening Execution", status: "implemented", sourceHint: "jev_screener", description: "Combines individual criteria outputs into a recommendation." },
      { id: "H", labelLines: ["Reviewer decision & override"], subgraph: "Multi-Stage Screening Execution", status: "implemented", sourceHint: "screening_decision", description: "Reviewer verification and decision persistence." },
      { id: "VR", labelLines: ["Planned: versioned approved criteria"], status: "planned", sourceHint: "Planned addition (unmapped)", description: "Planned versioning for approved criteria." },
    ],
    edges: [
      { from: "C", to: "S", style: "solid" },
      { from: "S", to: "T", style: "solid" },
      { from: "T", to: "A", style: "solid" },
      { from: "A", to: "F", style: "solid" },
      { from: "T", to: "E", style: "solid" },
      { from: "A", to: "E", style: "solid" },
      { from: "F", to: "E", style: "solid" },
      { from: "E", to: "L", style: "solid" },
      { from: "E", to: "O", style: "solid" },
      { from: "L", to: "J", style: "solid" },
      { from: "O", to: "J", style: "solid" },
      { from: "J", to: "H", style: "solid" },
      { from: "VR", to: "C", style: "dashed" },
    ],
  },
  {
    id: "extraction-prisma-drilldown",
    title: "Extraction, Evidence Tracing & PRISMA Drill-Down",
    subtitle: "Flow from PDF parsing through coded_extraction_service, laya_extraction_tracer, and prisma2020_sync",
    lastReviewedDate: "2026-10-27",
    revisionLabel: "CODE_GRAPH_DUAL_VIEW_PLAN v1.0",
    direction: "TB",
    summaryNote:
      "Local evidence-tracer guardrails were patched earlier with mocked regression tests; a clinical accuracy benchmark remains pending. PRISMA has known pending-state and report-versus-study counting gaps.",
    mermaidSource: `flowchart TB
  subgraph ExtractionAndPrisma["Extraction, Provenance & PRISMA Counting"]
    PDF["Upload or retrieve full text"] --> DP["PDF parsing (Docling or fallback)"]
    DP --> X["coded_extraction_service
Configured generator and rules"]
    X --> V["laya_extraction_tracer
Quote & value evidence checks"]
    V --> HR["Reviewer edits & verification"]
    HR --> DB[("Project database")]
    DB --> PR["prisma2020_sync
PRISMA counting services"]
    PR --> EX["PRISMA diagrams & exports"]
  end
  SL["Planned: optional SLIDERS adapter"] -.-> X
  classDef planned fill:#fbf9f4,stroke:#814d75,stroke-dasharray:5 4,color:#62535d;
  class SL planned;`,
    nodes: [
      { id: "PDF", labelLines: ["Upload or retrieve full text"], subgraph: "Extraction, Provenance & PRISMA Counting", status: "implemented", sourceHint: "pdf_upload", description: "Full-text PDF document storage and retrieval." },
      { id: "DP", labelLines: ["PDF parsing", "Docling or fallback"], subgraph: "Extraction, Provenance & PRISMA Counting", status: "implemented", sourceHint: "docling / pdf_parser", description: "Parses PDF text and tables into structured blocks." },
      { id: "X", labelLines: ["coded_extraction_service", "Configured generator & rules"], subgraph: "Extraction, Provenance & PRISMA Counting", status: "implemented", sourceHint: "coded_extraction_service", description: "Runs structured variable extraction." },
      { id: "V", labelLines: ["laya_extraction_tracer", "Quote & value evidence checks"], subgraph: "Extraction, Provenance & PRISMA Counting", status: "implemented", sourceHint: "laya_extraction_tracer", description: "Checks extracted quotes and values against parsed full-text spans." },
      { id: "HR", labelLines: ["Reviewer edits & verification"], subgraph: "Extraction, Provenance & PRISMA Counting", status: "implemented", sourceHint: "extractions", description: "Reviewer verification and manual overrides." },
      { id: "DB", labelLines: ["Project database"], subgraph: "Extraction, Provenance & PRISMA Counting", status: "storage", sourceHint: "DBBackend / database.py", description: "Persists verified extractions and study statuses." },
      { id: "PR", labelLines: ["prisma2020_sync", "PRISMA counting services"], subgraph: "Extraction, Provenance & PRISMA Counting", status: "implemented", sourceHint: "prisma2020_sync", description: "Aggregates identification, screening, and inclusion counts." },
      { id: "EX", labelLines: ["PRISMA diagrams & exports"], subgraph: "Extraction, Provenance & PRISMA Counting", status: "implemented", sourceHint: "prisma2020_sync / export", description: "Exports PRISMA 2020 flow diagram and summary tables." },
      { id: "SL", labelLines: ["Planned: optional SLIDERS adapter"], status: "planned", sourceHint: "Planned addition (unmapped)", description: "Planned optional SLIDERS extraction reconciliation adapter." },
    ],
    edges: [
      { from: "PDF", to: "DP", style: "solid" },
      { from: "DP", to: "X", style: "solid" },
      { from: "X", to: "V", style: "solid" },
      { from: "V", to: "HR", style: "solid" },
      { from: "HR", to: "DB", style: "solid" },
      { from: "DB", to: "PR", style: "solid" },
      { from: "PR", to: "EX", style: "solid" },
      { from: "SL", to: "X", style: "dashed" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Deterministic Local Mermaid Flowchart Layout & Strict SVG Renderer
// (Zero external network transmission, strict XML escaping, preserves legend on export)
// ---------------------------------------------------------------------------

function escapeXml(unsafe: string): string {
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface PositionedDiagramNode {
  spec: WorkflowNodeSpec;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SubgraphBox {
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function computeDiagramLayout(diagram: ReviewedDiagramDefinition): {
  nodes: Record<string, PositionedDiagramNode>;
  subgraphs: SubgraphBox[];
  width: number;
  height: number;
} {
  // Compute topological rank (layer) for each node
  const inDegree: Record<string, number> = {};
  const adj: Record<string, string[]> = {};
  for (const n of diagram.nodes) {
    inDegree[n.id] = 0;
    adj[n.id] = [];
  }
  for (const e of diagram.edges) {
    if (adj[e.from] && inDegree[e.to] !== undefined) {
      adj[e.from].push(e.to);
      inDegree[e.to] += 1;
    }
  }

  const layerOf: Record<string, number> = {};
  const queue: string[] = [];
  for (const n of diagram.nodes) {
    if (inDegree[n.id] === 0) {
      layerOf[n.id] = 0;
      queue.push(n.id);
    }
  }
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currLayer = layerOf[curr] ?? 0;
    for (const nxt of adj[curr] || []) {
      const candidate = currLayer + 1;
      if (layerOf[nxt] === undefined || candidate > layerOf[nxt]) {
        layerOf[nxt] = candidate;
      }
      inDegree[nxt] -= 1;
      if (inDegree[nxt] <= 0) {
        queue.push(nxt);
      }
    }
  }
  for (const n of diagram.nodes) {
    if (layerOf[n.id] === undefined) {
      layerOf[n.id] = 0;
    }
  }

  // Group nodes by layer
  const layersMap: Record<number, WorkflowNodeSpec[]> = {};
  let maxLayer = 0;
  for (const n of diagram.nodes) {
    const l = layerOf[n.id];
    if (l > maxLayer) maxLayer = l;
    if (!layersMap[l]) layersMap[l] = [];
    layersMap[l].push(n);
  }

  const nodeW = 225;
  const nodeH = 68;
  const padX = 56;
  const padY = 64;
  const topHeaderOffset = 88;
  const legendFooterOffset = 84;

  const positioned: Record<string, PositionedDiagramNode> = {};

  if (diagram.direction === "TB") {
    let maxRowCount = 1;
    for (let l = 0; l <= maxLayer; l++) {
      const count = (layersMap[l] || []).length;
      if (count > maxRowCount) maxRowCount = count;
    }
    const canvasWidth = Math.max(980, maxRowCount * (nodeW + padX) + padX * 2);

    for (let l = 0; l <= maxLayer; l++) {
      const rowNodes = layersMap[l] || [];
      const rowTotalW = rowNodes.length * nodeW + Math.max(0, rowNodes.length - 1) * padX;
      const startX = (canvasWidth - rowTotalW) / 2;
      const y = topHeaderOffset + l * (nodeH + padY);
      rowNodes.forEach((spec, idx) => {
        positioned[spec.id] = {
          spec,
          x: startX + idx * (nodeW + padX),
          y,
          width: nodeW,
          height: nodeH,
        };
      });
    }

    const totalHeight = topHeaderOffset + (maxLayer + 1) * (nodeH + padY) + legendFooterOffset;
    const subgraphs = computeSubgraphBoxes(positioned);
    return { nodes: positioned, subgraphs, width: canvasWidth, height: totalHeight };
  } else {
    // LR layout
    let maxColCount = 1;
    for (let l = 0; l <= maxLayer; l++) {
      const count = (layersMap[l] || []).length;
      if (count > maxColCount) maxColCount = count;
    }
    const canvasWidth = Math.max(1060, (maxLayer + 1) * (nodeW + padX) + padX * 2);
    const bodyHeight = Math.max(260, maxColCount * (nodeH + padY));

    for (let l = 0; l <= maxLayer; l++) {
      const colNodes = layersMap[l] || [];
      const colTotalH = colNodes.length * nodeH + Math.max(0, colNodes.length - 1) * padY;
      const startY = topHeaderOffset + (bodyHeight - colTotalH) / 2;
      const x = padX + l * (nodeW + padX);
      colNodes.forEach((spec, idx) => {
        positioned[spec.id] = {
          spec,
          x,
          y: startY + idx * (nodeH + padY),
          width: nodeW,
          height: nodeH,
        };
      });
    }

    const totalHeight = topHeaderOffset + bodyHeight + legendFooterOffset;
    const subgraphs = computeSubgraphBoxes(positioned);
    return { nodes: positioned, subgraphs, width: canvasWidth, height: totalHeight };
  }
}

function computeSubgraphBoxes(positioned: Record<string, PositionedDiagramNode>): SubgraphBox[] {
  const groups: Record<string, PositionedDiagramNode[]> = {};
  for (const item of Object.values(positioned)) {
    if (item.spec.subgraph) {
      if (!groups[item.spec.subgraph]) groups[item.spec.subgraph] = [];
      groups[item.spec.subgraph].push(item);
    }
  }
  const boxes: SubgraphBox[] = [];
  for (const [title, items] of Object.entries(groups)) {
    const minX = Math.min(...items.map((i) => i.x)) - 18;
    const minY = Math.min(...items.map((i) => i.y)) - 30;
    const maxX = Math.max(...items.map((i) => i.x + i.width)) + 18;
    const maxY = Math.max(...items.map((i) => i.y + i.height)) + 16;
    boxes.push({
      title,
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    });
  }
  return boxes;
}

function buildStandaloneSvgString(
  diagram: ReviewedDiagramDefinition,
  snapshotCommit: string,
  freshnessLabel: string
): string {
  const layout = computeDiagramLayout(diagram);
  const lines: string[] = [];

  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}" height="${layout.height}" role="img" aria-label="${escapeXml(diagram.title)}">`
  );
  lines.push(`<rect width="100%" height="100%" fill="${THEME.paper}" />`);
  lines.push(`<defs>
    <marker id="arrow-solid" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="${THEME.wine}" />
    </marker>
    <marker id="arrow-dashed" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="${THEME.plum}" />
    </marker>
  </defs>`);

  // Header metadata bar
  lines.push(
    `<text x="28" y="34" font-family="Serifon Editorial, Georgia, serif" font-size="18" font-weight="bold" fill="${THEME.wine}">${escapeXml(diagram.title)}</text>`
  );
  lines.push(
    `<text x="28" y="56" font-family="Work Sans, sans-serif" font-size="12" fill="${THEME.plumMuted}">Reviewed: ${escapeXml(diagram.lastReviewedDate)} | Revision: ${escapeXml(diagram.revisionLabel)} | Snapshot commit: ${escapeXml(snapshotCommit)} (${escapeXml(freshnessLabel)})</text>`
  );

  // Subgraphs
  for (const sg of layout.subgraphs) {
    lines.push(
      `<rect x="${sg.x}" y="${sg.y}" width="${sg.width}" height="${sg.height}" rx="10" fill="${THEME.paperWarm}" fill-opacity="0.65" stroke="${THEME.plumOutline}" stroke-width="1.2" />`
    );
    lines.push(
      `<text x="${sg.x + 12}" y="${sg.y + 18}" font-family="Serifon Editorial, Georgia, serif" font-size="12" font-weight="bold" fill="${THEME.wine}">${escapeXml(sg.title)}</text>`
    );
  }

  // Edges
  for (const edge of diagram.edges) {
    const src = layout.nodes[edge.from];
    const tgt = layout.nodes[edge.to];
    if (!src || !tgt) continue;
    const x1 = diagram.direction === "TB" ? src.x + src.width / 2 : src.x + src.width;
    const y1 = diagram.direction === "TB" ? src.y + src.height : src.y + src.height / 2;
    const x2 = diagram.direction === "TB" ? tgt.x + tgt.width / 2 : tgt.x;
    const y2 = diagram.direction === "TB" ? tgt.y : tgt.y + tgt.height / 2;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const pathD =
      diagram.direction === "TB"
        ? `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`
        : `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
    const stroke = edge.style === "dashed" ? THEME.plum : THEME.wine;
    const dash = edge.style === "dashed" ? `stroke-dasharray="5 4"` : "";
    const marker = edge.style === "dashed" ? "url(#arrow-dashed)" : "url(#arrow-solid)";
    lines.push(
      `<path d="${pathD}" fill="none" stroke="${stroke}" stroke-width="1.75" ${dash} marker-end="${marker}" />`
    );
    if (edge.label) {
      lines.push(
        `<text x="${midX}" y="${midY - 6}" text-anchor="middle" font-family="Work Sans, sans-serif" font-size="10" fill="${THEME.plumMuted}">${escapeXml(edge.label)}</text>`
      );
    }
  }

  // Nodes
  for (const pos of Object.values(layout.nodes)) {
    const { spec, x, y, width, height } = pos;
    const isPlanned = spec.status === "planned";
    const isStorage = spec.status === "storage";
    const fill = isPlanned ? THEME.paper : isStorage ? THEME.amberBg : THEME.cardWhite;
    const stroke = isPlanned ? THEME.plum : isStorage ? THEME.amber : THEME.wine;
    const dash = isPlanned ? `stroke-dasharray="5 4"` : "";
    const rx = isStorage ? 18 : 8;
    lines.push(
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.8" ${dash} />`
    );
    const startTextY = y + height / 2 - ((spec.labelLines.length - 1) * 14) / 2 + 4;
    spec.labelLines.forEach((line, i) => {
      const weight = i === 0 ? "600" : "400";
      const color = isPlanned ? THEME.plumMuted : THEME.ink;
      lines.push(
        `<text x="${x + width / 2}" y="${startTextY + i * 14}" text-anchor="middle" font-family="Work Sans, sans-serif" font-size="11" font-weight="${weight}" fill="${color}">${escapeXml(line)}</text>`
      );
    });
  }

  // Status Legend Footer (Preserved on SVG export)
  const legY = layout.height - 46;
  lines.push(
    `<rect x="24" y="${legY}" width="${layout.width - 48}" height="34" rx="6" fill="${THEME.cardWhite}" stroke="${THEME.plumOutline}" stroke-width="1" />`
  );
  lines.push(
    `<rect x="40" y="${legY + 10}" width="18" height="14" rx="3" fill="${THEME.cardWhite}" stroke="${THEME.wine}" stroke-width="1.8" />`
  );
  lines.push(
    `<text x="66" y="${legY + 21}" font-family="Work Sans, sans-serif" font-size="11" fill="${THEME.ink}">Implemented functional flow (solid)</text>`
  );
  lines.push(
    `<rect x="290" y="${legY + 10}" width="18" height="14" rx="3" fill="${THEME.paper}" stroke="${THEME.plum}" stroke-width="1.8" stroke-dasharray="4 3" />`
  );
  lines.push(
    `<text x="316" y="${legY + 21}" font-family="Work Sans, sans-serif" font-size="11" fill="${THEME.plumMuted}">Planned / unverified addition (dashed)</text>`
  );
  lines.push(
    `<rect x="565" y="${legY + 10}" width="18" height="14" rx="7" fill="${THEME.amberBg}" stroke="${THEME.amber}" stroke-width="1.8" />`
  );
  lines.push(
    `<text x="591" y="${legY + 21}" font-family="Work Sans, sans-serif" font-size="11" fill="${THEME.ink}">Persistent storage / snapshot artifact</text>`
  );

  lines.push(`</svg>`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main Dual-View CodeGraphPage Component
// ---------------------------------------------------------------------------

export function CodeGraphPage() {
  const queryClient = useQueryClient();

  // Top-level Dual-View tab state: "workflow" (Mermaid overview) vs "dependency" (Graphify explorer)
  const [activeView, setActiveView] = useState<"workflow" | "dependency">("workflow");

  // Motion & accessibility preference
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener?.("change", listener);
    return () => mq.removeEventListener?.("change", listener);
  }, []);

  // Optional, explicitly labelled Sample Mode (NEVER activated silently on API error)
  const [sampleModeEnabled, setSampleModeEnabled] = useState(false);
  const [allowStaleSnapshot, setAllowStaleSnapshot] = useState(false);

  // Workflow Overview state
  const [selectedDiagramId, setSelectedDiagramId] = useState<string>("app-overview");
  const [selectedWorkflowNodeId, setSelectedWorkflowNodeId] = useState<string>("S");
  const [diagramZoom, setDiagramZoom] = useState<number>(1);
  const [copiedMermaid, setCopiedMermaid] = useState<boolean>(false);
  const [showMermaidSource, setShowMermaidSource] = useState<boolean>(false);

  // Dependency Graph Explorer state
  const [explorerMode, setExplorerMode] = useState<
    "communities" | "subgraph" | "neighborhood" | "path"
  >("communities");
  const [sourceFile, setSourceFile] = useState("");
  const [community, setCommunity] = useState<string>("");
  const [relation, setRelation] = useState("");
  const [fileType, setFileType] = useState("");
  const [provenanceFilter, setProvenanceFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [offset, setOffset] = useState<number>(0);
  const [limit, setLimit] = useState<number>(250);

  // Neighborhood & Path Explorer state
  const [neighborhoodTarget, setNeighborhoodTarget] = useState<string>("AIScreeningPipeline");
  const [neighborhoodHops, setNeighborhoodHops] = useState<number>(1);
  const [pathSource, setPathSource] = useState<string>("AIScreeningPipeline");
  const [pathTarget, setPathTarget] = useState<string>("LayaModel");

  // Selected Node / Edge detail inspector state
  const [inspectedNode, setInspectedNode] = useState<CodeGraphNode | null>(null);
  const [inspectedLink, setInspectedLink] = useState<CodeGraphLink | null>(null);

  // -------------------------------------------------------------------------
  // Data Queries (Real Backend vs. Explicit Sample Mode)
  // -------------------------------------------------------------------------

  const statsQuery = useQuery<CodeGraphStatsResponse, Error>({
    queryKey: ["graphify-code-stats", allowStaleSnapshot, sampleModeEnabled],
    queryFn: async () => {
      if (sampleModeEnabled) {
        return {
          total_nodes: EXPLICIT_SAMPLE_GRAPH.node_count,
          total_links: EXPLICIT_SAMPLE_GRAPH.link_count,
          corpus_total_nodes: EXPLICIT_SAMPLE_GRAPH.node_count,
          corpus_total_links: EXPLICIT_SAMPLE_GRAPH.link_count,
          file_types: { code: 7, rationale: 1 },
          relations: { calls: 4, references: 1, rationale_for: 1 },
          provenance_counts: { extracted: 4, inferred: 2 },
          num_communities: 4,
          top_communities: { "1": 2, "2": 2, "4": 3, "3": 1 },
          top_source_files: [
            { path: "backend/services/jev_screener.py", node_count: 1 },
            { path: "backend/services/coded_extraction_service.py", node_count: 1 },
            { path: "backend/routers/graphify.py", node_count: 1 },
          ],
          built_at_commit: EXPLICIT_SAMPLE_SNAPSHOT.built_at_commit,
          schema_version: EXPLICIT_SAMPLE_SNAPSHOT.schema_version,
          snapshot: EXPLICIT_SAMPLE_SNAPSHOT,
        };
      }
      return fetchGraphifyEndpoint<CodeGraphStatsResponse>(
        `/api/graphify/code/stats?allow_stale=${allowStaleSnapshot}`
      );
    },
    retry: 1,
  });

  const communitiesQuery = useQuery<CommunitiesOverviewResponse, Error>({
    queryKey: ["graphify-code-communities", allowStaleSnapshot, sampleModeEnabled],
    queryFn: async () => {
      if (sampleModeEnabled) {
        return {
          communities: [
            {
              community_id: 1,
              label: "Community 1 (jev_screener)",
              node_count: 2,
              internal_link_count: 1,
              external_link_count: 1,
              file_types: { code: 2 },
              top_source_files: [
                { path: "backend/services/jev_screener.py", node_count: 1 },
                { path: "backend/services/jev_client.py", node_count: 1 },
              ],
              hub_nodes: [
                { id: "backend/services/jev_screener.py::AIScreeningPipeline", label: "AIScreeningPipeline", source_file: "backend/services/jev_screener.py", degree: 2 },
              ],
            },
            {
              community_id: 2,
              label: "Community 2 (coded_extraction_service)",
              node_count: 2,
              internal_link_count: 1,
              external_link_count: 2,
              file_types: { code: 2 },
              top_source_files: [
                { path: "backend/services/coded_extraction_service.py", node_count: 1 },
                { path: "backend/services/laya_extraction_tracer.py", node_count: 1 },
              ],
              hub_nodes: [
                { id: "backend/services/coded_extraction_service.py::coded_extraction_service", label: "coded_extraction_service", source_file: "backend/services/coded_extraction_service.py", degree: 3 },
              ],
            },
            {
              community_id: 3,
              label: "Community 3 (prisma2020_sync)",
              node_count: 1,
              internal_link_count: 0,
              external_link_count: 1,
              file_types: { code: 1 },
              top_source_files: [{ path: "backend/services/prisma2020_sync.py", node_count: 1 }],
              hub_nodes: [
                { id: "backend/services/prisma2020_sync.py::prisma2020_sync", label: "prisma2020_sync", source_file: "backend/services/prisma2020_sync.py", degree: 1 },
              ],
            },
            {
              community_id: 4,
              label: "Community 4 (CodeGraphPage)",
              node_count: 3,
              internal_link_count: 2,
              external_link_count: 0,
              file_types: { code: 2, rationale: 1 },
              top_source_files: [
                { path: "frontend/src/pages/CodeGraphPage.tsx", node_count: 1 },
                { path: "backend/routers/graphify.py", node_count: 1 },
              ],
              hub_nodes: [
                { id: "frontend/src/pages/CodeGraphPage.tsx::CodeGraphPage", label: "CodeGraphPage", source_file: "frontend/src/pages/CodeGraphPage.tsx", degree: 2 },
              ],
            },
          ],
          community_links: [
            {
              source_community: 1,
              target_community: 2,
              link_count: 1,
              extracted_count: 0,
              inferred_count: 1,
              relations: { references: 1 },
            },
            {
              source_community: 2,
              target_community: 3,
              link_count: 1,
              extracted_count: 1,
              inferred_count: 0,
              relations: { calls: 1 },
            },
          ],
          num_communities: 4,
          corpus_total_nodes: 8,
          corpus_total_links: 6,
          built_at_commit: EXPLICIT_SAMPLE_SNAPSHOT.built_at_commit,
          snapshot: EXPLICIT_SAMPLE_SNAPSHOT,
        };
      }
      return fetchGraphifyEndpoint<CommunitiesOverviewResponse>(
        `/api/graphify/code/communities?allow_stale=${allowStaleSnapshot}`
      );
    },
    retry: 1,
  });

  const workflowMappingQuery = useQuery<WorkflowMappingResponse, Error>({
    queryKey: ["graphify-workflow-mapping", sampleModeEnabled],
    queryFn: async () => {
      if (sampleModeEnabled) {
        return {
          mappings: {
            S: {
              diagram_node_id: "S",
              title: "Multi-stage screening service",
              status: "implemented",
              available: true,
              matched_count: 1,
              primary_node_id: "backend/services/jev_screener.py::AIScreeningPipeline",
              primary_label: "AIScreeningPipeline",
              primary_source_file: "backend/services/jev_screener.py",
              primary_community: 1,
              matched_nodes: [
                { id: "backend/services/jev_screener.py::AIScreeningPipeline", label: "AIScreeningPipeline", source_file: "backend/services/jev_screener.py", community: 1 },
              ],
            },
            L: {
              diagram_node_id: "L",
              title: "Local Laya ONNX",
              status: "implemented",
              available: true,
              matched_count: 1,
              primary_node_id: "backend/services/jev_client.py::LayaModel",
              primary_label: "LayaModel",
              primary_source_file: "backend/services/jev_client.py",
              primary_community: 1,
              matched_nodes: [
                { id: "backend/services/jev_client.py::LayaModel", label: "LayaModel", source_file: "backend/services/jev_client.py", community: 1 },
              ],
            },
            X: {
              diagram_node_id: "X",
              title: "Extraction service",
              status: "implemented",
              available: true,
              matched_count: 1,
              primary_node_id: "backend/services/coded_extraction_service.py::coded_extraction_service",
              primary_label: "coded_extraction_service",
              primary_source_file: "backend/services/coded_extraction_service.py",
              primary_community: 2,
              matched_nodes: [
                { id: "backend/services/coded_extraction_service.py::coded_extraction_service", label: "coded_extraction_service", source_file: "backend/services/coded_extraction_service.py", community: 2 },
              ],
            },
            V: {
              diagram_node_id: "V",
              title: "Quote and value checks (Laya evidence tracing)",
              status: "implemented",
              available: true,
              matched_count: 1,
              primary_node_id: "backend/services/laya_extraction_tracer.py::laya_extraction_tracer",
              primary_label: "laya_extraction_tracer",
              primary_source_file: "backend/services/laya_extraction_tracer.py",
              primary_community: 2,
              matched_nodes: [
                { id: "backend/services/laya_extraction_tracer.py::laya_extraction_tracer", label: "laya_extraction_tracer", source_file: "backend/services/laya_extraction_tracer.py", community: 2 },
              ],
            },
            PR: {
              diagram_node_id: "PR",
              title: "PRISMA counting services",
              status: "implemented",
              available: true,
              matched_count: 1,
              primary_node_id: "backend/services/prisma2020_sync.py::prisma2020_sync",
              primary_label: "prisma2020_sync",
              primary_source_file: "backend/services/prisma2020_sync.py",
              primary_community: 3,
              matched_nodes: [
                { id: "backend/services/prisma2020_sync.py::prisma2020_sync", label: "prisma2020_sync", source_file: "backend/services/prisma2020_sync.py", community: 3 },
              ],
            },
            SL: {
              diagram_node_id: "SL",
              title: "Planned: optional SLIDERS adapter",
              status: "planned",
              available: false,
              matched_nodes: [],
              reason: "Planned architectural addition; not implemented in current graph snapshot.",
            },
            VR: {
              diagram_node_id: "VR",
              title: "Planned: versioned approved criteria",
              status: "planned",
              available: false,
              matched_nodes: [],
              reason: "Planned architectural addition; not implemented in current graph snapshot.",
            },
            IH: {
              diagram_node_id: "IH",
              title: "Planned: real Import History and source-column duplicate matrix",
              status: "planned",
              available: false,
              matched_nodes: [],
              reason: "Planned architectural addition; not implemented in current graph snapshot.",
            },
          },
          built_at_commit: EXPLICIT_SAMPLE_SNAPSHOT.built_at_commit,
          snapshot: EXPLICIT_SAMPLE_SNAPSHOT,
        };
      }
      return fetchGraphifyEndpoint<WorkflowMappingResponse>(`/api/graphify/code/workflow-mapping`);
    },
    retry: 1,
  });

  const subgraphQuery = useQuery<CodeGraphResponse, Error>({
    queryKey: [
      "graphify-code-subgraph",
      sourceFile,
      community,
      relation,
      fileType,
      provenanceFilter,
      searchQuery,
      offset,
      limit,
      allowStaleSnapshot,
      sampleModeEnabled,
    ],
    enabled: activeView === "dependency" && explorerMode === "subgraph",
    queryFn: async () => {
      if (sampleModeEnabled) {
        return EXPLICIT_SAMPLE_GRAPH;
      }
      const qs = new URLSearchParams();
      if (sourceFile) qs.set("source_file", sourceFile);
      if (community !== "") qs.set("community", community);
      if (relation) qs.set("relation", relation);
      if (fileType) qs.set("file_type", fileType);
      if (provenanceFilter) qs.set("provenance", provenanceFilter);
      if (searchQuery.trim()) qs.set("search", searchQuery.trim());
      qs.set("offset", String(offset));
      qs.set("limit", String(limit));
      if (allowStaleSnapshot) qs.set("allow_stale", "true");
      return fetchGraphifyEndpoint<CodeGraphResponse>(`/api/graphify/code/graph?${qs.toString()}`);
    },
    retry: 1,
  });

  const neighborhoodQuery = useQuery<CodeGraphResponse, Error>({
    queryKey: [
      "graphify-code-neighborhood",
      neighborhoodTarget,
      neighborhoodHops,
      relation,
      limit,
      sampleModeEnabled,
    ],
    enabled:
      activeView === "dependency" &&
      explorerMode === "neighborhood" &&
      Boolean(neighborhoodTarget.trim()),
    queryFn: async () => {
      if (sampleModeEnabled) {
        return EXPLICIT_SAMPLE_GRAPH;
      }
      const qs = new URLSearchParams({
        node_id: neighborhoodTarget.trim(),
        hops: String(neighborhoodHops),
        limit: String(limit),
      });
      if (relation) qs.set("relation", relation);
      return fetchGraphifyEndpoint<CodeGraphResponse>(
        `/api/graphify/code/neighborhood?${qs.toString()}`
      );
    },
    retry: 1,
  });

  const pathQuery = useQuery<PathResponse, Error>({
    queryKey: ["graphify-code-path", pathSource, pathTarget, sampleModeEnabled],
    enabled:
      activeView === "dependency" &&
      explorerMode === "path" &&
      Boolean(pathSource.trim()) &&
      Boolean(pathTarget.trim()),
    queryFn: async () => {
      if (sampleModeEnabled) {
        return {
          found: true,
          source_resolved: "backend/services/jev_screener.py::AIScreeningPipeline",
          target_resolved: "backend/services/jev_client.py::LayaModel",
          nodes: EXPLICIT_SAMPLE_GRAPH.nodes.slice(0, 2),
          links: EXPLICIT_SAMPLE_GRAPH.links.slice(0, 1),
          hop_count: 1,
          built_at_commit: EXPLICIT_SAMPLE_SNAPSHOT.built_at_commit,
          snapshot: EXPLICIT_SAMPLE_SNAPSHOT,
        };
      }
      const qs = new URLSearchParams({
        source: pathSource.trim(),
        target: pathTarget.trim(),
        max_depth: "6",
      });
      return fetchGraphifyEndpoint<PathResponse>(`/api/graphify/code/path?${qs.toString()}`);
    },
    retry: 1,
  });

  // -------------------------------------------------------------------------
  // Snapshot Metadata & Freshness Synthesis
  // -------------------------------------------------------------------------

  const activeSnapshot: SnapshotMetadata | undefined =
    statsQuery.data?.snapshot ||
    communitiesQuery.data?.snapshot ||
    subgraphQuery.data?.snapshot ||
    neighborhoodQuery.data?.snapshot;

  const corpusTotalNodes =
    activeSnapshot?.corpus_total_nodes ??
    statsQuery.data?.corpus_total_nodes ??
    statsQuery.data?.total_nodes ??
    0;

  const corpusTotalLinks =
    activeSnapshot?.corpus_total_links ??
    statsQuery.data?.corpus_total_links ??
    statsQuery.data?.total_links ??
    0;

  const currentDiagram = useMemo(
    () => REVIEWED_DIAGRAMS.find((d) => d.id === selectedDiagramId) || REVIEWED_DIAGRAMS[0],
    [selectedDiagramId]
  );

  const diagramLayout = useMemo(() => computeDiagramLayout(currentDiagram), [currentDiagram]);

  const selectedWorkflowNodeSpec = useMemo(
    () =>
      currentDiagram.nodes.find((n) => n.id === selectedWorkflowNodeId) ||
      currentDiagram.nodes[0],
    [currentDiagram, selectedWorkflowNodeId]
  );

  const selectedWorkflowLiveMapping: WorkflowNodeMapping | undefined = useMemo(() => {
    if (!selectedWorkflowNodeSpec) return undefined;
    return workflowMappingQuery.data?.mappings?.[selectedWorkflowNodeSpec.id];
  }, [selectedWorkflowNodeSpec, workflowMappingQuery.data]);

  // -------------------------------------------------------------------------
  // Actions: Refresh, Copy Mermaid, Export SVG, Drill-Down Navigation
  // -------------------------------------------------------------------------

  const handleRefreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["graphify-code-stats"] });
    queryClient.invalidateQueries({ queryKey: ["graphify-code-communities"] });
    queryClient.invalidateQueries({ queryKey: ["graphify-code-subgraph"] });
    queryClient.invalidateQueries({ queryKey: ["graphify-code-neighborhood"] });
    queryClient.invalidateQueries({ queryKey: ["graphify-code-path"] });
    queryClient.invalidateQueries({ queryKey: ["graphify-workflow-mapping"] });
  }, [queryClient]);

  const handleCopyMermaidSource = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(currentDiagram.mermaidSource);
      setCopiedMermaid(true);
      setTimeout(() => setCopiedMermaid(false), 2000);
    } catch {
      setShowMermaidSource(true);
    }
  }, [currentDiagram.mermaidSource]);

  const handleExportLocalSvg = useCallback(() => {
    const commitStr = activeSnapshot?.built_at_commit || statsQuery.data?.built_at_commit || "unverified";
    const freshnessStr = sampleModeEnabled
      ? "SAMPLE MODE"
      : activeSnapshot?.freshness_status || "fresh";
    const svgContent = buildStandaloneSvgString(currentDiagram, commitStr, freshnessStr);
    const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentDiagram.id}-${currentDiagram.lastReviewedDate}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [currentDiagram, activeSnapshot, statsQuery.data, sampleModeEnabled]);

  const handleDrillDownFromWorkflow = useCallback(
    (nodeSpec: WorkflowNodeSpec, mapping?: WorkflowNodeMapping) => {
      if (nodeSpec.status === "planned" || (mapping && !mapping.available)) {
        return;
      }
      setActiveView("dependency");
      if (mapping?.primary_node_id) {
        setExplorerMode("neighborhood");
        setNeighborhoodTarget(mapping.primary_node_id);
        setNeighborhoodHops(1);
      } else if (mapping?.primary_source_file) {
        setExplorerMode("subgraph");
        setSourceFile(mapping.primary_source_file);
        setOffset(0);
      } else {
        setExplorerMode("subgraph");
        setSearchQuery(nodeSpec.sourceHint.split("/").pop()?.trim() || nodeSpec.id);
        setOffset(0);
      }
    },
    []
  );

  const handleOpenCommunityDrillDown = useCallback((communityId: number) => {
    setExplorerMode("subgraph");
    setCommunity(String(communityId));
    setSourceFile("");
    setOffset(0);
    setInspectedNode(null);
    setInspectedLink(null);
  }, []);

  // -------------------------------------------------------------------------
  // ReactFlow Nodes & Edges Construction (Stable Layout, Zero Dangling Edges)
  // -------------------------------------------------------------------------

  const { flowNodes, flowEdges, displayedNodeCount, displayedLinkCount, activeSubgraphMeta } =
    useMemo(() => {
      // Mode 1: Full-Corpus Community Overview
      if (explorerMode === "communities" && communitiesQuery.data) {
        const comms = communitiesQuery.data.communities || [];
        const commLinks = communitiesQuery.data.community_links || [];
        const validCommIds = new Set(comms.map((c) => `comm:${c.community_id}`));

        const cols = Math.max(1, Math.ceil(Math.sqrt(comms.length)));
        const spacingX = 290;
        const spacingY = 175;

        const rfNodes: Node[] = comms.map((c, idx) => {
          const col = idx % cols;
          const row = Math.floor(idx / cols);
          return {
            id: `comm:${c.community_id}`,
            position: { x: col * spacingX + 40, y: row * spacingY + 40 },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
            data: {
              label: `${c.label}\n(${c.node_count.toLocaleString()} nodes · ${c.internal_link_count.toLocaleString()} internal edges)`,
              rawCommunity: c,
            },
            style: {
              background: THEME.cardWhite,
              color: THEME.ink,
              border: `2px solid ${THEME.wine}`,
              borderRadius: "10px",
              padding: "10px 14px",
              width: 240,
              fontSize: "12px",
              fontFamily: "Work Sans, system-ui, sans-serif",
              fontWeight: 600,
              boxShadow: "0 2px 6px rgba(58, 15, 52, 0.08)",
              cursor: "pointer",
              whiteSpace: "pre-line",
            },
          };
        });

        const rfEdges: Edge[] = commLinks
          .filter(
            (l) =>
              validCommIds.has(`comm:${l.source_community}`) &&
              validCommIds.has(`comm:${l.target_community}`)
          )
          .slice(0, 120)
          .map((l, idx) => ({
            id: `comm-edge-${idx}-${l.source_community}-${l.target_community}`,
            source: `comm:${l.source_community}`,
            target: `comm:${l.target_community}`,
            animated: false,
            style: {
              stroke: l.inferred_count > l.extracted_count ? THEME.plum : THEME.wine,
              strokeWidth: Math.min(3.5, 1 + Math.log10(l.link_count + 1)),
              strokeDasharray: l.inferred_count > 0 && l.extracted_count === 0 ? "5 4" : undefined,
            },
          }));

        return {
          flowNodes: rfNodes,
          flowEdges: rfEdges,
          displayedNodeCount: rfNodes.length,
          displayedLinkCount: rfEdges.length,
          activeSubgraphMeta: {
            modeLabel: `Full-Corpus Community Overview (${comms.length} communities covering ${communitiesQuery.data.corpus_total_nodes.toLocaleString()} nodes)`,
            matchedTotalNodes: communitiesQuery.data.corpus_total_nodes,
            isSubset: false,
            hasMore: false,
          },
        };
      }

      // Modes 2, 3, 4: Subgraph, Neighborhood, or Path
      const activeData: CodeGraphResponse | PathResponse | undefined =
        explorerMode === "neighborhood"
          ? neighborhoodQuery.data
          : explorerMode === "path"
            ? pathQuery.data
            : subgraphQuery.data;

      const rawNodes = activeData?.nodes || [];
      const rawLinks = activeData?.links || [];
      const nodeIdSet = new Set(rawNodes.map((n) => n.id));

      // Deterministic grid/concentric layout (stable, no chaotic physics)
      const cols = Math.max(1, Math.ceil(Math.sqrt(rawNodes.length)));
      const cellW = 240;
      const cellH = 110;

      const rfNodes: Node[] = rawNodes.map((n, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const ftype = n.file_type || n.type || "code";
        const borderColor = NODE_COLORS[ftype] || THEME.wine;
        const isFocal = Boolean(n.is_focal);
        const isInferred = n.provenance === "inferred";
        const displayLabel = n.label || n.name || n.id.split("::").pop() || n.id;

        return {
          id: n.id,
          position: { x: col * cellW + 30, y: row * cellH + 30 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          data: {
            label: displayLabel,
            rawNode: n,
          },
          style: {
            background: isFocal ? THEME.wine : isInferred ? THEME.paper : THEME.cardWhite,
            color: isFocal ? THEME.cardWhite : THEME.ink,
            border: `${isFocal ? "2.5px" : "1.6px"} ${isInferred ? "dashed" : "solid"} ${borderColor}`,
            borderRadius: "8px",
            padding: "8px 12px",
            width: 200,
            fontSize: "11px",
            fontFamily: "Work Sans, system-ui, sans-serif",
            fontWeight: isFocal ? 700 : 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            cursor: "pointer",
          },
        };
      });

      // Guarantee zero dangling visible edges
      const safeLinks = rawLinks.filter(
        (l) => nodeIdSet.has(l.source) && nodeIdSet.has(l.target)
      );

      const rfEdges: Edge[] = safeLinks.map((l, idx) => {
        const rel = l.relation || l.type || "references";
        const isInferred =
          l.provenance === "inferred" ||
          l.inferred === true ||
          rel === "indirect_call";
        return {
          id: `e-${idx}-${l.source}-${l.target}-${rel}`,
          source: l.source,
          target: l.target,
          animated: false, // Avoid animating all edges per CODE_GRAPH_DUAL_VIEW_PLAN.md
          data: { rawLink: l },
          style: {
            stroke: EDGE_COLORS[rel] || THEME.plum,
            strokeWidth: isInferred ? 1.4 : 1.8,
            strokeDasharray: isInferred ? "5 4" : undefined,
          },
        };
      });

      const matchedTotal =
        (activeData as CodeGraphResponse)?.matched_total_nodes ?? rawNodes.length;
      const hasMore = Boolean((activeData as CodeGraphResponse)?.has_more);

      return {
        flowNodes: rfNodes,
        flowEdges: rfEdges,
        displayedNodeCount: rfNodes.length,
        displayedLinkCount: rfEdges.length,
        activeSubgraphMeta: {
          modeLabel:
            explorerMode === "neighborhood"
              ? `Symbol Neighborhood (${neighborhoodHops} hop${neighborhoodHops > 1 ? "s" : ""} around ${neighborhoodTarget})`
              : explorerMode === "path"
                ? `Verified Path (${pathSource} → ${pathTarget})`
                : `Filtered Subgraph (offset ${offset}, showing ${rfNodes.length} of ${matchedTotal.toLocaleString()} matched nodes)`,
          matchedTotalNodes: matchedTotal,
          isSubset: rfNodes.length < corpusTotalNodes,
          hasMore,
        },
      };
    }, [
      explorerMode,
      communitiesQuery.data,
      subgraphQuery.data,
      neighborhoodQuery.data,
      pathQuery.data,
      neighborhoodHops,
      neighborhoodTarget,
      pathSource,
      pathTarget,
      offset,
      corpusTotalNodes,
    ]);

  const activeError =
    statsQuery.error ||
    (activeView === "dependency" &&
      ((explorerMode === "communities" && communitiesQuery.error) ||
        (explorerMode === "subgraph" && subgraphQuery.error) ||
        (explorerMode === "neighborhood" && neighborhoodQuery.error) ||
        (explorerMode === "path" && pathQuery.error)));

  const isLoadingAny =
    statsQuery.isLoading ||
    (activeView === "dependency" &&
      ((explorerMode === "communities" && communitiesQuery.isLoading) ||
        (explorerMode === "subgraph" && subgraphQuery.isLoading) ||
        (explorerMode === "neighborhood" && neighborhoodQuery.isLoading) ||
        (explorerMode === "path" && pathQuery.isLoading)));

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundColor: THEME.paper,
        color: THEME.ink,
        fontFamily: "Work Sans, system-ui, sans-serif",
      }}
    >
      {/* Top Banner: Explicit Sample Mode or Stale Snapshot Warning */}
      {sampleModeEnabled && (
        <div
          role="status"
          aria-live="polite"
          className="px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 text-xs font-medium"
          style={{
            backgroundColor: THEME.amberBg,
            borderColor: THEME.amber,
            color: THEME.ink,
          }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: THEME.amber }} />
            <span>
              <strong>SAMPLE MODE ACTIVE:</strong> Displaying synthetic demonstration nodes (8 nodes),
              NOT actual repository data from <code>graphify-out/graph.json</code>.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSampleModeEnabled(false)}
            className="px-3 py-1 rounded text-xs font-semibold border transition-colors"
            style={{
              backgroundColor: THEME.wine,
              color: THEME.cardWhite,
              borderColor: THEME.wine,
            }}
          >
            Exit Sample Mode &amp; Reconnect Live Graphify
          </button>
        </div>
      )}

      {!sampleModeEnabled && activeSnapshot?.freshness_status === "stale" && (
        <div
          role="alert"
          className="px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 text-xs"
          style={{
            backgroundColor: THEME.amberBg,
            borderColor: THEME.amber,
            color: THEME.ink,
          }}
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" style={{ color: THEME.amber }} />
            <span>
              <strong>STALE SNAPSHOT RETAINED:</strong> Showing last-good snapshot (commit{" "}
              <code>{activeSnapshot.built_at_commit}</code>) because reloading{" "}
              <code>graph.json</code> failed: {activeSnapshot.stale_reason}
            </span>
          </div>
          <button
            type="button"
            onClick={handleRefreshAll}
            className="px-2.5 py-1 rounded border text-xs font-semibold"
            style={{ borderColor: THEME.wine, color: THEME.wine, backgroundColor: THEME.cardWhite }}
          >
            Retry Fresh Load
          </button>
        </div>
      )}

      {/* Main Header & Dual-View Switcher */}
      <header
        className="px-4 sm:px-6 py-4 border-b"
        style={{ backgroundColor: THEME.cardWhite, borderColor: THEME.plumOutline }}
      >
        <div className="max-w-[1440px] mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Network className="w-5 h-5" style={{ color: THEME.wine }} />
              <h1
                className="text-xl sm:text-2xl font-bold tracking-tight"
                style={{ fontFamily: "Serifon Editorial, Georgia, serif", color: THEME.wine }}
              >
                Code Graph: Workflow Overview &amp; Graphify Explorer
              </h1>
              <span
                className="text-xs px-2.5 py-0.5 rounded-full border font-medium"
                style={{
                  backgroundColor: THEME.paper,
                  borderColor: THEME.plumOutline,
                  color: THEME.plumMuted,
                }}
              >
                Commit: {activeSnapshot?.built_at_commit || statsQuery.data?.built_at_commit || "unloaded"}
              </span>
              {activeSnapshot && (
                <span
                  className="text-xs px-2.5 py-0.5 rounded-full border font-medium"
                  style={{
                    backgroundColor:
                      activeSnapshot.freshness_status === "fresh" ? THEME.paper : THEME.amberBg,
                    borderColor:
                      activeSnapshot.freshness_status === "fresh" ? THEME.plum : THEME.amber,
                    color: THEME.ink,
                  }}
                >
                  Snapshot {activeSnapshot.snapshot_id.slice(0, 8)} · {activeSnapshot.freshness_status.toUpperCase()}
                </span>
              )}
            </div>
            <p
              className="mt-1 text-xs sm:text-sm"
              style={{
                fontFamily: "Quadraat, QuadraatSmallCaps, Georgia, serif",
                color: THEME.plumMuted,
              }}
            >
              Complementing the reviewed Mermaid workflow diagram with the persistent{" "}
              <code>graphify-out/graph.json</code> dependency corpus.
            </p>
          </div>

          {/* Dual-View Tabs + Snapshot Refresh Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="tablist"
              aria-label="Code Graph Views"
              className="inline-flex rounded-lg p-1 border"
              style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}
            >
              <button
                type="button"
                role="tab"
                id="tab-workflow-overview"
                aria-selected={activeView === "workflow"}
                aria-controls="panel-workflow-overview"
                onClick={() => setActiveView("workflow")}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight") setActiveView("dependency");
                }}
                className="px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: activeView === "workflow" ? THEME.wine : "transparent",
                  color: activeView === "workflow" ? THEME.cardWhite : THEME.ink,
                }}
              >
                <GitBranch className="w-4 h-4" />
                <span>Workflow overview</span>
              </button>
              <button
                type="button"
                role="tab"
                id="tab-dependency-graph"
                aria-selected={activeView === "dependency"}
                aria-controls="panel-dependency-graph"
                onClick={() => setActiveView("dependency")}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft") setActiveView("workflow");
                }}
                className="px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: activeView === "dependency" ? THEME.wine : "transparent",
                  color: activeView === "dependency" ? THEME.cardWhite : THEME.ink,
                }}
              >
                <Layers className="w-4 h-4" />
                <span>Dependency graph</span>
                {corpusTotalNodes > 0 && (
                  <span
                    className="ml-1 px-1.5 py-0.2 rounded text-[11px]"
                    style={{
                      backgroundColor:
                        activeView === "dependency" ? THEME.plum : THEME.paperWarm,
                      color: activeView === "dependency" ? THEME.cardWhite : THEME.wine,
                    }}
                  >
                    {corpusTotalNodes.toLocaleString()}
                  </span>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={handleRefreshAll}
              title="Re-validate graph.json snapshot and refresh graph + stats without server restart"
              className="px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors"
              style={{
                backgroundColor: THEME.cardWhite,
                borderColor: THEME.plumOutline,
                color: THEME.wine,
              }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Snapshot</span>
            </button>
          </div>
        </div>

        {/* Full-Corpus vs Displayed Subset Summary Strip */}
        <div
          className="max-w-[1440px] mx-auto mt-3 pt-3 border-t grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-xs"
          style={{ borderColor: THEME.plumOutline }}
        >
          <div className="px-3 py-1.5 rounded border" style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}>
            <span className="block text-[11px]" style={{ color: THEME.plumMuted }}>Full Corpus Nodes</span>
            <strong className="text-sm font-bold" style={{ color: THEME.wine }}>
              {corpusTotalNodes > 0 ? corpusTotalNodes.toLocaleString() : "—"}
            </strong>
          </div>
          <div className="px-3 py-1.5 rounded border" style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}>
            <span className="block text-[11px]" style={{ color: THEME.plumMuted }}>Full Corpus Links</span>
            <strong className="text-sm font-bold" style={{ color: THEME.wine }}>
              {corpusTotalLinks > 0 ? corpusTotalLinks.toLocaleString() : "—"}
            </strong>
          </div>
          <div className="px-3 py-1.5 rounded border" style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}>
            <span className="block text-[11px]" style={{ color: THEME.plumMuted }}>Displayed View Subset</span>
            <strong className="text-sm font-bold" style={{ color: THEME.plum }}>
              {activeView === "workflow"
                ? `${currentDiagram.nodes.length} workflow nodes`
                : `${displayedNodeCount.toLocaleString()} nodes / ${displayedLinkCount.toLocaleString()} edges`}
            </strong>
          </div>
          <div className="px-3 py-1.5 rounded border" style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}>
            <span className="block text-[11px]" style={{ color: THEME.plumMuted }}>Communities</span>
            <strong className="text-sm font-bold" style={{ color: THEME.wine }}>
              {statsQuery.data?.num_communities?.toLocaleString() || communitiesQuery.data?.num_communities?.toLocaleString() || "—"}
            </strong>
          </div>
          <div className="px-3 py-1.5 rounded border" style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}>
            <span className="block text-[11px]" style={{ color: THEME.plumMuted }}>Link Provenance</span>
            <strong className="text-xs font-semibold" style={{ color: THEME.ink }}>
              {statsQuery.data?.provenance_counts
                ? `${statsQuery.data.provenance_counts.extracted.toLocaleString()} ext / ${statsQuery.data.provenance_counts.inferred.toLocaleString()} inf`
                : "Extracted & Inferred"}
            </strong>
          </div>
          <div className="px-3 py-1.5 rounded border" style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}>
            <span className="block text-[11px]" style={{ color: THEME.plumMuted }}>Snapshot Source</span>
            <strong className="text-xs font-semibold truncate block" style={{ color: THEME.ink }}>
              {activeSnapshot?.graph_path_source || "graphify-out/graph.json"}
            </strong>
          </div>
        </div>
      </header>

      {/* Visible Backend / Snapshot Error Banner (Never Silently Replaced by Sample Graph) */}
      {activeError && !sampleModeEnabled && (
        <div
          role="alert"
          className="max-w-[1440px] w-full mx-auto mt-4 px-4 sm:px-6"
        >
          <div
            className="p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4"
            style={{
              backgroundColor: THEME.cardWhite,
              borderColor: THEME.wine,
              boxShadow: "0 2px 8px rgba(58, 15, 52, 0.08)",
            }}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: THEME.wine }} />
              <div>
                <h2
                  className="text-sm font-bold"
                  style={{ fontFamily: "Serifon Editorial, Georgia, serif", color: THEME.wine }}
                >
                  Graphify Snapshot Unavailable — No Silent Demo Fallback Applied
                </h2>
                <p className="text-xs mt-1" style={{ color: THEME.ink }}>
                  {activeError.message}
                </p>
                <p
                  className="text-xs mt-1"
                  style={{
                    fontFamily: "Quadraat, QuadraatSmallCaps, Georgia, serif",
                    color: THEME.plumMuted,
                  }}
                >
                  Ensure <code>graphify-out/graph.json</code> is present or set{" "}
                  <code>RADEXTRACT_GRAPH_PATH</code> in the backend environment. The reviewed
                  Mermaid Workflow Overview remains available locally.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleRefreshAll}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border"
                style={{
                  backgroundColor: THEME.wine,
                  color: THEME.cardWhite,
                  borderColor: THEME.wine,
                }}
              >
                Retry Connection
              </button>
              <button
                type="button"
                onClick={() => setAllowStaleSnapshot((prev) => !prev)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border"
                style={{
                  backgroundColor: THEME.paper,
                  color: THEME.wine,
                  borderColor: THEME.plumOutline,
                }}
              >
                {allowStaleSnapshot ? "Require Fresh Snapshot" : "Allow Retained Stale Snapshot"}
              </button>
              <button
                type="button"
                onClick={() => setSampleModeEnabled(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border"
                style={{
                  backgroundColor: THEME.amberBg,
                  color: THEME.amber,
                  borderColor: THEME.amber,
                }}
              >
                Open Labelled Sample Mode
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 1: WORKFLOW OVERVIEW TAB (Reviewed Mermaid + Verified Drill-Down)
         ===================================================================== */}
      {activeView === "workflow" && (
        <main
          id="panel-workflow-overview"
          role="tabpanel"
          aria-labelledby="tab-workflow-overview"
          className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5 flex flex-col gap-5"
        >
          {/* Diagram Selector & Action Toolbar */}
          <div
            className="p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3"
            style={{ backgroundColor: THEME.cardWhite, borderColor: THEME.plumOutline }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor="workflow-diagram-select"
                className="text-xs font-semibold"
                style={{ color: THEME.wine }}
              >
                Diagram View:
              </label>
              <select
                id="workflow-diagram-select"
                value={selectedDiagramId}
                onChange={(e) => {
                  setSelectedDiagramId(e.target.value);
                  const nextDiag =
                    REVIEWED_DIAGRAMS.find((d) => d.id === e.target.value) ||
                    REVIEWED_DIAGRAMS[0];
                  setSelectedWorkflowNodeId(nextDiag.nodes[0]?.id || "S");
                }}
                className="px-3 py-1.5 rounded-lg border text-xs font-medium"
                style={{
                  backgroundColor: THEME.paper,
                  borderColor: THEME.plumOutline,
                  color: THEME.ink,
                }}
              >
                {REVIEWED_DIAGRAMS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} (Reviewed {d.lastReviewedDate})
                  </option>
                ))}
              </select>

              <span
                className="text-xs px-2.5 py-1 rounded border"
                style={{
                  backgroundColor: THEME.paper,
                  borderColor: THEME.plumOutline,
                  color: THEME.plumMuted,
                }}
              >
                Last reviewed: <strong>{currentDiagram.lastReviewedDate}</strong> ·{" "}
                {currentDiagram.revisionLabel}
              </span>
            </div>

            {/* Zoom, Reset, Copy Mermaid Source, Local SVG Export */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setDiagramZoom((z) => Math.max(0.55, Number((z - 0.15).toFixed(2))))}
                aria-label="Zoom out diagram"
                className="p-1.5 rounded border text-xs"
                style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline, color: THEME.wine }}
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs px-2 font-medium" style={{ color: THEME.plumMuted }}>
                {Math.round(diagramZoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setDiagramZoom((z) => Math.min(1.75, Number((z + 0.15).toFixed(2))))}
                aria-label="Zoom in diagram"
                className="p-1.5 rounded border text-xs"
                style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline, color: THEME.wine }}
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setDiagramZoom(1)}
                className="px-2.5 py-1.5 rounded border text-xs font-medium flex items-center gap-1"
                style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline, color: THEME.wine }}
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Fit / Reset</span>
              </button>
              <button
                type="button"
                onClick={handleCopyMermaidSource}
                className="px-2.5 py-1.5 rounded border text-xs font-medium flex items-center gap-1"
                style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline, color: THEME.wine }}
              >
                {copiedMermaid ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedMermaid ? "Copied Mermaid" : "Copy Mermaid Source"}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowMermaidSource((prev) => !prev)}
                className="px-2.5 py-1.5 rounded border text-xs font-medium flex items-center gap-1"
                style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline, color: THEME.wine }}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>{showMermaidSource ? "Hide Source" : "View Source"}</span>
              </button>
              <button
                type="button"
                onClick={handleExportLocalSvg}
                className="px-3 py-1.5 rounded border text-xs font-semibold flex items-center gap-1"
                style={{
                  backgroundColor: THEME.wine,
                  borderColor: THEME.wine,
                  color: THEME.cardWhite,
                }}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Local SVG</span>
              </button>
            </div>
          </div>

          {/* Diagram Canvas + Right-Hand Node Mapping & Qualifications Sidebar */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            {/* Left 8 cols: Local Interactive Mermaid SVG Canvas */}
            <div className="xl:col-span-8 flex flex-col gap-4">
              <div
                className="rounded-xl border overflow-hidden flex flex-col"
                style={{ backgroundColor: THEME.cardWhite, borderColor: THEME.plumOutline }}
              >
                <div
                  className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2"
                  style={{ backgroundColor: THEME.paperWarm, borderColor: THEME.plumOutline }}
                >
                  <div>
                    <h2
                      className="text-base font-bold"
                      style={{ fontFamily: "Serifon Editorial, Georgia, serif", color: THEME.wine }}
                    >
                      {currentDiagram.title}
                    </h2>
                    <p
                      className="text-xs"
                      style={{
                        fontFamily: "Quadraat, QuadraatSmallCaps, Georgia, serif",
                        color: THEME.plumMuted,
                      }}
                    >
                      {currentDiagram.subtitle}
                    </p>
                  </div>
                  <span className="text-[11px] font-medium" style={{ color: THEME.plumMuted }}>
                    Click any node to inspect verified Graphify mapping
                  </span>
                </div>

                {/* Summary disclaimer bar */}
                <div
                  className="px-4 py-2 border-b text-xs"
                  style={{
                    backgroundColor: THEME.paper,
                    borderColor: THEME.plumOutline,
                    fontFamily: "Quadraat, QuadraatSmallCaps, Georgia, serif",
                    color: THEME.ink,
                  }}
                >
                  {currentDiagram.summaryNote}
                </div>

                {/* Interactive SVG Viewport */}
                <div
                  className="overflow-auto p-3 max-h-[680px]"
                  style={{ backgroundColor: THEME.paper }}
                >
                  <div
                    style={{
                      width: `${Math.round(diagramLayout.width * diagramZoom)}px`,
                      height: `${Math.round(diagramLayout.height * diagramZoom)}px`,
                      transition: reducedMotion ? "none" : "width 150ms ease, height 150ms ease",
                    }}
                  >
                    <svg
                      viewBox={`0 0 ${diagramLayout.width} ${diagramLayout.height}`}
                      width="100%"
                      height="100%"
                      role="img"
                      aria-label={`${currentDiagram.title} workflow diagram`}
                    >
                      <defs>
                        <marker
                          id="wf-arrow-solid"
                          viewBox="0 0 10 10"
                          refX="8"
                          refY="5"
                          markerWidth="6"
                          markerHeight="6"
                          orient="auto-start-reverse"
                        >
                          <path d="M 0 1 L 10 5 L 0 9 z" fill={THEME.wine} />
                        </marker>
                        <marker
                          id="wf-arrow-dashed"
                          viewBox="0 0 10 10"
                          refX="8"
                          refY="5"
                          markerWidth="6"
                          markerHeight="6"
                          orient="auto-start-reverse"
                        >
                          <path d="M 0 1 L 10 5 L 0 9 z" fill={THEME.plum} />
                        </marker>
                      </defs>

                      {/* Header inside SVG */}
                      <text
                        x={28}
                        y={32}
                        fontFamily="Serifon Editorial, Georgia, serif"
                        fontSize={16}
                        fontWeight="bold"
                        fill={THEME.wine}
                      >
                        {currentDiagram.title}
                      </text>
                      <text
                        x={28}
                        y={52}
                        fontFamily="Work Sans, sans-serif"
                        fontSize={11}
                        fill={THEME.plumMuted}
                      >
                        Reviewed: {currentDiagram.lastReviewedDate} · Snapshot commit:{" "}
                        {activeSnapshot?.built_at_commit ||
                          statsQuery.data?.built_at_commit ||
                          "unverified"}{" "}
                        · Local strict renderer (zero external data transmission)
                      </text>

                      {/* Subgraph containers */}
                      {diagramLayout.subgraphs.map((sg) => (
                        <g key={sg.title}>
                          <rect
                            x={sg.x}
                            y={sg.y}
                            width={sg.width}
                            height={sg.height}
                            rx={10}
                            fill={THEME.paperWarm}
                            fillOpacity={0.65}
                            stroke={THEME.plumOutline}
                            strokeWidth={1.2}
                          />
                          <text
                            x={sg.x + 12}
                            y={sg.y + 18}
                            fontFamily="Serifon Editorial, Georgia, serif"
                            fontSize={12}
                            fontWeight="bold"
                            fill={THEME.wine}
                          >
                            {sg.title}
                          </text>
                        </g>
                      ))}

                      {/* Edges */}
                      {currentDiagram.edges.map((edge, idx) => {
                        const src = diagramLayout.nodes[edge.from];
                        const tgt = diagramLayout.nodes[edge.to];
                        if (!src || !tgt) return null;
                        const x1 =
                          currentDiagram.direction === "TB"
                            ? src.x + src.width / 2
                            : src.x + src.width;
                        const y1 =
                          currentDiagram.direction === "TB"
                            ? src.y + src.height
                            : src.y + src.height / 2;
                        const x2 =
                          currentDiagram.direction === "TB"
                            ? tgt.x + tgt.width / 2
                            : tgt.x;
                        const y2 =
                          currentDiagram.direction === "TB"
                            ? tgt.y
                            : tgt.y + tgt.height / 2;
                        const midX = (x1 + x2) / 2;
                        const midY = (y1 + y2) / 2;
                        const pathD =
                          currentDiagram.direction === "TB"
                            ? `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`
                            : `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
                        const isDashed = edge.style === "dashed";
                        return (
                          <g key={`edge-${idx}-${edge.from}-${edge.to}`}>
                            <path
                              d={pathD}
                              fill="none"
                              stroke={isDashed ? THEME.plum : THEME.wine}
                              strokeWidth={1.75}
                              strokeDasharray={isDashed ? "5 4" : undefined}
                              markerEnd={
                                isDashed
                                  ? "url(#wf-arrow-dashed)"
                                  : "url(#wf-arrow-solid)"
                              }
                            />
                            {edge.label && (
                              <text
                                x={midX}
                                y={midY - 6}
                                textAnchor="middle"
                                fontFamily="Work Sans, sans-serif"
                                fontSize={10}
                                fill={THEME.plumMuted}
                              >
                                {edge.label}
                              </text>
                            )}
                          </g>
                        );
                      })}

                      {/* Interactive Nodes */}
                      {Object.values(diagramLayout.nodes).map((pos) => {
                        const { spec, x, y, width, height } = pos;
                        const isSelected = spec.id === selectedWorkflowNodeId;
                        const isPlanned = spec.status === "planned";
                        const isStorage = spec.status === "storage";
                        const fill = isSelected
                          ? THEME.wine
                          : isPlanned
                            ? THEME.paper
                            : isStorage
                              ? THEME.amberBg
                              : THEME.cardWhite;
                        const stroke = isPlanned
                          ? THEME.plum
                          : isStorage
                            ? THEME.amber
                            : THEME.wine;
                        const startTextY =
                          y + height / 2 - ((spec.labelLines.length - 1) * 14) / 2 + 4;

                        return (
                          <g
                            key={spec.id}
                            role="button"
                            tabIndex={0}
                            aria-label={`${spec.labelLines.join(" ")} (${spec.status})`}
                            onClick={() => setSelectedWorkflowNodeId(spec.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedWorkflowNodeId(spec.id);
                              }
                            }}
                            style={{ cursor: "pointer" }}
                          >
                            <rect
                              x={x}
                              y={y}
                              width={width}
                              height={height}
                              rx={isStorage ? 18 : 8}
                              fill={fill}
                              stroke={stroke}
                              strokeWidth={isSelected ? 2.8 : 1.8}
                              strokeDasharray={isPlanned ? "5 4" : undefined}
                            />
                            {spec.labelLines.map((line, i) => (
                              <text
                                key={i}
                                x={x + width / 2}
                                y={startTextY + i * 14}
                                textAnchor="middle"
                                fontFamily="Work Sans, sans-serif"
                                fontSize={11}
                                fontWeight={i === 0 ? 600 : 400}
                                fill={
                                  isSelected
                                    ? THEME.cardWhite
                                    : isPlanned
                                      ? THEME.plumMuted
                                      : THEME.ink
                                }
                              >
                                {line}
                              </text>
                            ))}
                          </g>
                        );
                      })}

                      {/* Status Legend inside SVG */}
                      <g transform={`translate(24, ${diagramLayout.height - 46})`}>
                        <rect
                          x={0}
                          y={0}
                          width={diagramLayout.width - 48}
                          height={34}
                          rx={6}
                          fill={THEME.cardWhite}
                          stroke={THEME.plumOutline}
                          strokeWidth={1}
                        />
                        <rect
                          x={16}
                          y={10}
                          width={18}
                          height={14}
                          rx={3}
                          fill={THEME.cardWhite}
                          stroke={THEME.wine}
                          strokeWidth={1.8}
                        />
                        <text
                          x={42}
                          y={21}
                          fontFamily="Work Sans, sans-serif"
                          fontSize={11}
                          fill={THEME.ink}
                        >
                          Implemented functional flow (solid)
                        </text>
                        <rect
                          x={266}
                          y={10}
                          width={18}
                          height={14}
                          rx={3}
                          fill={THEME.paper}
                          stroke={THEME.plum}
                          strokeWidth={1.8}
                          strokeDasharray="4 3"
                        />
                        <text
                          x={292}
                          y={21}
                          fontFamily="Work Sans, sans-serif"
                          fontSize={11}
                          fill={THEME.plumMuted}
                        >
                          Planned / unverified addition (dashed)
                        </text>
                        <rect
                          x={541}
                          y={10}
                          width={18}
                          height={14}
                          rx={7}
                          fill={THEME.amberBg}
                          stroke={THEME.amber}
                          strokeWidth={1.8}
                        />
                        <text
                          x={567}
                          y={21}
                          fontFamily="Work Sans, sans-serif"
                          fontSize={11}
                          fill={THEME.ink}
                        >
                          Persistent storage / snapshot artifact
                        </text>
                      </g>
                    </svg>
                  </div>
                </div>

                {/* Optional Raw Mermaid Source Drawer */}
                {showMermaidSource && (
                  <div
                    className="p-4 border-t"
                    style={{ backgroundColor: THEME.paperWarm, borderColor: THEME.plumOutline }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold" style={{ color: THEME.wine }}>
                        Reviewed Mermaid Source ({currentDiagram.id})
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyMermaidSource}
                        className="text-xs underline"
                        style={{ color: THEME.wine }}
                      >
                        Copy to Clipboard
                      </button>
                    </div>
                    <pre
                      className="p-3 rounded border text-xs overflow-x-auto"
                      style={{
                        backgroundColor: THEME.cardWhite,
                        borderColor: THEME.plumOutline,
                        color: THEME.ink,
                      }}
                    >
                      <code>{currentDiagram.mermaidSource}</code>
                    </pre>
                  </div>
                )}
              </div>

              {/* Accessible Text Equivalent (Screen-reader & keyboard accessible workflow table) */}
              <details
                className="rounded-xl border p-4"
                style={{ backgroundColor: THEME.cardWhite, borderColor: THEME.plumOutline }}
              >
                <summary
                  className="cursor-pointer text-sm font-bold flex items-center justify-between"
                  style={{ fontFamily: "Serifon Editorial, Georgia, serif", color: THEME.wine }}
                >
                  <span>
                    Accessible Text Equivalent &amp; Node-by-Node Status Table ({currentDiagram.nodes.length} nodes)
                  </span>
                  <span className="text-xs font-normal" style={{ fontFamily: "Work Sans, sans-serif", color: THEME.plumMuted }}>
                    Expand for tabular representation
                  </span>
                </summary>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr
                        className="border-b"
                        style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}
                      >
                        <th className="py-2 px-2.5 font-semibold">Node ID</th>
                        <th className="py-2 px-2.5 font-semibold">Stage / Subgraph</th>
                        <th className="py-2 px-2.5 font-semibold">Component Label</th>
                        <th className="py-2 px-2.5 font-semibold">Status</th>
                        <th className="py-2 px-2.5 font-semibold">Source / Symbol Hint</th>
                        <th className="py-2 px-2.5 font-semibold">Outgoing Connections</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentDiagram.nodes.map((n) => {
                        const outgoing = currentDiagram.edges
                          .filter((e) => e.from === n.id)
                          .map((e) => `${e.to}${e.style === "dashed" ? " (planned)" : ""}`)
                          .join(", ");
                        return (
                          <tr
                            key={n.id}
                            className="border-b"
                            style={{ borderColor: THEME.plumOutline }}
                          >
                            <td className="py-2 px-2.5 font-mono font-semibold">{n.id}</td>
                            <td className="py-2 px-2.5">{n.subgraph || "Top-level"}</td>
                            <td className="py-2 px-2.5 font-medium">{n.labelLines.join(" — ")}</td>
                            <td className="py-2 px-2.5">
                              <span
                                className="px-2 py-0.5 rounded text-[11px] font-semibold"
                                style={{
                                  backgroundColor:
                                    n.status === "planned" ? THEME.paperWarm : THEME.paper,
                                  color: n.status === "planned" ? THEME.plum : THEME.wine,
                                  border: `1px ${n.status === "planned" ? "dashed" : "solid"} ${
                                    n.status === "planned" ? THEME.plum : THEME.wine
                                  }`,
                                }}
                              >
                                {n.status.toUpperCase()}
                              </span>
                            </td>
                            <td className="py-2 px-2.5 font-mono text-[11px]">{n.sourceHint}</td>
                            <td className="py-2 px-2.5">{outgoing || "Terminal"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>

            {/* Right 4 cols: Selected Workflow Node Drill-Down + Important Qualifications */}
            <div className="xl:col-span-4 flex flex-col gap-4">
              {/* Node-to-Graphify Inspector Card */}
              <div
                className="rounded-xl border p-4"
                style={{ backgroundColor: THEME.cardWhite, borderColor: THEME.plumOutline }}
              >
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b" style={{ borderColor: THEME.plumOutline }}>
                  <h3
                    className="text-sm font-bold"
                    style={{ fontFamily: "Serifon Editorial, Georgia, serif", color: THEME.wine }}
                  >
                    Verified Graphify Mapping Inspector
                  </h3>
                  <span
                    className="text-[11px] px-2 py-0.5 rounded font-mono font-semibold"
                    style={{ backgroundColor: THEME.paper, color: THEME.wine }}
                  >
                    Node [{selectedWorkflowNodeSpec.id}]
                  </span>
                </div>

                <div className="mt-3 space-y-2.5 text-xs">
                  <div>
                    <div className="font-bold text-sm" style={{ color: THEME.ink }}>
                      {selectedWorkflowNodeSpec.labelLines.join(" · ")}
                    </div>
                    <p
                      className="mt-1"
                      style={{
                        fontFamily: "Quadraat, QuadraatSmallCaps, Georgia, serif",
                        color: THEME.plumMuted,
                      }}
                    >
                      {selectedWorkflowNodeSpec.description}
                    </p>
                  </div>

                  <div
                    className="p-3 rounded-lg border space-y-1.5"
                    style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}
                  >
                    <div className="flex items-center justify-between">
                      <span style={{ color: THEME.plumMuted }}>Implementation Status:</span>
                      <span
                        className="font-semibold uppercase"
                        style={{
                          color:
                            selectedWorkflowNodeSpec.status === "planned"
                              ? THEME.plum
                              : THEME.wine,
                        }}
                      >
                        {selectedWorkflowNodeSpec.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span style={{ color: THEME.plumMuted }}>Inspected Module Hint:</span>
                      <code className="font-mono text-[11px]" style={{ color: THEME.ink }}>
                        {selectedWorkflowNodeSpec.sourceHint}
                      </code>
                    </div>

                    {selectedWorkflowNodeSpec.status === "planned" ? (
                      <div
                        className="mt-2 pt-2 border-t text-xs"
                        style={{ borderColor: THEME.plumOutline, color: THEME.plumMuted }}
                      >
                        <strong>Unavailable in Graphify Snapshot:</strong> This node represents a
                        planned architectural addition (dashed). No symbol or call edge is invented
                        in the dependency graph.
                      </div>
                    ) : selectedWorkflowLiveMapping?.available ? (
                      <div
                        className="mt-2 pt-2 border-t space-y-1.5"
                        style={{ borderColor: THEME.plumOutline }}
                      >
                        <div className="font-semibold" style={{ color: THEME.wine }}>
                          Verified in Loaded Snapshot ({selectedWorkflowLiveMapping.matched_count}{" "}
                          matching symbol{selectedWorkflowLiveMapping.matched_count === 1 ? "" : "s"}):
                        </div>
                        <div className="font-mono text-[11px] break-all">
                          {selectedWorkflowLiveMapping.primary_node_id}
                        </div>
                        {selectedWorkflowLiveMapping.primary_source_file && (
                          <div className="text-[11px]" style={{ color: THEME.plumMuted }}>
                            File: <code>{selectedWorkflowLiveMapping.primary_source_file}</code>{" "}
                            {selectedWorkflowLiveMapping.primary_community != null &&
                              `(Community ${selectedWorkflowLiveMapping.primary_community})`}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            handleDrillDownFromWorkflow(
                              selectedWorkflowNodeSpec,
                              selectedWorkflowLiveMapping
                            )
                          }
                          className="mt-2 w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
                          style={{ backgroundColor: THEME.wine, color: THEME.cardWhite }}
                        >
                          <span>Open Symbol Neighborhood in Dependency Graph</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div
                        className="mt-2 pt-2 border-t space-y-2"
                        style={{ borderColor: THEME.plumOutline }}
                      >
                        <div className="text-[11px]" style={{ color: THEME.plumMuted }}>
                          {selectedWorkflowLiveMapping?.reason ||
                            "Live snapshot mapping not yet resolved or node unmapped in current subset."}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleDrillDownFromWorkflow(
                              selectedWorkflowNodeSpec,
                              selectedWorkflowLiveMapping
                            )
                          }
                          className="w-full py-1.5 px-3 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5"
                          style={{
                            backgroundColor: THEME.cardWhite,
                            borderColor: THEME.wine,
                            color: THEME.wine,
                          }}
                        >
                          <span>Search Matching Symbols in Dependency Graph</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Important Qualifications Panel (Displayed with the Overview per Plan) */}
              <div
                className="rounded-xl border p-4"
                style={{ backgroundColor: THEME.cardWhite, borderColor: THEME.plumOutline }}
              >
                <div className="flex items-center gap-2 pb-2.5 border-b" style={{ borderColor: THEME.plumOutline }}>
                  <BookOpen className="w-4 h-4 shrink-0" style={{ color: THEME.wine }} />
                  <h3
                    className="text-sm font-bold"
                    style={{ fontFamily: "Serifon Editorial, Georgia, serif", color: THEME.wine }}
                  >
                    Important Qualifications Displayed with the Overview
                  </h3>
                </div>
                <ul
                  className="mt-3 space-y-2 text-xs list-disc pl-4"
                  style={{
                    fontFamily: "Quadraat, QuadraatSmallCaps, Georgia, serif",
                    color: THEME.ink,
                  }}
                >
                  {WORKFLOW_QUALIFICATIONS.map((qual, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {qual}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* =====================================================================
          VIEW 2: DEPENDENCY GRAPH TAB (Actual Persistent Graphify Explorer)
         ===================================================================== */}
      {activeView === "dependency" && (
        <main
          id="panel-dependency-graph"
          role="tabpanel"
          aria-labelledby="tab-dependency-graph"
          className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4"
        >
          {/* Exploration Mode & Filter Toolbar */}
          <div
            className="p-4 rounded-xl border flex flex-col gap-3"
            style={{ backgroundColor: THEME.cardWhite, borderColor: THEME.plumOutline }}
          >
            {/* Mode Switcher: Communities Overview | Filtered Subgraph | Symbol Neighborhood | Path Finder */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b" style={{ borderColor: THEME.plumOutline }}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold mr-1" style={{ color: THEME.wine }}>
                  Exploration Mode:
                </span>
                {(
                  [
                    { id: "communities", label: "1. Full-Corpus Community Overview", icon: Compass },
                    { id: "subgraph", label: "2. File / Community / Symbol Subgraph", icon: Filter },
                    { id: "neighborhood", label: "3. Symbol Neighborhood (Hops)", icon: Sparkles },
                    { id: "path", label: "4. Relationship Path Finder", icon: Route },
                  ] as const
                ).map((m) => {
                  const Icon = m.icon;
                  const active = explorerMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setExplorerMode(m.id);
                        setInspectedNode(null);
                        setInspectedLink(null);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors"
                      style={{
                        backgroundColor: active ? THEME.wine : THEME.paper,
                        borderColor: active ? THEME.wine : THEME.plumOutline,
                        color: active ? THEME.cardWhite : THEME.ink,
                      }}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>

              <span className="text-xs font-medium" style={{ color: THEME.plumMuted }}>
                {activeSubgraphMeta.modeLabel}
              </span>
            </div>

            {/* Mode-Specific Controls */}
            {explorerMode === "communities" && (
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <p
                  style={{
                    fontFamily: "Quadraat, QuadraatSmallCaps, Georgia, serif",
                    color: THEME.plumMuted,
                  }}
                >
                  Showing all communities across the entire{" "}
                  <strong>{corpusTotalNodes.toLocaleString()}-node</strong> corpus without any
                  2,685-node cap. Click any community card or graph node to drill down into its
                  symbols and files.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setExplorerMode("subgraph");
                    setOffset(0);
                  }}
                  className="px-3 py-1.5 rounded-lg border font-semibold"
                  style={{
                    backgroundColor: THEME.paper,
                    borderColor: THEME.wine,
                    color: THEME.wine,
                  }}
                >
                  Browse Paginated Symbol Nodes →
                </button>
              </div>
            )}

            {explorerMode === "subgraph" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold mb-1" style={{ color: THEME.plumMuted }}>
                    Search Symbol / File (Full Corpus)
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2" style={{ color: THEME.plumMuted }} />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setOffset(0);
                      }}
                      placeholder="e.g. AIScreeningPipeline, laya..."
                      className="w-full pl-8 pr-2.5 py-1.5 rounded border text-xs"
                      style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold mb-1" style={{ color: THEME.plumMuted }}>
                    Source File Filter
                  </label>
                  <select
                    value={sourceFile}
                    onChange={(e) => {
                      setSourceFile(e.target.value);
                      setOffset(0);
                    }}
                    className="w-full px-2.5 py-1.5 rounded border text-xs"
                    style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}
                  >
                    <option value="">All files ({corpusTotalNodes.toLocaleString()} nodes)</option>
                    {statsQuery.data?.top_source_files?.map((f) => (
                      <option key={f.path} value={f.path}>
                        {f.path} ({f.node_count})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold mb-1" style={{ color: THEME.plumMuted }}>
                    Community ID
                  </label>
                  <select
                    value={community}
                    onChange={(e) => {
                      setCommunity(e.target.value);
                      setOffset(0);
                    }}
                    className="w-full px-2.5 py-1.5 rounded border text-xs"
                    style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}
                  >
                    <option value="">All communities</option>
                    {communitiesQuery.data?.communities?.map((c) => (
                      <option key={c.community_id} value={String(c.community_id)}>
                        {c.label} ({c.node_count} nodes)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold mb-1" style={{ color: THEME.plumMuted }}>
                    Relation &amp; Provenance
                  </label>
                  <div className="flex gap-1.5">
                    <select
                      value={relation}
                      onChange={(e) => {
                        setRelation(e.target.value);
                        setOffset(0);
                      }}
                      className="w-1/2 px-2 py-1.5 rounded border text-xs"
                      style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}
                    >
                      <option value="">All rels</option>
                      {Object.keys(statsQuery.data?.relations || EDGE_COLORS).map((relKey) => (
                        <option key={relKey} value={relKey}>
                          {relKey}
                        </option>
                      ))}
                    </select>
                    <select
                      value={provenanceFilter}
                      onChange={(e) => {
                        setProvenanceFilter(e.target.value);
                        setOffset(0);
                      }}
                      className="w-1/2 px-2 py-1.5 rounded border text-xs"
                      style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}
                    >
                      <option value="">All prov</option>
                      <option value="extracted">Extracted</option>
                      <option value="inferred">Inferred</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold mb-1" style={{ color: THEME.plumMuted }}>
                    Page Size (Bounded Load)
                  </label>
                  <select
                    value={limit}
                    onChange={(e) => {
                      setLimit(Number(e.target.value));
                      setOffset(0);
                    }}
                    className="w-full px-2.5 py-1.5 rounded border text-xs"
                    style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}
                  >
                    <option value={100}>100 nodes / page</option>
                    <option value={250}>250 nodes / page</option>
                    <option value={500}>500 nodes / page</option>
                    <option value={1000}>1,000 nodes / page</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold mb-1" style={{ color: THEME.plumMuted }}>
                    Corpus Offset Navigation (No Cap)
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={offset === 0}
                      onClick={() => setOffset((o) => Math.max(0, o - limit))}
                      className="px-2 py-1.5 rounded border disabled:opacity-40"
                      style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}
                      aria-label="Previous offset page"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      min={0}
                      step={limit}
                      value={offset}
                      onChange={(e) => setOffset(Math.max(0, Number(e.target.value) || 0))}
                      className="w-20 px-2 py-1.5 rounded border text-center font-mono text-xs"
                      style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}
                      aria-label="Node offset"
                    />
                    <button
                      type="button"
                      disabled={!activeSubgraphMeta.hasMore}
                      onClick={() => setOffset((o) => o + limit)}
                      className="px-2 py-1.5 rounded border disabled:opacity-40"
                      style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}
                      aria-label="Next offset page"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {explorerMode === "neighborhood" && (
              <div className="flex flex-wrap items-end gap-3 text-xs">
                <div className="flex-1 min-w-[240px]">
                  <label className="block text-[11px] font-semibold mb-1" style={{ color: THEME.plumMuted }}>
                    Target Symbol or Node ID (Searches Full 11k+ Corpus)
                  </label>
                  <input
                    type="text"
                    value={neighborhoodTarget}
                    onChange={(e) => setNeighborhoodTarget(e.target.value)}
                    placeholder="e.g. AIScreeningPipeline, LayaModel, coded_extraction_service..."
                    className="w-full px-3 py-1.5 rounded border text-xs font-mono"
                    style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1" style={{ color: THEME.plumMuted }}>
                    Traversal Hops
                  </label>
                  <select
                    value={neighborhoodHops}
                    onChange={(e) => setNeighborhoodHops(Number(e.target.value))}
                    className="px-3 py-1.5 rounded border text-xs"
                    style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}
                  >
                    <option value={1}>1 Hop (Immediate callers/callees)</option>
                    <option value={2}>2 Hops (Extended neighborhood)</option>
                    <option value={3}>3 Hops (Broad module cluster)</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "AIScreeningPipeline",
                    "LayaModel",
                    "coded_extraction_service",
                    "laya_extraction_tracer",
                    "prisma2020_sync",
                  ].map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => setNeighborhoodTarget(sym)}
                      className="px-2.5 py-1.5 rounded border text-[11px] font-mono"
                      style={{
                        backgroundColor:
                          neighborhoodTarget === sym ? THEME.wine : THEME.paper,
                        color: neighborhoodTarget === sym ? THEME.cardWhite : THEME.wine,
                        borderColor: THEME.plumOutline,
                      }}
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {explorerMode === "path" && (
              <div className="flex flex-wrap items-end gap-3 text-xs">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[11px] font-semibold mb-1" style={{ color: THEME.plumMuted }}>
                    Source Symbol / Node ID
                  </label>
                  <input
                    type="text"
                    value={pathSource}
                    onChange={(e) => setPathSource(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border text-xs font-mono"
                    style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[11px] font-semibold mb-1" style={{ color: THEME.plumMuted }}>
                    Target Symbol / Node ID
                  </label>
                  <input
                    type="text"
                    value={pathTarget}
                    onChange={(e) => setPathTarget(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border text-xs font-mono"
                    style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}
                  />
                </div>
                {pathQuery.data && (
                  <div
                    className="px-3 py-1.5 rounded border font-medium"
                    style={{
                      backgroundColor: pathQuery.data.found ? THEME.paper : THEME.amberBg,
                      borderColor: pathQuery.data.found ? THEME.wine : THEME.amber,
                    }}
                  >
                    {pathQuery.data.found
                      ? `Verified path found: ${pathQuery.data.hop_count} hop(s)`
                      : "No relationship path exists in graph.json (no edges invented)"}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Graph Canvas + Right-Hand Node/Edge & Community Detail Inspector */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div
              className="xl:col-span-8 rounded-xl border overflow-hidden relative"
              style={{
                height: "620px",
                backgroundColor: THEME.paper,
                borderColor: THEME.plumOutline,
              }}
            >
              {isLoadingAny ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-7 h-7 animate-spin" style={{ color: THEME.wine }} />
                  <span className="text-xs font-medium" style={{ color: THEME.plumMuted }}>
                    Loading verified Graphify snapshot...
                  </span>
                </div>
              ) : flowNodes.length === 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
                  <Info className="w-8 h-8 mb-2" style={{ color: THEME.plum }} />
                  <h3
                    className="text-base font-bold"
                    style={{ fontFamily: "Serifon Editorial, Georgia, serif", color: THEME.wine }}
                  >
                    Zero Nodes Matched Current Filter
                  </h3>
                  <p className="text-xs mt-1 max-w-md" style={{ color: THEME.plumMuted }}>
                    Full corpus contains {corpusTotalNodes.toLocaleString()} nodes, but 0 nodes
                    matched your current filter/path criteria. Try clearing filters or resetting
                    offset to 0.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSourceFile("");
                      setCommunity("");
                      setRelation("");
                      setFileType("");
                      setProvenanceFilter("");
                      setSearchQuery("");
                      setOffset(0);
                    }}
                    className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ backgroundColor: THEME.wine, color: THEME.cardWhite }}
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                <ReactFlow
                  nodes={flowNodes}
                  edges={flowEdges}
                  fitView
                  minZoom={0.15}
                  maxZoom={2.5}
                  onNodeClick={(_, node) => {
                    const rawComm = (node.data as { rawCommunity?: CommunitySummaryItem })
                      ?.rawCommunity;
                    if (rawComm) {
                      handleOpenCommunityDrillDown(rawComm.community_id);
                      return;
                    }
                    const rawNode = (node.data as { rawNode?: CodeGraphNode })?.rawNode;
                    if (rawNode) {
                      setInspectedNode(rawNode);
                      setInspectedLink(null);
                    }
                  }}
                  onEdgeClick={(_, edge) => {
                    const rawLink = (edge.data as { rawLink?: CodeGraphLink })?.rawLink;
                    if (rawLink) {
                      setInspectedLink(rawLink);
                      setInspectedNode(null);
                    }
                  }}
                >
                  <Background
                    variant={BackgroundVariant.Dots}
                    gap={18}
                    size={1}
                    color={THEME.plumOutline}
                  />
                  <Controls />
                  <MiniMap
                    nodeColor={(n) => {
                      const rn = (n.data as { rawNode?: CodeGraphNode })?.rawNode;
                      return NODE_COLORS[rn?.file_type || "code"] || THEME.wine;
                    }}
                    style={{
                      backgroundColor: THEME.cardWhite,
                      border: `1px solid ${THEME.plumOutline}`,
                    }}
                  />
                </ReactFlow>
              )}

              {/* Provenance Legend Overlay */}
              <div
                className="absolute bottom-3 left-14 z-10 px-3 py-1.5 rounded-lg border text-[11px] flex flex-wrap items-center gap-3"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.94)",
                  borderColor: THEME.plumOutline,
                  color: THEME.ink,
                }}
              >
                <span className="font-semibold" style={{ color: THEME.wine }}>
                  Provenance Legend:
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-4 h-0.5"
                    style={{ backgroundColor: THEME.wine }}
                  />
                  Extracted relationship (solid)
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-4 border-t-2 border-dashed"
                    style={{ borderColor: THEME.plum }}
                  />
                  Inferred relationship (dashed)
                </span>
              </div>
            </div>

            {/* Right 4 cols: Node / Edge Inspector & Community Directory */}
            <div className="xl:col-span-4 flex flex-col gap-4">
              {/* Selected Node or Edge Provenance Detail Panel */}
              <div
                className="rounded-xl border p-4"
                style={{ backgroundColor: THEME.cardWhite, borderColor: THEME.plumOutline }}
              >
                <h3
                  className="text-sm font-bold pb-2 border-b"
                  style={{
                    fontFamily: "Serifon Editorial, Georgia, serif",
                    color: THEME.wine,
                    borderColor: THEME.plumOutline,
                  }}
                >
                  Selected Symbol / Relationship Inspector
                </h3>

                {inspectedNode ? (
                  <div className="mt-3 space-y-2 text-xs">
                    <div className="font-mono font-bold text-sm break-all" style={{ color: THEME.wine }}>
                      {inspectedNode.label || inspectedNode.name || inspectedNode.id}
                    </div>
                    <div className="p-2.5 rounded border space-y-1" style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}>
                      <div>
                        <span style={{ color: THEME.plumMuted }}>Node ID: </span>
                        <code className="font-mono text-[11px] break-all">{inspectedNode.id}</code>
                      </div>
                      {inspectedNode.source_file && (
                        <div>
                          <span style={{ color: THEME.plumMuted }}>Source File: </span>
                          <code className="font-mono text-[11px] break-all">
                            {inspectedNode.source_file}
                          </code>
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-1">
                        <span>
                          Community:{" "}
                          <strong>
                            {inspectedNode.community != null ? inspectedNode.community : "N/A"}
                          </strong>
                        </span>
                        <span>
                          Provenance:{" "}
                          <strong className="uppercase">
                            {inspectedNode.provenance || "extracted"}
                          </strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setExplorerMode("neighborhood");
                          setNeighborhoodTarget(inspectedNode.id);
                          setNeighborhoodHops(1);
                        }}
                        className="flex-1 py-1.5 px-2.5 rounded text-xs font-semibold"
                        style={{ backgroundColor: THEME.wine, color: THEME.cardWhite }}
                      >
                        1-Hop Neighborhood
                      </button>
                      {inspectedNode.source_file && (
                        <button
                          type="button"
                          onClick={() => {
                            setExplorerMode("subgraph");
                            setSourceFile(inspectedNode.source_file || "");
                            setCommunity("");
                            setOffset(0);
                          }}
                          className="flex-1 py-1.5 px-2.5 rounded border text-xs font-semibold"
                          style={{ borderColor: THEME.wine, color: THEME.wine }}
                        >
                          Filter to File
                        </button>
                      )}
                    </div>
                  </div>
                ) : inspectedLink ? (
                  <div className="mt-3 space-y-2 text-xs">
                    <div className="font-bold text-sm" style={{ color: THEME.wine }}>
                      Relationship: {inspectedLink.relation || inspectedLink.type}
                    </div>
                    <div className="p-2.5 rounded border space-y-1.5" style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}>
                      <div>
                        <span style={{ color: THEME.plumMuted }}>Source: </span>
                        <code className="font-mono text-[11px] break-all">
                          {inspectedLink.source}
                        </code>
                      </div>
                      <div>
                        <span style={{ color: THEME.plumMuted }}>Target: </span>
                        <code className="font-mono text-[11px] break-all">
                          {inspectedLink.target}
                        </code>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span>
                          Provenance:{" "}
                          <strong className="uppercase">
                            {inspectedLink.provenance || "extracted"}
                          </strong>
                        </span>
                        <span>Direction: {inspectedLink.direction || "directed"}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p
                    className="mt-3 text-xs"
                    style={{
                      fontFamily: "Quadraat, QuadraatSmallCaps, Georgia, serif",
                      color: THEME.plumMuted,
                    }}
                  >
                    Click any node or edge in the Dependency Graph canvas to inspect its source
                    file path, community assignment, and whether the relationship is directly
                    extracted or inferred.
                  </p>
                )}
              </div>

              {/* Full-Corpus Communities Directory */}
              <div
                className="rounded-xl border p-4 flex-1 flex flex-col"
                style={{ backgroundColor: THEME.cardWhite, borderColor: THEME.plumOutline }}
              >
                <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: THEME.plumOutline }}>
                  <h3
                    className="text-sm font-bold"
                    style={{ fontFamily: "Serifon Editorial, Georgia, serif", color: THEME.wine }}
                  >
                    Full-Corpus Communities ({communitiesQuery.data?.num_communities ?? 0})
                  </h3>
                  {explorerMode !== "communities" && (
                    <button
                      type="button"
                      onClick={() => setExplorerMode("communities")}
                      className="text-xs underline font-medium"
                      style={{ color: THEME.wine }}
                    >
                      Show Overview Map
                    </button>
                  )}
                </div>

                <div className="mt-2.5 space-y-2 max-h-[340px] overflow-y-auto pr-1 text-xs">
                  {communitiesQuery.data?.communities?.map((c) => (
                    <div
                      key={c.community_id}
                      className="p-2.5 rounded-lg border flex items-center justify-between gap-2"
                      style={{ backgroundColor: THEME.paper, borderColor: THEME.plumOutline }}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold truncate" style={{ color: THEME.wine }}>
                          {c.label}
                        </div>
                        <div className="text-[11px]" style={{ color: THEME.plumMuted }}>
                          {c.node_count.toLocaleString()} nodes ·{" "}
                          {c.internal_link_count.toLocaleString()} internal /{" "}
                          {c.external_link_count.toLocaleString()} external links
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenCommunityDrillDown(c.community_id)}
                        className="px-2.5 py-1 rounded border text-[11px] font-semibold shrink-0"
                        style={{
                          backgroundColor: THEME.cardWhite,
                          borderColor: THEME.wine,
                          color: THEME.wine,
                        }}
                      >
                        Drill Down
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
export default CodeGraphPage;
