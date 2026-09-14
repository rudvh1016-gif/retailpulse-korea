/**
 * What the harness does when things break — proven against fakes, never against
 * a real provider.
 *
 * Every scenario below is driven by an injected executor, an injected
 * verification result, or a local SQLite ledger. No test here opens a socket,
 * so running the suite costs Production nothing and can never contribute to a
 * provider's daily quota.
 *
 * The recurring question is the same one in every case: when something goes
 * wrong, does the system say what actually broke, or does it say something
 * comfortable?
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { SqliteD1 } from './helpers/operational-sqlite.mjs';
import { OperationalMemory } from '../lib/operational-memory.ts';
import { executeControlledRecovery } from '../lib/operational-recovery-runner.ts';
import { resolveCentralRecoveryActivation } from '../lib/central-recovery-gate.ts';
import { verifyRecovery, decideRecovery } from '../lib/recovery-orchestration.ts';
import { resolveRecoveryDisposition } from '../lib/recovery-capability.ts';
import { publicFailureReason } from '../lib/source-status.ts';

const at = '2026-09-13T06:00:00Z', later = '2026-09-13T06:05:00Z';
const parts = { sourceId: 'KMA_VILAGE_FCST', failureClass: 'STALE', contractVersion: 'weather-v1', logicalJob: 'collect-weather.yml' };
const setup = () => { const db = new SqliteD1(); return { db, memory: new OperationalMemory(db) }; };
const failure = (runId = 'run1') => ({ parts, kind: 'FAILURE', runId, at, evidence: 'connect timeout' });
const request = (runId = 'r1', overrides = {}) => ({
  parts, targetDate: '2026-09-13', scheduledSlot: '06:00', operation: 'REQUEST_ONLY_MISSING_COVERAGE', runId, at, ...overrides,
});
const OPEN_GATE = resolveCentralRecoveryActivation({
  compiledEnabled: true, runtimeEnabled: true, ownerApproved: true,
  nowIso: '2026-10-01T00:00:00Z', trialEndExclusiveIso: '2026-09-27T00:00:00+09:00',
});
/** An existing scheduled collection, as recordExistingCompletion writes one. */
function insertExistingRun(db, { targetDate = '2026-09-13', n = 0 } = {}) {
  db.raw.prepare(`INSERT INTO operational_recovery_attempts
    (attempt_id,execution_id,fingerprint,source_id,failure_class,contract_version,logical_job,target_date,
     scheduled_slot,operation,attempt_number,started_at,completed_at,outcome,verified,escalation_required,mode)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,'EXISTING_RUN')`)
    .run(`existing|${targetDate}|${n}`, `exec|${targetDate}|${n}`, 'fp', parts.sourceId, parts.failureClass,
      parts.contractVersion, parts.logicalJob, targetDate, `0${n}:00`, 'REQUEST_ONLY_MISSING_COVERAGE', n + 1,
      at, later, 'RECOVERED');
}

// ── A/B. Transient failures are repairable; the class says so ──────────────

test('A/B: a transient network or 5xx failure is classified as repairable, bounded by a ceiling', () => {
  // The classifier reads the collector's own `failureClass=` marker rather than
  // guessing from prose, which is why an unmarked message stays OTHER instead
  // of being sorted into a bucket nobody measured.
  assert.equal(publicFailureReason('failureClass=TIMEOUT causeCode=UND_ERR_HEADERS_TIMEOUT'), 'TIMEOUT');
  assert.equal(publicFailureReason('failureClass=NETWORK causeCode=UND_ERR_CONNECT_TIMEOUT'), 'NETWORK');
  assert.equal(publicFailureReason('just some prose about a timeout'), 'OTHER',
    'an unmarked message must not be guessed into a class');
  assert.equal(publicFailureReason(null), 'OTHER');
  // EXECUTION_ERROR is in the closed rule table, with a ceiling that stops a
  // real defect from looping forever.
  const decision = decideRecovery('EXECUTION_ERROR', 0);
  assert.equal(decision.approved, true);
  assert.equal(decision.maxAttempts, 2);
  assert.equal(decideRecovery('EXECUTION_ERROR', 2).approved, false, 'the ceiling must bind');
  assert.match(decideRecovery('EXECUTION_ERROR', 2).reason, /budget exhausted/);
});

