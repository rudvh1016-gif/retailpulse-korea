export const sourceStatuses = ["LIVE", "STALE", "MISSING", "DEGRADED", "ERROR", "OFFICIAL_HISTORICAL", "DEMO"] as const;
export type SourceStatus = typeof sourceStatuses[number];

export type RecordOrigin = "LIVE" | "OFFICIAL_HISTORICAL" | "FORECAST" | "BACKFILLED" | "DEMO";
export type QualityStatus = "VALID" | "PARTIAL" | "STALE" | "MISSING" | "INVALID";

export interface CanonicalRecord {
  sourceId: string;
  recordOrigin: RecordOrigin;
  eventAt: string;
  publishedAt: string | null;
  retrievedAt: string;
  freshness: SourceStatus;
  schemaVersion: string;
  qualityStatus: QualityStatus;
  sourceHash: string;
}

export interface ForecastFeature {
  sourceId: string;
  eventAt: string;
  availableAt: string;
  ingestionAt: string;
  value: number;
  recordOrigin: RecordOrigin;
}

export interface PredictionInput {
  predictionId: string;
  createdAt: string;
  targetAt: string;
  dataCutoff: string;
  targetId: "AREA_ACTIVITY" | "FOREIGN_PRESENCE" | "FOREIGN_SHOPPING_MOVEMENT" | "FOREIGN_RETAIL_PROXY";
  area: "myeongdong" | "hongdae" | "seongsu";
  industry?: "beauty" | "fashion" | "food" | "convenience" | "popup" | "tourism";
  value: number;
  forecastClass: "LOW" | "MODERATE" | "HIGH";
  confidence: "LOW" | "MODERATE" | "HIGH";
  modelVersion: string;
  proxyVersion: string;
  featureVersion: string;
  sourceVersions: Record<string, string>;
  inputHash: string;
  recordOrigin: "FORECAST";
}

export interface ImmutablePrediction extends PredictionInput {
  predictionHash: string;
}

export function assertIsoTimestamp(value: string, field: string): void {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(`invalid_${field}`);
}

export function assertFeatureAvailableAtCutoff(feature: ForecastFeature, cutoff: string): void {
  assertIsoTimestamp(feature.availableAt, "availableAt");
  assertIsoTimestamp(cutoff, "cutoff");
  if (Date.parse(feature.availableAt) > Date.parse(cutoff)) throw new Error("future_leakage_available_after_cutoff");
  if (feature.recordOrigin === "BACKFILLED") throw new Error("backfill_not_prospective_evidence");
}

export function assertTargetMatch(predictionTarget: string, outcomeTarget: string): void {
  if (predictionTarget !== outcomeTarget) throw new Error("target_mismatch");
}
