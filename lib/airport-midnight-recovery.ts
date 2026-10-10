/** Prepared A1 fallback. No scheduler, provider call, credential or permission grant. */
import { centralRecoveryActivation } from './operational-recovery-runner';
import type { CentralRecoveryActivation } from './central-recovery-gate';
import { OperationalMemory, type AttemptRequest, type StoredAttempt } from './operational-memory';
import { kstDayOf, isValidKstDay } from './kst';
import type { airportTodayCoverage } from './airport-today-coverage';
import { capabilityFor } from './recovery-capability';

export const A1_MIDNIGHT_RECOVERY_REVIEWED = false;
export const A1_RECOVERY_WORKFLOW_ID = 349242009;
export const A1_RECOVERY_WORKFLOW = 'collect-airport-recovery.yml';
export const A1_SOURCE = 'INCHEON_FLIGHT_DETAIL';
const REPOSITORY = 'rudvh1016-gif/retailpulse-korea';
const SLOT = '00:07';
const API = `https://api.github.com/repos/${REPOSITORY}/actions`;
const ACTIVE = new Set(['queued', 'pending', 'waiting', 'requested', 'in_progress']);
type Coverage = ReturnType<typeof airportTodayCoverage>;

export interface AirportWorkflowRun {
  id: number; workflow_id: number; event: string; head_branch: string;
  created_at: string; status: string; conclusion: string | null;
}
export interface AirportRunSnapshot {
  complete: boolean;
  early: AirportWorkflowRun[];
  active: AirportWorkflowRun[];
}
export interface AirportDispatchReceipt { accepted: boolean; runId: number | null; status: number | null }

/** The existing gate AND an A1-specific review. Registry classification stays HUMAN_REVIEW_ONLY. */
export function airportMidnightRecoveryActivation(nowIso: string, env: Record<string, string | undefined> = process.env) {
  const gate = centralRecoveryActivation(nowIso, env);
  const capability = capabilityFor(A1_SOURCE);
  const sourceAllowed = capability.controlledRecoveryEligible && capability.supportedActions.includes('REDISPATCH_SAME_WORKFLOW');
  if (A1_MIDNIGHT_RECOVERY_REVIEWED && sourceAllowed) return gate;
  return { ...gate, allowed: false, blockedBy: [...gate.blockedBy,
    ...(!A1_MIDNIGHT_RECOVERY_REVIEWED ? ['A1_REVIEW_REQUIRED'] : []),
    ...(!sourceAllowed ? ['SOURCE_NOT_CONTROLLED_ELIGIBLE'] : [])],
    reason: gate.reason + '; A1-only redispatch requires source review' };
}

export function planAirportMidnightRecovery(nowIso: string, coverage: Coverage, snapshot: AirportRunSnapshot, sourceBlocked: boolean) {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) return { eligible: false, reason: 'CLOCK_UNREADABLE' };
  const targetDate = kstDayOf(nowIso);
  if (coverage.today !== targetDate) return { eligible: false, reason: 'COVERAGE_DATE_MISMATCH' };
  if (coverage.state === 'CURRENT') return { eligible: false, reason: 'ALREADY_CURRENT' };
  if (now < Date.parse(targetDate + 'T01:15:00+09:00') || now >= Date.parse(targetDate + 'T03:00:00+09:00'))
    return { eligible: false, reason: 'OUTSIDE_FALLBACK_WINDOW' };
  if (!snapshot.complete) return { eligible: false, reason: 'WORKFLOW_READ_UNVERIFIED' };
  if (sourceBlocked) return { eligible: false, reason: 'SOURCE_BLOCKED' };
  if (snapshot.active.some(run => ACTIVE.has(run.status))) return { eligible: false, reason: 'ORIGINAL_RUN_ACTIVE' };
  const dayStart = Date.parse(targetDate + 'T00:00:00+09:00');
  // A started/failed early run belongs to its own retry ladder, never this fallback.
  if (snapshot.early.some(run => Date.parse(run.created_at) >= dayStart))
    return { eligible: false, reason: 'EARLY_RUN_ALREADY_STARTED' };
  return { eligible: true, reason: 'EARLY_RUN_NOT_OBSERVED', targetDate };
}

