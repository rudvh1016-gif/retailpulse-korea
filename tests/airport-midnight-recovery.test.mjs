import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { SqliteD1 } from './helpers/operational-sqlite.mjs';
import { OperationalMemory } from '../lib/operational-memory.ts';
import { resolveCentralRecoveryActivation } from '../lib/central-recovery-gate.ts';
import {
  A1_MIDNIGHT_RECOVERY_REVIEWED, A1_RECOVERY_WORKFLOW_ID, A1_SOURCE,
  airportMidnightRecoveryActivation, executeAirportMidnightRecovery, planAirportMidnightRecovery,
  dispatchAirportMidnightRecovery, readAirportRunSnapshot, saveAirportDispatchReceipt, readAirportDispatchReceipt,
} from '../lib/airport-midnight-recovery.ts';
import { airportMidnightSourceBlocked } from '../lib/airport-recovery-protection.ts';
import { airportRequestBudgetAvailable, reserveAirportRequestBudget } from '../lib/airport-request-budget.ts';
import { runSelectedProductionSources } from '../lib/production-runner.ts';

const NOW = '2026-10-10T16:22:00Z', DAY = '2026-10-11';
const MISSING = { today: DAY, state: 'MISSING_TODAY', pastGrace: true, alert: true, retrievedAt: '2026-10-10T00:42:39Z' };
const CURRENT = { ...MISSING, state: 'CURRENT', alert: false, retrievedAt: NOW };
const OPEN_GATE = resolveCentralRecoveryActivation({ compiledEnabled: true, ownerApproved: true, runtimeEnabled: true,
  nowIso: NOW, trialEndExclusiveIso: '2026-09-27T00:00:00+09:00' });
const RUN = { id: 123, workflow_id: A1_RECOVERY_WORKFLOW_ID, event: 'workflow_dispatch', head_branch: 'main',
  created_at: NOW, status: 'in_progress', conclusion: null };

function setup(overrides = {}) {
  const db = new SqliteD1(), memory = new OperationalMemory(db), counter = { posts: 0 };
  const deps = {
    memory, nowIso: NOW, witnessRunId: 'witness-1', dispatchPermissionGranted: true,
    readCoverage: async () => MISSING,
    readSnapshot: async () => ({ complete: true, early: [], active: [] }),
    sourceBlocked: async () => false, budgetAvailable: async () => true,
    dispatch: async () => { counter.posts++; return { accepted: true, runId: RUN.id, status: 200 }; },
    readRun: async () => RUN,
    saveReceipt: (request, attemptId, runId) => saveAirportDispatchReceipt(memory, request, attemptId, runId),
    readReceipt: attempt => readAirportDispatchReceipt(db, attempt),
    verifyPublicToday: async () => true,
    ...overrides,
  };
  return { db, memory, counter, deps };
}
const execute = deps => executeAirportMidnightRecovery(deps, { activation: OPEN_GATE });

test('owner-reviewed A1 conditions do not authorise the legacy HTTP transport', async () => {
  assert.equal(A1_MIDNIGHT_RECOVERY_REVIEWED, true);
  const gate = airportMidnightRecoveryActivation(NOW, { RPK_CENTRAL_RECOVERY_OWNER_APPROVED: 'true', RPK_CENTRAL_RECOVERY_RUNTIME_ENABLED: 'true' });
  assert.equal(gate.allowed, true);
  assert.equal(airportMidnightRecoveryActivation(NOW, {}).allowed, false);
  const { db, deps, counter } = setup();
  assert.equal((await executeAirportMidnightRecovery(deps)).state, 'HTTP_DISPATCH_NOT_AUTHORIZED');
  assert.equal(counter.posts, 0); assert.equal(db.calls.length, 0);
});

test('missing dispatch permission stops before admission even in a hypothetical approved gate', async () => {
  const { db, deps } = setup({ dispatchPermissionGranted: false });
  assert.equal((await execute(deps)).state, 'DISPATCH_PERMISSION_REQUIRED');
  assert.equal(db.calls.length, 0);
});

