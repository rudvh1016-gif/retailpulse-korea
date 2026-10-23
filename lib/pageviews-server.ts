import { PAGEVIEWS_ORIGIN, pageviewPath, type PageviewsSnapshot } from './pageviews-contract';
import { kstDayOf } from './kst';

export const RECEIPT_TTL_MS = 10 * 60_000;
export const EVENT_MAX_AGE_MS = 2 * 60_000;
export const READ_TOTALS_SQL = 'SELECT enabled, incomplete, partial_day, day, today, total, started_at FROM pageview_totals WHERE id = 1';
export const PRUNE_RECEIPTS_SQL = `DELETE FROM pageview_receipts WHERE event_id IN (
  SELECT event_id FROM pageview_receipts WHERE received_at < ? ORDER BY received_at LIMIT 8
)`;
/** Global durable request admission, including duplicate attempts. Once the
 * budget is exceeded, rejected requests execute this indexed statement only:
 * no receipt cleanup, insertion, trigger or additional aggregate query.
 * This bounds D1 work, NOT Worker request quota or DDoS availability.
 */
export const ADMIT_PAGEVIEW_SQL = `UPDATE pageview_totals SET
  incomplete = CASE WHEN admission_limit = 0 OR (admission_day >= ?1 AND admission_count >= admission_limit) THEN 1 ELSE incomplete END,
  partial_day = CASE WHEN admission_limit = 0 OR (admission_day >= ?1 AND admission_count >= admission_limit) THEN MAX(partial_day, ?2) ELSE partial_day END,
  admission_count = CASE WHEN admission_day < ?1 THEN 1 ELSE admission_count + 1 END,
  admission_day = MAX(admission_day, ?1)
  WHERE id = 1 AND enabled = 1 AND partial_day < ?2
  RETURNING (partial_day >= ?2) AS blocked`;
export const INSERT_RECEIPT_SQL = 'INSERT OR IGNORE INTO pageview_receipts(event_id, received_at) VALUES (?, ?)';
interface Totals { enabled: number; incomplete: number; partial_day: string; day: string; today: number; total: number; started_at: number | null }
export function snapshotFromTotals(row: Totals | null, now: number): PageviewsSnapshot {
  if (!row) return { available: false, reason: 'unavailable' };
  if (!row.enabled) return { available: false, reason: 'disabled' };
  if (row.started_at === null) return { available: false, reason: 'unavailable' };
  const day = kstDayOf(new Date(now).toISOString());
  if (row.partial_day >= day) return { available: false, reason: 'incomplete' };
  return { available: true, today: row.day === day ? row.today : 0, total: row.incomplete ? null : row.total, totalComplete: row.incomplete === 0, day, startedAt: new Date(row.started_at).toISOString() };
}
export function acceptsPageviewRequest(request: Request): boolean {
  const url = new URL(request.url);
  const ua = request.headers.get('user-agent') ?? '';
  return url.origin === PAGEVIEWS_ORIGIN && request.headers.get('origin') === PAGEVIEWS_ORIGIN
    && request.headers.get('sec-fetch-site') === 'same-origin'
    && request.headers.get('content-type')?.split(';')[0].trim() === 'application/json'
    && request.headers.get('x-koretail-pageview') === '1'
    && request.headers.get('dnt') !== '1' && request.headers.get('sec-gpc') !== '1'
    && ua.length > 0 && ua.length < 1024 && !/bot|crawler|spider|headless|playwright|puppeteer|curl|wget/i.test(ua)
    && Number(request.headers.get('content-length') ?? 0) <= 512;
}
export function validPageviewEvent(body: unknown, now: number): body is { id: string; path: string } {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  if (Object.keys(b).sort().join(',') !== 'id,path' || typeof b.id !== 'string' || typeof b.path !== 'string') return false;
  const match = /^(\d{13})\.([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(b.id);
  return !!match && Number(match[1]) <= now + EVENT_MAX_AGE_MS && now - Number(match[1]) <= EVENT_MAX_AGE_MS && pageviewPath(b.path) !== null;
}
/** Bounded body read even when a client omits Content-Length. */
export async function readPageviewBody(request: Request): Promise<unknown> {
  if (!request.body) throw new Error('invalid_body');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 512) { await reader.cancel(); throw new Error('body_too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function recordPageview(db: D1Database, id: string, now: number): Promise<PageviewsSnapshot> {
  const utcDay = new Date(now).toISOString().slice(0, 10);
  const kstDay = kstDayOf(new Date(now).toISOString());
  // Reservation is never refunded after a crash, duplicate, or failed batch.
  const admission = await db.prepare(ADMIT_PAGEVIEW_SQL).bind(utcDay, kstDay).first<{ blocked: number }>();
  if (!admission) return { available: false, reason: 'unavailable' };
  if (admission.blocked) return { available: false, reason: 'incomplete' };
  // D1 batch is transactional; trigger ties receipt insertion to atomic count.
  const result = await db.batch<Totals>([
    db.prepare(PRUNE_RECEIPTS_SQL).bind(now - RECEIPT_TTL_MS),
    db.prepare(INSERT_RECEIPT_SQL).bind(id, now),
    db.prepare(READ_TOTALS_SQL),
  ]);
  if (result.some(r => !r.success)) throw new Error('pageviews_unavailable');
  return snapshotFromTotals(result[2]?.results?.[0] ?? null, Date.now());
}
