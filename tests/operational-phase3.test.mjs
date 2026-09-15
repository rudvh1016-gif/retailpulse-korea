/**
 * Phase 3 pre-activation closure: the control layer that makes switching central
 * recovery on later a decision rather than a gamble.
 *
 * Every test here answers one of two questions:
 *
 *   1. While the system is dormant, can ANY call path reach a provider?
 *   2. When it is not dormant, does the system still refuse everything nobody
 *      cleared — unsupported sources, unknown contracts, exhausted budgets,
 *      held locks?
 *
 * The provider counter is the spine. Almost every test below counts
 * `executor.execute()` calls, because "it returned a refusal object" and "it
 * made no request" are different claims and only the second one matters.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SqliteD1 } from './helpers/operational-sqlite.mjs';
import { OperationalMemory } from '../lib/operational-memory.ts';
import { executeControlledRecovery, centralRecoveryActivation, CENTRAL_RECOVERY_EXECUTION_ENABLED } from '../lib/operational-recovery-runner.ts';
import { resolveCentralRecoveryActivation, runtimeCentralRecoveryEnabled, ownerApprovedCentralRecovery } from '../lib/central-recovery-gate.ts';
import {
  SOURCE_RECOVERY_CAPABILITIES, PRODUCTION_SOURCE_IDS, CLASSIFIED_SOURCE_IDS, ADDITIONAL_LIVE_SOURCE_IDS,
  capabilityFor, resolveRecoveryDisposition,
} from '../lib/recovery-capability.ts';
import { buildOrchestrationPlan, kstDate } from '../lib/orchestration-plan.ts';
import { decideRecovery, RECOVERY_RULES } from '../lib/recovery-orchestration.ts';
import { currentActionFor, shadowCandidatesFor, evaluateShadowPolicy } from '../lib/recovery-scorecard.ts';
import { classifyTriggerEvidence, provesIndependentPlatform } from '../lib/trigger-evidence.ts';
import { classifyRuntimeEnablement, readWorkflowFacts } from '../lib/scheduler-truth.ts';
import { observeQuota } from '../lib/quota-observation.ts';
import { observedUsage } from '../lib/recovery-scorecard.ts';

const at = '2026-09-13T06:00:00Z', later = '2026-09-13T06:05:00Z';
const parts = { sourceId: 'KMA_VILAGE_FCST', failureClass: 'STALE', contractVersion: 'weather-v1', logicalJob: 'collect-weather.yml' };

/** The same in-memory migrated database the Phase 2 suite uses. */
function setup() {
  const db = new SqliteD1();
  return { db, memory: new OperationalMemory(db) };
}
const failure = (runId = 'run1') => ({ parts, kind: 'FAILURE', runId, at, evidence: 'connect timeout' });
const request = (runId = 'r1', overrides = {}) => ({
  parts, targetDate: '2026-09-13', scheduledSlot: '06:00', operation: 'REQUEST_ONLY_MISSING_COVERAGE',
  runId, at, ...overrides,
});
/** Counts what actually reached a provider. A refusal that still executed is a failure. */
function countingExecutor() {
  const counter = { calls: 0, verifies: 0 };
  return [counter, {
    execute: async () => { counter.calls += 1; return { source: 'weather_recovery', status: 'SUCCESS', records: 3, providerRequests: 1 }; },
    verify: async () => { counter.verifies += 1; return { dataValid: true, storageValid: true, publicValid: true }; },
    now: () => later,
  }];
}
const OPEN_GATE = resolveCentralRecoveryActivation({
  compiledEnabled: true, runtimeEnabled: true, ownerApproved: true,
  nowIso: '2026-10-01T00:00:00Z', trialEndExclusiveIso: '2026-09-27T00:00:00+09:00',
});

/**
 * Source with comments removed.
 *
 * These scans are about what the code DOES. Every one of these modules explains
 * the rule it enforces in prose, and several name the very symbols being
 * searched for — so a scan that reads comments finds its own documentation and
 * reports it as a violation.
 */
function code(path) {
  return readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Repository files that must never contain a production activation override. */
function repositoryFiles(root, out = []) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (/^(node_modules|dist|\.next|\.git|\.wrangler|\.playwright-browsers|coverage|test-results)$/.test(entry.name)) continue;
      repositoryFiles(path, out);
      continue;
    }
    if (/\.(ts|tsx|mjs|js|yml|yaml)$/.test(path) && statSync(path).size < 2_000_000) out.push(path);
  }
  return out;
}

// ── A. Hard gate: no call path reaches a provider while dormant ──────────────

test('A: the production gate is locked, and every one of its four conditions is reported', () => {
  assert.equal(CENTRAL_RECOVERY_EXECUTION_ENABLED, false);
  const gate = centralRecoveryActivation('2026-10-01T00:00:00Z', {});
  assert.equal(gate.allowed, false);
  assert.ok(gate.blockedBy.includes('COMPILED_DISABLED'));
  assert.ok(gate.blockedBy.includes('OWNER_APPROVAL_MISSING'));
  assert.ok(gate.blockedBy.includes('RUNTIME_DISABLED'));
  assert.deepEqual(gate.evaluated, { trialOver: true, compiledEnabled: false, ownerApproved: false, runtimeEnabled: false });
});

test('A: the trial date is necessary and never sufficient', () => {
  // Before the trial ends, the trial itself blocks.
  const during = resolveCentralRecoveryActivation({ compiledEnabled: true, runtimeEnabled: true, ownerApproved: true,
    nowIso: '2026-09-20T00:00:00Z', trialEndExclusiveIso: '2026-09-27T00:00:00+09:00' });
  assert.equal(during.allowed, false);
  assert.deepEqual([...during.blockedBy], ['UI_TRIAL_LOCK']);
  // After it ends, the date alone opens nothing.
  const after = resolveCentralRecoveryActivation({ compiledEnabled: false, runtimeEnabled: false, ownerApproved: false,
    nowIso: '2026-12-01T00:00:00Z', trialEndExclusiveIso: '2026-09-27T00:00:00+09:00' });
  assert.equal(after.allowed, false);
  assert.equal(after.evaluated.trialOver, true);
  // Exactly three conditions still missing, and all four together are required.
  assert.deepEqual([...after.blockedBy], ['COMPILED_DISABLED', 'OWNER_APPROVAL_MISSING', 'RUNTIME_DISABLED']);
  assert.equal(OPEN_GATE.allowed, true);
});

