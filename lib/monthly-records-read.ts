import { kstDayOf, kstNowIsoOf } from './kst';
import { buildMonthlyRecords, previousRecordMonth, recordMonthDays, RECORD_SOURCE, type RecordArea, type RecordObservation } from './monthly-records';

const columns = `area, area_code AS areaCode, source_id AS sourceId, schema_version AS schemaVersion,
 quality_status AS qualityStatus, record_origin AS recordOrigin, observed_at AS observedAt,
 population_min AS populationMin, population_max AS populationMax`;

/** Existing source/area/time unique index: two boundary seeks, no history aggregation. */
export const RECORD_BOUNDS_SQL = ['ASC', 'DESC'].map(order => `SELECT * FROM (
 SELECT ${columns} FROM seoul_realtime_area
 WHERE source_id = ? AND area = ? AND observed_at <= ? AND quality_status = 'VALID' AND record_origin = 'LIVE'
 AND population_min >= 0 AND population_max >= population_min
 ORDER BY observed_at ${order} LIMIT 1)`).join(' UNION ALL ');

/** At most 31×24 index seeks per month; no extra statement per day/hour.
 * Date functions operate on the tiny requested-days CTE, never the indexed timestamp.
 * 35 or fewer bound variables; stays under D1's 100 parameters and 50-query Free limits.
 */
export function recordMonthStatement(area: RecordArea, month: string, generatedAt: string) {
  const days = recordMonthDays(month).filter(day => day < kstDayOf(generatedAt));
  if (!days.length) return { sql: `SELECT ${columns} FROM seoul_realtime_area WHERE 0`, binds: [] };
  return { sql: `WITH requested_days(day) AS (VALUES ${days.map(() => '(?)').join(',')}),
 hours(hour) AS (VALUES ${Array.from({length: 24}, (_, hour) => `(${hour})`).join(',')}),
 slots AS (SELECT day || printf('T%02d:00:00+09:00', hour) AS start_at,
 CASE WHEN hour = 23 THEN date(day, '+1 day') || 'T00:00:00+09:00' ELSE day || printf('T%02d:00:00+09:00', hour + 1) END AS end_at
 FROM requested_days CROSS JOIN hours)
 SELECT ${columns} FROM slots JOIN seoul_realtime_area ON seoul_realtime_area.rowid = (
 SELECT sample.rowid FROM seoul_realtime_area sample WHERE sample.source_id = ? AND sample.area = ?
 AND sample.observed_at >= slots.start_at AND sample.observed_at < slots.end_at
 ORDER BY sample.observed_at DESC LIMIT 1) LIMIT 744`, binds: [...days, RECORD_SOURCE, area] };
}

export interface RecordsClient {
  prepare(sql: string): { bind(...values: (string | number)[]): unknown };
  batch(statements: unknown[]): Promise<Array<{ results?: RecordObservation[] }>>;
}
export async function readMonthlyRecords(client: RecordsClient, area: RecordArea, month: string, generatedAt: string) {
  const bounds = client.prepare(RECORD_BOUNDS_SQL).bind(...[0, 1].flatMap(() => [RECORD_SOURCE, area, kstNowIsoOf(generatedAt)]));
  const statements = [month, previousRecordMonth(month)].map(value => {
    const query = recordMonthStatement(area, value, generatedAt);
    return client.prepare(query.sql).bind(...query.binds);
  });
  const result = await client.batch([bounds, ...statements]);
  if (result.length !== 3 || result.some(value => !Array.isArray(value.results))) throw new Error('records_read_incomplete');
  return buildMonthlyRecords({ area, month, generatedAt, first: result[0].results![0] ?? null, last: result[0].results!.at(-1) ?? null,
    rows: result.slice(1).flatMap(value => value.results!) });
}
