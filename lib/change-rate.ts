export type RateLang = 'ko' | 'en' | 'zh' | 'ja';
/** Owner display convention only. Underlying signed calculations are unchanged. */
export function formatChangeRate(value: number | null, unit: '%' | '%p' = '%'): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value === 0) return `0${unit}`;
  const magnitude = Math.abs(value);
  return `${value > 0 ? '▲ +' : '▽ −'}${magnitude < 0.05 ? '<0.1' : magnitude.toFixed(1)}${unit}`;
}
export function spokenRateText(text: string, lang: RateLang): string {
  const labels = {
    ko: {up:'증가',down:'감소 · 역신장',less:'미만',point:'퍼센트포인트'},
    en: {up:'increase',down:'decrease',less:'less than',point:'percentage points'},
    zh: {up:'增长',down:'下降',less:'小于',point:'个百分点'},
    ja: {up:'増加',down:'減少',less:'未満',point:'パーセントポイント'},
  }[lang];
  return text.replace(/(▲ \+|▽ −|△<|△|<\+|\+)(<)?(\d+(?:\.\d+)?)(%p|%)?/g, (_match, sign:string, less:string|undefined, number:string, unit:string|undefined) =>
    `${sign.includes('▽') || sign.includes('△') ? labels.down : labels.up} ${less || sign.includes('<') ? labels.less+' ' : ''}${number}${unit==='%p' ? ' '+labels.point : unit==='%' ? '%' : ''}`);
}
