import { redactSeoulUrl, redactServiceKey } from "./source-adapters";

/** Keep operational diagnostics useful without ever emitting authenticated URLs. */
export function sanitizeProductionDetail(value: unknown): string {
  const detail = typeof value === "string" ? value : String(value ?? "");
  return redactSeoulUrl(redactServiceKey(detail))
    .replace(/https?:\/\/\S+/gi, "[REDACTED_URL]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .slice(0, 500);
}
