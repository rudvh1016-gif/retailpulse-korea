/** Public aggregate contract: never turn unavailable or malformed data into zero. */
export type PageviewsDisplay = { available: true; today: number; total: number | null; totalComplete: boolean; day: string; startedAt: string };
export function parsePageviewsDisplay(value: unknown): PageviewsDisplay | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Partial<PageviewsDisplay>;
  if (data.available !== true || !Number.isSafeInteger(data.today)
    || data.today! < 0 || typeof data.day !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(data.day) || typeof data.startedAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(data.startedAt)
    || !Number.isFinite(Date.parse(data.startedAt))) return null;
  if (data.totalComplete === true) {
    if (!Number.isSafeInteger(data.total) || data.total! < data.today!) return null;
  } else if (data.totalComplete !== false || data.total !== null) return null;
  const day = new Date(`${data.day}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== data.day) return null;
  return data as PageviewsDisplay;
}

const KST_OFFSET = 9 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
export function pageviewsKstDay(now = Date.now()): string {
  return new Date(now + KST_OFFSET).toISOString().slice(0, 10);
}
export function untilPageviewsMidnight(now = Date.now()): number {
  return DAY - ((now + KST_OFFSET) % DAY);
}
