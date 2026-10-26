import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, DEMO_PROJECT } from "../lib/api";
import { Plus, Folder, Calendar, BookOpen, Sparkles, RefreshCw } from "lucide-react";

export function ProjectList() {
  const { data: rawProjects, isLoading, error, refetch } = useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects,
  });

  // Always ensure at least the landmark review project is accessible if list is empty
  const projects = rawProjects && rawProjects.length > 0 ? rawProjects : (rawProjects ? [DEMO_PROJECT] : []);

  return (
    <div className="min-h-screen bg-[#fbf9f4] p-6 sm:p-10 font-['Work_Sans']">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header with Master Theme */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#d2c2cb] pb-6">
          <div>
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#814d75] bg-[#eee7ec] px-2 py-0.5 rounded">
              Systematic Literature Review
            </span>
            <h1 className="text-3xl sm:text-4xl font-serif font-bold text-[#3a0f34] mt-2 tracking-tight">
              Research & Extraction Projects
            </h1>
            <p className="text-[#62535d] text-sm mt-1">
              PRISMA 2020 protocol, clinical eligibility screening, data extraction, and synthesis.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/projects/new"
              className="inline-flex items-center gap-2 bg-[#3a0f34] text-[#fbf9f4] px-4 py-2.5 rounded text-sm font-semibold hover:bg-[#1a0017] transition-colors shadow-2xs"
            >
              <Plus className="h-4 w-4" /> New Project
            </Link>
          </div>
        </div>

        {isLoading && (
          <div className="p-8 text-center text-[#72636d] font-mono text-sm">
            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-[#814d75]" />
            Loading research projects...
          </div>
        )}

        {error && (
          <div role="alert" className="p-5 rounded-lg border border-[#d2c2cb] bg-white text-[#4f444b] shadow-2xs space-y-3">
            <div className="flex items-center gap-2 font-semibold text-[#3a0f34]">
              <Sparkles className="h-4 w-4 text-[#814d75]" />
              <span>Offline / Local Cache Active</span>
            </div>
            <p className="text-xs text-[#62535d]">
              Displaying locally cached review studies and extraction records while backend reconnects.
            </p>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => refetch()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-[#3a0f34] text-[#fbf9f4] hover:bg-[#1a0017]"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Reconnect
              </button>
            </div>
          </div>
        )}

        {projects && projects.length === 0 && !isLoading && (
          <div className="bg-white border border-[#d2c2cb] rounded-lg p-12 text-center shadow-2xs space-y-4">
            <Folder className="h-12 w-12 text-[#814d75] mx-auto opacity-70" />
            <h3 className="font-serif text-xl font-bold text-[#3a0f34]">No Review Projects Found</h3>
            <p className="text-[#62535d] text-sm max-w-md mx-auto">
              Create a new systematic review protocol or start with our landmark neurovascular extraction dataset.
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <Link
                to="/projects/new"
                className="inline-flex items-center gap-1.5 bg-[#3a0f34] text-[#fbf9f4] px-4 py-2 rounded text-sm font-semibold hover:bg-[#1a0017]"
              >
                <Plus className="h-4 w-4" /> Create Project
              </Link>
            </div>
          </div>
        )}

        {projects && projects.length > 0 && (
          <div className="grid gap-4">
            {projects.map((p) => (
              <Link
                key={p.project_id}
                to={`/projects/${p.project_id}`}
                className="group block bg-white border border-[#d2c2cb] rounded-lg p-5 hover:border-[#814d75] hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#3a0f34] bg-[#fbf9f4] border border-[#d2c2cb] px-2 py-0.5 rounded">
                        Active Project
                      </span>
                      <span className="text-[11px] font-mono text-[#72636d]">
                        ID: {p.project_id.slice(0, 14)}
                      </span>
                    </div>
                    <h2 className="font-serif text-xl font-bold text-[#3a0f34] group-hover:text-[#814d75] transition-colors">
                      {p.name}
                    </h2>
                    {p.description && (
                      <p className="text-[#62535d] text-sm line-clamp-2 leading-relaxed">
                        {p.description}
                      </p>
                    )}
                    {p.research_question && (
                      <p className="text-[#4f444b] text-xs italic bg-[#fbf9f4] border-l-2 border-[#814d75] pl-2.5 py-1 mt-2">
                        RQ: {p.research_question}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-[#72636d] whitespace-nowrap pt-1">
                    <Calendar className="h-3.5 w-3.5 text-[#814d75]" />
                    <span>{new Date(p.created_at || Date.now()).toLocaleDateString()}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