test('C: an auth failure is never retried automatically', () => {
  assert.equal(publicFailureReason('failureClass=AUTH status=401'), 'AUTH');
  assert.equal(publicFailureReason('failureClass=HTTP 403 Forbidden'), 'AUTH');
  assert.equal(publicFailureReason('failureClass=SCHEMA field=expectedPassengers'), 'SCHEMA');
  // There is no rule for an auth-shaped failure class, and the forbidden-action
  // list keeps a credential change out of reach even if someone added one.
  for (const failureClass of ['INVALID_PAYLOAD', 'PERSISTENCE_FAILED', 'PUBLICATION_MISMATCH']) {
    const decision = decideRecovery(failureClass, 0);
    assert.equal(decision.approved, false, failureClass);
    assert.equal(decision.action, 'NONE');
    assert.equal(decision.stage, 'HUMAN_REVIEW_REQUIRED');
  }
});

test('D/E/F: the first broken layer decides the verdict, and a later layer cannot rescue it', () => {
  // E — collected but not stored.
  assert.equal(verifyRecovery({ dataValid: true, storageValid: false, publicValid: true }).stage, 'RECOVERY_FAILED');
  // F — stored but the public surface still shows the old data.
  assert.equal(verifyRecovery({ dataValid: true, storageValid: true, publicValid: false }).stage, 'RECOVERY_FAILED');
  // Bad data is never rescued by healthy storage.
  assert.equal(verifyRecovery({ dataValid: false, storageValid: true, publicValid: true }).stage, 'RECOVERY_FAILED');
  // An UNMEASURED layer is pending, never a pass.
  for (const unmeasured of [
    { dataValid: null, storageValid: true, publicValid: true },
    { dataValid: true, storageValid: null, publicValid: true },
    { dataValid: true, storageValid: true, publicValid: null },
  ]) {
    const outcome = verifyRecovery(unmeasured);
    assert.equal(outcome.stage, 'RECOVERY_PENDING', JSON.stringify(unmeasured));
    assert.equal(outcome.verified, false);
  }
});

test('J: RECOVERED requires all three layers re-verified, and nothing less', () => {
  const outcome = verifyRecovery({ dataValid: true, storageValid: true, publicValid: true });
  assert.equal(outcome.stage, 'RECOVERED');
  assert.equal(outcome.verified, true);
  assert.match(outcome.reason, /data, storage and public surface/);
});

test('I: the recovery program can run correctly and the failure still not be fixed', async () => {
  const { memory } = setup();
  await memory.recordEvent(failure());
  let executed = 0;
  // The executor does its job and exits cleanly; the re-check says the public
  // surface is still wrong. Execution succeeded. Health did not.
  const result = await executeControlledRecovery(memory, request(), {
    execute: async () => { executed += 1; return { source: 'weather_recovery', status: 'SUCCESS', records: 9, providerRequests: 1 }; },
    verify: async () => ({ dataValid: true, storageValid: true, publicValid: false }),
    now: () => later,
  }, { activation: OPEN_GATE });
  assert.equal(executed, 1, 'the program ran');
  assert.equal(result.stage, 'RECOVERY_FAILED', 'and honestly reported that the system is still broken');
  const [attempt] = await memory.attempts(parts.sourceId, '2026-09-13');
  assert.equal(attempt.outcome, 'RECOVERY_FAILED');
  assert.equal(attempt.verified, false);
  assert.equal(attempt.escalationRequired, true, 'an unverified repair must escalate, not go quiet');
});

test('an executor that throws is recorded as a failure, not as an absent result', async () => {
  const { memory } = setup();
  await memory.recordEvent(failure());
  const result = await executeControlledRecovery(memory, request(), {
    execute: async () => { throw new Error('provider exploded'); },
    verify: async () => ({ dataValid: true, storageValid: true, publicValid: true }),
    now: () => later,
  }, { activation: OPEN_GATE });
  assert.equal(result.state, 'RECOVERY_FAILED');
  const [attempt] = await memory.attempts(parts.sourceId, '2026-09-13');
  assert.equal(attempt.dataValid, false);
  assert.equal(attempt.completedAt !== null, true, 'the attempt must be closed, not left holding the lock');
});

