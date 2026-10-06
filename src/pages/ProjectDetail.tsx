import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { FileText, CheckSquare, ShieldCheck, Table, Download, Plus, GitBranch, BarChart3, Award, Highlighter, FileSpreadsheet, Sparkles, ArrowRight } from "lucide-react";

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.getProject(projectId!),
    enabled: !!projectId,
  });

  const { data: studies } = useQuery({
    queryKey: ["studies", projectId],
    queryFn: () => api.listStudies(projectId!),
    enabled: !!projectId,
  });

  const { data: robSummary } = useQuery({
    queryKey: ["rob-summary", projectId],
    queryFn: () => api.robSummary(projectId!),
    enabled: !!projectId,
  });

  const { data: metaList } = useQuery({
    queryKey: ["meta-analyses", projectId],
    queryFn: () => api.listMetaAnalyses(projectId!),
    enabled: !!projectId,
  });

  const { data: gradeList } = useQuery({
    queryKey: ["grade-list", projectId],
    queryFn: () => api.listGrade(projectId!),
    enabled: !!projectId,
  });

  let pico: Record<string, string> = {};
  try {
    pico = project?.pico_json ? JSON.parse(project.pico_json) : {};
  } catch {}

  const studyCount = studies?.length || 0;
  const includedCount = studies?.filter((s) => s.screening_status === "included").length || 0;
  const robCount = robSummary?.total_assessments || 0;
  const metaCount = metaList?.length || 0;
  const gradeCount = gradeList?.length || 0;

  const cards = [
    { label: "Data Extraction (PDF)", value: "6 Papers", to: `/projects/${projectId}/extraction`, icon: Highlighter, color: "text-blue-600" },
    { label: "Extraction Sheet", value: "Matrix", to: `/projects/${projectId}/extraction-sheet`, icon: FileSpreadsheet, color: "text-emerald-600" },
    { label: "Studies", value: studyCount, to: `/projects/${projectId}/studies`, icon: FileText, color: "text-phylo-blue" },
    { label: "Screened In", value: includedCount, to: `/projects/${projectId}/screening`, icon: CheckSquare, color: "text-phylo-green" },
    { label: "PRISMA Flow", value: "View", to: `/projects/${projectId}/prisma`, icon: GitBranch, color: "text-phylo-pink" },
    { label: "RoB Assessments", value: robCount, to: `/projects/${projectId}/rob`, icon: ShieldCheck, color: "text-phylo-orange" },
    { label: "Data Review", value: "—", to: `/projects/${projectId}/review`, icon: Table, color: "text-phylo-pink" },
    { label: "Meta-Analyses", value: metaCount, to: `/projects/${projectId}/meta-analysis`, icon: BarChart3, color: "text-phylo-blue" },
  ];

  return (
    <div className="p-6 sm:p-10 max-w-6xl mx-auto space-y-8">
      {/* Project Header */}
      {project && (
        <div className="border-b border-black/[0.08] pb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="tag-phylo-yellow text-[10px] px-2.5 py-0.5">PROJECT SYNTHESIS</span>
            <span className="text-xs font-mono text-[#8A817A]">ID: {projectId?.slice(0, 12)}</span>
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl font-normal text-[#141413] tracking-tight">
            {project.name}
          </h1>
          {project.description && (
            <p className="font-serif italic text-base text-[#6B665E] mt-2 max-w-2xl leading-relaxed">
              {project.description}
            </p>
          )}
        </div>
      )}

      {/* AI Extraction & Verification Primary Hero Banner */}
      <div className="card-phylo-warm p-8 sm:p-10 rounded-3xl relative overflow-hidden shadow-[0_2px_16px_rgba(0,0,0,0.02)]">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 relative z-10">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E9ED4C] text-[#62631E] text-xs font-mono font-medium mb-3">
              <Sparkles className="h-3.5 w-3.5" /> AI AGENT ENGINE · DOCLING v2.4 IN-SITU
            </div>
            <h2 className="font-serif text-2xl sm:text-3xl font-normal text-[#141413] tracking-tight leading-snug">
              In-Situ PDF Data Extraction & Word-Style Track Changes
            </h2>
            <p className="font-sans text-xs sm:text-sm text-[#6B665E] mt-3 leading-relaxed">
              6 Benchmark Clinical Studies pre-indexed with spatial bounding boxes, in-situ verbatim quote highlighting, and rapid human verification hotkeys.
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-4 text-[11px] font-mono text-[#8A817A]">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#141413] animate-pulse"></span>
                6 Papers Pre-Indexed
              </span>
              <span>·</span>
              <span>Hotkeys (A: Accept, M: Modify, R: Reject, F: Focus)</span>
              <span>·</span>
              <span>Consolidated Extraction Sheet</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0 w-full lg:w-auto">
            <Link
              to={`/projects/${projectId}/extraction`}
              className="btn-phylo-primary text-sm px-6 py-3.5 shadow-sm"
            >
              <Highlighter className="h-4 w-4" />
              <span>Open PDF Viewer</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to={`/projects/${projectId}/extraction-sheet`}
              className="btn-phylo-secondary text-sm px-6 py-3.5 bg-white/80"
            >
              <FileSpreadsheet className="h-4 w-4 text-[#141413]" />
              <span>Extraction Sheet</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Dashboard Metrics Grid (Serif numbers as per warm-editorial rules) */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg font-medium text-[#141413]">Review Architecture & Metrics</h3>
          <span className="font-mono text-xs text-[#8A817A]">Live Status</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map((c) => (
            <Link
              key={c.label}
              to={c.to}
              className="card-phylo p-6 rounded-2xl hover:border-black/20 hover:shadow-[0_8px_24px_rgba(0,0,0,0.04)] transition-all group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="h-8 w-8 rounded-full bg-black/[0.04] flex items-center justify-center text-[#141413] group-hover:bg-[#141413] group-hover:text-[#FAF9F3] transition-colors">
                  <c.icon className="h-4 w-4" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-[#8A817A] opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="font-serif text-3xl font-normal text-[#141413] tracking-tight">{c.value}</div>
              <div className="font-mono text-[11px] text-[#8A817A] uppercase tracking-wider mt-1">{c.label}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* PICOS Framework */}
      {Object.keys(pico).length > 0 && (
        <div className="card-phylo p-6 sm:p-8 rounded-2xl">
          <div className="flex items-center gap-2 mb-4">
            <span className="tag-phylo-yellow text-[10px] px-2 py-0.5">PROTOCOL</span>
            <h2 className="font-serif text-lg font-medium text-[#141413]">PICOS Clinical Framework</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {pico.population && <PicosItem letter="P" label="Population" value={pico.population} />}
            {pico.index_test && <PicosItem letter="I" label="Index Test" value={pico.index_test} />}
            {pico.comparator && <PicosItem letter="C" label="Comparator" value={pico.comparator} />}
            {pico.outcome && <PicosItem letter="O" label="Outcome" value={pico.outcome} />}
            {pico.study_design && <PicosItem letter="S" label="Study Design" value={pico.study_design} />}
          </div>
        </div>
      )}

      {/* Quick Actions & Research Question */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-4 border-t border-black/[0.08]">
        <div className="flex items-center gap-3">
          <Link to={`/projects/${projectId}/studies/new`} className="btn-phylo-primary text-xs">
            <Plus className="h-3.5 w-3.5" />
            <span>Import Study</span>
          </Link>
          <Link to={`/projects/${projectId}/export`} className="btn-phylo-secondary text-xs bg-white/80">
            <Download className="h-3.5 w-3.5" />
            <span>Export Evidence</span>
          </Link>
        </div>

        {project?.research_question && (
          <div className="font-serif italic text-xs text-[#6B665E]">
            <span className="font-mono not-italic text-[10px] text-[#8A817A] uppercase mr-2">Q:</span>
            "{project.research_question}"
          </div>
        )}
      </div>
    </div>
  );
}

function PicosItem({ letter, label, value }: { letter: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 p-3.5 rounded-xl bg-black/[0.02] border border-black/[0.04]">
      <div className="h-6 w-6 rounded-full bg-[#141413] text-[#FAF9F3] flex items-center justify-center font-serif text-xs font-bold shrink-0">
        {letter}
      </div>
      <div>
        <div className="font-mono text-[10px] text-[#8A817A] uppercase tracking-wider">{label}</div>
        <div className="font-sans text-xs text-[#141413] mt-0.5 leading-relaxed">{value}</div>
      </div>
    </div>
  );
}
