import { assertFeatureAvailableAtCutoff, type ForecastFeature, type ImmutablePrediction, type PredictionInput } from "./contracts";
import { sha256 } from "./hash";

export async function createImmutablePrediction(input: PredictionInput, features: ForecastFeature[]): Promise<ImmutablePrediction> {
  for (const feature of features) assertFeatureAvailableAtCutoff(feature, input.dataCutoff);
  if (input.recordOrigin !== "FORECAST") throw new Error("prediction_origin_must_be_forecast");
  if (Date.parse(input.createdAt) > Date.parse(input.targetAt)) throw new Error("prediction_created_after_target");
  if (Date.parse(input.dataCutoff) > Date.parse(input.createdAt)) throw new Error("cutoff_after_prediction_creation");
  const predictionHash = await sha256({ ...input, features });
  return Object.freeze({ ...input, predictionHash });
}

export function sameWeekdayBaseline(history: number[]): number | null {
  return history.length ? history.at(-1) ?? null : null;
}

export function fourWeekAverageBaseline(history: number[]): number | null {
  if (!history.length) return null;
  const sample = history.slice(-4);
  return sample.reduce((sum, value) => sum + value, 0) / sample.length;
}

export function seasonalNaiveBaseline(history: number[], seasonLength = 7): number | null {
  return history.length >= seasonLength ? history.at(-seasonLength) ?? null : null;
}
