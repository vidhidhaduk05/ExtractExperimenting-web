import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { FileText, CheckSquare, ShieldCheck, Table, Download, Plus, GitBranch, BarChart3, Award } from "lucide-react";

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
    { label: "Studies", value: studyCount, to: `/projects/${projectId}/studies`, icon: FileText, color: "text-phylo-blue" },
    { label: "Screened In", value: includedCount, to: `/projects/${projectId}/screening`, icon: CheckSquare, color: "text-phylo-green" },
    { label: "PRISMA Flow", value: "View", to: `/projects/${projectId}/prisma`, icon: GitBranch, color: "text-phylo-pink" },
    { label: "RoB Assessments", value: robCount, to: `/projects/${projectId}/rob`, icon: ShieldCheck, color: "text-phylo-orange" },
    { label: "Data Review", value: "—", to: `/projects/${projectId}/review`, icon: Table, color: "text-phylo-pink" },
    { label: "Meta-Analyses", value: metaCount, to: `/projects/${projectId}/meta-analysis`, icon: BarChart3, color: "text-phylo-blue" },
    { label: "GRADE", value: gradeCount, to: `/projects/${projectId}/grade`, icon: Award, color: "text-phylo-green" },
    { label: "Export", value: "—", to: `/projects/${projectId}/export`, icon: Download, color: "text-gray-500" },
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {project && (
        <>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          {project.description && <p className="text-gray-500 mt-1">{project.description}</p>}
        </>
      )}

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
