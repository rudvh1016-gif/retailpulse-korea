/**
 * Trigger-only scheduled collection dispatch.
 *
 * docs/REALTIME_SCHEDULER_AUDIT.md measured the previous design — running
 * A4-T1/A4-T2/S1 inside Worker Cron — at 414% of the Workers Free 10 ms Cron
 * CPU budget, driven almost entirely by the changed-only SHA-256 hashing.
 * That design is rejected.
 *
 * This module is the replacement: Cloudflare acts ONLY as the alarm clock.
 * A Cron invocation makes exactly one authenticated GitHub API request that
 * dispatches one explicitly allowlisted workflow, and GitHub Actions keeps
 * running the unchanged collectors, hashing and changed-only D1 writes.
 *
 * Deliberately absent here: provider calls, parsing, normalization, hashing,
 * D1 reads and D1 writes. Anything heavier belongs in Actions.
 */

/** The only workflows this trigger may ever dispatch. */
export const REALTIME_WORKFLOW_FILE = "collect-realtime.yml";
export const FORECAST_WORKFLOW_FILE = "collect-forecast.yml";
export const REALTIME_CRON = "7,22,37,52 * * * *";
export const FORECAST_CRON = "42 * * * *";
export type AllowedWorkflowFile = typeof REALTIME_WORKFLOW_FILE | typeof FORECAST_WORKFLOW_FILE;
export const DISPATCH_OWNER = "rudvh1016-gif";
export const DISPATCH_REPO = "retailpulse-korea";
/** Scheduled workflows run from the default branch; keep dispatch identical. */
export const DISPATCH_REF = "main";

const DISPATCH_TIMEOUT_MS = 10_000;
/**
 * One bounded retry, transient failures only. At the unchanged 15-minute
 * cadence this is at most 96 x 2 = 192 GitHub API requests/day against an
 * authenticated limit of 5,000/hour, so the rate-limit impact is negligible.
 */
const TRANSIENT_RETRY_DELAY_MS = 500;

export type DispatchOutcome =
  | "dispatch_success"
  | "dispatch_ignored_cron"
  | "dispatch_missing_token"
  | "dispatch_auth_failed"
  | "dispatch_not_found"
  | "dispatch_invalid_request"
  | "dispatch_rate_limited"
  | "dispatch_upstream_error"
  | "dispatch_network_error";

export interface DispatchClassification {
  outcome: DispatchOutcome;
  /** Only transient connection-layer and 5xx failures may be retried. */
  retryable: boolean;
}

/**
 * Maps a GitHub dispatch status to an outcome.
 *
 * Auth, missing-workflow and invalid-ref failures are permanent: retrying
 * them cannot succeed and only burns rate limit. 429 is explicitly NOT
 * retried — adding load to a rate-limited endpoint is the wrong response.
 */
export function classifyDispatchStatus(status: number): DispatchClassification {
  if (status === 204) return { outcome: "dispatch_success", retryable: false };
  if (status === 401 || status === 403) return { outcome: "dispatch_auth_failed", retryable: false };
  if (status === 404) return { outcome: "dispatch_not_found", retryable: false };
  if (status === 422) return { outcome: "dispatch_invalid_request", retryable: false };
  if (status === 429) return { outcome: "dispatch_rate_limited", retryable: false };
  if (status >= 500) return { outcome: "dispatch_upstream_error", retryable: true };
  return { outcome: "dispatch_invalid_request", retryable: false };
}

/** Safe, secret-free operational record. Never carries headers or the token. */
export interface DispatchLog {
  event: DispatchOutcome;
  workflow: AllowedWorkflowFile | null;
  ref: string;
  status: number | null;
  attempts: number;
  at: string;
}

export interface DispatchEnv {
  /** Cloudflare Worker secret binding. The value is never logged or returned. */
  GITHUB_DISPATCH_TOKEN?: string;
}

export function workflowForCron(cron: string): AllowedWorkflowFile | null {
  if (cron === REALTIME_CRON) return REALTIME_WORKFLOW_FILE;
  if (cron === FORECAST_CRON) return FORECAST_WORKFLOW_FILE;
  return null;
}

export function dispatchUrl(workflow: AllowedWorkflowFile): string {
  return `https://api.github.com/repos/${DISPATCH_OWNER}/${DISPATCH_REPO}/actions/workflows/${workflow}/dispatches`;
}

export function realtimeDispatchUrl(): string {
  return dispatchUrl(REALTIME_WORKFLOW_FILE);
}

/**
 * Performs the single dispatch request.
 *
 * Returns a safe log record instead of throwing, so a Cron invocation can
 * never fail in a way that leaks the token through an error message.
 */
async function dispatchAllowedWorkflow(
  workflow: AllowedWorkflowFile,
  env: DispatchEnv,
  fetchImpl: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): Promise<DispatchLog> {
  const token = env.GITHUB_DISPATCH_TOKEN?.trim();
  const base = { workflow, ref: DISPATCH_REF };
  if (!token) {
    return { ...base, event: "dispatch_missing_token", status: null, attempts: 0, at: now().toISOString() };
  }

  const url = dispatchUrl(workflow);
  const body = JSON.stringify({ ref: DISPATCH_REF });
  let attempts = 0;
  let last: DispatchClassification = { outcome: "dispatch_network_error", retryable: true };
  let lastStatus: number | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    attempts += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "content-type": "application/json",
          "user-agent": "koretail-scheduled-trigger",
          "x-github-api-version": "2022-11-28",
        },
        body,
      });
      lastStatus = response.status;
      last = classifyDispatchStatus(response.status);
    } catch {
      lastStatus = null;
      last = { outcome: "dispatch_network_error", retryable: true };
    } finally {
      clearTimeout(timer);
    }
    if (!last.retryable) break;
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS));
  }

  return { ...base, event: last.outcome, status: lastStatus, attempts, at: now().toISOString() };
}


/** Routes only the two production Cron expressions; unknown values are inert. */
export async function dispatchScheduledCollection(
  cron: string,
  env: DispatchEnv,
  fetchImpl: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): Promise<DispatchLog> {
  const workflow = workflowForCron(cron);
  if (!workflow) {
    return {
      event: "dispatch_ignored_cron",
      workflow: null,
      ref: DISPATCH_REF,
      status: null,
      attempts: 0,
      at: now().toISOString(),
    };
  }
  return dispatchAllowedWorkflow(workflow, env, fetchImpl, now);
}

/** Backwards-compatible realtime entry used by the local CPU benchmark. */
export function dispatchRealtimeCollection(
  env: DispatchEnv,
  fetchImpl: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): Promise<DispatchLog> {
  return dispatchAllowedWorkflow(REALTIME_WORKFLOW_FILE, env, fetchImpl, now);
}