function validRun(run: AirportWorkflowRun, workflowId?: number): boolean {
  return Number.isSafeInteger(run.id) && run.id > 0 && Number.isFinite(Date.parse(run.created_at)) &&
    run.head_branch === 'main' && ['schedule', 'workflow_dispatch'].includes(run.event) &&
    (!workflowId || run.workflow_id === workflowId) && typeof run.status === 'string';
}

/** Bounded public GitHub reads, including old active runs; never infer absence from truncated lists. */
export async function readAirportRunSnapshot(nowIso: string, fetcher: typeof fetch = fetch): Promise<AirportRunSnapshot> {
  const read = async (url: string) => {
    const response = await fetcher(url, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('workflow_read_unavailable');
    const body = await response.json() as { total_count?: number; workflow_runs?: AirportWorkflowRun[] };
    if (!Number.isSafeInteger(body.total_count) || !Array.isArray(body.workflow_runs)) throw new Error('workflow_read_unverified');
    return body;
  };
  const early = await read(`${API}/workflows/${A1_RECOVERY_WORKFLOW_ID}/runs?per_page=100`);
  // The first page must cover today's window. All active statuses are queried independently.
  if (early.workflow_runs!.some(run => !validRun(run, A1_RECOVERY_WORKFLOW_ID))) throw new Error('workflow_contract_mismatch');
  const dayStart = Date.parse(kstDayOf(nowIso) + 'T00:00:00+09:00');
  if (early.total_count! <= 100 && early.total_count !== early.workflow_runs!.length) throw new Error('early_runs_truncated');
  if (early.total_count! > early.workflow_runs!.length &&
      !early.workflow_runs!.some(run => Date.parse(run.created_at) < dayStart)) throw new Error('early_runs_truncated');
  const active: AirportWorkflowRun[] = [];
  for (const status of ['queued', 'pending', 'waiting', 'requested', 'in_progress']) {
    const body = await read(`${API}/runs?status=${status}&per_page=100`);
    if (body.total_count! > 100 || body.total_count !== body.workflow_runs!.length) throw new Error('active_runs_truncated');
    for (const run of body.workflow_runs!) {
      if (!Number.isSafeInteger(run.workflow_id)) throw new Error('active_run_contract_mismatch');
      // Both collectors share production-collector. Resolve daily by its filename below.
      if (run.workflow_id === A1_RECOVERY_WORKFLOW_ID || (run as AirportWorkflowRun & { path?: string }).path === '.github/workflows/collect-production.yml') {
        if (!validRun(run)) throw new Error('active_run_contract_mismatch');
        active.push(run);
      }
    }
  }
  return { complete: early.total_count! <= 100 || early.workflow_runs!.length === 100, early: early.workflow_runs!, active };
}

/** Single request; 403/429/timeout are never retried. Uncorrelated receipts hold the durable lock. */
export async function dispatchAirportMidnightRecovery(token: string, targetDate: string, fetcher: typeof fetch = fetch): Promise<AirportDispatchReceipt> {
  if (!token.trim() || !isValidKstDay(targetDate)) throw new Error('dispatch_input_unverified');
  const response = await fetcher(`${API}/workflows/${A1_RECOVERY_WORKFLOW}/dispatches`, {
    method: 'POST', headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2026-03-10' },
    body: JSON.stringify({ ref: 'main', inputs: { a1_midnight_recovery: true, a1_recovery_target_date: targetDate } }),
    signal: AbortSignal.timeout(10_000), redirect: 'error',
  });
  let runId: number | null = null;
  if (response.status === 200) {
    try { const body = await response.json() as { workflow_run_id?: number };
      if (Number.isSafeInteger(body.workflow_run_id) && body.workflow_run_id! > 0) runId = body.workflow_run_id!;
    } catch { /* accepted but uncorrelated: no automatic retry */ }
  }
  return { accepted: [200, 204].includes(response.status), runId, status: response.status };
}

export interface AirportRecoveryDependencies {
  memory: OperationalMemory;
  nowIso: string;
  witnessRunId: string;
  dispatchPermissionGranted: boolean;
  env?: Record<string, string | undefined>;
  readCoverage: () => Promise<Coverage>;
  readSnapshot: () => Promise<AirportRunSnapshot>;
  sourceBlocked: () => Promise<boolean>;
  budgetAvailable: () => Promise<boolean>;
  dispatch: (targetDate: string) => Promise<AirportDispatchReceipt>;
  readRun: (runId: number) => Promise<AirportWorkflowRun>;
  saveReceipt: (request: AttemptRequest, attemptId: string, runId: number) => Promise<void>;
  readReceipt: (attempt: StoredAttempt) => Promise<number | null>;
  verifyPublicToday: (targetDate: string) => Promise<boolean | null>;
}

/** Deep boundary; the activation override is a TEST SEAM and production never supplies it. */
export async function executeAirportMidnightRecovery(deps: AirportRecoveryDependencies,
  options: { activation?: CentralRecoveryActivation } = {}) {
  const gate = options.activation ?? airportMidnightRecoveryActivation(deps.nowIso, deps.env);
  if (!gate.allowed) return { state: 'CENTRAL_RECOVERY_DORMANT', reason: gate.reason, dispatches: 0 };
  if (!deps.dispatchPermissionGranted) return { state: 'DISPATCH_PERMISSION_REQUIRED', reason: 'actions:write not granted', dispatches: 0 };
  try {
    const targetDate = kstDayOf(deps.nowIso);
    const attempts = (await deps.memory.attempts(A1_SOURCE, targetDate)).filter(attempt => attempt.logicalJob === A1_RECOVERY_WORKFLOW);
    if (attempts.length) {
      const attempt = attempts[0];
      if (attempt.completedAt) return { state: 'DAILY_ATTEMPT_ALREADY_SPENT', dispatches: 0 };
      const runId = await deps.readReceipt(attempt);
      if (!runId) return { state: 'HUMAN_REVIEW_UNCORRELATED_DISPATCH', dispatches: 0 };
      const run = await deps.readRun(runId);
      if (!validRun(run, A1_RECOVERY_WORKFLOW_ID) || run.id !== runId || run.event !== 'workflow_dispatch')
        return { state: 'HUMAN_REVIEW_RUN_MISMATCH', dispatches: 0 };
      if (Date.parse(run.created_at) < Math.floor(Date.parse(attempt.startedAt) / 1000) * 1000)
        return { state: 'HUMAN_REVIEW_RUN_MISMATCH', dispatches: 0 };
      if (run.status !== 'completed') return { state: 'RECOVERY_PENDING', dispatches: 0, runId };
      const coverage = await deps.readCoverage();
      const stored = coverage.today === targetDate && coverage.state === 'CURRENT';
      const publicValid = stored ? await deps.verifyPublicToday(targetDate) : null;
      const valid = run.conclusion === 'success' && stored && publicValid === true;
      // Finish only after a correlated terminal run; admission alone is never a success.
      await deps.memory.finish(attempt.attemptId, deps.nowIso,
        { dataValid: valid, storageValid: stored, publicValid });
      return { state: valid ? 'RECOVERED' : 'HUMAN_REVIEW_RECOVERY_UNVERIFIED', dispatches: 0, runId };
    }
    const coverage = await deps.readCoverage();
    if (coverage.state === 'CURRENT') return { state: 'ALREADY_CURRENT', dispatches: 0 };
    const snapshot = await deps.readSnapshot();
    const plan = planAirportMidnightRecovery(deps.nowIso, coverage, snapshot, await deps.sourceBlocked());
    if (!plan.eligible || !plan.targetDate) return { state: plan.reason, dispatches: 0 };
    if (!await deps.budgetAvailable()) return { state: 'REQUEST_BUDGET_UNAVAILABLE', dispatches: 0 };
    const request: AttemptRequest = { parts: { sourceId: A1_SOURCE, failureClass: 'MISSED_RUN',
      contractVersion: 'airport-v1', logicalJob: A1_RECOVERY_WORKFLOW }, targetDate, scheduledSlot: SLOT,
      operation: 'REDISPATCH_SAME_WORKFLOW', runId: deps.witnessRunId, at: deps.nowIso };
    const admission = await deps.memory.admit(request, { maxAttempts: 1 });
    if (!admission.admitted) return { state: 'DAILY_OR_INFLIGHT_LOCK', dispatches: 0 };
    // Recheck after atomic admission; native cron may have arrived during the earlier reads.
    const recheck = planAirportMidnightRecovery(deps.nowIso, await deps.readCoverage(), await deps.readSnapshot(), await deps.sourceBlocked());
    if (!recheck.eligible || !await deps.budgetAvailable()) {
      // This process proves no dispatch was attempted. Consume today's one attempt
      // without an indefinite in-flight lock that would block tomorrow as well.
      // Crash/uncertain POST paths below still retain their lock for human review.
      await deps.memory.finish(admission.attemptId, deps.nowIso,
        { dataValid: false, storageValid: null, publicValid: null });
      return { state: 'ABORTED_BEFORE_DISPATCH', reason: recheck.reason, dispatches: 0 };
    }
    let receipt: AirportDispatchReceipt;
    try { receipt = await deps.dispatch(targetDate); }
    catch { return { state: 'HUMAN_REVIEW_UNCERTAIN_DISPATCH', dispatches: 1 }; }
    if (receipt.accepted && receipt.runId) {
      try { await deps.saveReceipt(request, admission.attemptId, receipt.runId); }
      catch { return { state: 'HUMAN_REVIEW_RECEIPT_WRITE_FAILED', dispatches: 1, runId: receipt.runId }; }
    }
    return { state: receipt.accepted && receipt.runId ? 'RECOVERY_PENDING' : 'HUMAN_REVIEW_UNCORRELATED_DISPATCH',
      dispatches: 1, runId: receipt.runId, httpStatus: receipt.status };
  } catch { return { state: 'READ_OR_ADMISSION_UNAVAILABLE', dispatches: 0 }; }
}

/** Existing event table, no migration. Receipt failure leaves the admission lock held. */
export async function saveAirportDispatchReceipt(memory: OperationalMemory, request: AttemptRequest, attemptId: string, runId: number) {
  if (!Number.isSafeInteger(runId) || runId < 1) throw new Error('invalid_dispatch_run_id');
  await memory.recordEvent({ parts: request.parts, kind: 'RECOVERY_STARTED', runId: `a1-dispatch-${runId}`,
    at: request.at, evidence: `attemptId=${attemptId}; acceptedRun=${runId}; targetDate=${request.targetDate}` });
}
export async function readAirportDispatchReceipt(db: Pick<D1Database, 'prepare'>, attempt: StoredAttempt) {
  const prefix = `attemptId=${attempt.attemptId};`;
  const rows = (await db.prepare(`SELECT run_id FROM operational_incident_events WHERE fingerprint=?
    AND kind='RECOVERY_STARTED' AND substr(evidence,1,length(?))=? ORDER BY at DESC LIMIT 2`)
    .bind(attempt.fingerprint, prefix, prefix).all<{ run_id: string }>()).results;
  if (!rows || rows.length !== 1) return null;
  const match = /^a1-dispatch-(\d+)$/.exec(rows[0].run_id);
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
