/** Direct reusable-job transport. No HTTP dispatch, scheduler or permission grant. */
import type { CentralRecoveryActivation } from './central-recovery-gate';
import { ABORTED_BEFORE_COLLECTION, MAX_ABORTED_BEFORE_COLLECTION_PER_DAY, type OperationalMemory, type AttemptRequest } from './operational-memory';
import type { ProductionSourceResult } from './production-runner';
import type { RecoveryVerification } from './recovery-orchestration';
import type { airportTodayCoverage } from './airport-today-coverage';
import { kstDayOf, isValidKstDay } from './kst';
import { A1_SOURCE, A1_RECOVERY_WORKFLOW, airportMidnightRecoveryActivation,
  planAirportMidnightRecovery, type AirportRunSnapshot } from './airport-midnight-recovery';

type Coverage = ReturnType<typeof airportTodayCoverage>;
export const A1_DIRECT_CALLER = 'airport_midnight_recovery';
export interface AirportMidnightCandidateDependencies {
  memory: OperationalMemory;
  env?: Record<string, string | undefined>;
  readCoverage: (nowIso: string) => Promise<Coverage>;
  readSnapshot: (nowIso: string) => Promise<AirportRunSnapshot>;
  sourceBlocked: () => Promise<boolean>;
  budgetAvailable: (nowIso: string) => Promise<boolean>;
}
type TestOptions = { activation?: CentralRecoveryActivation };
/** Longer than the 20-minute collector job, so a live child is never mistaken for an abandoned one. */
const ABANDONED_AFTER_MS = 30 * 60_000;
/** A failure's own words, bounded and without credentials, so logs name what broke. */
export function failureText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/(Bearer|token|key)[=:\s]+\S+/gi, '$1 ***').replace(/\s+/g, ' ').slice(0, 200) || 'unknown';
}
/** Open A1 direct attempts that never wrote their pre-collector receipt and are long past their job. */
async function abandonedWithoutCollection(memory: OperationalMemory, nowIso: string): Promise<string[]> {
  const before = new Date(Date.parse(nowIso) - ABANDONED_AFTER_MS).toISOString();
  return (await memory.openAttemptsWithoutReceipt(A1_SOURCE, A1_RECOVERY_WORKFLOW, before))
    .filter(id => id.includes('|a1-direct-'));
}

/**
 * Completes, as ABORTED_BEFORE_COLLECTION, every A1 direct attempt that has no
 * collector receipt and started more than 30 minutes ago: exactly the attempts
 * the next direct window would release before admitting. Run on demand
 * (operational-memory mode release_abandoned) so a lock the evidence shows was
 * never used does not sit as HUMAN_REVIEW_REQUIRED until the next missing slot.
 * An attempt with a receipt is never touched; nothing is deleted.
 */
export async function releaseAbandonedA1Attempts(memory: OperationalMemory, nowIso: string): Promise<string[]> {
  const released = await abandonedWithoutCollection(memory, nowIso);
  for (const attemptId of released)
    await memory.abortBeforeCollection(attemptId, nowIso, 'no collector receipt; released on demand after the job had long finished');
  return released;
}

/** Read-only candidate, never an admission or authority to run the collector. */
export async function airportMidnightCandidate(deps: AirportMidnightCandidateDependencies, nowIso: string,
  options: TestOptions = {}) {
  const gate = options.activation ?? airportMidnightRecoveryActivation(nowIso, deps.env);
  const closed = (reason: string) => ({ eligible: false, targetDate: '', reason });
  if (!gate.allowed) return closed('CENTRAL_RECOVERY_DORMANT');
  try {
    const day = kstDayOf(nowIso);
    // An attempt that provably never reached the collector is released, not spent.
    const abandoned = await abandonedWithoutCollection(deps.memory, nowIso);
    const today = (await deps.memory.attempts(A1_SOURCE, day)).filter(attempt =>
      attempt.mode === 'CONTROLLED' && attempt.logicalJob === A1_RECOVERY_WORKFLOW && attempt.targetDate === day);
    if (today.some(attempt => attempt.outcome !== ABORTED_BEFORE_COLLECTION && !abandoned.includes(attempt.attemptId)))
      return closed('DAILY_ATTEMPT_ALREADY_SPENT');
    if (today.filter(attempt => attempt.outcome === ABORTED_BEFORE_COLLECTION || abandoned.includes(attempt.attemptId)).length
      >= MAX_ABORTED_BEFORE_COLLECTION_PER_DAY) return closed('DAILY_RETRY_LIMIT_REACHED');
    if ((await deps.memory.inFlightControlled()).filter(attempt =>
      attempt.sourceId === A1_SOURCE && attempt.logicalJob === A1_RECOVERY_WORKFLOW).length > abandoned.length) return closed('INFLIGHT_LOCK');
    const coverage = await deps.readCoverage(nowIso);
    if (coverage.state === 'CURRENT') return closed('ALREADY_CURRENT');
    const plan = planAirportMidnightRecovery(nowIso, coverage, await deps.readSnapshot(nowIso), await deps.sourceBlocked());
    if (!plan.eligible || !plan.targetDate) return closed(plan.reason);
    if (!await deps.budgetAvailable(nowIso)) return closed('REQUEST_BUDGET_UNAVAILABLE');
    return { eligible: true, targetDate: plan.targetDate, reason: plan.reason };
  } catch (error) { return { ...closed('READ_UNAVAILABLE'), error: failureText(error) }; }
}

