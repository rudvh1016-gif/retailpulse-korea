export type QueueHeatLevel = 'neutral' | 'clear' | 'normal' | 'busy' | 'very-busy';
export type QueueHeatState = 'current' | 'stale' | 'missing' | 'closed' | 'unverified' | 'unavailable';
export interface QueueHeatReading {
  terminal: string;
  zone: string;
  waitTimeMinutes: number | null;
  waitTimeRaw?: string | null;
  observedAt: string;
  freshness: string;
}

/** Same 20-minute freshness limit used by /api/live/summary for A4 observations. */
const QUEUE_FRESH_MS = 20 * 60_000;

/**
 * T2 contract: <20 / 20–<40 / 40–<60 / >=60 minutes (docs/DATA_SOURCES.md).
 * Only exact minutes and the documented 60+ lower bound are categorized.
 * Waiting people never determine color. T1 uses these same minute bands as
 * KORETAIL visual criteria; they are not official T1 grades.
 */
export function queueHeat(reading: QueueHeatReading, now: number): { level: QueueHeatLevel; state: QueueHeatState; basis?: 'KORETAIL_MINUTES' } {
  const raw = reading.waitTimeRaw?.trim() ?? '';
  if (/^(?:운영\s*안\s*함|미운영|운영\s*종료|closed|not\s+operating)$/i.test(raw)) {
    return {level:'neutral', state:'closed'};
  }
  const age = now - Date.parse(reading.observedAt);
  if (!Number.isFinite(age) || age < 0 || !['LIVE','STALE'].includes(reading.freshness)) return {level:'neutral', state:'unavailable'};
  if (reading.freshness === 'STALE' || age > QUEUE_FRESH_MS) {
    return {level:'neutral', state:'stale'};
  }
  const minutes = raw === '60+' ? 60 : raw && !/^\d+$/.test(raw) ? null
    : reading.waitTimeMinutes ?? (raw ? Number(raw) : null);
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return {level:'neutral', state:'missing'};
  const level = minutes < 20 ? 'clear' : minutes < 40 ? 'normal' : minutes < 60 ? 'busy' : 'very-busy';
  if (reading.terminal === 'T1' && /^(?:DG[2-5]_[EW]|[2-5][EW])$/.test(reading.zone)) {
    return {level, state:'current', basis:'KORETAIL_MINUTES'};
  }
  if (reading.terminal !== 'T2' || !/^DG[12]_[ABCD]$/.test(reading.zone)) return {level:'neutral', state:'unverified'};
  return {level, state:'current'};
}

const labels = {
  ko: {clear:'원활', normal:'보통', busy:'혼잡', 'very-busy':'매우 혼잡', stale:'오래된 관측', missing:'대기시간 미확인', closed:'운영 안 함', unverified:'등급 기준 미확인', unavailable:'관측 확인 불가'},
  en: {clear:'Smooth', normal:'Moderate', busy:'Busy', 'very-busy':'Very busy', stale:'Past observation', missing:'Wait unavailable', closed:'Not operating', unverified:'Category unverified', unavailable:'Observation unavailable'},
  zh: {clear:'通畅', normal:'一般', busy:'拥挤', 'very-busy':'非常拥挤', stale:'较早观测', missing:'等候时间未知', closed:'未运营', unverified:'等级标准未确认', unavailable:'观测无法确认'},
  ja: {clear:'円滑', normal:'通常', busy:'混雑', 'very-busy':'非常に混雑', stale:'過去の観測', missing:'待ち時間未確認', closed:'営業外', unverified:'区分基準未確認', unavailable:'観測確認不可'},
};

export function queueHeatLabel(heat: ReturnType<typeof queueHeat>, lang: string): string {
  const copy = labels[lang as keyof typeof labels] ?? labels.en;
  if (heat.basis === 'KORETAIL_MINUTES' && heat.level !== 'neutral') {
    const band = {clear:'<20', normal:'20–<40', busy:'40–<60', 'very-busy':'60+'}[heat.level];
    return `${band}${{ko:'분 · 코리테일 색상 기준',en:' min · KORETAIL color criteria',zh:'分钟 · KORETAIL配色标准',ja:'分 · KORETAIL色分け基準'}[lang as 'ko'|'en'|'zh'|'ja'] ?? ' min · KORETAIL color criteria'}`;
  }
  return heat.level === 'neutral' ? copy[heat.state as Exclude<QueueHeatState, 'current'>] : copy[heat.level];
}
