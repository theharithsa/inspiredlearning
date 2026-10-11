import type { Workshop } from "./types";
export function workshopCredits(w: Workshop): number | null {
  if (w.status !== "completed") return 0;
  return Number.isFinite(w.teamCredits) && Number.isFinite(w.personalCredits)
    ? w.teamCredits! + w.personalCredits!
    : null;
}