/** Fixed caller/source/date/budget tuple; typed inputs alone never open the gate. */
export function airportDirectContext(env: Record<string, string | undefined>, nowIso: string) {
  if (!Number.isFinite(Date.parse(nowIso))) return null;
  const targetDate = env.RPK_A1_EXPECTED_TARGET_DATE ?? '';
  if (!isValidKstDay(targetDate) || targetDate !== kstDayOf(nowIso)) return null;
  if (env.ENABLE_PRODUCTION_COLLECTOR !== 'true' || env.RPK_A1_MIDNIGHT_RECOVERY !== 'true' ||
      env.RPK_A1_MIDNIGHT_CALLER !== A1_DIRECT_CALLER || env.RPK_PRODUCTION_SOURCES !== 'airport_recent' ||
      env.RPK_A1_MAX_REQUESTS !== '125' || env.RPK_A1_RESCAN_TODAY !== 'false' || env.RPK_OPERATIONAL_ATTEMPT !== '1' ||
      env.GITHUB_REPOSITORY !== 'rudvh1016-gif/retailpulse-korea' || env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_WORKFLOW !== 'Collect Realtime Signals' ||
      env.GITHUB_JOB !== 'collect' || !/^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? '') ||
      !/^[1-9]\d*$/.test(env.GITHUB_RUN_ATTEMPT ?? '') || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')) return null;
  return { targetDate, runId: `a1-direct-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}-${A1_DIRECT_CALLER}-collect-${env.GITHUB_SHA}` };
}

function measuredRequests(result: ProductionSourceResult): number | null {
  if (result.status === 'SKIPPED_ALREADY_COMPLETE_TODAY')
    return result.providerRequests === undefined || result.providerRequests === 0 ? 0 : null;
  const detail = /(?:^|; )requests (\d+)(?:;|$)/.exec(result.detail ?? '');
  const value = result.providerRequests ?? (detail ? Number(detail[1]) : null);
  return value !== null && Number.isSafeInteger(value) && value >= 0 && value <= 125 ? value : null;
}
export interface AirportMidnightDirectDependencies extends AirportMidnightCandidateDependencies {
  env: Record<string, string | undefined>;
  now: () => string;
  collectA1: () => Promise<ProductionSourceResult>;
  verifyToday: (targetDate: string, nowIso: string) => Promise<RecoveryVerification>;
}

/** Admission occurs inside the actual reusable collector, after its concurrency wait.
 * The activation override is a test seam; production never supplies it. */
