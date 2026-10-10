import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { SqliteD1 } from './helpers/operational-sqlite.mjs';
import { expandRealtimeCadence } from './helpers/realtime-cycle.mjs';
import { OperationalMemory } from '../lib/operational-memory.ts';
import { resolveCentralRecoveryActivation } from '../lib/central-recovery-gate.ts';
import { A1_SOURCE, A1_RECOVERY_WORKFLOW } from '../lib/airport-midnight-recovery.ts';
import { airportMidnightCandidate, airportDirectContext, executeAirportMidnightDirect } from '../lib/airport-midnight-direct-recovery.ts';
import { airportMidnightSourceBlocked } from '../lib/airport-recovery-protection.ts';
import { airportRequestBudgetAvailable } from '../lib/airport-request-budget.ts';

const NOW = '2026-10-10T16:22:00Z', DAY = '2026-10-11';
const MISSING = { today: DAY, state: 'MISSING_TODAY', pastGrace: true, alert: true, retrievedAt: null };
const CURRENT = { ...MISSING, state: 'CURRENT', alert: false, retrievedAt: NOW };
const OPEN = resolveCentralRecoveryActivation({ compiledEnabled: true, ownerApproved: true, runtimeEnabled: true,
  nowIso: NOW, trialEndExclusiveIso: '2026-09-27T00:00:00+09:00' });
const ENV = { ENABLE_PRODUCTION_COLLECTOR: 'true', RPK_A1_MIDNIGHT_RECOVERY: 'true',
  RPK_A1_MIDNIGHT_CALLER: 'airport_midnight_recovery', RPK_PRODUCTION_SOURCES: 'airport_recent',
  RPK_A1_MAX_REQUESTS: '125', RPK_A1_RESCAN_TODAY: 'false', RPK_OPERATIONAL_ATTEMPT: '1',
  RPK_A1_EXPECTED_TARGET_DATE: DAY, GITHUB_REPOSITORY: 'rudvh1016-gif/retailpulse-korea',
  GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_WORKFLOW: 'Collect Realtime Signals',
  GITHUB_JOB: 'collect', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: 'a'.repeat(40) };
const RESULT = { source: 'airport_recent', status: 'SUCCESS', records: 2, providerRequests: 2 };
function setup(overrides = {}) {
  const db = new SqliteD1(), memory = new OperationalMemory(db), calls = { collectors: 0 };
  let collected = false;
  const deps = { memory, env: ENV, now: () => NOW,
    readCoverage: async () => collected ? CURRENT : MISSING,
    readSnapshot: async () => ({ complete: true, early: [], active: [] }),
    sourceBlocked: async () => false, budgetAvailable: async () => true,
    collectA1: async () => { calls.collectors++; collected = true; return RESULT; },
    verifyToday: async () => ({ dataValid: true, storageValid: true, publicValid: true }), ...overrides };
  return { db, memory, deps, calls };
}
const execute = deps => executeAirportMidnightDirect(deps, { activation: OPEN });

test('shipped candidate and collector gates stop before every read/write/provider even with runtime flags', async () => {
  const { db, deps, calls } = setup({ env: { ...ENV, RPK_CENTRAL_RECOVERY_OWNER_APPROVED: 'true', RPK_CENTRAL_RECOVERY_RUNTIME_ENABLED: 'true' } });
  assert.equal((await airportMidnightCandidate(deps, NOW)).reason, 'CENTRAL_RECOVERY_DORMANT');
  assert.equal((await executeAirportMidnightDirect(deps)).state, 'CENTRAL_RECOVERY_DORMANT');
  assert.equal(db.calls.length, 0); assert.equal(calls.collectors, 0);
});

