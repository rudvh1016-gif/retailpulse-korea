import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { CloudflareD1RestDatabase } from '../lib/d1-rest';
import { applySeoulCleanup, planSeoulCleanup, seoulCleanupBudget, seoulCleanupDecision, seoulDailyAllowance } from '../lib/retired-seoul-cleanup';
import { d1StorageHeadroom } from '../lib/storage-inventory';
import { renderSeoulCleanupSummary, type SeoulCleanupSummary } from '../scripts/retired-seoul-cleanup-summary';

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

test('cleanup budget distinguishes missing account evidence from both quota thresholds', () => {
  assert.deepEqual(seoulCleanupBudget(null), { allowance: 0, reason: 'SEOUL_USAGE_UNVERIFIED' });
  assert.deepEqual(seoulCleanupBudget({ rowsRead: 1, rowsWritten: -1 }), { allowance: 0, reason: 'SEOUL_USAGE_UNVERIFIED' });
  assert.deepEqual(seoulCleanupBudget({ rowsRead: 3_500_001, rowsWritten: 0 }), { allowance: 0, reason: 'SEOUL_READ_PROTECTION' });
  assert.deepEqual(seoulCleanupBudget({ rowsRead: 3_500_000, rowsWritten: 70_000 }), { allowance: 0, reason: 'SEOUL_WRITE_PROTECTION' });
  assert.deepEqual(seoulCleanupBudget({ rowsRead: 3_500_000, rowsWritten: 69_999 }), { allowance: 1, reason: null });
});

test('runtime gates explain why a deletion was disabled even when the account has enough writes', () => {
  const usage = { rowsRead: 10, rowsWritten: 10 };
  const gates = { seoulEnabled: false, cleanupEnabled: true, scheduled: true };
  assert.deepEqual(seoulCleanupDecision(usage, { ...gates, seoulEnabled: true }), { allowance: 0, reason: 'SEOUL_PRODUCT_ENABLED' });
  assert.deepEqual(seoulCleanupDecision(usage, { ...gates, cleanupEnabled: false }), { allowance: 0, reason: 'SEOUL_CLEANUP_DISABLED' });
  assert.deepEqual(seoulCleanupDecision(usage, { ...gates, scheduled: false }), { allowance: 0, reason: 'SEOUL_UNSCHEDULED' });
  assert.deepEqual(seoulCleanupDecision(usage, gates), { allowance: 8_000, reason: null });
});

test('run summary separates actual deletion from measured storage and unverified observations', () => {
  const report = {
    utcDay: '2026-11-22', status: 'PROCESSED', reason: null,
    accountUsage: { rowsRead: 550, rowsWritten: 300 }, maximumBillableWrites: 8000, deleted: 100, rowsWritten: 245,
    storageBefore: { checkedAt: '2026-11-22T21:07:00Z', d1StorageHeadroom: [
      { binding: 'DB', ...d1StorageHeadroom(12_288) },
      { binding: 'A4_OVERFLOW_DB', ...d1StorageHeadroom(4_096) },
    ] },
    storageAfter: { checkedAt: '2026-11-22T21:07:45Z', d1StorageHeadroom: [
      { binding: 'DB', ...d1StorageHeadroom(8_192) },
      { binding: 'A4_OVERFLOW_DB', ...d1StorageHeadroom(8_192) },
    ] },
    remaining: [{ table: 'seoul_context', sampledRows: 1 }],
  } satisfies SeoulCleanupSummary;
  const output = renderSeoulCleanupSummary(report);
  assert.match(output, /100건.*245행/);
  assert.match(output, /550행.*300행/);
  assert.match(output, /\| Primary \| 12,288 \| 8,192 \| 4,096 \| 499,991,808 \|/);
  assert.match(output, /\| Overflow \| 4,096 \| 8,192 \| 0 \| 499,991,808 \|/);
  assert.match(output, /06:07:00.*06:07:45/);
  assert.match(output, /`seoul_context` 최소 1건/);
  const unknown = renderSeoulCleanupSummary({ ...report, status: 'STOPPED', reason: 'SEOUL_RESULT_UNVERIFIED',
    deleted: null, rowsWritten: null, storageAfter: null, remaining: null });
  assert.match(unknown, /STOPPED.*SEOUL_RESULT_UNVERIFIED/);
  assert.match(unknown, /\| Primary \| 12,288 \| 미확인 \| 미확인 \| 미확인 \|/);
  assert.match(unknown, /논리 삭제 미확인.*D1 쓰기 미확인/);
  assert.match(unknown, /남은 서울 기록 표본\n\n미확인/);
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
