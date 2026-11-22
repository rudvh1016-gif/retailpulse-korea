import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { CloudflareD1RestDatabase } from '../lib/d1-rest';
import { applySeoulCleanup, planSeoulCleanup, seoulDailyAllowance } from '../lib/retired-seoul-cleanup';

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