test('fixed main/caller/source/date/attempt/budget tuple cannot be broadened by an input', async () => {
  assert.ok(airportDirectContext(ENV, NOW));
  assert.ok(airportDirectContext(ENV, NOW).runId.endsWith(ENV.GITHUB_SHA));
  assert.equal(airportDirectContext(ENV, 'invalid'), null);
  for (const [key, value] of Object.entries({ GITHUB_REPOSITORY: 'other/repo', GITHUB_REF: 'refs/heads/feature',
    GITHUB_EVENT_NAME: 'pull_request', GITHUB_WORKFLOW: 'other workflow', GITHUB_JOB: 'other-job', GITHUB_RUN_ID: '0',
    GITHUB_RUN_ATTEMPT: '', GITHUB_SHA: 'unknown', RPK_A1_MIDNIGHT_CALLER: 'other-caller',
    RPK_PRODUCTION_SOURCES: 'airport_recent,airport_enrichment', RPK_A1_MAX_REQUESTS: '126',
    RPK_A1_RESCAN_TODAY: 'true', RPK_OPERATIONAL_ATTEMPT: '2', RPK_A1_EXPECTED_TARGET_DATE: '2026-10-10' })) {
    const { db, deps, calls } = setup({ env: { ...ENV, [key]: value } });
    assert.equal((await execute(deps)).state, 'DIRECT_CONTEXT_UNVERIFIED', key);
    assert.equal(db.calls.length, 0); assert.equal(calls.collectors, 0);
  }
});

test('candidate delivery/canceled pending jobs never acquire a durable lock', async () => {
  const { db, deps, memory, calls } = setup();
  for (let i = 0; i < 3; i++) assert.equal((await airportMidnightCandidate(deps, NOW, { activation: OPEN })).eligible, true);
  assert.ok(db.calls.every(sql => sql.trim().startsWith('SELECT')));
  assert.equal((await memory.attempts(A1_SOURCE, DAY)).length, 0); assert.equal(calls.collectors, 0);
  assert.equal((await execute(deps)).state, 'RECOVERED'); assert.equal(calls.collectors, 1);
});

test('simultaneous actual jobs and repeated parent attempts spend exactly one daily admission', async () => {
  const { deps, memory, db, calls } = setup();
  await Promise.all([execute(deps), execute({ ...deps, memory: new OperationalMemory(db), env: { ...ENV, GITHUB_RUN_ID: '124' } })]);
  assert.equal(calls.collectors, 1);
  const attempts = await memory.attempts(A1_SOURCE, DAY);
  assert.equal(attempts.length, 1); assert.equal(attempts[0].logicalJob, A1_RECOVERY_WORKFLOW);
  assert.equal(attempts[0].scheduledSlot, '00:07'); assert.equal(attempts[0].operation, 'REDISPATCH_SAME_WORKFLOW');
  assert.equal(attempts[0].verified, true); assert.equal(attempts[0].providerRequests, 2);
  await execute({ ...deps, env: { ...ENV, GITHUB_RUN_ATTEMPT: '2' } }); assert.equal(calls.collectors, 1);
});

test('late native, newly current rows, protected source or spent shared budget abort before the collector', async () => {
  for (const mode of ['native', 'current', 'source', 'budget']) {
    let reads = 0;
    const overrides = mode === 'native' ? { readSnapshot: async () => ({ complete: true, early: [], active: ++reads === 1 ? [] : [{ status: 'queued' }] }) }
      : mode === 'current' ? { readCoverage: async () => ++reads === 1 ? MISSING : CURRENT }
      : mode === 'source' ? { sourceBlocked: async () => ++reads > 1 } : { budgetAvailable: async () => ++reads === 1 };
    const { deps, memory, calls } = setup(overrides);
    assert.equal((await execute(deps)).state, 'ABORTED_BEFORE_COLLECTION', mode);
    assert.equal(calls.collectors, 0); assert.equal((await memory.inFlightControlled()).length, 0);
    assert.equal((await memory.attempts(A1_SOURCE, DAY)).length, 1);
  }
});