test('A: each single missing condition is enough to keep the gate shut', () => {
  const base = { compiledEnabled: true, runtimeEnabled: true, ownerApproved: true,
    nowIso: '2026-10-01T00:00:00Z', trialEndExclusiveIso: '2026-09-27T00:00:00+09:00' };
  for (const key of ['compiledEnabled', 'runtimeEnabled', 'ownerApproved']) {
    const gate = resolveCentralRecoveryActivation({ ...base, [key]: false });
    assert.equal(gate.allowed, false, `${key}=false must lock the gate`);
  }
});

test('A: an unreadable clock fails closed rather than counting as trial-over', () => {
  const gate = resolveCentralRecoveryActivation({ compiledEnabled: true, runtimeEnabled: true, ownerApproved: true,
    nowIso: 'not-a-date', trialEndExclusiveIso: '2026-09-27T00:00:00+09:00' });
  assert.equal(gate.allowed, false);
  assert.ok(gate.blockedBy.includes('ACTIVATION_CLOCK_UNREADABLE'));
  assert.equal(gate.evaluated.trialOver, false);
});

test('A: runtime and owner flags are read only from their own explicit variables', () => {
  assert.equal(runtimeCentralRecoveryEnabled({}), false);
  assert.equal(runtimeCentralRecoveryEnabled({ RPK_CENTRAL_RECOVERY_RUNTIME_ENABLED: 'TRUE' }), false);
  assert.equal(runtimeCentralRecoveryEnabled({ RPK_CENTRAL_RECOVERY_RUNTIME_ENABLED: 'true' }), true);
  // One variable may never satisfy the other condition.
  assert.equal(ownerApprovedCentralRecovery({ RPK_CENTRAL_RECOVERY_RUNTIME_ENABLED: 'true' }), false);
  assert.equal(ownerApprovedCentralRecovery({ RPK_CENTRAL_RECOVERY_OWNER_APPROVED: 'true' }), true);
});

// ── B. Bypass attempts (§6) ─────────────────────────────────────────────────

for (const [name, env, nowIso] of [
  ['bare direct call', {}, later],
  ['runtime env set alone', { RPK_CENTRAL_RECOVERY_RUNTIME_ENABLED: 'true' }, later],
  ['owner approval set alone', { RPK_CENTRAL_RECOVERY_OWNER_APPROVED: 'true' }, later],
  ['both env flags set', { RPK_CENTRAL_RECOVERY_RUNTIME_ENABLED: 'true', RPK_CENTRAL_RECOVERY_OWNER_APPROVED: 'true' }, later],
  ['a date long after the trial ends', { RPK_CENTRAL_RECOVERY_RUNTIME_ENABLED: 'true', RPK_CENTRAL_RECOVERY_OWNER_APPROVED: 'true' }, '2027-06-01T00:00:00Z'],
]) {
  test(`B: bypass attempt "${name}" makes zero provider calls and writes no admission`, async () => {
    const { memory } = setup();
    await memory.recordEvent(failure());
    const [counter, executor] = countingExecutor();
    const result = await executeControlledRecovery(memory, request(), executor, { env, nowIso });
    assert.equal(result.admitted, false);
    assert.equal(result.state, 'CENTRAL_RECOVERY_DORMANT');
    assert.equal(counter.calls, 0, 'no provider request may be made');
    assert.equal(counter.verifies, 0);
    // The refusal must also cost nothing durable: no attempt row, so no budget spent.
    assert.equal((await memory.attempts(parts.sourceId, '2026-09-13')).length, 0);
    assert.equal((await memory.inFlightControlled()).length, 0);
  });
}

test('B: a valid incident plus a real-looking adapter still executes nothing while dormant', async () => {
  const { memory } = setup();
  await memory.recordEvent(failure());
  const [counter, executor] = countingExecutor();
  await executeControlledRecovery(memory, request(), executor, { env: {}, nowIso: later });
  assert.equal(counter.calls, 0);
});

// ── C/D. Rule and capability must BOTH approve (§8) ─────────────────────────

test('C: rule approval alone never authorises a source; capability approval alone never authorises a failure class', () => {
  // EXECUTION_ERROR is approved by the rule table for every failure of that class.
  assert.equal(decideRecovery('EXECUTION_ERROR', 0).approved, true);
  // A1 has a rule-approved class and no capability: the intersection refuses.
  const a1 = resolveRecoveryDisposition({ sourceId: 'INCHEON_FLIGHT_DETAIL', failureClass: 'EXECUTION_ERROR',
    contractVersion: 'flight-v1', attemptsUsed: 0, inFlight: false, alreadyRecovered: false, centralGateAllowed: true });
  assert.equal(a1.ruleDecision.approved, true);
  assert.equal(a1.finalDisposition, 'BLOCKED_UNSUPPORTED_SOURCE');
  assert.equal(a1.recommendedAction, 'NONE');
  // BLOCKED_BUDGET means this incident's ATTEMPT budget is spent, which is a
  // different fact from A1's provider ceiling being permanently allocated; the
  // latter is why the source is unsupported at all, and it travels in the reason.
  assert.match(a1.blockReason, /500/);
  assert.equal(a1.capability.providerBudgetPolicy, 'DAILY_CEILING_FULLY_ALLOCATED');
  // KMA has capability and a class the rule does NOT cover: the intersection refuses too.
  const kma = resolveRecoveryDisposition({ sourceId: 'KMA_VILAGE_FCST', failureClass: 'INVALID_PAYLOAD',
    contractVersion: 'weather-v1', attemptsUsed: 0, inFlight: false, alreadyRecovered: false, centralGateAllowed: true });
  assert.equal(kma.capability.controlledRecoveryEligible, true);
  assert.equal(kma.finalDisposition, 'HUMAN_REVIEW_REQUIRED');
  assert.equal(kma.recommendedAction, 'NONE');
});

