export type UsageEvidence = "OFFICIAL_USAGE" | "INTERNAL_ESTIMATE";
export type GuardrailLevel = "NORMAL" | "NOTICE" | "PROTECT" | "EMERGENCY";

export interface GuardrailDecision {
  evidence: UsageEvidence;
  percent: number;
  level: GuardrailLevel;
  allowCriticalWrites: boolean;
  allowOptionalWrites: boolean;
  allowBackfill: boolean;
}

export function evaluateQuotaUsage(used: number, limit: number, evidence: UsageEvidence): GuardrailDecision {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || used < 0 || limit <= 0) throw new Error("invalid_quota_usage");
  const percent = (used / limit) * 100;
  const level: GuardrailLevel = percent >= 95 ? "EMERGENCY" : percent >= 85 ? "PROTECT" : percent >= 70 ? "NOTICE" : "NORMAL";
  return {
    evidence,
    percent,
    level,
    allowCriticalWrites: percent < 100,
    allowOptionalWrites: percent < 85,
    allowBackfill: percent < 85,
  };
}