test('a proven unused admission does not block next-day collection', async () => {
  let reads = 0;
  const { deps, memory, calls } = setup({ budgetAvailable: async () => ++reads === 1 });
  assert.equal((await execute(deps)).state, 'ABORTED_BEFORE_COLLECTION');
  const next = await execute({ ...deps, env: { ...ENV, RPK_A1_EXPECTED_TARGET_DATE: '2026-10-12', GITHUB_RUN_ID: '125' },
    now: () => '2026-10-11T16:22:00Z', readCoverage: async () => ({ ...MISSING, today: '2026-10-12' }), budgetAvailable: async () => true });
  assert.equal(next.state, 'HUMAN_REVIEW_RECOVERY_UNVERIFIED'); assert.equal(calls.collectors, 1);
  assert.equal((await memory.attempts(A1_SOURCE, '2026-10-12')).length, 1);
});

test('crashed child keeps the durable lock across restart and dates; no elapsed unlock', async () => {
  let calls = 0;
  const { deps, memory } = setup({ collectA1: async () => { calls++; throw Error('runner lost'); } });
  assert.equal((await execute(deps)).state, 'HUMAN_REVIEW_UNCERTAIN_CHILD');
  await execute({ ...deps, env: { ...ENV, GITHUB_RUN_ID: '124' } });
  await execute({ ...deps, env: { ...ENV, RPK_A1_EXPECTED_TARGET_DATE: '2026-10-12' }, now: () => '2026-10-11T16:22:00Z' });
  assert.equal(calls, 1); assert.equal((await memory.inFlightControlled()).length, 1);
});

test('a changed valid parent/attempt identity cannot collect or finish a previous child', async () => {
  for (const when of ['before', 'after']) {
    const env = { ...ENV }; let checks = 0, calls = 0;
    const { deps, memory } = setup({ env,
      sourceBlocked: async () => { if (++checks === 2 && when === 'before') env.GITHUB_RUN_ID = '124'; return false; },
      collectA1: async () => { calls++; if (when === 'after') env.GITHUB_RUN_ATTEMPT = '2'; return RESULT; } });
    assert.equal((await execute(deps)).state, when === 'before' ? 'ABORTED_BEFORE_COLLECTION' : 'HUMAN_REVIEW_CONTEXT_CHANGED');
    assert.equal(calls, when === 'before' ? 0 : 1);
    assert.equal((await memory.inFlightControlled()).length, when === 'before' ? 0 : 1);
  }
});

test('receipt persistence failure never starts the collector or opens the admission', async () => {
  const { deps, memory, calls } = setup();
  const original = memory.recordEvent.bind(memory);
  memory.recordEvent = async event => { if (event.runId.endsWith('-receipt')) throw Error('unavailable'); return original(event); };
  assert.equal((await execute(deps)).state, 'HUMAN_REVIEW_READ_OR_WRITE_UNAVAILABLE');
  assert.equal(calls.collectors, 0); assert.equal((await memory.inFlightControlled()).length, 1);
});

for (const publicValid of [true, false, null]) test(`own A1 result requires verified DB and public evidence (${publicValid})`, async () => {
  const { deps, memory } = setup({ verifyToday: async () => ({ dataValid: true, storageValid: true, publicValid }), parentConclusion: 'failure' });
  assert.equal((await execute(deps)).state, publicValid === true ? 'RECOVERED' : 'HUMAN_REVIEW_RECOVERY_UNVERIFIED');
  assert.equal((await memory.attempts(A1_SOURCE, DAY))[0].verified, publicValid === true);
});

test('a successful parent or unrelated source cannot substitute for the actual A1 result', async () => {
  for (const source of ['airport_recent', 'airport_enrichment']) {
    const { deps, memory } = setup({ collectA1: async () => ({ ...RESULT, source, status: source === 'airport_recent' ? 'ERROR' : 'SUCCESS' }),
      readCoverage: async () => MISSING, parentConclusion: 'success' });
    assert.match((await execute(deps)).state, /HUMAN_REVIEW/);
    assert.equal((await memory.attempts(A1_SOURCE, DAY))[0].verified, false);
  }
});

