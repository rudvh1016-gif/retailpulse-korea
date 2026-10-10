export type RateLang = 'ko' | 'en' | 'zh' | 'ja';
/** Owner format: keep signed calculations, replace only the displayed decrease sign. */
export function formatChangeRate(value: number | null, unit: '%' | '%p' = '%'): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value === 0) return `0${unit}`;
  const magnitude = Math.abs(value);
  if (magnitude < 0.05) return value > 0 ? `<+0.1${unit}` : `△<0.1${unit}`;
  return `${value > 0 ? '+' : '△'}${magnitude.toFixed(1)}${unit}`;
}

/** The hollow triangle means decrease, even though the glyph points upward. */
export function spokenRateText(text: string, lang: RateLang): string {
  const labels = {
    ko: {up:'증가',down:'감소 · 역신장',less:'미만',point:'퍼센트포인트'},
    en: {up:'increase',down:'decrease',less:'less than',point:'percentage points'},
    zh: {up:'增长',down:'下降',less:'小于',point:'个百分点'},
    ja: {up:'増加',down:'減少',less:'未満',point:'パーセントポイント'},
  }[lang];
  return text.replace(/(△<|△|<\+|\+)(\d+(?:\.\d+)?)(%p|%)/g, (_match, sign:string, number:string, unit:string) =>
    `${sign.includes('△') ? labels.down : labels.up} ${sign.includes('<') ? labels.less+' ' : ''}${number}${unit==='%p' ? ' '+labels.point : '%'}`);
}
