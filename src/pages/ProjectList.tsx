import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Plus, Folder, Calendar } from "lucide-react";

export function ProjectList() {
  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects,
  });

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Systematic Review Projects</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your radiology systematic review projects</p>
        </div>
        <Link to="/projects/new" className="btn-primary">
          <Plus className="h-4 w-4" /> New Project
        </Link>
      </div>

      {isLoading && <p className="text-gray-400">Loading projects...</p>}

      {projects && projects.length === 0 && (
        <div className="card p-12 text-center">
          <Folder className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-4">No projects yet</p>
          <Link to="/projects/new" className="btn-primary inline-flex">
            <Plus className="h-4 w-4" /> Create your first project
          </Link>
        </div>
      )}

      {projects && projects.length > 0 && (
        <div className="grid gap-4">
          {projects.map((p) => (
            <Link
              key={p.project_id}
              to={`/projects/${p.project_id}`}
              className="card p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h2 className="font-semibold text-lg">{p.name}</h2>
                  {p.description && (
                    <p className="text-gray-500 text-sm mt-1 line-clamp-2">{p.description}</p>
                  )}
                  {p.research_question && (
                    <p className="text-gray-600 text-sm mt-2 italic">
                      RQ: {p.research_question}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-400 ml-4">
                  <Calendar className="h-3 w-3" />
                  {new Date(p.created_at).toLocaleDateString()}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