test('D: an unsupported source cannot execute even with the gate wide open', async () => {
  const { memory } = setup();
  const unsupported = { ...parts, sourceId: 'INCHEON_FLIGHT_DETAIL', logicalJob: 'collect-production.yml' };
  await memory.recordEvent({ ...failure(), parts: unsupported });
  const [counter, executor] = countingExecutor();
  const result = await executeControlledRecovery(memory, { ...request(), parts: unsupported }, executor, { activation: OPEN_GATE });
  assert.equal(result.state, 'BLOCKED_UNSUPPORTED_SOURCE');
  assert.equal(counter.calls, 0);
  assert.equal((await memory.attempts('INCHEON_FLIGHT_DETAIL', '2026-09-13')).length, 0);
});

test('D: an action the source does not support is refused even for an eligible source', async () => {
  const { memory } = setup();
  const missed = { ...parts, failureClass: 'MISSED_RUN' };
  await memory.recordEvent({ ...failure(), parts: missed });
  const [counter, executor] = countingExecutor();
  // MISSED_RUN's rule action is REDISPATCH_SAME_WORKFLOW, which KMA does not support.
  const result = await executeControlledRecovery(memory,
    { ...request(), parts: missed, operation: 'REDISPATCH_SAME_WORKFLOW' }, executor, { activation: OPEN_GATE });
  assert.equal(result.state, 'BLOCKED_UNSUPPORTED_SOURCE');
  assert.equal(counter.calls, 0);
  assert.equal(resolveRecoveryDisposition({ sourceId: 'KMA_VILAGE_FCST', failureClass: 'MISSED_RUN',
    contractVersion: 'weather-v1', attemptsUsed: 0, inFlight: false, alreadyRecovered: false, centralGateAllowed: true })
    .finalDisposition, 'BLOCKED_UNSUPPORTED_ACTION_FOR_SOURCE');
});

// ── B(matrix)/E/F/G/H. Every production source is classified (§7, §9) ───────

test('B: every production source id is classified exactly once', () => {
  const missing = PRODUCTION_SOURCE_IDS.filter((id) => !CLASSIFIED_SOURCE_IDS.includes(id));
  assert.deepEqual(missing, [], 'a production source with no capability entry would be silently unreviewed');
  const extra = CLASSIFIED_SOURCE_IDS.filter((id) => !PRODUCTION_SOURCE_IDS.includes(id));
  assert.deepEqual(extra, [], 'the matrix must not classify sources no collector writes');
  assert.equal(new Set(CLASSIFIED_SOURCE_IDS).size, CLASSIFIED_SOURCE_IDS.length, 'one entry per source');
  // A source that reaches D1 without being in DIAGNOSTIC_SOURCE_IDS is still a
  // production source. The first Production rehearsal found one.
  // Each one must be written by something real, not merely asserted here.
  const collectors = ['scripts/collect-production.ts', 'lib/collector.ts', 'lib/operational-evidence.ts']
    .map((path) => readFileSync(path, 'utf8')).join('\n');
  for (const id of ADDITIONAL_LIVE_SOURCE_IDS) {
    assert.ok(CLASSIFIED_SOURCE_IDS.includes(id), `${id} reaches D1 and must be classified`);
    assert.ok(collectors.includes(id), `${id} must be a real collected source, not an invented entry`);
  }
});

test('coverage is counted over sources SEEN, not only over the static table', () => {
  // The defect this locks: a source carrying live incidents but missing from
  // DIAGNOSTIC_SOURCE_IDS used to leave coverage reading 16/16 and readiness
  // reading true. Coverage must be able to see it and withhold the green.
  const plan = buildOrchestrationPlan(planInput({
    incidents: [incident(), incident({ fingerprint: 'zzz', sourceId: 'A_SOURCE_NOBODY_CLASSIFIED' })],
  }));
  assert.deepEqual(plan.capabilityCoverage.unclassified, ['A_SOURCE_NOBODY_CLASSIFIED']);
  assert.equal(plan.capabilityCoverage.productionSources, PRODUCTION_SOURCE_IDS.length + 1);
  assert.equal(plan.capabilityCoverage.classified, PRODUCTION_SOURCE_IDS.length);
  // And it still refuses the unclassified source rather than acting on it.
  const entry = plan.entries.find((row) => row.sourceId === 'A_SOURCE_NOBODY_CLASSIFIED');
  assert.equal(entry.sourceCapability.controlledRecoveryEligible, false);
  assert.notEqual(entry.finalDisposition, 'WOULD_CONTROLLED_RECOVER');
});

test('B: an unclassified source resolves to human review, never to permission', () => {
  const unknown = capabilityFor('SOME_FUTURE_SOURCE');
  assert.equal(unknown.recoveryClass, 'HUMAN_REVIEW_ONLY');
  assert.equal(unknown.controlledRecoveryEligible, false);
  assert.deepEqual([...unknown.supportedActions], []);
  assert.equal(unknown.publicVerification, 'UNKNOWN');
  assert.equal(unknown.providerBudgetPolicy, 'UNMEASURED');
});