test('eligibility preserves grace, date, active originals, prior failed attempts and unknown reads', () => {
  const good = { complete: true, early: [], active: [] };
  for (const [now, coverage, snapshot, blocked, reason] of [
    ['2026-10-10T16:14:59Z', MISSING, good, false, 'OUTSIDE_FALLBACK_WINDOW'],
    ['2026-10-10T18:00:00Z', MISSING, good, false, 'OUTSIDE_FALLBACK_WINDOW'],
    [NOW, { ...MISSING, today: '2026-10-10' }, good, false, 'COVERAGE_DATE_MISMATCH'],
    [NOW, CURRENT, good, false, 'ALREADY_CURRENT'],
    [NOW, MISSING, { ...good, complete: false }, false, 'WORKFLOW_READ_UNVERIFIED'],
    [NOW, MISSING, { ...good, active: [{ ...RUN, created_at: '2026-10-09T00:00:00Z' }] }, false, 'ORIGINAL_RUN_ACTIVE'],
    [NOW, MISSING, { ...good, early: [{ ...RUN, status: 'completed', conclusion: 'failure' }] }, false, 'EARLY_RUN_ALREADY_STARTED'],
    [NOW, MISSING, good, true, 'SOURCE_BLOCKED'],
  ]) assert.equal(planAirportMidnightRecovery(now, coverage, snapshot, blocked).reason, reason);
  assert.equal(planAirportMidnightRecovery(NOW, MISSING, good, false).eligible, true);
});

test('simultaneous witnesses admit exactly one post; receipt never marks recovery successful', async () => {
  const { db, deps, counter, memory } = setup();
  const other = { ...deps, memory: new OperationalMemory(db), witnessRunId: 'witness-2' };
  const results = await Promise.all([execute(deps), execute(other)]);
  assert.equal(counter.posts, 1);
  assert.equal(results.filter(result => result.state === 'RECOVERY_PENDING').length, 1);
  const attempts = await memory.attempts(A1_SOURCE, DAY);
  assert.equal(attempts.length, 1); assert.equal(attempts[0].completedAt, null); assert.equal(attempts[0].verified, false);
  await execute({ ...deps, witnessRunId: 'restart-3' });
  assert.equal(counter.posts, 1);
});

test('native arrival before dispatch consumes today without an indefinite lock on tomorrow', async () => {
  let reads = 0;
  const { deps, counter, memory } = setup({ readSnapshot: async () => ({ complete: true, early: [], active: ++reads === 1 ? [] : [RUN] }) });
  assert.equal((await execute(deps)).state, 'ABORTED_BEFORE_DISPATCH');
  assert.equal(counter.posts, 0);
  assert.equal((await memory.inFlightControlled()).length, 0);
  assert.equal((await execute(deps)).state, 'DAILY_ATTEMPT_ALREADY_SPENT');
  assert.equal((await memory.attempts(A1_SOURCE, DAY)).length, 1);
  const nextDay = await execute({ ...deps, nowIso: '2026-10-11T16:22:00Z', witnessRunId: 'next-day-witness',
    readCoverage: async () => ({ ...MISSING, today: '2026-10-12' }),
    readSnapshot: async () => ({ complete: true, early: [], active: [] }) });
  assert.equal(nextDay.state, 'RECOVERY_PENDING'); assert.equal(counter.posts, 1);
  assert.equal((await memory.attempts(A1_SOURCE, '2026-10-12')).length, 1);
});

test('new current data, changed source health or exhausted budget before post costs zero calls', async () => {
  for (const mode of ['coverage', 'source', 'budget']) {
    let reads = 0;
    const overrides = mode === 'coverage' ? { readCoverage: async () => ++reads === 1 ? MISSING : CURRENT }
      : mode === 'source' ? { sourceBlocked: async () => ++reads > 1 }
      : { budgetAvailable: async () => ++reads === 1 };
    const { deps, counter } = setup(overrides);
    assert.equal((await execute(deps)).state, 'ABORTED_BEFORE_DISPATCH');
    assert.equal(counter.posts, 0);
  }
});

