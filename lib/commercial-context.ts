type Lang = "ko" | "en" | "zh" | "ja";

/** Seoul's published ordinal activity levels, not a computed percentage above average. */
export function commercialActivityContext(level: string, lang: Lang): string | null {
  const ranks: Record<string, number> = { 한산: 1, 한산한: 1, 한가한: 1, 보통: 2, 바쁜: 3, 분주한: 4 };
  const rank = ranks[level.replace(/\s|시간대/g, "")];
  if (!rank) return null;
  const labels = {
    ko: ["소비활동 낮음", "소비활동 보통", "소비활동 활발", "소비활동 매우 활발"],
    en: ["Low activity", "Normal activity", "Busy activity", "Peak activity"],
    zh: ["消费活跃度低", "消费活跃度普通", "消费活跃", "消费非常活跃"],
    ja: ["消費活動は低め", "消費活動は通常", "消費活動は活発", "消費活動は非常に活発"],
  }[lang];
  return `${labels[rank - 1]} · ${rank}/4`;
}

/** Same-window amount/count: an average transaction range, never a historical benchmark. */
export function averagePaymentRange(min: number | null, max: number | null, count: number | null): [number, number] | null {
  if (min === null || max === null || count === null || ![min, max, count].every(Number.isFinite)
    || min < 0 || max < min || count <= 0 || !Number.isInteger(count)) return null;
  return [Math.floor(min / count), Math.ceil(max / count)];
}
