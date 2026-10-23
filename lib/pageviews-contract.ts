/** Aggregate views, not people. No visitor identity or historical seed. */
export type PageviewsSnapshot = {
  available: true;
  today: number;
  total: number | null;
  totalComplete: boolean;
  day: string;
  startedAt: string;
} | { available: false; reason: 'unavailable' | 'incomplete' | 'disabled' };

export const PAGEVIEWS_ORIGIN = 'https://koretaildata.com';
const PUBLIC_PAGE = /^\/(?:ko|en|zh|ja)(?:\/(?:myeongdong|hongdae|seongsu|itaewon|airport-glance|airport|airport-countries|airport-prepare|forecast|where-to|consumption|business|about|more|airport-news|travel-records|tourism-desk(?:\/(?:myeongdong|hongdae|seongsu|itaewon))?))?\/?$/;
export function pageviewPath(path: string): string | null {
  return path === '/' ? '/' : PUBLIC_PAGE.test(path) ? path.replace(/\/$/, '') : null;
}
export function validPageviewsSnapshot(value: unknown): value is PageviewsSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.available === false) return ['unavailable', 'incomplete', 'disabled'].includes(String(v.reason));
  return v.available === true && Number.isSafeInteger(v.today)
    && Number(v.today) >= 0
    && ((v.totalComplete === true && Number.isSafeInteger(v.total) && Number(v.total) >= Number(v.today)) || (v.totalComplete === false && v.total === null))
    && typeof v.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.day)
    && typeof v.startedAt === 'string' && Number.isFinite(Date.parse(v.startedAt));
}