for (const [name, receipt] of [
  ['HTTP403', { accepted: false, status: 403, runId: null }],
  ['HTTP429', { accepted: false, status: 429, runId: null }],
  ['HTTP500', { accepted: false, status: 500, runId: null }],
  ['uncorrelated204', { accepted: true, status: 204, runId: null }],
  ['network timeout', null],
]) test(`${name} holds the daily lock and never posts again`, async () => {
  let posts = 0;
  const { deps, memory } = setup({ dispatch: async () => { posts++; if (!receipt) throw new Error('timeout'); return receipt; } });
  const first = await execute(deps);
  assert.match(first.state, /HUMAN_REVIEW/); assert.equal(first.dispatches, 1);
  await execute({ ...deps, witnessRunId: 'restart' });
  assert.equal(posts, 1); assert.equal((await memory.inFlightControlled()).length, 1);
});

test('receipt persistence failure is reported as a sent post and cannot reopen admission', async () => {
  const { deps, counter } = setup({ saveReceipt: async () => { throw new Error('DB unavailable'); } });
  const result = await execute(deps);
  assert.equal(result.state, 'HUMAN_REVIEW_RECEIPT_WRITE_FAILED'); assert.equal(result.dispatches, 1);
  await execute(deps); assert.equal(counter.posts, 1);
});

for (const publicValid of [true, false, null]) test(`correlated completed run requires stored AND public evidence (${publicValid})`, async () => {
  const { deps, counter, memory } = setup();
  await execute(deps);
  const result = await execute({ ...deps, readCoverage: async () => CURRENT,
    readRun: async () => ({ ...RUN, status: 'completed', conclusion: 'success' }), verifyPublicToday: async () => publicValid });
  assert.equal(result.state, publicValid === true ? 'RECOVERED' : 'HUMAN_REVIEW_RECOVERY_UNVERIFIED');
  assert.equal((await memory.attempts(A1_SOURCE, DAY))[0].verified, publicValid === true);
  await execute(deps); assert.equal(counter.posts, 1);
});

test('unrelated run identity cannot complete the lock', async () => {
  const { deps, memory } = setup(); await execute(deps);
  assert.equal((await execute({ ...deps, readRun: async () => ({ ...RUN, id: 999, status: 'completed', conclusion: 'success' }) })).state, 'HUMAN_REVIEW_RUN_MISMATCH');
  assert.equal((await memory.inFlightControlled()).length, 1);
});

test('provider protection blocks 429/auth/schema/unknown health and admits known last-good only', async () => {
  const { db } = setup();
  assert.equal(await airportMidnightSourceBlocked(db), true);
  for (const [status, detail, expected] of [['SUCCESS', 'normal', false], ['STALE', 'NOT_YET_PUBLISHED', false],
    ['STALE', 'httpStatus=429', true], ['ERROR', 'NETWORK', true], ['SUCCESS', 'AUTH 403', true], ['STALE', 'SCHEMA', true]]) {
    db.raw.prepare("INSERT INTO source_health(source_id,status,detail,schema_version) VALUES(?,?,?,'airport-v1') ON CONFLICT(source_id) DO UPDATE SET status=excluded.status,detail=excluded.detail").run(A1_SOURCE, status, detail);
    assert.equal(await airportMidnightSourceBlocked(db), expected);
  }
});

test('budget preflight shares atomic math and does not write; 376/499/500 used cannot admit 125', async () => {
  for (const used of [375, 376, 499, 500]) {
    const { db } = setup();
    db.raw.prepare('INSERT INTO collector_runs(run_id,source_id,started_at,status,records_read) VALUES(?,?,?,?,?)')
      .run('used', 'INCHEON_FLIGHT_REQUEST_BUDGET', NOW, 'RESERVED', used);
    assert.equal(await airportRequestBudgetAvailable(db, NOW), used === 375);
    assert.ok(db.calls.every(sql => sql.trim().startsWith('SELECT')));
    assert.equal(await reserveAirportRequestBudget(db, NOW, 125), used === 375);
  }
});

