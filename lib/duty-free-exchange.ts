/** Public rate evidence and client-safe validation; provider reads live only in the collector. */
export const dutyFreeSources = {
  shilla: 'https://www.shilladfs.com/estore/kr/ko/',
  shinsegae: 'https://www.ssgdfs.com/kr/main/initMain/',
} as const;

export type DutyFreeVendor = keyof typeof dutyFreeSources;
export type DutyFreeObservation = {
  vendor: DutyFreeVendor; serviceDateKst: string; currency: 'USD'; krwPerUnit: number;
  verifiedAt: string; sourceUrl: string; verified: boolean; scope: 'INTERNET_SHOP';
};

export const DUTY_FREE_CURRENT_MAX_AGE_MS = 24 * 3_600_000;
export type DutyFreeAttemptStatus = 'SUCCESS' | 'ERROR' | 'BLOCKED' | 'RUNNING' | 'NEVER';
export type DutyFreeSourceSnapshot = {
  vendor: DutyFreeVendor; observation: DutyFreeObservation | null;
  lastAttemptAt: string | null; lastAttemptStatus: DutyFreeAttemptStatus;
  errorCode: string | null; nextAttemptAt: string | null;
};
export type DutyFreeExchangeSnapshot = {
  mode: 'duty-free-exchange'; collectionMode: 'AUTOMATED';
  generatedAt: string; todayKst: string; sources: DutyFreeSourceSnapshot[];
};

/** A last-good rate keeps its original date and verification time, including during an outage. */
export function verifiedDutyFreeObservation(input: unknown, nowMs: number): DutyFreeObservation | null {
  if (!input || typeof input !== 'object' || !Number.isFinite(nowMs)) return null;
  const row = input as DutyFreeObservation;
  if (!Object.hasOwn(dutyFreeSources, row.vendor) || row.sourceUrl !== dutyFreeSources[row.vendor]) return null;
  const at = Date.parse(row.verifiedAt);
  if (row.verified !== true || row.scope !== 'INTERNET_SHOP' || row.currency !== 'USD'
    || !Number.isFinite(row.krwPerUnit) || row.krwPerUnit <= 0 || !Number.isFinite(at) || at > nowMs
    || row.serviceDateKst !== kstExchangeDate(at)) return null;
  return row;
}

export function dutyFreePresentation(snapshot: DutyFreeExchangeSnapshot | null, nowMs: number, selectedDate?: string | null) {
  const today = kstExchangeDate(nowMs);
  if (!snapshot || !today || (selectedDate && selectedDate !== today)) return [];
  return (Object.keys(dutyFreeSources) as DutyFreeVendor[]).flatMap(vendor => {
    const source = snapshot.sources.find(row => row.vendor === vendor);
    const observation = verifiedDutyFreeObservation(source?.observation, nowMs);
    if (!source || !observation || observation.vendor !== vendor) return [];
    return [{ ...observation, current: observation.serviceDateKst === today
      && nowMs - Date.parse(observation.verifiedAt) <= DUTY_FREE_CURRENT_MAX_AGE_MS
      && source.lastAttemptStatus === 'SUCCESS', lastAttemptStatus: source.lastAttemptStatus }];
  });
}

export function kstExchangeDate(nowMs: number): string | null {
  const date=new Date(nowMs+9*3_600_000);
  return Number.isFinite(date.getTime())?date.toISOString().slice(0,10):null;
}

export function nextKstExchangeMidnight(nowMs: number): number {
  const shifted = nowMs + 9 * 3_600_000;
  return Math.floor(shifted / 86_400_000 + 1) * 86_400_000 - 9 * 3_600_000;
}

/** Only an already verified observation for today's selected KST date can be shown. */
export function currentDutyFreeExchange(records: readonly unknown[], nowMs: number, selectedDate?: string | null): DutyFreeObservation[] {
  const today = kstExchangeDate(nowMs);
  if (!today || (selectedDate && selectedDate !== today)) return [];
  const byVendor = new Map<DutyFreeVendor, DutyFreeObservation>();
  for (const input of records) {
    if (!input || typeof input !== 'object') continue;
    const row = input as DutyFreeObservation;
    if (!Object.hasOwn(dutyFreeSources, row.vendor) || row.sourceUrl !== dutyFreeSources[row.vendor]) continue;
    const at = Date.parse(row.verifiedAt);
    if (row.verified !== true || row.scope !== 'INTERNET_SHOP' || row.currency !== 'USD'
      || !Number.isFinite(row.krwPerUnit) || row.krwPerUnit <= 0
      || !Number.isFinite(at) || at > nowMs || row.serviceDateKst !== today || kstExchangeDate(at) !== today) continue;
    const previous = byVendor.get(row.vendor);
    if (!previous || at > Date.parse(previous.verifiedAt)) byVendor.set(row.vendor, row);
  }
  return (Object.keys(dutyFreeSources) as DutyFreeVendor[]).flatMap(vendor => {
    const row = byVendor.get(vendor); return row ? [row] : [];
  });
}