test('B: only a source with an adapter, a bounded budget and a verification path is eligible', () => {
  for (const entry of SOURCE_RECOVERY_CAPABILITIES) {
    if (!entry.controlledRecoveryEligible) {
      assert.deepEqual([...entry.supportedActions], [], `${entry.sourceId} must offer no action`);
      continue;
    }
    assert.equal(entry.recoveryClass, 'CONTROLLED_ELIGIBLE', entry.sourceId);
    assert.ok(entry.adapter, `${entry.sourceId} must name an adapter`);
    assert.ok(entry.supportedActions.length, `${entry.sourceId} must support at least one action`);
    assert.notEqual(entry.publicVerification, 'UNKNOWN', `${entry.sourceId} must be provable end to end`);
    assert.equal(entry.providerBudgetPolicy, 'BOUNDED_BY_MISSING_COVERAGE', `${entry.sourceId} must have a bounded budget`);
    assert.ok(entry.reason.length > 40, `${entry.sourceId} must carry its evidence`);
  }
});

test('E: A4 congestion waits for its own next 15-minute cycle instead of adding a call', () => {
  for (const sourceId of ['INCHEON_DEPARTURE_CONGESTION', 'INCHEON_DEPARTURE_CONGESTION_T2']) {
    const resolved = resolveRecoveryDisposition({ sourceId, failureClass: 'EXECUTION_ERROR',
      contractVersion: 'congestion-v1', attemptsUsed: 0, inFlight: false, alreadyRecovered: false, centralGateAllowed: true });
    assert.equal(resolved.finalDisposition, 'WAIT_FOR_NEXT_SCHEDULED_SLOT', sourceId);
    assert.equal(resolved.recommendedAction, 'NONE');
    assert.match(resolved.capability.nextScheduledSlotBehavior, /15 minutes/);
  }
});

test('F: A1 is protected by its fully allocated daily ceiling', () => {
  const capability = capabilityFor('INCHEON_FLIGHT_DETAIL');
  assert.equal(capability.controlledRecoveryEligible, false);
  assert.equal(capability.providerBudgetPolicy, 'DAILY_CEILING_FULLY_ALLOCATED');
  assert.match(capability.reason, /500/);
  // The workflow that owns the ceiling still documents it, so this is not folklore.
  const workflow = readFileSync('.github/workflows/collect-airport-recovery.yml', 'utf8');
  assert.match(workflow, /worst case\s+500/);
});

for (const [label, sourceId, adapter] of [['G: A5', 'INCHEON_PASSENGER_FORECAST', 'airport_passenger_forecast_recovery'],
  ['H: KMA', 'KMA_VILAGE_FCST', 'weather_recovery']]) {
  test(`${label} reuses its existing missing-coverage adapter and nothing else`, () => {
    const capability = capabilityFor(sourceId);
    assert.equal(capability.controlledRecoveryEligible, true);
    assert.equal(capability.adapter, adapter);
    assert.deepEqual([...capability.supportedActions], ['REQUEST_ONLY_MISSING_COVERAGE']);
    // The adapter name must be one the runner actually maps, not an aspiration.
    const runner = readFileSync('lib/operational-recovery-runner.ts', 'utf8');
    assert.ok(runner.includes(`'${adapter}'`), `${adapter} must exist in existingRecoveryAdapter`);
  });
}

// ── I/J/K/L/M/N. Contracts, budgets, locks, crashes ────────────────────────

test('I: an unknown contract goes to human review before anything else is considered', () => {
  const resolved = resolveRecoveryDisposition({ sourceId: 'KMA_VILAGE_FCST', failureClass: 'STALE',
    contractVersion: 'UNKNOWN_CONTRACT', attemptsUsed: 0, inFlight: false, alreadyRecovered: false, centralGateAllowed: true });
  assert.equal(resolved.finalDisposition, 'BLOCKED_UNKNOWN_CONTRACT');
  assert.equal(resolved.recommendedAction, 'NONE');
});

test('J: an exhausted budget blocks rather than quietly stopping', async () => {
  const rule = RECOVERY_RULES.find((entry) => entry.failureClass === 'STALE');
  const resolved = resolveRecoveryDisposition({ sourceId: 'KMA_VILAGE_FCST', failureClass: 'STALE',
    contractVersion: 'weather-v1', attemptsUsed: rule.maxAttempts, inFlight: false, alreadyRecovered: false, centralGateAllowed: true });
  assert.equal(resolved.finalDisposition, 'BLOCKED_BUDGET');
  assert.equal(resolved.recommendedAction, 'NONE');
  // And the database enforces the same ceiling, so the plan cannot promise an admission it would refuse.
  const { memory } = setup();
  await memory.recordEvent(failure());
  let admitted = 0;
  for (let i = 0; i < rule.maxAttempts + 2; i += 1) {
    const result = await memory.admit(request(`r${i}`, { scheduledSlot: `0${i}:00` }));
    if (result.admitted) { admitted += 1; await memory.finish(result.attemptId, later, { dataValid: false, storageValid: null, publicValid: null }); }
  }
  assert.equal(admitted, rule.maxAttempts);
});

test('K: a persistent duplicate is refused and costs no provider call', async () => {
  const { memory } = setup();
  await memory.recordEvent(failure());
  const [counter, executor] = countingExecutor();
  await executeControlledRecovery(memory, request(), executor, { activation: OPEN_GATE });
  await executeControlledRecovery(memory, request('again'), executor, { activation: OPEN_GATE });
  assert.equal(counter.calls, 1, 'the same execution id may reach the provider exactly once');
});

test('L: two concurrent clients cannot both be admitted for the same source and job', async () => {
  const { db, memory } = setup();
  await memory.recordEvent(failure());
  const other = new OperationalMemory(db);
  const results = await Promise.all([memory.admit(request('a')), other.admit(request('b', { scheduledSlot: '15:00' }))]);
  assert.equal(results.filter((row) => row.admitted).length, 1);
});

