import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { FileText, CheckSquare, ShieldCheck, Table, Download, Plus, GitBranch, BarChart3, Award, Highlighter, FileSpreadsheet, Sparkles, ArrowRight, Layers } from "lucide-react";

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

  const { data: duplicateData } = useQuery({
    queryKey: ["duplicate-groups", projectId],
    queryFn: () => api.getDuplicateGroups(projectId!).catch(() => null),
    enabled: !!projectId,
  });

  const duplicateCount = duplicateData?.total_duplicates ?? (studies?.filter((s) => s.is_duplicate || s.duplicate_group_id).length || 0);

  const cards = [
    { label: "1. Studies & Search", value: studyCount, to: `/projects/${projectId}/studies`, icon: FileText },
    { label: "2. Deduplication", value: duplicateCount > 0 ? `${duplicateCount} Duplicates` : "Clean", to: `/projects/${projectId}/studies?dedup=open`, icon: Layers },
    { label: "3. Eligibility Screening", value: includedCount, to: `/projects/${projectId}/screening`, icon: CheckSquare },
    { label: "4. Extraction Sheet", value: "Matrix", to: `/projects/${projectId}/extraction-sheet`, icon: FileSpreadsheet },
    { label: "5. Risk of Bias", value: robCount, to: `/projects/${projectId}/rob`, icon: ShieldCheck },
    { label: "6. Evidence Synthesis", value: metaCount, to: `/projects/${projectId}/meta-analysis`, icon: BarChart3 },
    { label: "7. GRADE Certainty", value: gradeCount, to: `/projects/${projectId}/grade`, icon: Award },
    { label: "8. PRISMA 2020 Flow", value: "Audit", to: `/projects/${projectId}/prisma`, icon: GitBranch },
    { label: "9. Scientific Export", value: "Ready", to: `/projects/${projectId}/export`, icon: Download },
  ];

  return (
    <div className="p-6 sm:p-10 max-w-6xl mx-auto space-y-8 font-['Work_Sans']">
      {/* Project Header */}
      {project && (
        <div className="border-b border-[#d2c2cb] pb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded bg-[#ffdea6]/50 text-[#7c5800] border border-[#d2c2cb]">
              PROJECT SYNTHESIS
            </span>
            <span className="text-xs font-mono text-[#81737b]">ID: {projectId?.slice(0, 12)}</span>
          </div>
          <h1 className="font-['Serifon_Editorial'] text-4xl sm:text-5xl font-bold text-[#3a0f34] tracking-tight">
            {project.name}
          </h1>
          {project.description && (
            <p className="font-['Newsreader'] italic text-base text-[#62535d] mt-2 max-w-2xl leading-relaxed">
              {project.description}
            </p>
          )}
        </div>
      )}

      {/* Dashboard Metrics Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-['Serifon_Editorial'] text-xl font-bold text-[#3a0f34]">Review Architecture & Metrics</h3>
          <span className="font-mono text-xs text-[#81737b]">Live Status</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map((c) => (
            <Link
              key={c.label}
              to={c.to}
              className="bg-[#ffffff] border border-[#d2c2cb] p-6 rounded hover:border-[#814d75] hover:bg-[#eee7ec]/30 transition-all group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="h-8 w-8 rounded bg-[#fbf9f4] border border-[#d2c2cb] flex items-center justify-center text-[#3a0f34] group-hover:bg-[#3a0f34] group-hover:text-[#fbf9f4] transition-colors">
                  <c.icon className="h-4 w-4" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-[#81737b] opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="font-['Serifon_Editorial'] text-3xl font-bold text-[#3a0f34] tracking-tight">{c.value}</div>
              <div className="font-mono text-[11px] text-[#62535d] uppercase tracking-wider mt-1">{c.label}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* PICOS Framework */}
      {Object.keys(pico).length > 0 && (
        <div className="bg-[#ffffff] border border-[#d2c2cb] p-6 sm:p-8 rounded">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#ffdea6]/50 text-[#7c5800] border border-[#d2c2cb]">
              PROTOCOL
            </span>
            <h2 className="font-['Serifon_Editorial'] text-xl font-bold text-[#3a0f34]">PICOS Clinical Framework</h2>
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
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-4 border-t border-[#d2c2cb]">
        <div className="flex items-center gap-3">
          <Link
            to={`/projects/${projectId}/studies/new`}
            className="bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017] px-4 py-2 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Import Study</span>
          </Link>
          <Link
            to={`/projects/${projectId}/export`}
            className="bg-[#ffffff] text-[#3a0f34] border border-[#d2c2cb] hover:bg-[#eee7ec] px-4 py-2 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Evidence</span>
          </Link>
        </div>

        {project?.research_question && (
          <div className="font-['Newsreader'] italic text-xs text-[#62535d]">
            <span className="font-mono not-italic text-[10px] text-[#81737b] uppercase mr-2">Q:</span>
            "{project.research_question}"
          </div>
        )}
      </div>
    </div>
  );
}

function PicosItem({ letter, label, value }: { letter: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 p-3.5 rounded bg-[#fbf9f4] border border-[#d2c2cb]">
      <div className="h-6 w-6 rounded bg-[#3a0f34] text-[#fbf9f4] flex items-center justify-center font-['Serifon_Editorial'] text-xs font-bold shrink-0">
        {letter}
      </div>
      <div>
        <div className="font-mono text-[10px] text-[#81737b] uppercase tracking-wider">{label}</div>
        <div className="font-sans text-xs text-[#4f444b] mt-0.5 leading-relaxed">{value}</div>
      </div>
    </div>
  );
}
