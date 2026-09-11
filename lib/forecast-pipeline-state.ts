/**
 * Forecast and outcome pipeline: MONITOR ONLY.
 *
 * This module reads the prediction/outcome pipeline's state and reports it. It
 * changes no formula, no weight, no threshold, edits no past prediction, and
 * makes no performance claim. That restriction is the reason it exists
 * separately from the prediction code — an orchestration layer that can both
 * watch a model and adjust it will eventually adjust it to look watched.
 *
 * The one claim it is allowed to block
 * ────────────────────────────────────
 * `BASELINE_NOT_INDEPENDENT`. If the population model's prediction is
 * arithmetically indistinguishable from the same-weekday baseline, then the
 * model has demonstrated nothing, however good its error looks. Reporting skill
 * in that situation would be the single most misleading number this product
 * could publish, so the state exists and suppresses the claim.
 */

export type ForecastPipelineState =
  | "PIPELINE_HEALTHY"
  | "PREDICTION_NOT_CREATED"
  | "INPUT_MISSING"
  | "INPUT_NOT_FROZEN"
  | "OUTCOME_NOT_AVAILABLE_YET"
  | "OUTCOME_MISSING"
  | "OUTCOME_MATCH_FAILED"
  | "BACKFILL_ONLY"
  | "INSUFFICIENT_SAMPLE"
  | "BASELINE_NOT_INDEPENDENT"
  | "FORECAST_EVIDENCE_NOT_DISCRIMINATING"
  | "UNKNOWN";

export interface ForecastObservation {
  targetDate: string;
  /** Was a prospective prediction written before the target time? null = unmeasured. */
  predictionCreated: boolean | null;
  /** Were the model's inputs present? null = unmeasured. */
  inputsPresent: boolean | null;
  /** Were the inputs frozen at prediction time (not re-read later)? null = unmeasured. */
  inputsFrozen: boolean | null;
  /** Has the target time passed, so an outcome could exist at all? */
  outcomeWindowClosed: boolean;
  /** Was an actual observed value recorded? null = unmeasured. */
  outcomeRecorded: boolean | null;
  /** Did prediction and outcome match on the same logical key? null = unmeasured. */
  outcomeMatched: boolean | null;
  /** True when every matched record was written after the fact. */
  backfillOnly: boolean;
  matchedHours: number;
  /** Minimum matched hours before any error figure means anything. */
  minimumSample: number;
  /**
   * Mean absolute error of the model and of the same-weekday baseline.
   * null = unmeasured. Equal-within-tolerance means the model added nothing.
   */
  modelMeanAbsoluteError: number | null;
  baselineMeanAbsoluteError: number | null;
}

/**
 * How close the model and the baseline must be before the model is declared
 * non-independent.
 *
 * Two percent of the baseline error. Tight enough that a real improvement
 * survives it, loose enough that floating-point and rounding noise does not
 * manufacture a difference.
 */
export const BASELINE_EQUIVALENCE_TOLERANCE = 0.02;

export interface ForecastVerdict {
  targetDate: string;
  state: ForecastPipelineState;
  /** Whether any accuracy claim may be published from this state. */
  performanceClaimAllowed: boolean;
  detail: string;
}

/**
 * Orders the checks so the EARLIEST broken link is reported.
 *
 * A pipeline with no frozen inputs has no meaningful error figure, so checking
 * the sample size first would report INSUFFICIENT_SAMPLE and hide the real
 * defect. Upstream before downstream, every time.
 */
export function evaluateForecastPipeline(observation: ForecastObservation): ForecastVerdict {
  const deny = (state: ForecastPipelineState, detail: string): ForecastVerdict => ({
    targetDate: observation.targetDate,
    state,
    performanceClaimAllowed: false,
    detail,
  });

  if (observation.predictionCreated === null) return deny("UNKNOWN", "whether a prediction was created was not measured");
  if (!observation.predictionCreated) return deny("PREDICTION_NOT_CREATED", "no prospective prediction exists for this target");
  if (observation.inputsPresent === null) return deny("UNKNOWN", "input presence was not measured");
  if (!observation.inputsPresent) return deny("INPUT_MISSING", "the model's inputs are absent for this target");
  if (observation.inputsFrozen === null) return deny("UNKNOWN", "input freezing was not measured");
  if (!observation.inputsFrozen) {
    return deny("INPUT_NOT_FROZEN", "inputs were not frozen at prediction time, so the prediction is not prospective");
  }
  if (!observation.outcomeWindowClosed) {
    return deny("OUTCOME_NOT_AVAILABLE_YET", "the target time has not passed yet; this is normal, not a fault");
  }
  if (observation.outcomeRecorded === null) return deny("UNKNOWN", "outcome recording was not measured");
  if (!observation.outcomeRecorded) return deny("OUTCOME_MISSING", "the target time has passed and no actual value was recorded");
  if (observation.outcomeMatched === null) return deny("UNKNOWN", "outcome matching was not measured");
  if (!observation.outcomeMatched) return deny("OUTCOME_MATCH_FAILED", "an outcome exists but could not be matched to its prediction key");
  if (observation.backfillOnly) {
    return deny("BACKFILL_ONLY", "every matched record was written after the fact, so none of it is prospective evidence");
  }
  if (observation.matchedHours < observation.minimumSample) {
    return deny("INSUFFICIENT_SAMPLE", `${observation.matchedHours} matched hours is below the ${observation.minimumSample} minimum`);
  }
  if (observation.modelMeanAbsoluteError === null || observation.baselineMeanAbsoluteError === null) {
    return deny("FORECAST_EVIDENCE_NOT_DISCRIMINATING", "the model was not compared against an independent baseline");
  }
  const baseline = observation.baselineMeanAbsoluteError;
  const gap = Math.abs(observation.modelMeanAbsoluteError - baseline);
  if (baseline === 0 || gap <= baseline * BASELINE_EQUIVALENCE_TOLERANCE) {
    return deny(
      "BASELINE_NOT_INDEPENDENT",
      `the model's error (${observation.modelMeanAbsoluteError}) is indistinguishable from the same-weekday baseline (${baseline}); no skill claim may be made`,
    );
  }
  return {
    targetDate: observation.targetDate,
    state: "PIPELINE_HEALTHY",
    performanceClaimAllowed: true,
    detail: `${observation.matchedHours} prospective matched hours, model error ${observation.modelMeanAbsoluteError} vs baseline ${baseline}`,
  };
}