test('M: a crashed attempt holds its lock permanently, whatever the clock says', async () => {
  const { memory } = setup();
  await memory.recordEvent(failure());
  // Admitted, then the process dies: completed_at stays NULL forever.
  assert.equal((await memory.admit(request())).admitted, true);
  for (const nowIso of ['2026-09-14T06:00:00Z', '2026-09-20T06:00:00Z', '2027-09-13T06:00:00Z']) {
    const retry = await memory.admit(request('later', { scheduledSlot: '07:00', at: nowIso }));
    assert.equal(retry.admitted, false, `time travel to ${nowIso} must not release the lock`);
  }
  // And no provider call can slip through the executor path either.
  const [counter, executor] = countingExecutor();
  await executeControlledRecovery(memory, request('third', { scheduledSlot: '08:00', at: '2027-09-13T06:00:00Z' }),
    executor, { activation: OPEN_GATE });
  assert.equal(counter.calls, 0);
});

test('N: an orphaned controlled attempt is reported for human review, never auto-unlocked', async () => {
  const { memory } = setup();
  await memory.recordEvent(failure());
  await memory.admit(request());
  const stuck = await memory.stuckControlledAttempts('2026-09-14T06:00:00Z');
  assert.equal(stuck.length, 1);
  assert.equal(stuck[0].sourceId, parts.sourceId);
  assert.equal(stuck[0].logicalJob, parts.logicalJob);
  assert.equal(stuck[0].disposition, 'HUMAN_REVIEW_REQUIRED');
  assert.ok(stuck[0].ageMs >= 86_000_000, 'the age a reviewer needs must be reported');
  assert.ok(stuck[0].executionId.includes(parts.sourceId));
  // Still locked afterwards: reporting is not releasing.
  assert.equal((await memory.admit(request('after', { scheduledSlot: '09:00' }))).admitted, false);
  // A young attempt is in flight but not yet "stuck".
  assert.deepEqual(await memory.stuckControlledAttempts(later), []);
  assert.equal((await memory.inFlightControlled()).length, 1);
});

// ── O. Public verification (§10) ───────────────────────────────────────────

test('O: a source that cannot be proven fixed is never controlled-eligible', () => {
  for (const entry of SOURCE_RECOVERY_CAPABILITIES) {
    if (entry.publicVerification === 'UNKNOWN') assert.equal(entry.controlledRecoveryEligible, false, entry.sourceId);
  }
  // And the disposition says so explicitly for an unclassified id.
  const resolved = resolveRecoveryDisposition({ sourceId: 'SOME_FUTURE_SOURCE', failureClass: 'STALE',
    contractVersion: 'v1', attemptsUsed: 0, inFlight: false, alreadyRecovered: false, centralGateAllowed: true });
  assert.equal(resolved.finalDisposition, 'BLOCKED_UNSUPPORTED_SOURCE');
});

// ── P/Q/R/S. Shadow policy truth (§16, §17, §18) ───────────────────────────

test('P: the current action is read from the rule table, not restated', () => {
  for (const rule of RECOVERY_RULES) assert.equal(currentActionFor(rule.failureClass), rule.action);
  // The specific bug: STALE's real current action is NOT REDISPATCH_SAME_WORKFLOW.
  assert.equal(currentActionFor('STALE'), 'REQUEST_ONLY_MISSING_COVERAGE');
  assert.equal(currentActionFor('PARTIAL_DATA'), 'REQUEST_ONLY_MISSING_COVERAGE');
  assert.equal(currentActionFor('MISSED_RUN'), 'REDISPATCH_SAME_WORKFLOW');
  assert.equal(currentActionFor('INVALID_PAYLOAD'), 'NONE');
  // health.ts must no longer carry the hardcoded pair it used to pass.
  const health = readFileSync('scripts/health.ts', 'utf8');
  assert.ok(!/'REDISPATCH_SAME_WORKFLOW','REQUEST_ONLY_MISSING_COVERAGE'/.test(health),
    'the hardcoded current/candidate pair must be gone');
});

test('Q: a candidate the source cannot perform is never evaluated', () => {
  const supported = (sourceId) => capabilityFor(sourceId).supportedActions;
  // KMA's only supported action IS the one already in force for STALE, so nothing to shadow.
  assert.deepEqual(shadowCandidatesFor('KMA_VILAGE_FCST', 'STALE', supported), []);
  // A source with no adapter offers no candidate at all.
  assert.deepEqual(shadowCandidatesFor('INCHEON_FLIGHT_DETAIL', 'STALE', supported), []);
  assert.deepEqual(shadowCandidatesFor('SOME_FUTURE_SOURCE', 'STALE', supported), []);
  // And an action outside the pre-approved vocabulary is rejected by the evaluator itself.
  assert.equal(evaluateShadowPolicy([], { sourceId: 'KMA_VILAGE_FCST', failureClass: 'STALE',
    contractVersion: 'weather-v1', logicalJob: 'collect-weather.yml' }, 'REQUEST_ONLY_MISSING_COVERAGE', 'SWAP_PROVIDER').state,
    'REJECT_CANDIDATE');
});

test('R/S: automatic policy promotion and automatic code change stay false', () => {
  const scorecard = readFileSync('lib/recovery-scorecard.ts', 'utf8');
  assert.ok(scorecard.includes('automaticPolicyChangeAllowed:false as const'));
  const result = evaluateShadowPolicy([], { sourceId: 'KMA_VILAGE_FCST', failureClass: 'STALE',
    contractVersion: 'weather-v1', logicalJob: 'collect-weather.yml' }, 'REQUEST_ONLY_MISSING_COVERAGE', 'REDISPATCH_SAME_WORKFLOW');
  assert.equal(result.automaticPolicyChangeAllowed, false);
  // No reachable state promotes by itself.
  assert.notEqual(result.state, 'PROMOTED');
});

// ── T/U. Runtime enablement truth (§19, §20) ───────────────────────────────

const gated = readWorkflowFacts('collect-production.yml', readFileSync('.github/workflows/collect-production.yml', 'utf8'));