test('queued fallback rechecks target date, source 429 and a newly complete native scan', async () => {
  const { db } = setup();
  const env = { DB: db, DATA_GO_KR_SERVICE_KEY: 'fixture-key', A1_EXPECTED_TARGET_DATE: DAY };
  const original = globalThis.fetch;
  let requests = 0; globalThis.fetch = async () => { requests++; throw new Error('unexpected provider'); };
  try {
    assert.equal((await runSelectedProductionSources({ ...env, A1_EXPECTED_TARGET_DATE: '2026-10-10' }, ['airport_recent'], new Date(NOW)))[0].status, 'SKIPPED_RECOVERY_DATE_MISMATCH');
    db.raw.prepare("INSERT INTO source_health(source_id,status,detail,schema_version) VALUES(?,?,?,'airport-v1')").run(A1_SOURCE, 'ERROR', 'httpStatus=429');
    assert.equal((await runSelectedProductionSources(env, ['airport_recent'], new Date(NOW)))[0].status, 'SKIPPED_RECOVERY_SOURCE_PROTECTED');
    db.raw.prepare('INSERT INTO collector_runs(run_id,source_id,started_at,status,detail) VALUES(?,?,?,?,?)')
      .run('native-complete', A1_SOURCE, NOW, 'SUCCESS', `recent 2026-10-08..${DAY}; requests 120;`);
    assert.equal((await runSelectedProductionSources(env, ['airport_recent'], new Date(NOW)))[0].status, 'SKIPPED_ALREADY_COMPLETE_TODAY');
    assert.equal(requests, 0);
  } finally { globalThis.fetch = original; }
});

test('dispatcher uses exact workflow/default branch/date and a single request on 429', async () => {
  for (const status of [200, 204, 429]) {
    let calls = 0;
    const result = await dispatchAirportMidnightRecovery('fixture-token', DAY, async (url, init) => {
      calls++; assert.match(url, /\/collect-airport-recovery.yml\/dispatches$/);
      assert.deepEqual(JSON.parse(init.body), { ref: 'main', inputs: { a1_midnight_recovery: true, a1_recovery_target_date: DAY } });
      assert.equal(init.redirect, 'error');
      return new Response(status === 204 ? null : JSON.stringify({ workflow_run_id: 123 }), { status });
    });
    assert.equal(calls, 1); assert.equal(result.accepted, status !== 429); assert.equal(result.runId, status === 200 ? 123 : null);
  }
});

test('snapshot detects old active daily runs and fails on truncated queues and unreadable contracts', async () => {
  const fetcher = async url => new Response(JSON.stringify(url.includes('/workflows/')
    ? { total_count: 0, workflow_runs: [] }
    : { total_count: 1, workflow_runs: [{ ...RUN, workflow_id: 999, path: '.github/workflows/collect-production.yml', created_at: '2026-10-01T00:00:00Z' }] }), { status: 200 });
  assert.equal((await readAirportRunSnapshot(NOW, fetcher)).active.length, 5);
  await assert.rejects(readAirportRunSnapshot(NOW, async () => new Response(JSON.stringify({ total_count: 101, workflow_runs: [] }), { status: 200 })));
  await assert.rejects(readAirportRunSnapshot(NOW, async () => new Response('unavailable', { status: 429 })));
});

test('production integration keeps permission and review locks; no activation override or new scheduler', () => {
  const script = readFileSync('scripts/airport-midnight-recovery.ts', 'utf8');
  assert.match(script, /A1_RECOVERY_DISPATCH_PERMISSION_GRANTED = false/);
  assert.doesNotMatch(script, /activation\s*:/);
  const workflow = readFileSync('.github/workflows/collect-realtime.yml', 'utf8');
  assert.doesNotMatch(workflow, /^\s+schedule:/m); assert.doesNotMatch(workflow, /^\s+actions:\s*write/m);
  const early = readFileSync('.github/workflows/collect-airport-recovery.yml', 'utf8');
  assert.match(early, /group: production-collector/); assert.match(early, /cancel-in-progress: false/);
  assert.equal((early.match(/a1_expected_target_date:/g) ?? []).length, 3);
});
