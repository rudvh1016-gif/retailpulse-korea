import type { CloudflareD1RestDatabase } from './d1-rest';

const retiredAreas = ['myeongdong', 'hongdae', 'seongsu', 'itaewon'] as const;
const scope = [
  { table: 'seoul_context' },
  { table: 'seoul_realtime_forecast' },
  { table: 'seoul_realtime_area' },
  { table: 'seoul_realtime_commercial' },
  { table: 'seoul_commercial_months' },
  { table: 'seoul_estimated_sales' },
  { table: 'seoul_store_dynamics' },
  { table: 'seoul_foreign_presence_dong' },
  { table: 'seoul_foreign_presence_area' },
  { table: 'seoul_foreign_purpose_mobility' },
  { table: 'seoul_foreign_purpose_publications' },
  { table: 'area_data_coverage', areas: retiredAreas },
] as const;

type Db = Pick<CloudflareD1RestDatabase, 'prepare' | 'batch' | 'usageSnapshot'>;
export type SeoulCleanupUsage = { rowsRead: number; rowsWritten: number };
type Plan = { table: (typeof scope)[number]['table']; predicate: string; areas: readonly string[]; maxRowid: number; planned: number; writeBound: number };
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function seoulCleanupBudget(usage: SeoulCleanupUsage | null) {
  if (!usage || !isCount(usage.rowsRead) || !isCount(usage.rowsWritten)) {
    return { allowance: 0, reason: 'SEOUL_USAGE_UNVERIFIED' } as const;
  }
  if (usage.rowsRead > 3_500_000) return { allowance: 0, reason: 'SEOUL_READ_PROTECTION' } as const;
  if (usage.rowsWritten >= 70_000) return { allowance: 0, reason: 'SEOUL_WRITE_PROTECTION' } as const;
  // Leave at least 30,000 daily writes for collection, analytics lag and indexing.
  // The cleanup itself is capped at 8,000 billable writes, including its ledger.
  return { allowance: Math.min(8_000, 70_000 - usage.rowsWritten), reason: null };
}

export function seoulDailyAllowance(usage: SeoulCleanupUsage | null) {
  return seoulCleanupBudget(usage).allowance;
}

export function seoulCleanupDecision(usage: SeoulCleanupUsage | null, gates: {
  seoulEnabled: boolean;
  cleanupEnabled: boolean;
  scheduled: boolean;
}) {
  if (gates.seoulEnabled) return { allowance: 0, reason: 'SEOUL_PRODUCT_ENABLED' } as const;
  if (!gates.cleanupEnabled) return { allowance: 0, reason: 'SEOUL_CLEANUP_DISABLED' } as const;
  if (!gates.scheduled) return { allowance: 0, reason: 'SEOUL_UNSCHEDULED' } as const;
  return seoulCleanupBudget(usage);
}

