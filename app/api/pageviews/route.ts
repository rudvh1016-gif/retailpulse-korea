import { getDb } from '../../../db';
import { PAGEVIEWS_DEPLOYMENT_ENABLED } from '../../../lib/pageviews-deployment';
import { PAGEVIEWS_ORIGIN } from '../../../lib/pageviews-contract';
import { acceptsPageviewRequest, readPageviewBody, validPageviewEvent, recordPageview, READ_TOTALS_SQL, snapshotFromTotals } from '../../../lib/pageviews-server';

export const dynamic = 'force-dynamic';
const unavailable = () => Response.json({ available: false, reason: 'unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } });
export async function POST(request: Request) {
  if (!PAGEVIEWS_DEPLOYMENT_ENABLED) return Response.json({ available: false, reason: 'disabled' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  if (!acceptsPageviewRequest(request)) return new Response(null, { status: 403, headers: { 'cache-control': 'no-store' } });
  try {
    const body = await readPageviewBody(request);
    const now = Date.now();
    if (!validPageviewEvent(body, now)) return new Response(null, { status: 400, headers: { 'cache-control': 'no-store' } });
    const db = await getDb();
    const value = await recordPageview(db.$client, body.id, now);
    return Response.json(value, { status: value.available ? 200 : 503, headers: { 'cache-control': 'no-store' } });
  } catch { return unavailable(); }
}
export async function GET(request: Request) {
  if (!PAGEVIEWS_DEPLOYMENT_ENABLED) return Response.json({ available: false, reason: 'disabled' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  if (new URL(request.url).origin !== PAGEVIEWS_ORIGIN) return unavailable();
  try {
    const db = await getDb();
    const row = await db.$client.prepare(READ_TOTALS_SQL).first<Parameters<typeof snapshotFromTotals>[0]>();
    const now = Date.now();
    const value = snapshotFromTotals(row, now);
    if (!value.available) return Response.json(value, { status: 503, headers: { 'cache-control': 'no-store' } });
    // Shared cache expires no later than KST midnight; never cache an error.
    const tomorrowKst = Date.parse(`${value.day}T00:00:00+09:00`) + 86_400_000;
    const ttl = Math.max(0, Math.min(60, Math.floor((tomorrowKst - now) / 1000)));
    return Response.json(value, { headers: { 'cache-control': `public, max-age=${ttl}, s-maxage=${ttl}` } });
  } catch { return unavailable(); }
}