export async function executeAirportMidnightDirect(deps: AirportMidnightDirectDependencies, options: TestOptions = {}) {
  const startedAt = deps.now();
  const gate = options.activation ?? airportMidnightRecoveryActivation(startedAt, deps.env);
  if (!gate.allowed) return { state: 'CENTRAL_RECOVERY_DORMANT', providerRequests: 0, writes: 0 };
  const context = airportDirectContext(deps.env, startedAt);
  if (!context) return { state: 'DIRECT_CONTEXT_UNVERIFIED', providerRequests: 0, writes: 0 };
  // Which step failed, and whether this process ever handed control to the collector.
  let stage = 'candidate', admittedId: string | null = null, collectorInvoked = false;
  try {
    const candidate = await airportMidnightCandidate(deps, startedAt, options);
    if (!candidate.eligible || candidate.targetDate !== context.targetDate)
      return { state: candidate.reason, providerRequests: 0, writes: 0,
        ...('error' in candidate ? { error: candidate.error } : {}) };
    stage = 'release_abandoned';
    for (const attemptId of await abandonedWithoutCollection(deps.memory, startedAt))
      await deps.memory.abortBeforeCollection(attemptId, startedAt, 'no collector receipt; job long finished');
    stage = 'admit';
    // Same identity as the prepared HTTP transport, never a new quota/lock namespace.
    const request: AttemptRequest = { parts: { sourceId: A1_SOURCE, failureClass: 'MISSED_RUN',
      contractVersion: 'airport-v1', logicalJob: A1_RECOVERY_WORKFLOW }, targetDate: context.targetDate,
      scheduledSlot: '00:07', operation: 'REDISPATCH_SAME_WORKFLOW', runId: context.runId, at: startedAt };
    const admission = await deps.memory.admit(request, { maxAttempts: 1 });
    if (!admission.admitted) return { state: 'DAILY_OR_INFLIGHT_LOCK', providerRequests: 0 };
    admittedId = admission.attemptId;
    stage = 'recheck_before_collection';
    const readAt = deps.now();
    const coverageBefore = await deps.readCoverage(readAt), snapshotBefore = await deps.readSnapshot(readAt);
    const blocked = await deps.sourceBlocked(), budget = await deps.budgetAvailable(readAt);
    const checkedAt = deps.now();
    const checkedGate = options.activation ?? airportMidnightRecoveryActivation(checkedAt, deps.env);
    const checkedContext = airportDirectContext(deps.env, checkedAt);
    const plan = planAirportMidnightRecovery(checkedAt, coverageBefore, snapshotBefore, blocked);
    if (!checkedGate.allowed || checkedContext?.runId !== context.runId ||
        checkedContext.targetDate !== context.targetDate || !plan.eligible || !budget) {
      // Proven no collector/provider was invoked, so this does not spend today's attempt.
      stage = 'abort_before_collection';
      await deps.memory.abortBeforeCollection(admission.attemptId, checkedAt, 'recheck no longer eligible');
      return { state: 'ABORTED_BEFORE_COLLECTION', providerRequests: 0 };
    }
    stage = 'receipt';
    await deps.memory.recordEvent({ parts: request.parts, kind: 'RECOVERY_STARTED',
      runId: context.runId + '-receipt', at: checkedAt,
      evidence: `attemptId=${admission.attemptId}; directChild=${context.runId}; targetDate=${context.targetDate}` });
    let result: ProductionSourceResult;
    stage = 'collector';
    collectorInvoked = true;
    try { result = await deps.collectA1(); }
    catch { return { state: 'HUMAN_REVIEW_UNCERTAIN_CHILD', child: context.runId }; }
    // This in-process result belongs to this exact A1 child, never the parent badge.
    if (result.source !== 'airport_recent') return { state: 'HUMAN_REVIEW_CHILD_MISMATCH', child: context.runId };
    const providerRequests = measuredRequests(result);
    if (result.executionUncertain) return { state: 'HUMAN_REVIEW_UNCERTAIN_CHILD', child: context.runId, providerRequests };
    if (providerRequests === null)
      return { state: 'HUMAN_REVIEW_UNMEASURED_CHILD', child: context.runId };
    const ownSuccess = ['SUCCESS', 'SKIPPED_ALREADY_COMPLETE_TODAY'].includes(result.status);
    const knownFailure = ['ERROR', 'NEEDS_KEY', 'NOT_YET_PUBLISHED', 'SKIPPED_REQUEST_BUDGET',
      'SKIPPED_RECOVERY_DATE_MISMATCH', 'SKIPPED_RECOVERY_SOURCE_PROTECTED'].includes(result.status);
    if (!ownSuccess && !knownFailure) return { state: 'HUMAN_REVIEW_CHILD_STATUS_UNVERIFIED', child: context.runId, providerRequests };
    const completedAt = deps.now();
    const completedContext = airportDirectContext(deps.env, completedAt);
    if (completedContext?.runId !== context.runId || completedContext.targetDate !== context.targetDate)
      return { state: 'HUMAN_REVIEW_CONTEXT_CHANGED', child: context.runId };
    if (knownFailure) {
      // The bounded child returned a measured, definite result. Complete this
      // failed attempt without requiring unrelated public reads. Today remains
      // spent; unknown execution/persistence above retains the cross-day lock.
      await deps.memory.finish(admission.attemptId, completedAt,
        { dataValid: false, storageValid: null, publicValid: null }, { providerRequests });
      return { state: 'HUMAN_REVIEW_RECOVERY_UNVERIFIED', child: context.runId, providerRequests };
    }
    stage = 'verify';
    const coverage = await deps.readCoverage(completedAt);
    const stored = coverage.today === context.targetDate && coverage.state === 'CURRENT';
    const evidence = await deps.verifyToday(context.targetDate, completedAt);
    const verification = { dataValid: ownSuccess && stored && evidence.dataValid === true,
      storageValid: stored && evidence.storageValid === true, publicValid: evidence.publicValid };
    await deps.memory.finish(admission.attemptId, completedAt, verification, { providerRequests });
    const recovered = verification.dataValid && verification.storageValid && verification.publicValid === true;
    return { state: recovered ? (result.status === 'SUCCESS' ? 'RECOVERED' : 'CURRENT_WITHOUT_PROVIDER_CALL')
      : 'HUMAN_REVIEW_RECOVERY_UNVERIFIED', child: context.runId, providerRequests };
  } catch (error) {
    const failure = { stage, error: failureText(error) };
    if (admittedId && !collectorInvoked) {
      // This process never called the collector, so no provider call happened:
      // release the admission instead of spending today's only attempt on a read.
      try {
        await deps.memory.abortBeforeCollection(admittedId, deps.now(), `${failure.stage}: ${failure.error}`);
        return { state: 'RETRYABLE_BEFORE_COLLECTION', ...failure, providerRequests: 0 };
      } catch (abortError) {
        return { state: 'HUMAN_REVIEW_READ_OR_WRITE_UNAVAILABLE', ...failure, releaseError: failureText(abortError) };
      }
    }
    // After the collector was invoked, uncertainty never releases an admission by time.
    return { state: 'HUMAN_REVIEW_READ_OR_WRITE_UNAVAILABLE', ...failure };
  }
}
