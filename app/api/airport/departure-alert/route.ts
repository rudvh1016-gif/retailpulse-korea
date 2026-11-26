import { getDb } from '../../../../db';
import { getPublicA4ShardReader, mergePublicA4Terminal, type A4Terminal } from '../../../../lib/a4-overflow-public-read';
import { projectDepartureCongestion } from '../../../../lib/airport-congestion-observation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const terminal = params.get('terminal');
  if ((terminal !== 'T1' && terminal !== 'T2') || params.getAll('terminal').length !== 1 || params.size !== 1) {
    return Response.json({ status: 'INVALID_TERMINAL' }, { status: 400, headers: {'cache-control':'no-store'} });
  }
  try {
    const { env } = await import('cloudflare:workers');
    if (env.ACCOUNTS_ENABLED !== 'true') {
      return Response.json({ status: 'UNAVAILABLE' }, { status: 404, headers: {'cache-control':'no-store'} });
    }
    const client = (await getDb()).$client;
    const read = await getPublicA4ShardReader(client);
    const congestion = await readDepartureAlertRows(client, terminal, read, Date.now());
    if (congestion) {
      return Response.json({ mode: 'departure-alert', dayRelation: 'TODAY', airport: { congestion } },
        { headers: { 'cache-control': 'public, max-age=60' } });
    }
  } catch { /* Missing or failed public evidence must never trigger an alert. */ }
  return Response.json({ status: 'UNAVAILABLE' }, { status: 503, headers: {'cache-control':'no-store'} });
}

type DepartureReader = Awaited<ReturnType<typeof getPublicA4ShardReader>>;
export async function readDepartureAlertRows(client: D1Database, terminal: A4Terminal, read: DepartureReader, now: number) {
  const sourceId = terminal === 'T1' ? 'INCHEON_DEPARTURE_CONGESTION' : 'INCHEON_DEPARTURE_CONGESTION_T2';
  const replies = await client.batch<Record<string,unknown>>([
    client.prepare(`SELECT terminal, zone, wait_time_minutes AS waitTimeMinutes, wait_time_raw AS waitTimeRaw,
      observed_at AS observedAt, retrieved_at AS retrievedAt FROM airport_congestion
      WHERE terminal=? AND observed_at=(SELECT MAX(observed_at) FROM airport_congestion WHERE terminal=?)
      AND record_origin='LIVE' AND quality_status='VALID' ORDER BY zone LIMIT 12`).bind(terminal, terminal),
    client.prepare(`SELECT source_id AS sourceId, status, last_event_at AS eventAt, last_retrieved_at AS retrievedAt
      FROM source_health WHERE source_id=?`).bind(sourceId),
  ]);
  if (replies.length !== 2 || !replies.every(item => item.success)) return null;
  const [observations, sources] = replies;
  const health = sources.results?.[0];
  if (!health || health.status !== 'LIVE') return null;
  const selected = await mergePublicA4Terminal(terminal, observations.results ?? [], read, now, 12);
  if (selected.degraded || !selected.rows.length) return null;
  const instant = (value: unknown) => typeof value === 'string' ? Date.parse(value) : NaN;
  const event = instant(health.eventAt), retrieved = instant(health.retrievedAt);
  if (!(event <= retrieved && retrieved <= now) || selected.rows.some(row =>
    instant(row.observedAt) !== event || instant(row.retrievedAt) !== retrieved)) return null;
  const projected = projectDepartureCongestion(selected.rows, [health], now);
  return projected.every(row => row.collectionStatus === 'LIVE') ? projected : null;
}
