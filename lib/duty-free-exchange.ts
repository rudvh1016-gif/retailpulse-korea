/** Dated manual observations only: no provider calls, collector or scheduler. */
export const dutyFreeSources = {
  shilla: 'https://www.shilladfs.com/estore/kr/ko/',
  shinsegae: 'https://www.ssgdfs.com/kr/main/initMain/',
} as const;

export type DutyFreeVendor = keyof typeof dutyFreeSources;
export type DutyFreeObservation = {
  vendor: DutyFreeVendor; serviceDateKst: string; currency: 'USD'; krwPerUnit: number;
  verifiedAt: string; sourceUrl: string; verified: boolean; scope: 'INTERNET_SHOP';
};

export function kstExchangeDate(nowMs: number): string | null {
  return Number.isFinite(nowMs) ? new Date(nowMs + 9 * 3_600_000).toISOString().slice(0, 10) : null;
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
