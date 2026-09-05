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