test('T: with no supplied variable, a gated schedule stays UNKNOWN offline', () => {
  assert.equal(classifyRuntimeEnablement(gated), 'RUNTIME_ENABLE_STATE_UNKNOWN');
  assert.equal(classifyRuntimeEnablement(gated, undefined), 'RUNTIME_ENABLE_STATE_UNKNOWN');
  // An unrelated variable is not an answer about the gate.
  assert.equal(classifyRuntimeEnablement(gated, { SOMETHING_ELSE: 'true' }), 'RUNTIME_ENABLE_STATE_UNKNOWN');
});

test('U+: some workflow actually SUPPLIES the variable, or the mechanism is decorative', () => {
  // The gap this closes. `classifyRuntimeEnablement` accepted `knownVariables`
  // from the day the scheduler graph was built, and scripts/health.ts read
  // RPK_KNOWN_ENABLE_PRODUCTION_COLLECTOR from 2026-09-14 — but no workflow
  // ever set it. So every one of the ten variable-gated schedules reported
  // RUNTIME_ENABLE_STATE_UNKNOWN for ever, and the harness's own P1 list was
  // ten copies of that single unwired line. A collector group switched off
  // would have looked exactly like the normal state.
  //
  // A mechanism nobody feeds is not a safeguard, so the wiring is asserted
  // rather than the mechanism alone.
  const suppliers = readdirSync('.github/workflows')
    .filter((file) => /\.ya?ml$/.test(file))
    .filter((file) => {
      const yaml = readFileSync(join('.github/workflows', file), 'utf8');
      return yaml.includes('RPK_KNOWN_ENABLE_PRODUCTION_COLLECTOR:')
        && /RPK_KNOWN_ENABLE_PRODUCTION_COLLECTOR:\s*\$\{\{\s*vars\.ENABLE_PRODUCTION_COLLECTOR\s*\}\}/.test(yaml);
    });
  assert.ok(suppliers.length > 0, 'at least one workflow must hand the gating Variable to the harness');
  // And each supplier must be a workflow that actually runs health, or it is
  // setting an environment variable nothing reads.
  for (const file of suppliers) {
    const yaml = readFileSync(join('.github/workflows', file), 'utf8');
    assert.match(yaml, /npm run health/, `${file} sets the variable but never runs health`);
  }
  // Only this one name is forwarded: repository Variables are not harvested
  // wholesale, and no secret may ride along.
  for (const file of suppliers) {
    const yaml = readFileSync(join('.github/workflows', file), 'utf8');
    const forwarded = [...yaml.matchAll(/RPK_KNOWN_([A-Z0-9_]+):/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(forwarded)], ['ENABLE_PRODUCTION_COLLECTOR'], file);
  }
});

test('U: a genuinely known variable value is classified, in both directions', () => {
  assert.equal(classifyRuntimeEnablement(gated, { ENABLE_PRODUCTION_COLLECTOR: 'true' }), 'RUNTIME_ENABLED');
  assert.equal(classifyRuntimeEnablement(gated, { ENABLE_PRODUCTION_COLLECTOR: 'false' }), 'RUNTIME_DISABLED');
  // health.ts reads exactly one named variable and only accepts true/false.
  const health = readFileSync('scripts/health.ts', 'utf8');
  assert.ok(health.includes('RPK_KNOWN_ENABLE_PRODUCTION_COLLECTOR'));
  assert.ok(/value === "true" \|\| value === "false"/.test(health),
    'anything other than an explicit true/false must stay UNKNOWN');
});

// ── V. Trigger evidence may not overclaim (§21, §22) ───────────────────────

