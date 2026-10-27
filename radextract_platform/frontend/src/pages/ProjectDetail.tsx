import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Download, Plus, Check } from "lucide-react";

// Dashboard cards: every card shows a real DB-derived number, a computed reason
// line, and navigates to its stage. No label-only tiles, no placeholder dashes.

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? "s" : ""} ago`;
}

function StageCard({
  to,
  number,
  stage,
  reason,
  fraction,
  complete,
}: {
  to: string;
  number: string;
  stage: string;
  reason: string;
  fraction?: { done: number; total: number };
  complete?: boolean;
}) {
  const pct = fraction && fraction.total > 0 ? Math.round((fraction.done / fraction.total) * 100) : 0;
  return (
    <Link
      to={to}
      className="block bg-[#ffffff] border border-[#d2c2cb] p-5 rounded hover:border-[#3a0f34] transition-colors group"
    >
      <div className="font-['Serifon_Editorial'] text-3xl font-bold text-[#3a0f34] tracking-tight">
        {number}
      </div>
      <div className="text-[10px] font-semibold text-[#62535d] uppercase tracking-wider mt-1.5 font-['Work_Sans']">
        {stage}
      </div>
      <div className="text-xs text-[#62535d] mt-2 leading-snug flex items-start gap-1.5">
        {complete && <Check className="h-3.5 w-3.5 text-[#3a0f34] shrink-0 mt-0.5" />}
        <span>{reason}</span>
      </div>
      {fraction && fraction.total > 0 && (
        <div className="h-1 w-full bg-[#eee7ec] rounded-full overflow-hidden mt-3">
          <div className="h-full bg-[#3a0f34] rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      )}
    </Link>
  );
}

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

  const { data: summary } = useQuery({
    queryKey: ["screening-summary", projectId],
    queryFn: () => api.screeningSummary(projectId!),
    enabled: !!projectId,
  });

  // Live AI batch screening state, polled only while a run is active
  const { data: aiProgress } = useQuery({
    queryKey: ["screening-progress", projectId],
    queryFn: () => api.getAIScreeningProgress(projectId!),
    enabled: !!projectId,
    refetchInterval: (q) => (q.state.data?.active ? 2000 : false),
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

  const { data: prisma } = useQuery({
    queryKey: ["prisma-flow", projectId],
    queryFn: () => api.prismaFlow(projectId!),
    enabled: !!projectId,
  });

  const { data: reviewProgress } = useQuery({
    queryKey: ["review-progress", projectId],
    queryFn: () => api.reviewProgress(projectId!),
    enabled: !!projectId,
  });

  const { data: importBatches = [] } = useQuery({
    queryKey: ["import-batches", projectId],
    queryFn: () => api.listImportBatches(projectId!),
    enabled: !!projectId,
  });

  let pico: Record<string, string> = {};
  try {
    pico = project?.pico_json ? JSON.parse(project.pico_json) : {};
  } catch {}

  const studyCount = studies?.length || 0;
  const total = summary?.total ?? studyCount;
  const pending = summary?.pending ?? 0;
  const decided = total - pending;
  const included = (summary?.ft_included ?? 0) + (summary?.ta_included ?? 0);
  const taDecided = (summary?.ta_included ?? 0) + (summary?.ta_excluded ?? 0);
  const ftIncluded = summary?.ft_included ?? 0;

  const robCount = robSummary?.total_assessments || 0;
  const metaCount = metaList?.length || 0;
  const gradeCount = gradeList?.length || 0;

  const aiRunning = !!aiProgress?.active && !aiProgress?.paused;
  const extractionValues = reviewProgress?.total_extractions ?? 0;
  const verifiedValues = reviewProgress?.edited_count ?? 0;
  const lastBatch = importBatches.find((b) => b.status !== "undone");

  const cards = (
    <>
      <StageCard
        to={`/projects/${projectId}/screening`}
        number={`${decided} / ${total}`}
        stage="Screening"
        reason={
          aiRunning
            ? `AI batch running — ${aiProgress?.done ?? 0}/${aiProgress?.total ?? 0} read`
            : pending > 0
            ? `${pending} studies waiting on a decision`
            : total > 0
            ? "All studies decided"
            : "Import studies to begin screening"
        }
        fraction={{ done: decided, total: total }}
        complete={total > 0 && pending === 0}
      />

      <StageCard
        to={`/projects/${projectId}/screening?stage=ft`}
        number={`${ftIncluded} / ${taDecided}`}
        stage="Full-Text"
        reason={
          pending > 0
            ? "Blocked: finish Title/Abstract first"
            : taDecided === 0
            ? "No Title/Abstract decisions yet"
            : `${taDecided - ftIncluded} studies not yet included at full-text`
        }
        fraction={{ done: ftIncluded, total: taDecided }}
        complete={taDecided > 0 && pending === 0 && ftIncluded === taDecided}
      />

      <StageCard
        to={`/projects/${projectId}/extraction-sheet`}
        number={`${verifiedValues} / ${extractionValues}`}
        stage="Extraction"
        reason={
          extractionValues === 0
            ? included === 0
              ? "Needs included studies"
              : "Define extraction variables to begin"
            : extractionValues - verifiedValues > 0
            ? `${extractionValues - verifiedValues} values awaiting human verification`
            : "All extracted values verified"
        }
        fraction={{ done: verifiedValues, total: extractionValues }}
        complete={extractionValues > 0 && verifiedValues === extractionValues}
      />

      <StageCard
        to={`/projects/${projectId}/rob`}
        number={`${robCount} / ${included}`}
        stage="Risk of Bias"
        reason={
          included === 0
            ? "Needs included studies"
            : robCount < included
            ? "Required before GRADE can run"
            : "All included studies assessed"
        }
        fraction={{ done: robCount, total: included }}
        complete={included > 0 && robCount >= included}
      />

      <StageCard
        to={`/projects/${projectId}/grade`}
        number={`${gradeCount}`}
        stage="GRADE"
        reason={
          robCount === 0 || extractionValues === 0
            ? "Needs RoB + extraction data"
            : gradeCount === 0
            ? "Ready: assess outcome certainty"
            : "Outcomes evaluated"
        }
        complete={gradeCount > 0}
      />

      <StageCard
        to={`/projects/${projectId}/meta-analysis`}
        number={`${metaCount}`}
        stage="Meta-Analysis"
        reason={
          included < 2
            ? "Needs ≥2 studies with extracted effect data"
            : metaCount === 0
            ? "Ready: pool extracted effect data"
            : "Effect sizes pooled"
        }
        complete={metaCount > 0}
      />

      {/* PRISMA card: the only card that deliberately repeats To-dos numbers */}
      <StageCard
        to={`/projects/${projectId}/prisma`}
        number={`${prisma?.identification?.total ?? 0} → ${prisma?.screening?.records_screened ?? 0} → ${prisma?.included?.studies_in_review ?? 0}`}
        stage="PRISMA Flow"
        reason="Identified → screened → included, live from the flow computation"
      />

      <StageCard
        to={`/projects/${projectId}/studies`}
        number={`${studyCount}`}
        stage="Studies"
        reason={
          lastBatch
            ? `Last import ${relativeTime(lastBatch.created_at)}`
            : "No imports yet"
        }
      />
    </>
  );

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{cards}</div>
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
