import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Scale } from "lucide-react";
import { DualBlindedDashboard } from "../components/screening/DualBlindedDashboard";

export function BlindReviewPage() {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to={`/projects/${projectId}/screening`}
          className="text-xs font-semibold text-slate-500 hover:text-indigo-600 flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Screening Workspace</span>
        </Link>
        <span className="text-xs font-mono text-slate-400">
          Project ID: {projectId?.slice(0, 12)}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-700">
          <Scale className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-serif font-bold text-slate-900 tracking-tight">
            Dual-Blinded Screening &amp; Adjudication Console
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Statistical inter-rater concordance, Cohen's Kappa evaluation, and disagreement adjudication.
          </p>
        </div>
      </div>

      <DualBlindedDashboard projectId={projectId!} />
    </div>
  );
}