test('actual A1 request counter in detail is measured and unmeasured success keeps the lock', async () => {
  for (const detail of ['recent dates; requests 3; stored', 'unmeasured', 'recent dates; requests 126; stored']) {
    let collected = false;
    const { deps, memory } = setup({ collectA1: async () => { collected = true; return { ...RESULT, providerRequests: undefined, detail }; },
      readCoverage: async () => collected ? CURRENT : MISSING });
    const result = await execute(deps);
    assert.equal(result.state, detail.includes('requests 3;') ? 'RECOVERED' : 'HUMAN_REVIEW_UNMEASURED_CHILD');
    assert.equal((await memory.attempts(A1_SOURCE, DAY))[0].providerRequests, detail.includes('requests 3;') ? 3 : null);
  }
});

test('known provider429/auth/schema or full shared500 budget stops before admission', async () => {
  for (const detail of ['httpStatus=429', 'AUTH403', 'SCHEMA']) {
    const { db, deps, calls, memory } = setup();
    db.raw.prepare("INSERT INTO source_health(source_id,status,detail,schema_version) VALUES(?,?,?,'airport-v1')").run(A1_SOURCE, 'ERROR', detail);
    assert.equal((await execute({ ...deps, sourceBlocked: () => airportMidnightSourceBlocked(db) })).state, 'SOURCE_BLOCKED');
    assert.equal(calls.collectors, 0); assert.equal((await memory.attempts(A1_SOURCE, DAY)).length, 0);
  }
  const { db, deps, calls } = setup();
  db.raw.prepare('INSERT INTO collector_runs(run_id,source_id,started_at,status,records_read) VALUES(?,?,?,?,?)')
    .run('budget-full', 'INCHEON_FLIGHT_REQUEST_BUDGET', NOW, 'RESERVED', 500);
  assert.equal((await execute({ ...deps, budgetAvailable: now => airportRequestBudgetAvailable(db, now) })).state, 'REQUEST_BUDGET_UNAVAILABLE');
  assert.equal(calls.collectors, 0);
});

test('production entry stops before credential configuration while all shipped gates stay closed', () => {
  const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/collect-airport-midnight-direct.ts'], {
    env: { ...process.env, ...ENV, RPK_CENTRAL_RECOVERY_OWNER_APPROVED: 'true', RPK_CENTRAL_RECOVERY_RUNTIME_ENABLED: 'true',
      CLOUDFLARE_D1_WRITE_TOKEN: '' }, encoding: 'utf8', timeout: 10_000 });
  assert.equal(child.status, 0, child.stderr); assert.match(child.stdout, /CENTRAL_RECOVERY_DORMANT/);
  assert.match(child.stdout, /"providerRequests":0,"writes":0/);
});

test('reusable graph preserves the entire realtime cycle lock and keeps A1 outside it with read permissions', () => {
  const root = readFileSync('.github/workflows/collect-realtime.yml', 'utf8');
  const expanded = expandRealtimeCadence(root);
  assert.match(expanded, /RPK_PRODUCTION_SOURCES: airport_congestion,airport_congestion_t2,seoul_realtime/);
  assert.match(expanded, /needs\.collect\.outputs\.retry_sources != ''/);
  assert.match(expanded, /a4_max_attempts_per_request: "1"/);
  assert.match(root, /group: duty-free-exchange-production/);
  assert.match(root, /always\(\).*needs\.airport_today_coverage\.outputs\.a1_recovery_eligible/);
  for (const file of ['collect-realtime.yml', 'collect-realtime-cycle.yml', 'collect-attempt.yml']) {
    const text = readFileSync('.github/workflows/' + file, 'utf8');
    assert.doesNotMatch(text, /^\s+(?:actions:\s*write|continue-on-error:\s*true|cancel-in-progress:\s*true)\s*$/m);
  }
  const witness = readFileSync('scripts/airport-midnight-recovery.ts', 'utf8');
  assert.doesNotMatch(witness, /executeAirportMidnightRecovery|dispatchAirportMidnightRecovery|activation\s*:/);
  const entry = readFileSync('scripts/collect-airport-midnight-direct.ts', 'utf8');
  assert.doesNotMatch(entry, /activation\s*:|collectHolidays|pruneOperationalHistory|airport_enrichment/);
});
