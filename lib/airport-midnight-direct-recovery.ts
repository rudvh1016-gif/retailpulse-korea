/** Direct reusable-job transport. No HTTP dispatch, scheduler or permission grant. */
import type { CentralRecoveryActivation } from './central-recovery-gate';
import type { OperationalMemory, AttemptRequest } from './operational-memory';
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

/** Read-only candidate, never an admission or authority to run the collector. */
export async function airportMidnightCandidate(deps: AirportMidnightCandidateDependencies, nowIso: string,
  options: TestOptions = {}) {
  const gate = options.activation ?? airportMidnightRecoveryActivation(nowIso, deps.env);
  const closed = (reason: string) => ({ eligible: false, targetDate: '', reason });
  if (!gate.allowed) return closed('CENTRAL_RECOVERY_DORMANT');
  try {
    const day = kstDayOf(nowIso);
    const spent = (await deps.memory.attempts(A1_SOURCE, day)).some(attempt =>
      attempt.mode === 'CONTROLLED' && attempt.logicalJob === A1_RECOVERY_WORKFLOW && attempt.targetDate === day);
    if (spent) return closed('DAILY_ATTEMPT_ALREADY_SPENT');
    if ((await deps.memory.inFlightControlled()).some(attempt =>
      attempt.sourceId === A1_SOURCE && attempt.logicalJob === A1_RECOVERY_WORKFLOW)) return closed('INFLIGHT_LOCK');
    const coverage = await deps.readCoverage(nowIso);
    if (coverage.state === 'CURRENT') return closed('ALREADY_CURRENT');
    const plan = planAirportMidnightRecovery(nowIso, coverage, await deps.readSnapshot(nowIso), await deps.sourceBlocked());
    if (!plan.eligible || !plan.targetDate) return closed(plan.reason);
    if (!await deps.budgetAvailable(nowIso)) return closed('REQUEST_BUDGET_UNAVAILABLE');
    return { eligible: true, targetDate: plan.targetDate, reason: plan.reason };
  } catch { return closed('READ_UNAVAILABLE'); }
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
  if (result.status === 'SKIPPED_ALREADY_COMPLETE_TODAY') return 0;
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
  try {
    const candidate = await airportMidnightCandidate(deps, startedAt, options);
    if (!candidate.eligible || candidate.targetDate !== context.targetDate)
      return { state: candidate.reason, providerRequests: 0, writes: 0 };
    // Same identity as the prepared HTTP transport, never a new quota/lock namespace.
    const request: AttemptRequest = { parts: { sourceId: A1_SOURCE, failureClass: 'MISSED_RUN',
      contractVersion: 'airport-v1', logicalJob: A1_RECOVERY_WORKFLOW }, targetDate: context.targetDate,
      scheduledSlot: '00:07', operation: 'REDISPATCH_SAME_WORKFLOW', runId: context.runId, at: startedAt };
    const admission = await deps.memory.admit(request, { maxAttempts: 1 });
    if (!admission.admitted) return { state: 'DAILY_OR_INFLIGHT_LOCK', providerRequests: 0 };
    const readAt = deps.now();
    const coverageBefore = await deps.readCoverage(readAt), snapshotBefore = await deps.readSnapshot(readAt);
    const blocked = await deps.sourceBlocked(), budget = await deps.budgetAvailable(readAt);
    const checkedAt = deps.now();
    const checkedGate = options.activation ?? airportMidnightRecoveryActivation(checkedAt, deps.env);
    const checkedContext = airportDirectContext(deps.env, checkedAt);
    const plan = planAirportMidnightRecovery(checkedAt, coverageBefore, snapshotBefore, blocked);
    if (!checkedGate.allowed || checkedContext?.runId !== context.runId ||
        checkedContext.targetDate !== context.targetDate || !plan.eligible || !budget) {
      // Proven no collector/provider was invoked. Today's admission stays spent.
      await deps.memory.finish(admission.attemptId, checkedAt, { dataValid: false, storageValid: null, publicValid: null });
      return { state: 'ABORTED_BEFORE_COLLECTION', providerRequests: 0 };
    }
    await deps.memory.recordEvent({ parts: request.parts, kind: 'RECOVERY_STARTED',
      runId: context.runId + '-receipt', at: checkedAt,
      evidence: `attemptId=${admission.attemptId}; directChild=${context.runId}; targetDate=${context.targetDate}` });
    let result: ProductionSourceResult;
    try { result = await deps.collectA1(); }
    catch { return { state: 'HUMAN_REVIEW_UNCERTAIN_CHILD', child: context.runId }; }
    // This in-process result belongs to this exact A1 child, never the parent badge.
    if (result.source !== 'airport_recent') return { state: 'HUMAN_REVIEW_CHILD_MISMATCH', child: context.runId };
    const providerRequests = measuredRequests(result);
    if (result.status === 'SUCCESS' && providerRequests === null)
      return { state: 'HUMAN_REVIEW_UNMEASURED_CHILD', child: context.runId };
    const completedAt = deps.now();
    const completedContext = airportDirectContext(deps.env, completedAt);
    if (completedContext?.runId !== context.runId || completedContext.targetDate !== context.targetDate)
      return { state: 'HUMAN_REVIEW_CONTEXT_CHANGED', child: context.runId };
    const coverage = await deps.readCoverage(completedAt);
    const stored = coverage.today === context.targetDate && coverage.state === 'CURRENT';
    const evidence = await deps.verifyToday(context.targetDate, completedAt);
    const ownSuccess = ['SUCCESS', 'SKIPPED_ALREADY_COMPLETE_TODAY'].includes(result.status);
    const verification = { dataValid: ownSuccess && stored && evidence.dataValid === true,
      storageValid: stored && evidence.storageValid === true, publicValid: evidence.publicValid };
    await deps.memory.finish(admission.attemptId, completedAt, verification, { providerRequests });
    const recovered = verification.dataValid && verification.storageValid && verification.publicValid === true;
    return { state: recovered ? (result.status === 'SUCCESS' ? 'RECOVERED' : 'CURRENT_WITHOUT_PROVIDER_CALL')
      : 'HUMAN_REVIEW_RECOVERY_UNVERIFIED', child: context.runId, providerRequests };
  } catch {
    // Receipt, crash or verification uncertainty never releases an admission by time.
    return { state: 'HUMAN_REVIEW_READ_OR_WRITE_UNAVAILABLE' };
  }
}
