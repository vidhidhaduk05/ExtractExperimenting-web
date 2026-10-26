import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Scale } from "lucide-react";
import { DualBlindedDashboard } from "../components/screening/DualBlindedDashboard";

export function BlindReviewPage() {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 font-sans">
      <div className="flex items-center justify-between">
        <Link
          to={`/projects/${projectId}/screening`}
          className="text-xs font-semibold text-[#81737b] hover:text-[#3a0f34] flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-[#814d75]" />
          <span>Back to Screening Workspace</span>
        </Link>
        <span className="text-xs font-mono text-[#81737b]">
          Project ID: {projectId?.slice(0, 12)}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-white border border-[#d2c2cb] rounded-lg text-[#3a0f34] shadow-2xs">
          <Scale className="w-6 h-6 text-[#3a0f34]" />
        </div>
        <div>
          <h1 className="text-2xl font-serif font-bold text-[#3a0f34] tracking-tight">
            Dual-Blinded Screening &amp; Adjudication Console
          </h1>
          <p className="text-xs text-[#62535d] mt-0.5">
            Statistical inter-rater concordance, Cohen's Kappa evaluation, and disagreement adjudication.
          </p>
        </div>
      </div>

      <DualBlindedDashboard projectId={projectId!} />
    </div>
  );
}
