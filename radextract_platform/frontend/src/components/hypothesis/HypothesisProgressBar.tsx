import { useState, useEffect } from "react";
import { Loader2, Sparkles, CheckCircle2 } from "lucide-react";

interface HypothesisProgressBarProps {
  isPending: boolean;
  isSuccess?: boolean;
}

export function HypothesisProgressBar({ isPending, isSuccess }: HypothesisProgressBarProps) {
  const [progress, setProgress] = useState(12);
  const [stage, setStage] = useState("Deconstructing PICO criteria & study design...");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isPending) {
      if (!isSuccess) {
        setProgress(0);
        setElapsed(0);
      }
      return;
    }

    setProgress(12);
    setStage("Deconstructing PICO criteria & study boundaries...");
    setElapsed(0);

    const timer = setInterval(() => {
      setElapsed((prev: number) => prev + 1);
    }, 1000);

    const pTimer = setInterval(() => {
      setProgress((prev: number) => {
        if (prev < 38) {
          setStage("Synthesizing directional primary alternative (H1)...");
          return prev + 5;
        } else if (prev < 68) {
          setStage("Deriving statistical null hypothesis (H0) & test boundaries...");
          return prev + 3.5;
        } else if (prev < 88) {
          setStage("Formulating secondary subgroup, safety & endpoint hypotheses...");
          return prev + 2.5;
        } else if (prev < 96) {
          setStage("Validating clinical falsifiability & persisting to database...");
          return prev + 0.8;
        }
        return prev;
      });
    }, 400);

    return () => {
      clearInterval(timer);
      clearInterval(pTimer);
    };
  }, [isPending, isSuccess]);

  if (!isPending && !isSuccess) return null;

  return (
    <div className="mb-4 p-4 bg-gradient-to-r from-blue-50/95 via-indigo-50/90 to-purple-50/95 border border-blue-200/90 rounded-xl shadow-sm transition-all duration-300">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          {isSuccess && !isPending ? (
            <div className="flex items-center justify-center h-5 w-5 rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          ) : (
            <div className="relative flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-phylo-blue" />
              <Sparkles className="h-2 w-2 text-indigo-500 absolute -top-0.5 -right-0.5 animate-pulse" />
            </div>
          )}
          <span className="text-xs font-semibold text-gray-800">
            {isSuccess && !isPending ? "Hypotheses generated & synchronized!" : stage}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-gray-600">
          <span className="font-semibold text-phylo-blue">
            {isSuccess && !isPending ? "100%" : `${Math.round(progress)}%`}
          </span>
          <span>•</span>
          <span className="font-mono text-gray-500">{elapsed}s</span>
        </div>
      </div>

      {/* Animated Gradient Progress Bar */}
      <div className="w-full bg-gray-200/90 h-2.5 rounded-full overflow-hidden p-0.5 shadow-inner">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${
            isSuccess && !isPending
              ? "bg-emerald-500"
              : "bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 animate-pulse"
          }`}
          style={{ width: isSuccess && !isPending ? "100%" : `${progress}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5 font-medium text-gray-600">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
          Active local GPU reasoning engine
        </span>
        <span className="text-gray-400">Please do not refresh</span>
      </div>
    </div>
  );
}