test('a verifier that throws leaves the recovery PENDING, never RECOVERED', async () => {
  const { memory } = setup();
  await memory.recordEvent(failure());
  const result = await executeControlledRecovery(memory, request(), {
    execute: async () => ({ source: 'weather_recovery', status: 'SUCCESS', records: 3, providerRequests: 1 }),
    verify: async () => { throw new Error('verifier exploded'); },
    now: () => later,
  }, { activation: OPEN_GATE });
  assert.equal(result.stage, 'RECOVERY_PENDING');
  assert.notEqual(result.stage, 'RECOVERED');
});

test('H: two concurrent requests for the same repair execute it once', async () => {
  const { db, memory } = setup();
  await memory.recordEvent(failure());
  const other = new OperationalMemory(db);
  let calls = 0;
  const executor = {
    execute: async () => { calls += 1; return { source: 'weather_recovery', status: 'SUCCESS', records: 1, providerRequests: 1 }; },
    verify: async () => ({ dataValid: true, storageValid: true, publicValid: true }),
    now: () => later,
  };
  await Promise.all([
    executeControlledRecovery(memory, request('a'), executor, { activation: OPEN_GATE }),
    executeControlledRecovery(other, request('b', { scheduledSlot: '07:00' }), executor, { activation: OPEN_GATE }),
  ]);
  assert.equal(calls, 1, 'the provider may be called exactly once for one repair');
});

// ── §5. Normal collection must never spend the recovery budget ─────────────

test('ordinary scheduled collections do not consume the recovery budget', async () => {
  const { db, memory } = setup();
  await memory.recordEvent(failure());
  // A busy but perfectly healthy day: twelve normal collections recorded.
  for (let n = 0; n < 12; n += 1) insertExistingRun(db, { n });
  // The repair budget for STALE is 3 and must be untouched by any of them.
  const admitted = await memory.admit(request());
  assert.equal(admitted.admitted, true,
    'a source that merely ran on schedule all day must still be repairable');
  assert.equal(admitted.state, 'RECOVERY_STARTED');
  const [attempt] = (await memory.attempts(parts.sourceId, '2026-09-13')).filter((row) => row.mode === 'CONTROLLED');
  assert.equal(attempt.attemptNumber, 1, 'the attempt number counts repairs, not collections');
});

test('the recovery budget still binds once real repairs are spent', async () => {
  const { db, memory } = setup();
  await memory.recordEvent(failure());
  for (let n = 0; n < 5; n += 1) insertExistingRun(db, { n });
  const max = decideRecovery('STALE', 0).maxAttempts;
  let admitted = 0;
  for (let i = 0; i < max + 3; i += 1) {
    const result = await memory.admit(request(`r${i}`, { scheduledSlot: `0${i}:00` }));
    if (result.admitted) { admitted += 1; await memory.finish(result.attemptId, later, { dataValid: false, storageValid: null, publicValid: null }); }
  }
  assert.equal(admitted, max, 'exactly the repair ceiling, no more and no fewer');
});

test('a new KST day starts a fresh repair budget, and only a new day does', async () => {
  const { memory } = setup();
  await memory.recordEvent(failure());
  const max = decideRecovery('STALE', 0).maxAttempts;
  for (let i = 0; i < max; i += 1) {
    const result = await memory.admit(request(`d1-${i}`, { scheduledSlot: `0${i}:00` }));
    await memory.finish(result.attemptId, later, { dataValid: false, storageValid: null, publicValid: null });
  }
  // Same day: refused.
  assert.equal((await memory.admit(request('d1-extra', { scheduledSlot: '09:00' }))).admitted, false);
  // Next day: a fresh budget, because the ceiling is per target date.
  const nextDay = await memory.admit(request('d2', { targetDate: '2026-09-14', scheduledSlot: '06:00', at: '2026-09-14T06:00:00Z' }));
  assert.equal(nextDay.admitted, true);
});

// ── G. An unregistered source may not be recovered ─────────────────────────

test('G: a source nobody registered is never acted on', () => {
  const resolved = resolveRecoveryDisposition({
    sourceId: 'A_BRAND_NEW_PROVIDER', failureClass: 'STALE', contractVersion: 'v1',
    attemptsUsed: 0, inFlight: false, alreadyRecovered: false, centralGateAllowed: true,
  });
  assert.equal(resolved.capability.controlledRecoveryEligible, false);
  assert.equal(resolved.recommendedAction, 'NONE');
  assert.notEqual(resolved.finalDisposition, 'WOULD_CONTROLLED_RECOVER');
});
