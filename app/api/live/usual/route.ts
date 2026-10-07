import { getDb } from '../../../../db';
import { CONTENT_API_ROBOTS_TAG } from '../../../../lib/crawl-policy';
import { kstDayOf } from '../../../../lib/kst';
import {
  USUAL_LATEST_SQL,
  compareWithUsual,
  holidayDates,
  holidayMonthsFor,
  usualBaselineStatements,
  usualHolidaySql,
  type UsualRow,
} from '../../../../lib/usual-comparison';

export const dynamic = 'force-dynamic';

const AREAS = ['myeongdong', 'hongdae', 'seongsu', 'itaewon'];

/**
 * Same weekday, same time, recent weeks — for the business screen only.
 * Two round trips of indexed seeks (the latest reading, then eight past
 * slots plus the holiday months): a few dozen rows, never the history.
 */
export async function GET(request: Request) {
  const area = new URL(request.url).searchParams.get('area') ?? '';
  const headers = { 'x-robots-tag': CONTENT_API_ROBOTS_TAG };
  if (!AREAS.includes(area)) return Response.json({ error: 'invalid_area' }, { status: 400, headers: { ...headers, 'cache-control': 'no-store' } });
  try {
    const db = (await getDb()).$client;
    const generatedAt = new Date().toISOString();
    const todayKst = kstDayOf(generatedAt);
    const current = await db.prepare(USUAL_LATEST_SQL).bind(area).first<UsualRow>();
    if (!current || typeof current.observedAt !== 'string') {
      return Response.json(compareWithUsual({ area, current: null, candidates: [], holidays: null, todayKst, generatedAt }), { headers: { ...headers, 'cache-control': 'public, max-age=120' } });
    }
    const baselines = usualBaselineStatements(area, current.observedAt);
    const months = holidayMonthsFor(current.observedAt);
    const results = await db.batch([
      ...baselines.map(({ sql, binds }) => db.prepare(sql).bind(...binds)),
      db.prepare(usualHolidaySql(months.length)).bind(...months),
    ]);
    const holidayRows = results[baselines.length];
    const result = compareWithUsual({
      area,
      current,
      candidates: results.slice(0, baselines.length).flatMap((result) => result.results ?? []) as UsualRow[],
      holidays: holidayDates((holidayRows.results ?? []) as Array<{ month?: unknown; payload?: unknown }>, months),
      todayKst,
      generatedAt,
    });
    return Response.json(result, { headers: { ...headers, 'cache-control': 'public, max-age=300' } });
  } catch {
    return Response.json({ error: 'usual_comparison_unavailable' }, { status: 503, headers: { ...headers, 'cache-control': 'no-store' } });
  }
}
