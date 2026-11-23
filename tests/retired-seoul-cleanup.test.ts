import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { CloudflareD1RestDatabase } from '../lib/d1-rest';
import { applySeoulCleanup, planSeoulCleanup, seoulDailyAllowance, seoulCleanupSkipReason } from '../lib/retired-seoul-cleanup';
import { seoulCleanupSummary } from '../scripts/retired-seoul-cleanup-summary';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync('drizzle/' + file, 'utf8'));
  }
  const db = new CloudflareD1RestDatabase('test', 'isolated', 'test', async (_url, init) => {
    const { batch } = JSON.parse(String(init?.body)) as { batch: { sql: string; params: (string | number)[] }[] };
    sqlite.exec('BEGIN');
    try {
      const result = batch.map(({ sql, params }) => {
        const results = sqlite.prepare(sql).all(...params);
        const mutates = /^(INSERT|DELETE) /i.test(sql);
        const changes = mutates ? Number(sqlite.prepare('SELECT changes() AS n').get()?.n) : 0;
        return { results, success: true, meta: { changes, rows_written: changes, rows_read: results.length } };
      });
      sqlite.exec('COMMIT');
      return Response.json({ result, success: true });
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  });
  return { sqlite, db };
}

test('cleanup allowance is account-wide, leaves operating reserve, and fails closed on missing evidence', () => {
  assert.equal(seoulDailyAllowance(null), 0);
  assert.equal(seoulDailyAllowance({ rowsRead: 3_500_001, rowsWritten: 0 }), 0);
  assert.equal(seoulDailyAllowance({ rowsRead: 900_000, rowsWritten: 4_000 }), 8_000);
  assert.equal(seoulDailyAllowance({ rowsRead: 100, rowsWritten: 69_975 }), 25);
  assert.equal(seoulDailyAllowance({ rowsRead: 100, rowsWritten: 70_000 }), 0);
});

test('operator summary distinguishes logical deletes, billed writes, net bytes, and residual samples', () => {
  const summary = seoulCleanupSummary({
    utcDay: '2026-11-23', reason: 'PROCESSED',
    usage: { rowsRead: 201223, rowsWritten: 169 }, allowance: 8000,
    result: { deleted: 1581, rowsWritten: 1583 },
    before: [{ binding: 'DB', usedBytes: 475037696 }, { binding: 'A4_OVERFLOW_DB', usedBytes: 3612672 }],
    after: [{ binding: 'DB', usedBytes: 474017792 }, { binding: 'A4_OVERFLOW_DB', usedBytes: 3612672 }],
    remaining: [{ table: 'seoul_realtime_forecast', sampledRows: 1 }],
  });
  assert.match(summary, /논리 삭제.*1,581/);
  assert.match(summary, /D1 쓰기.*1,583/);
  assert.match(summary, /201,223.*169/);
  assert.match(summary, /Primary.*475,037,696.*474,017,792.*1,019,904/);
  assert.match(summary, /Overflow.*3,612,672.*3,612,672.*0/);
  assert.match(summary, /seoul_realtime_forecast.*1/);
});

test('operator summary preserves unavailable usage, storage, and post-run evidence as unknown', () => {
  const summary = seoulCleanupSummary({ utcDay: '2026-11-23', reason: 'ACCOUNT_USAGE_UNAVAILABLE', allowance: 0 });
  assert.match(summary, /계정 전체 사용량 미확인/);
  assert.match(summary, /논리 삭제.*미확인/);
  assert.match(summary, /Primary.*미확인/);
  assert.match(summary, /남은 표본.*미확인/);
});

test('operator reasons distinguish scheduling, unavailable usage and quota reserves', () => {
  const allowed = { retired: true, enabled: true, scheduled: true, usage: { rowsRead: 100, rowsWritten: 0 } };
  assert.equal(seoulCleanupSkipReason({ ...allowed, scheduled: false }), 'NOT_SCHEDULED');
  assert.equal(seoulCleanupSkipReason({ ...allowed, usage: null }), 'ACCOUNT_USAGE_UNAVAILABLE');
  assert.equal(seoulCleanupSkipReason({ ...allowed, usage: { rowsRead: 3_500_001, rowsWritten: 0 } }), 'ACCOUNT_READ_RESERVE');
  assert.equal(seoulCleanupSkipReason({ ...allowed, usage: { rowsRead: 100, rowsWritten: 70_000 } }), 'ACCOUNT_WRITE_RESERVE');
});

test('real migration schema retains shared airport data and resumes at most once per UTC day', async () => {
  const { sqlite, db } = fixture();
  const seed = sqlite.prepare("INSERT INTO seoul_context VALUES (?, ?, ?, '{}', 'h')");
  for (let i = 0; i < 40; i++) seed.run(i < 20 ? 'hongdae' : 'myeongdong', String(i), String(i));
  sqlite.exec("INSERT INTO area_data_coverage VALUES ('hongdae','0','{}'),('airport','0','{}')");
  const dryRun = await planSeoulCleanup(db, 0);
  assert.deepEqual(dryRun.inventory.map(x => x.table), ['seoul_context', 'area_data_coverage']);
  assert.equal(dryRun.plans.length, 0);

  const { plans } = await planSeoulCleanup(db, 46);
  assert.equal(plans[0]?.planned, 10);
  const first = await applySeoulCleanup(db, '2026-11-22', 'first', 'bookmark', plans, 46);
  assert.equal(first.deleted, 10);
  const appliedUsage = db.usageSnapshot().rowsWritten;
  assert.deepEqual((await planSeoulCleanup(db, 0)).inventory, [
    { table: 'seoul_context', sampledRows: 1 }, { table: 'area_data_coverage', sampledRows: 1 },
  ]);
  assert.equal(db.usageSnapshot().rowsWritten, appliedUsage);
  assert.equal((await applySeoulCleanup(db, '2026-11-22', 'duplicate', 'bookmark', plans, 46)).deleted, 0);
  assert.equal((await applySeoulCleanup(db, '2026-11-23', 'next', 'bookmark', plans, 46)).deleted, 0);

  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM seoul_context").get()?.n, 30);
  // A new day plans the remaining rowids, including only retired shared-area keys.
  const resumed = await planSeoulCleanup(db, 8000);
  await applySeoulCleanup(db, '2026-11-24', 'fresh', 'bookmark', resumed.plans, 8000);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM seoul_context").get()?.n, 0);
  assert.deepEqual(sqlite.prepare('SELECT area FROM area_data_coverage').all().map(row => row.area), ['airport']);
  sqlite.close();
});

test('a new delete trigger stops cleanup before touching any historical records', async () => {
  const { sqlite, db } = fixture();
  sqlite.exec("CREATE TRIGGER protected_seoul BEFORE DELETE ON seoul_context BEGIN SELECT RAISE(ABORT, 'protected'); END;");
  await assert.rejects(planSeoulCleanup(db, 8000), /SEOUL_SCOPE_UNVERIFIED/);
  assert.equal(db.usageSnapshot().rowsWritten, 0);
  sqlite.close();
});
