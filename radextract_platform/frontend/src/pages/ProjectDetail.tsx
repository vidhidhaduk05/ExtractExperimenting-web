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
    { label: "Extraction Sheet", value: "Matrix", to: `/projects/${projectId}/extraction-sheet`, icon: FileSpreadsheet },
    { label: "Data Extraction (PDF)", value: "6 Papers", to: `/projects/${projectId}/extraction`, icon: Highlighter },
    { label: "Studies", value: studyCount, to: `/projects/${projectId}/studies`, icon: FileText },
    { label: "Screened In", value: includedCount, to: `/projects/${projectId}/screening`, icon: CheckSquare },
    { label: "PRISMA Flow", value: "View", to: `/projects/${projectId}/prisma`, icon: GitBranch },
    { label: "RoB Assessments", value: robCount, to: `/projects/${projectId}/rob`, icon: ShieldCheck },
    { label: "Data Review", value: "—", to: `/projects/${projectId}/review`, icon: Table },
    { label: "Meta-Analyses", value: metaCount, to: `/projects/${projectId}/meta-analysis`, icon: BarChart3 },
  ];

  return (
    <div className="p-6 sm:p-10 max-w-6xl mx-auto space-y-8 bg-[#fbf9f4] min-h-screen">
      {/* Project Header */}
      {project && (
        <div className="border-b border-[#d2c2cb] pb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-[#ffdea6] text-[#3a0f34] border border-[#d2c2cb] text-[10px] font-mono font-bold px-2.5 py-0.5 rounded">PROJECT SYNTHESIS</span>
            <span className="text-xs font-mono text-[#81737b]">ID: {projectId?.slice(0, 12)}</span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#3a0f34] tracking-tight">
            {project.name}
          </h1>
          {project.description && (
            <p className="font-serif italic text-base text-[#62535d] mt-2 max-w-2xl leading-relaxed">
              {project.description}
            </p>
          )}
        </div>
      )}

      {/* AI Extraction & Verification Primary Hero Banner */}
      <div className="bg-white border border-[#d2c2cb] p-6 sm:p-8 rounded-xl relative overflow-hidden shadow-xs">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 relative z-10">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#eee7ec] text-[#3a0f34] border border-[#d2c2cb] text-xs font-mono font-bold mb-3">
              <Sparkles className="h-3.5 w-3.5 text-[#814d75]" /> CO-SCIENTIST ENGINE · DOCLING IN-SITU
            </div>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#3a0f34] tracking-tight leading-snug">
              In-Situ PDF Data Extraction & Word-Style Track Changes
            </h2>
            <p className="font-sans text-xs sm:text-sm text-[#62535d] mt-3 leading-relaxed">
              6 Benchmark Clinical Studies pre-indexed with spatial bounding boxes, in-situ verbatim quote highlighting, and rapid human verification hotkeys.
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-4 text-[11px] font-mono text-[#81737b]">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#3a0f34] animate-pulse"></span>
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
              className="inline-flex items-center justify-center gap-2 bg-[#3a0f34] text-[#fbf9f4] px-5 py-3 rounded-lg text-sm font-semibold hover:bg-[#1a0017] transition-colors shadow-2xs"
            >
              <Highlighter className="h-4 w-4" />
              <span>Open PDF Viewer</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to={`/projects/${projectId}/extraction-sheet`}
              className="inline-flex items-center justify-center gap-2 bg-white text-[#3a0f34] border border-[#d2c2cb] px-5 py-3 rounded-lg text-sm font-semibold hover:bg-[#eee7ec] transition-colors shadow-2xs"
            >
              <FileSpreadsheet className="h-4 w-4 text-[#814d75]" />
              <span>Extraction Sheet</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Dashboard Metrics Grid (Serif numbers as per Master Theme) */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg font-bold text-[#3a0f34]">Review Architecture & Metrics</h3>
          <span className="font-mono text-xs text-[#81737b]">Live Status</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map((c) => (
            <Link
              key={c.label}
              to={c.to}
              className="bg-white border border-[#d2c2cb] p-5 rounded-xl hover:border-[#814d75] hover:shadow-xs transition-all group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="h-8 w-8 rounded-full bg-[#eee7ec] flex items-center justify-center text-[#3a0f34] group-hover:bg-[#3a0f34] group-hover:text-[#fbf9f4] transition-colors">
                  <c.icon className="h-4 w-4" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-[#81737b] opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="font-serif text-3xl font-bold text-[#3a0f34] tracking-tight">{c.value}</div>
              <div className="font-mono text-[11px] text-[#81737b] uppercase tracking-wider mt-1">{c.label}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* PICOS Framework */}
      {Object.keys(pico).length > 0 && (
        <div className="bg-white border border-[#d2c2cb] p-6 sm:p-8 rounded-xl shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <span className="bg-[#ffdea6] text-[#3a0f34] border border-[#d2c2cb] text-[10px] font-mono font-bold px-2 py-0.5 rounded">PROTOCOL</span>
            <h2 className="font-serif text-lg font-bold text-[#3a0f34]">PICOS Clinical Framework</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {pico.population && <PicosItem letter="P" label="Population" value={pico.population} badgeColor="bg-[#3a0f34]" />}
            {pico.index_test && <PicosItem letter="I" label="Index Test" value={pico.index_test} badgeColor="bg-[#814d75]" />}
            {pico.comparator && <PicosItem letter="C" label="Comparator" value={pico.comparator} badgeColor="bg-[#66365c]" />}
            {pico.outcome && <PicosItem letter="O" label="Outcome" value={pico.outcome} badgeColor="bg-[#4f444b]" />}
            {pico.study_design && <PicosItem letter="S" label="Study Design" value={pico.study_design} badgeColor="bg-[#81737b]" />}
          </div>
        </div>
      )}

      {/* Quick Actions & Research Question */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-4 border-t border-[#d2c2cb]">
        <div className="flex items-center gap-3">
          <Link to={`/projects/${projectId}/studies/new`} className="inline-flex items-center gap-1.5 bg-[#3a0f34] text-[#fbf9f4] px-4 py-2 rounded text-xs font-semibold hover:bg-[#1a0017] transition-colors">
            <Plus className="h-3.5 w-3.5" />
            <span>Import Study</span>
          </Link>
          <Link to={`/projects/${projectId}/export`} className="inline-flex items-center gap-1.5 bg-white text-[#3a0f34] border border-[#d2c2cb] px-4 py-2 rounded text-xs font-semibold hover:bg-[#eee7ec] transition-colors">
            <Download className="h-3.5 w-3.5" />
            <span>Export Evidence</span>
          </Link>
        </div>

        {project?.research_question && (
          <div className="font-serif italic text-xs text-[#62535d]">
            <span className="font-mono not-italic text-[10px] text-[#81737b] uppercase mr-2">Q:</span>
            "{project.research_question}"
          </div>
        )}
      </div>
    </div>
  );
}

function PicosItem({ letter, label, value, badgeColor = "bg-[#3a0f34]" }: { letter: string; label: string; value: string; badgeColor?: string }) {
  return (
    <div className="flex items-start gap-3 p-3.5 rounded-lg bg-[#fbf9f4] border border-[#d2c2cb]">
      <div className={`h-6 w-6 rounded-full ${badgeColor} text-[#fbf9f4] flex items-center justify-center font-serif text-xs font-bold shrink-0`}>
        {letter}
      </div>
      <div>
        <div className="font-mono text-[10px] text-[#81737b] uppercase tracking-wider">{label}</div>
        <div className="font-sans text-xs text-[#4f444b] mt-0.5 leading-relaxed">{value}</div>
      </div>
    </div>
  );
}
