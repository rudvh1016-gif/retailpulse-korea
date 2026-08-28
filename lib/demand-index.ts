export type DemandLevel = "low" | "normal" | "high";

function interpolatedQuantile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction;
}

/** Bands for the sample UI only: lower and upper thirds of the full displayed cohort. */
export function demoDemandThresholds(cohort: number[]): { lowMax: number; highMin: number } {
  if (!cohort.length || cohort.some((value) => !Number.isFinite(value))) {
    throw new TypeError("A finite demo demand cohort is required");
  }
  const sorted = [...cohort].sort((a, b) => a - b);
  return { lowMax: interpolatedQuantile(sorted, 1 / 3), highMin: interpolatedQuantile(sorted, 2 / 3) };
}

export function classifyDemoDemand(score: number, cohort: number[]): DemandLevel {
  const { lowMax, highMin } = demoDemandThresholds(cohort);
  if (score <= lowMax) return "low";
  if (score >= highMin) return "high";
  return "normal";
}