export async function planSeoulCleanup(db: Db, allowance: number) {
  if (!isCount(allowance) || allowance > 8_000) throw Error('SEOUL_INVALID_BUDGET');
  const before = db.usageSnapshot();
  const schema = await db.prepare(
    "SELECT type, name, tbl_name AS tableName, sql FROM sqlite_master WHERE type IN ('table','trigger','index') ORDER BY name",
  ).all<{ type: string; name: string; tableName: string; sql: string | null }>();
  if (!schema.success || !isCount(schema.meta?.rows_read) || schema.meta?.rows_written !== 0) {
    throw Error('SEOUL_SCHEMA_UNVERIFIED');
  }
  const plans: Plan[] = [];
  const inventory: { table: string; sampledRows: number }[] = [];
  // Reserve extra writes for the daily claim and ledger pruning.
  let balance = Math.max(0, allowance - 16);
  for (const target of scope) {
    const table = target.table;
    const definition = schema.results.find(row => row.type === 'table' && row.name === table);
    if (!definition?.sql || /WITHOUT\s+ROWID/i.test(definition.sql)
      || schema.results.some(row => row.type === 'trigger' && row.tableName === table)
      || schema.results.some(row => row.type === 'table' && row.sql?.toLowerCase().includes('references')
        && new RegExp('\\b' + table + '\\b', 'i').test(row.sql.slice(row.sql.toLowerCase().indexOf('references'))))) {
      throw Error('SEOUL_SCOPE_UNVERIFIED');
    }
    const areas = 'areas' in target ? target.areas : [];
    const predicate = areas.length ? `area IN (${areas.map(() => '?').join(',')})` : '1';
    // D1 charges index entries as writes. Count primary/autoindexes too, then
    // add slack per record. Never rely on the logical SQLite change count.
    const perRow = 2 + schema.results.filter(row => row.type === 'index' && row.tableName === table).length;
    const limit = allowance === 0 ? 1 : Math.min(1500, Math.max(1, Math.floor(balance / perRow)));
    const selected = await db.prepare(`SELECT COUNT(*) AS planned, MAX(id) AS maxRowid FROM (
      SELECT rowid AS id FROM "${table}" WHERE ${predicate} ORDER BY rowid LIMIT ?
    )`).bind(...areas, limit).all<{ planned: number; maxRowid: number | null }>();
    const row = selected.results[0];
    if (!selected.success || !isCount(selected.meta?.rows_read) || selected.meta?.rows_written !== 0
      || !row || !isCount(row.planned) || row.planned > limit
      || (row.planned > 0 && !Number.isSafeInteger(row.maxRowid))) throw Error('SEOUL_INVENTORY_UNVERIFIED');
    const writeBound = row.planned * perRow;
    if (row.planned > 0) inventory.push({ table, sampledRows: row.planned });
    if (row.planned > 0 && writeBound <= balance) {
      plans.push({ table, predicate, areas, maxRowid: row.maxRowid!, planned: row.planned, writeBound });
      balance -= writeBound;
    }
  }
  const measured = db.usageSnapshot();
  if (measured.unmeasuredStatements !== before.unmeasuredStatements
    || measured.rowsWritten !== before.rowsWritten || measured.rowsRead - before.rowsRead > 50_000) {
    throw Error('SEOUL_INVENTORY_BUDGET');
  }
  return { plans, inventory };
}

export async function applySeoulCleanup(db: Db, utcDay: string, runId: string, bookmark: string, plans: readonly Plan[], allowance: number) {
  if (!plans.length) return { deleted: 0, rowsWritten: 0, status: 'COMPLETE' };
  const bound = plans.reduce((total, plan) => total + plan.writeBound, 16);
  if (!isCount(allowance) || allowance > 8_000 || bound > allowance) throw Error('SEOUL_WRITE_BUDGET');
  const statements = [
    db.prepare(`INSERT OR IGNORE INTO retired_seoul_cleanup_days (day, run_id, recovery_bookmark) VALUES (?, ?, ?)`)
      .bind(utcDay, runId, bookmark),
    ...plans.map(({ table, predicate, areas, maxRowid, planned }) =>
      db.prepare(`DELETE FROM "${table}" WHERE rowid IN (
        SELECT rowid FROM "${table}" WHERE ${predicate} AND rowid <= ? ORDER BY rowid LIMIT ?
      ) AND EXISTS (SELECT 1 FROM retired_seoul_cleanup_days WHERE day = ? AND run_id = ?)`)
        .bind(...areas, maxRowid, planned, utcDay, runId)),
    db.prepare("DELETE FROM retired_seoul_cleanup_days WHERE day < date(?, '-14 days') AND day = (SELECT MIN(day) FROM retired_seoul_cleanup_days) AND EXISTS (SELECT 1 FROM retired_seoul_cleanup_days WHERE day = ? AND run_id = ?)").bind(utcDay, utcDay, runId),
  ];
  const results = await db.batch(statements);
  const recorded = results[0]?.meta?.changes;
  if (results.length !== statements.length || (recorded !== 0 && recorded !== 1)
    || !results.every(result => result.success && isCount(result.meta?.rows_written) && isCount(result.meta?.changes))) {
    throw Error('SEOUL_RESULT_UNVERIFIED');
  }
  const rowsWritten = results.reduce((sum, result) => sum + result.meta!.rows_written!, 0);
  const deleted = results.slice(1, -1).reduce((sum, result) => sum + result.meta!.changes!, 0);
  if (rowsWritten > bound || (recorded === 0 && deleted !== 0)) throw Error('SEOUL_WRITE_BOUND_EXCEEDED');
  return { deleted, rowsWritten, status: recorded ? 'PROCESSED' : 'ALREADY_PROCESSED' };
}