test('V: a workflow_dispatch is never recorded as proof the Worker Cron fired', () => {
  assert.equal(classifyTriggerEvidence({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch' }),
    'GITHUB_WORKFLOW_DISPATCH_ORIGIN_UNVERIFIED');
  assert.equal(classifyTriggerEvidence({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'schedule' }), 'GITHUB_SCHEDULE');
  assert.equal(classifyTriggerEvidence({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_run' }), 'GITHUB_WORKFLOW_RUN');
  assert.equal(classifyTriggerEvidence({}), 'UNKNOWN');
  assert.equal(classifyTriggerEvidence({ GITHUB_ACTIONS: 'true' }, 'MANUAL_INSPECTION'), 'MANUAL_INSPECTION');
  // No classification whatsoever claims an independent platform observed it.
  for (const evidence of ['GITHUB_SCHEDULE', 'GITHUB_WORKFLOW_DISPATCH_ORIGIN_UNVERIFIED', 'GITHUB_WORKFLOW_RUN', 'MANUAL_INSPECTION', 'UNKNOWN']) {
    const proof = provesIndependentPlatform(evidence);
    assert.equal(proof.independent, false, evidence);
    assert.ok(proof.reason.length > 20, `${evidence} must explain why not`);
  }
  // The watchdog coverage gap therefore stays open rather than turning green.
  assert.ok(!/GITHUB_WORKER_CRON/.test(code('lib/trigger-evidence.ts')),
    'no classification may assert a Worker Cron origin GitHub cannot confirm');
});

// ── Orchestration plan (§11, §12) ──────────────────────────────────────────

const incident = (overrides = {}) => ({
  incidentId: 'f1', fingerprint: 'f1', sourceId: 'KMA_VILAGE_FCST', failureClass: 'STALE',
  contractVersion: 'weather-v1', logicalJob: 'collect-weather.yml', firstSeen: at, lastSeen: at,
  occurrenceCount: 2, affectedRuns: ['run1'], evidence: ['connect timeout'], severity: 'P2',
  currentState: 'OPEN', lastGoodAt: null, recoveryAttempts: 0, lastRecoveryResult: null, resolvedAt: null,
  ...overrides,
});
const planInput = (overrides = {}) => ({
  nowIso: '2026-09-13T06:00:00Z', incidents: [incident()], attempts: [], inFlight: [], stuck: [],
  activation: centralRecoveryActivation('2026-09-13T06:00:00Z', {}), ...overrides,
});

test('the plan makes no provider call, no write, no deploy and no dispatch', () => {
  const plan = buildOrchestrationPlan(planInput());
  assert.equal(plan.providerCalls, 0);
  assert.equal(plan.d1Writes, 0);
  assert.equal(plan.deploys, 0);
  assert.equal(plan.dispatches, 0);
  assert.equal(plan.centralRecovery.executionGate, 'LOCKED');
});

test('the plan is byte-stable for the same input', () => {
  const first = JSON.stringify(buildOrchestrationPlan(planInput()));
  const second = JSON.stringify(buildOrchestrationPlan(planInput()));
  assert.equal(first, second);
  // Input order must not change the output either.
  const a = incident({ fingerprint: 'aaa' }), b = incident({ fingerprint: 'bbb' });
  assert.equal(JSON.stringify(buildOrchestrationPlan(planInput({ incidents: [a, b] }))),
    JSON.stringify(buildOrchestrationPlan(planInput({ incidents: [b, a] }))));
});

test('the plan reports every field a reviewer needs, per incident', () => {
  const [entry] = buildOrchestrationPlan(planInput()).entries;
  for (const key of ['fingerprint', 'sourceId', 'failureClass', 'contractVersion', 'logicalJob', 'currentState',
    'occurrenceCount', 'lastSeen', 'lastGoodAt', 'ruleDecision', 'sourceCapability', 'attemptsUsed', 'maxAttempts',
    'inFlightAttempt', 'recommendedAction', 'finalDisposition', 'blockReason']) {
    assert.ok(key in entry, `the plan must report ${key}`);
  }
  assert.ok(entry.blockReason.length > 10);
  assert.ok('publicVerification' in entry.sourceCapability);
  assert.ok('providerBudgetPolicy' in entry.sourceCapability);
});

test('while dormant, an otherwise-eligible incident reports the gate as the blocker', () => {
  const [entry] = buildOrchestrationPlan(planInput()).entries;
  assert.equal(entry.finalDisposition, 'BLOCKED_CENTRAL_RECOVERY_DORMANT');
  assert.equal(entry.recommendedAction, 'NONE');
  // With the gate open the same incident would act — which is what makes the plan useful.
  const open = buildOrchestrationPlan(planInput({ activation: OPEN_GATE }));
  assert.equal(open.entries[0].finalDisposition, 'WOULD_CONTROLLED_RECOVER');
  assert.equal(open.entries[0].recommendedAction, 'REQUEST_ONLY_MISSING_COVERAGE');
});

test('the plan reflects in-flight locks, resolved incidents and spent budgets', () => {
  const inFlight = buildOrchestrationPlan(planInput({ activation: OPEN_GATE,
    inFlight: [{ sourceId: 'KMA_VILAGE_FCST', logicalJob: 'collect-weather.yml' }] }));
  assert.equal(inFlight.entries[0].finalDisposition, 'BLOCKED_IN_FLIGHT');
  assert.equal(inFlight.entries[0].inFlightAttempt, true);

  const resolved = buildOrchestrationPlan(planInput({ activation: OPEN_GATE,
    incidents: [incident({ currentState: 'RESOLVED' })] }));
  assert.equal(resolved.entries[0].finalDisposition, 'ALREADY_RECOVERED');

  const attempt = (n) => ({ attemptId: `a${n}`, executionId: `e${n}`, fingerprint: 'f1', sourceId: 'KMA_VILAGE_FCST',
    failureClass: 'STALE', contractVersion: 'weather-v1', logicalJob: 'collect-weather.yml',
    targetDate: kstDate('2026-09-13T06:00:00Z'), scheduledSlot: '06:00', operation: 'REQUEST_ONLY_MISSING_COVERAGE',
    attemptNumber: n, startedAt: at, completedAt: later, outcome: 'RECOVERY_FAILED', verified: false,
    dataValid: false, storageValid: null, publicValid: null, providerRequests: 1, rowsRead: null, rowsWritten: null,
    durationMs: 1000, escalationRequired: true, mode: 'CONTROLLED' });
  const spent = buildOrchestrationPlan(planInput({ activation: OPEN_GATE, attempts: [attempt(1), attempt(2), attempt(3)] }));
  assert.equal(spent.entries[0].attemptsUsed, 3);
  assert.equal(spent.entries[0].finalDisposition, 'BLOCKED_BUDGET');
});

test('the plan surfaces stuck attempts and full capability coverage', () => {
  const plan = buildOrchestrationPlan(planInput({
    stuck: [{ attemptId: 'x', sourceId: 'KMA_VILAGE_FCST', logicalJob: 'collect-weather.yml',
      executionId: 'e', startedAt: at, ageMs: 90_000_000 }],
  }));
  assert.equal(plan.stuckControlledAttempts.length, 1);
  assert.equal(plan.stuckControlledAttempts[0].disposition, 'HUMAN_REVIEW_REQUIRED');
  assert.equal(plan.capabilityCoverage.productionSources, PRODUCTION_SOURCE_IDS.length);
  assert.equal(plan.capabilityCoverage.classified, PRODUCTION_SOURCE_IDS.length);
  assert.deepEqual(plan.capabilityCoverage.unclassified, []);
  assert.ok(plan.capabilityCoverage.observeOnly.includes('KASI_PUBLIC_HOLIDAYS'));
  assert.deepEqual(plan.capabilityCoverage.controlledEligible, ['INCHEON_PASSENGER_FORECAST', 'KMA_VILAGE_FCST']);
  assert.ok(plan.capabilityCoverage.nextSlotOnly.includes('INCHEON_DEPARTURE_CONGESTION'));
  assert.ok(plan.capabilityCoverage.humanReviewOnly.includes('INCHEON_FLIGHT_DETAIL'));
});

test('the real-world failure types resolve the way the direction requires', () => {
  const cases = [
    // A4 network timeout: the next 15-minute cycle is the repair.
    ['INCHEON_DEPARTURE_CONGESTION', 'EXECUTION_ERROR', 'congestion-v1', 'WAIT_FOR_NEXT_SCHEDULED_SLOT'],
    // PUBLICATION_MISMATCH is a query/cache defect, never a reason to call the provider.
    ['KMA_VILAGE_FCST', 'PUBLICATION_MISMATCH', 'weather-v1', 'HUMAN_REVIEW_REQUIRED'],
    // PERSISTENCE_FAILED must not trigger a collection retry.
    ['KMA_VILAGE_FCST', 'PERSISTENCE_FAILED', 'weather-v1', 'HUMAN_REVIEW_REQUIRED'],
    ['KMA_VILAGE_FCST', 'INVALID_PAYLOAD', 'weather-v1', 'HUMAN_REVIEW_REQUIRED'],
    ['KMA_VILAGE_FCST', 'STALE', 'UNKNOWN_CONTRACT', 'BLOCKED_UNKNOWN_CONTRACT'],
    // A5 partial coverage with the gate open is the one case that would act.
    ['INCHEON_PASSENGER_FORECAST', 'PARTIAL_DATA', 'forecast-v1', 'WOULD_CONTROLLED_RECOVER'],
  ];
  for (const [sourceId, failureClass, contractVersion, expected] of cases) {
    assert.equal(resolveRecoveryDisposition({ sourceId, failureClass, contractVersion, attemptsUsed: 0,
      inFlight: false, alreadyRecovered: false, centralGateAllowed: true }).finalDisposition, expected,
      `${sourceId} / ${failureClass}`);
  }
});

// ── W/X/Y. Whole-repository safety counts (§30, §31, §32) ──────────────────

const files = repositoryFiles('.');

test('W: the activation test seam is never used outside tests/', () => {
  const offenders = files.filter((path) => !path.startsWith('tests/') && !path.startsWith('./tests/'))
    .filter((path) => /activation\s*:\s*OPEN_GATE|activation:\s*resolveCentralRecoveryActivation/.test(code(path)));
  assert.deepEqual(offenders, [], 'production code must never supply its own activation answer');
});

test('W: nothing in production calls executeControlledRecovery', () => {
  const callers = files
    .filter((path) => !/^\.?\/?tests\//.test(path) && !path.endsWith('operational-recovery-runner.ts'))
    .filter((path) => /executeControlledRecovery\s*\(/.test(code(path)));
  assert.deepEqual(callers, [], 'a production caller would need its own owner-approved review');
});

test('X: this phase adds no recurring production schedule', () => {
  // The five Worker crons plus the existing Actions crons, unchanged. The plan
  // mode rides the manual-only Operational Memory Inspection workflow.
  const memoryWorkflow = readFileSync('.github/workflows/operational-memory.yml', 'utf8');
  assert.ok(memoryWorkflow.includes('workflow_dispatch'));
  assert.ok(!/^\s*schedule:/m.test(memoryWorkflow), 'the plan workflow must stay manual');
  assert.ok(!/^\s*workflow_run:/m.test(memoryWorkflow), 'the plan workflow must not chain off another run');
  assert.ok(memoryWorkflow.includes('plan'), 'plan must be an available mode');
  // No provider secret reaches it; only the D1 read credential.
  const secrets = [...memoryWorkflow.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(secrets)], ['CLOUDFLARE_D1_WRITE_TOKEN']);
});

test('Y: the Phase 3 modules make no network call of their own', () => {
  for (const path of ['lib/central-recovery-gate.ts', 'lib/recovery-capability.ts', 'lib/orchestration-plan.ts', 'lib/trigger-evidence.ts']) {
    const source = code(path);
    for (const forbidden of ['fetch(', 'XMLHttpRequest', 'require(', 'child_process']) {
      assert.ok(!source.includes(forbidden), `${path} must not contain ${forbidden}`);
    }
    assert.ok(!/\bINSERT\b|\bUPDATE\b|\bDELETE\b/i.test(source), `${path} must not contain a write statement`);
  }
});

// ── One-way quota safety (§25) ─────────────────────────────────────────────

test('an observed lower bound can prove EMERGENCY but can never prove NORMAL', () => {
  const at = (used) => observeQuota({ resource: 'cloudflare_d1_rows_read', used, limit: 100,
    basis: 'OBSERVED_LOWER_BOUND', measurementSource: 'operational_usage_daily' });
  // High enough to be certain: the real figure can only be larger.
  assert.equal(at(95).level, 'EMERGENCY');
  assert.equal(at(99).level, 'EMERGENCY');
  assert.equal(at(120).level, 'EMERGENCY');
  assert.equal(at(95).observeOnly, false);
  // Below that, nothing is provable and NORMAL must not be claimed.
  for (const used of [0, 20, 69, 70, 84, 85, 94]) {
    const verdict = at(used);
    assert.equal(verdict.level, 'UNKNOWN', `${used}% lower bound must stay UNKNOWN`);
    assert.equal(verdict.observeOnly, true);
    assert.equal(verdict.decision, null, 'an unprovable level may not gate anything');
    assert.notEqual(verdict.level, 'NORMAL');
  }
  // The observed percentage is still reported, so the fact is not lost.
  assert.equal(at(20).percent, 20);
  // And a measurement that does not exist is still UNKNOWN, never 0%.
  assert.equal(observeQuota({ resource: 'x', used: null, limit: 100, basis: 'OBSERVED_LOWER_BOUND',
    measurementSource: 'operational_usage_daily' }).percent, null);
});

test('the daily counters describe themselves as a lower bound, not as account usage', () => {
  const [row] = observedUsage([{ day: '2026-09-13', source_id: 'KMA_VILAGE_FCST', executions: 1,
    provider_requests: 2, provider_measured: 1, rows_read: 10, rows_written: 2 }]);
  assert.equal(row.basis, 'OBSERVED_LOWER_BOUND');
  assert.equal(row.accountUsage, 'UNKNOWN');
  assert.equal(row.quotaPercent, null, 'a lower bound may not be rendered as a quota percentage');
  assert.equal(row.providerRequests.upperBound, null);
});
