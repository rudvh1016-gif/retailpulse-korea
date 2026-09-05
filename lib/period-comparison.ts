export interface RangeChange {
  baselineAt: string;
  minPercent: number;
  maxPercent: number;
}

/** Preserve the uncertainty of published ranges: never compare invented midpoints. */
export function rangeChange(currentMin: unknown, currentMax: unknown, baselineMin: unknown, baselineMax: unknown, baselineAt: string): RangeChange | null {
  const values = [currentMin, currentMax, baselineMin, baselineMax];
  if (!values.every((x) => typeof x === "number" && Number.isFinite(x))) return null;
  const [a, b, c, d] = values as number[];
  if (a < 0 || a > b || c <= 0 || c > d) return null;
  return { baselineAt, minPercent: (a / d - 1) * 100, maxPercent: (b / c - 1) * 100 };
}

export function comparisonText(change: RangeChange, lang: "ko" | "en" | "zh" | "ja", days: 7 | 28): string {
  const labels = days === 7
    ? { ko: "전주 동요일", en: "Same weekday last week", zh: "上周同星期", ja: "先週同曜日" }
    : { ko: "4주 전 동요일", en: "Same weekday 4 weeks ago", zh: "4周前同星期", ja: "4週前同曜日" };
  const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
  const value = Math.abs(change.minPercent - change.maxPercent) < 0.00001
    ? signed(change.minPercent) : `${signed(change.minPercent)} ~ ${signed(change.maxPercent)}`;
  return `${labels[lang]} ${value} (${change.baselineAt.replace("T", " ").replace("+09:00", " KST")})`;
}

/** Two exact-time index seeks per area; no history scan or extra D1 round trip. */
export function withAreaBaselines(sql: string, table: "seoul_realtime_area" | "seoul_realtime_commercial", min: string, max: string): string {
  return `SELECT current.*, ${[7, 28].map((days) => `(SELECT json_object('min', h.${min}, 'max', h.${max}, 'observedAt', h.observed_at)
    FROM ${table} h WHERE h.area = current.area
      AND h.observed_at = strftime('%Y-%m-%dT%H:%M:%S', substr(current.observedAt, 1, 19), '-${days} days') || '+09:00'
      AND h.quality_status = 'VALID' AND current.qualityStatus = 'VALID'
      AND h.source_id = current.sourceId AND h.schema_version = current.schemaVersion LIMIT 1) AS baseline${days}`).join(", ")}
    FROM (${sql}) current`;
}

