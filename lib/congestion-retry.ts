/**
 * Which A4 sources — if any — earn one fresh runner this cycle.
 *
 * Why this exists
 * ───────────────
 * PR #189 added a fresh-runner retry to `collect-realtime.yml` gated on
 * `needs.collect.result == 'failure'`. A job result is a single bit for the
 * WHOLE job, and that job collects T1, T2 and `seoul_realtime` together. So
 * the gate fired on any failure at all: Seoul failing alone, an auth error, a
 * schema change, a D1 write problem, or T1 failing while T2 was fine — every
 * one of those re-requested BOTH airport datasets. That spends a provider
 * quota on a problem a second runner cannot fix.
 *
 * The evidence the retry was built on is narrower than the gate was. Measured
 * on Production over 14.7 h / 120 runs, every A4 failure was
 * `failureClass=NETWORK causeCode=UND_ERR_CONNECT_TIMEOUT retryExhausted=true`
 * while `seoul_realtime` succeeded from the SAME runner at the same moment.
 * A fresh runner is a fresh egress address, and that is the only thing it
 * fixes. This function narrows the gate back to exactly that case.
 *
 * It reads THIS cycle's own per-source result lines. A past incident is never
 * evidence about this run: a source with no result line in this log is
 * `RESULT_UNKNOWN` and is not retried, because "we could not tell" must never
 * spend a request.
 */

/** The only two sources a fresh runner may ever re-request from here. */
export const RETRYABLE_A4_SOURCES = ["airport_congestion", "airport_congestion_t2"] as const;
export type RetryableA4Source = (typeof RETRYABLE_A4_SOURCES)[number];

/** Why a source was or was not given a fresh runner. Every source gets one. */
export type RetryVerdict =
  | "RETRY_FRESH_RUNNER"
  | "NOT_AN_A4_SOURCE"
  | "RESULT_UNKNOWN"
  | "ALREADY_HEALTHY"
  | "FAILED_FOR_ANOTHER_REASON";

export interface SourceDecision {
  source: string;
  verdict: RetryVerdict;
  detail: string;
}

export interface RetryDecision {
  /** Sources to pass to collect-attempt.yml, in a stable order. Possibly empty. */
  sources: RetryableA4Source[];
  decisions: SourceDecision[];
}

interface ResultLine {
  source: string;
  status: string;
  detail?: string;
}

/**
 * The collector prints one JSON object per line, and more than one kind:
 * `{"operationalMemory":…}` bookkeeping lines carry a `source` too. Only the
 * lines that carry a `status` are collection results.
 */
export function parseCollectorResults(log: string): ResultLine[] {
  const results: ResultLine[] = [];
  for (const line of log.split(/\r?\n/)) {
    const start = line.indexOf("{");
    if (start < 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line.slice(start));
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const record = parsed as Record<string, unknown>;
    if (typeof record.source !== "string" || typeof record.status !== "string") continue;
    results.push({
      source: record.source,
      status: record.status,
      detail: typeof record.detail === "string" ? record.detail : undefined,
    });
  }
  return results;
}

/**
 * Is this failure the one a different egress address actually fixes?
 *
 * T1 nests its failure inside a longer sentence ("… ; failed P01:
 * failureClass=NETWORK causeCode=UND_ERR_CONNECT_TIMEOUT …") while T2 reports
 * the bare detail, so both are scanned for every occurrence. EVERY classified
 * failure in the line must be the connect timeout: a detail carrying one
 * connect timeout and one auth error is a source with more than one problem,
 * and re-requesting it would not fix the other.
 */
export function isFreshRunnerFailure(detail: string | undefined): boolean {
  if (!detail) return false;
  const classes = [...detail.matchAll(/failureClass=([A-Za-z0-9_]+)/g)].map((match) => match[1]);
  const causes = [...detail.matchAll(/causeCode=([A-Za-z0-9_]+)/g)].map((match) => match[1]);
  if (classes.length === 0 || causes.length === 0) return false;
  return classes.every((value) => value === "NETWORK")
    && causes.every((value) => value === "UND_ERR_CONNECT_TIMEOUT");
}

/**
 * Decides from one cycle's collector output.
 *
 * Later lines win, so a source that failed and was then collected
 * successfully within the same log is already recovered and is not retried.
 * An old healthy value still sitting in D1 is NOT recovery and is never
 * consulted here — only this cycle's own outcome is.
 */
export function decideCongestionRetry(log: string): RetryDecision {
  const results = parseCollectorResults(log);
  const latest = new Map<string, ResultLine>();
  for (const result of results) latest.set(result.source, result);

  const decisions: SourceDecision[] = [];
  const sources: RetryableA4Source[] = [];

  for (const [source, result] of latest) {
    if (!(RETRYABLE_A4_SOURCES as readonly string[]).includes(source)) {
      decisions.push({ source, verdict: "NOT_AN_A4_SOURCE", detail: `status ${result.status}; a fresh runner is only ever spent on the congestion pair` });
    }
  }

  for (const source of RETRYABLE_A4_SOURCES) {
    const result = latest.get(source);
    if (!result) {
      decisions.push({ source, verdict: "RESULT_UNKNOWN", detail: "no result line for this source in this cycle; a request is never spent on a guess" });
      continue;
    }
    // SUCCESS, PARTIAL and every SKIPPED_* are outcomes a second runner
    // cannot improve. PARTIAL kept some rows; re-requesting risks spending a
    // request to change nothing.
    if (result.status !== "ERROR") {
      decisions.push({ source, verdict: "ALREADY_HEALTHY", detail: `status ${result.status}` });
      continue;
    }
    if (!isFreshRunnerFailure(result.detail)) {
      decisions.push({ source, verdict: "FAILED_FOR_ANOTHER_REASON", detail: result.detail ?? "ERROR with no classified detail" });
      continue;
    }
    decisions.push({ source, verdict: "RETRY_FRESH_RUNNER", detail: result.detail ?? "" });
    sources.push(source);
  }

  return { sources, decisions };
}
