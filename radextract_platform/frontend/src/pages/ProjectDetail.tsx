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
    <div className="p-8 max-w-5xl mx-auto">
      {project && (
        <>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          {project.description && <p className="text-gray-500 mt-1">{project.description}</p>}
        </>
      )}

      {/* AI Extraction & Verification Primary Hero Banner */}
      <div className="card p-6 mt-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white border-0 shadow-xl relative overflow-hidden rounded-2xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-semibold mb-3 border border-blue-400/30">
              <Sparkles className="h-3.5 w-3.5 text-blue-400" /> AI Extraction Engine · Docling v2.4 Multi-Modal
            </div>
            <h2 className="text-xl md:text-2xl font-extrabold text-white tracking-tight leading-snug">
              PDF Data Extraction & Word-Style Track Changes
            </h2>
            <p className="text-sm text-slate-300 mt-2 leading-relaxed">
              6 Benchmark Radiotherapy & Aneurysm papers pre-extracted with spatial bounding boxes, in-situ PDF quote highlighting, and rapid human verification.
            </p>
            <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> 6 Papers Pre-Indexed</span>
              <span>·</span>
              <span>Single Keystroke Shortcuts (A, M, R, F)</span>
              <span>·</span>
              <span>Cross-Study Matrix</span>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0 w-full sm:w-auto">
            <Link
              to={`/projects/${projectId}/extraction`}
              className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-900/40 hover:shadow-xl transition-all flex items-center justify-center gap-2"
            >
              <Highlighter className="h-4 w-4" />
              Open PDF Extraction
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to={`/projects/${projectId}/extraction-sheet`}
              className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 text-sm font-semibold backdrop-blur-xs transition-all flex items-center justify-center gap-2"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
              Extraction Data Sheet
            </Link>
          </div>
        </div>
      </div>

      {/* PICOS */}
      {Object.keys(pico).length > 0 && (
        <div className="card p-5 mt-6">
          <h2 className="font-semibold mb-3">PICOS Framework</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {pico.population && <PicosItem letter="P" label="Population" value={pico.population} />}
            {pico.index_test && <PicosItem letter="I" label="Index Test" value={pico.index_test} />}
            {pico.comparator && <PicosItem letter="C" label="Comparator" value={pico.comparator} />}
            {pico.outcome && <PicosItem letter="O" label="Outcome" value={pico.outcome} />}
            {pico.study_design && <PicosItem letter="S" label="Study Design" value={pico.study_design} />}
          </div>
        </div>
      )}

      {/* Dashboard cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="card p-5 hover:shadow-md transition-shadow">
            <c.icon className={`h-8 w-8 ${c.color} mb-2`} />
            <div className="text-2xl font-bold">{c.value}</div>
            <div className="text-sm text-gray-500">{c.label}</div>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div className="mt-6 flex gap-3">
        <Link to={`/projects/${projectId}/studies/new`} className="btn-primary">
          <Plus className="h-4 w-4" /> Import Study
        </Link>
        <Link to={`/projects/${projectId}/export`} className="btn-secondary">
          <Download className="h-4 w-4" /> Export Data
        </Link>
      </div>

      {/* Research question */}
      {project?.research_question && (
        <div className="card p-4 mt-6 bg-phylo-cream/30">
          <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Research Question</div>
          <p className="text-sm">{project.research_question}</p>
        </div>
      )}
    </div>
  );
}

function PicosItem({ letter, label, value }: { letter: string; label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-phylo-blue/10 text-phylo-blue text-xs font-bold">
        {letter}
      </span>
      <div>
        <span className="text-gray-400 text-xs">{label}: </span>
        <span>{value}</span>
      </div>
    </div>
  );
}
