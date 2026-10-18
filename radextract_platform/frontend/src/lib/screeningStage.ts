export function resolveScreeningStage(study: { screening_stage?: string | null; screening_status?: string | null }): "ta" | "ft" {
  const stage = study.screening_stage;
  if (stage === "ta" || stage === "ft") return stage;
  if (stage) throw new Error("Record has an invalid screening stage. Refresh before saving.");
  // Legacy records have no stage; new records start at abstract screening.
  return study.screening_status === "awaiting_pdf" ? "ft" : "ta";
}
