// @ts-check
/**
 * Bounded transport for the PREPARED 인천국제공항공사 services described in
 * ./incheon-airport-stats.mjs. No collector, workflow or page imports it.
 *
 * - The service key is read only from the DATA_GO_KR_SERVICE_KEY environment
 *   variable and exists only inside the URL handed to fetch. No result, error
 *   or log line carries that URL, the key or a response body.
 * - Retry is small and bounded: only a client timeout, a connection failure,
 *   HTTP 5xx and a 5xx gateway page retry, and never beyond three attempts.
 *   Auth (30/31/20/21/32/33, HTTP 401/403), quota (22/23, HTTP 429), request,
 *   provider and schema outcomes are final on the first answer.
 * - Redirects are reported, never followed, so the keyed URL goes nowhere else.
 */
import { buildDataGoKrUrl } from "./data-go-kr.mjs";
import {
  MAX_SCHEDULE_PAGES,
  buildScheduledDeparturesRequest,
  emptyResultFor,
  inspectIncheonResponse,
  parseIncheonPayload,
} from "./incheon-airport-stats.mjs";

/** @typedef {import("./incheon-airport-stats.mjs").IncheonRequestPlan} IncheonRequestPlan */
/** @typedef {import("./incheon-airport-stats.mjs").IncheonClassification} IncheonClassification */
/** @typedef {import("./incheon-airport-stats.mjs").ParsedMonthlyStats} ParsedMonthlyStats */
/** @typedef {import("./incheon-airport-stats.mjs").ParsedSchedulePage} ParsedSchedulePage */
/** @typedef {import("./incheon-airport-stats.mjs").ScheduledDepartureRow} ScheduledDepartureRow */
/** @typedef {(input: URL, init: RequestInit) => Promise<Response>} FetchLike */

export const SERVICE_KEY_ENV = "DATA_GO_KR_SERVICE_KEY";
export const MAX_ATTEMPTS_CEILING = 3;
export const DEFAULT_MAX_ATTEMPTS = 2;
export const DEFAULT_RETRY_DELAYS_MS = Object.freeze([2_000, 10_000]);
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * @param {Readonly<Record<string, string | undefined>>} env
 * @returns {string | null}
 */
export function readServiceKey(env) {
  const value = env[SERVICE_KEY_ENV];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  return Number.isFinite(value) ? Math.min(Math.max(value, min), max) : min;
}

/** Platform error codes are uppercase identifiers; anything else is not echoed. */
const NETWORK_CAUSE_CODE = /^[A-Z][A-Z0-9_]{1,39}$/;

/**
 * @param {unknown} error
 * @returns {string | null}
 */
function networkCauseCode(error) {
  /** @type {Set<unknown>} */
  const seen = new Set();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const code = /** @type {{ code?: unknown }} */ (current).code;
    if (typeof code === "string" && NETWORK_CAUSE_CODE.test(code)) return code;
    current = /** @type {{ cause?: unknown }} */ (current).cause;
  }
  return null;
}

/**
 * @param {"TIMEOUT" | "NETWORK" | "KEY_NOT_CONFIGURED"} kind
 * @param {string | null} issue
 * @returns {IncheonClassification}
 */
function localOutcome(kind, issue) {
  return {
    kind,
    httpStatus: null,
    resultCode: null,
    resultMsg: null,
    bodyFormat: null,
    retryable: kind !== "KEY_NOT_CONFIGURED",
    authFailure: false,
    issue,
  };
}

/**
 * @param {IncheonRequestPlan} plan
 * @param {string} serviceKey
 * @param {FetchLike} fetchImpl
 * @param {number} timeoutMs
 * @returns {Promise<{ classification: IncheonClassification, payload: unknown }>}
 */
async function attemptOnce(plan, serviceKey, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(buildDataGoKrUrl(plan.endpoint, serviceKey, { ...plan.params }), {
      headers: { accept: "application/json" },
      signal: controller.signal,
      redirect: "manual",
    });
    const bodyText = await response.text();
    return inspectIncheonResponse({
      status: response.status,
      contentType: response.headers.get("content-type"),
      bodyText,
      serviceKey,
    });
  } catch (error) {
    const timedOut = controller.signal.aborted
      || (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"));
    return {
      classification: localOutcome(timedOut ? "TIMEOUT" : "NETWORK", timedOut ? "CLIENT_TIMEOUT" : networkCauseCode(error)),
      payload: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @typedef {object} IncheonRequestOptions
 * @property {Readonly<Record<string, string | undefined>>} [env] Defaults to process.env. Only DATA_GO_KR_SERVICE_KEY is read.
 * @property {FetchLike} [fetchImpl]
 * @property {number} [timeoutMs] Per attempt, 1 ms to 60 s.
 * @property {number} [maxAttempts] 1 to 3; the probe uses 1.
 * @property {readonly number[]} [retryDelaysMs]
 * @property {(delayMs: number) => Promise<void>} [sleep]
 * @property {() => number} [nowMs]
 */

/**
 * @typedef {object} IncheonRequestResult
 * @property {IncheonClassification} classification
 * @property {number} attempts Provider requests actually made.
 * @property {number} elapsedMs
 * @property {boolean} retryExhausted A retryable failure with no attempt left.
 * @property {ParsedMonthlyStats | ParsedSchedulePage | null} parsed Present for OK, NO_DATA and row-level SCHEMA_ERROR.
 */

/**
 * One operation, at most `maxAttempts` provider requests.
 *
 * @param {IncheonRequestPlan} plan
 * @param {IncheonRequestOptions} [options]
 * @returns {Promise<IncheonRequestResult>}
 */
export async function requestIncheonOperation(plan, options = {}) {
  const nowMs = options.nowMs ?? Date.now;
  const startedAt = nowMs();
  const serviceKey = readServiceKey(options.env ?? process.env);
  if (!serviceKey) {
    return { classification: localOutcome("KEY_NOT_CONFIGURED", SERVICE_KEY_ENV), attempts: 0, elapsedMs: 0, retryExhausted: false, parsed: null };
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = clamp(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1, 60_000);
  const maxAttempts = clamp(Math.trunc(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS), 1, MAX_ATTEMPTS_CEILING);
  const delays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const sleep = options.sleep ?? ((/** @type {number} */ delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));

  let attempts = 0;
  let outcome;
  do {
    if (attempts > 0) await sleep(clamp(delays[attempts - 1] ?? delays[delays.length - 1] ?? 0, 0, 60_000));
    attempts += 1;
    outcome = await attemptOnce(plan, serviceKey, fetchImpl, timeoutMs);
  } while (outcome.classification.retryable && attempts < maxAttempts);

  let { classification } = outcome;
  /** @type {ParsedMonthlyStats | ParsedSchedulePage | null} */
  let parsed = null;
  if (classification.kind === "OK") {
    parsed = parseIncheonPayload(plan, outcome.payload);
    if (parsed.status === "SCHEMA_ERROR") {
      classification = { ...classification, kind: "SCHEMA_ERROR", issue: parsed.schemaIssues[0] ?? "ROW_SCHEMA_INVALID" };
    }
  } else if (classification.kind === "NO_DATA") {
    parsed = emptyResultFor(plan);
  }
  return {
    classification,
    attempts,
    elapsedMs: Math.max(0, nowMs() - startedAt),
    retryExhausted: classification.retryable && attempts >= maxAttempts,
    parsed,
  };
}

/**
 * @typedef {object} ScheduleCollection
 * @property {"COMPLETE" | "EMPTY" | "INCOMPLETE" | "FAILED"} status
 * @property {string | null} issue
 * @property {ScheduledDepartureRow[]} rows Only when COMPLETE; never a partial schedule.
 * @property {number | null} totalCount
 * @property {"MATCH" | "DRIFT" | "UNOBSERVED"} contractStatus DRIFT if any page drifted.
 * @property {number} pagesFetched
 * @property {number} requestCount
 * @property {IncheonClassification} lastClassification
 */

/**
 * Every page of scheduled departures, or none. At most MAX_SCHEDULE_PAGES
 * pages are requested, and a total larger than that bound is refused after
 * the first page instead of being half-collected.
 *
 * @param {IncheonRequestOptions} [options]
 * @returns {Promise<ScheduleCollection>}
 */
export async function requestAllScheduledDeparturePages(options = {}) {
  const first = await requestIncheonOperation(buildScheduledDeparturesRequest({ pageNo: 1 }), options);
  let requestCount = first.attempts;
  /**
   * @param {ScheduleCollection["status"]} status
   * @param {string | null} issue
   * @param {Partial<ScheduleCollection>} [extra]
   * @returns {ScheduleCollection}
   */
  const finish = (status, issue, extra = {}) => ({
    status,
    issue,
    rows: [],
    totalCount: null,
    contractStatus: "UNOBSERVED",
    pagesFetched: 0,
    requestCount,
    lastClassification: first.classification,
    ...extra,
  });

  if (first.classification.kind === "NO_DATA") return finish("EMPTY", first.classification.issue, { pagesFetched: 1 });
  const page = first.parsed;
  if (first.classification.kind !== "OK" || !page || page.shape !== "SCHEDULE" || page.status !== "VALID") {
    return finish("FAILED", first.classification.issue ?? first.classification.kind);
  }
  const totalCount = page.totalCount;
  if (totalCount === null || page.pagesNeeded === null) return finish("INCOMPLETE", "TOTAL_COUNT_MISSING", { pagesFetched: 1 });
  if (page.pagesNeeded > MAX_SCHEDULE_PAGES) {
    return finish("INCOMPLETE", "PAGING_BOUND_EXCEEDED", { totalCount, pagesFetched: 1 });
  }

  const rows = [...page.rows];
  let drift = page.contract.status === "DRIFT";
  let lastClassification = first.classification;
  for (let pageNo = 2; pageNo <= page.pagesNeeded; pageNo += 1) {
    const next = await requestIncheonOperation(buildScheduledDeparturesRequest({ pageNo }), options);
    requestCount += next.attempts;
    lastClassification = next.classification;
    const nextPage = next.parsed;
    if (next.classification.kind !== "OK" || !nextPage || nextPage.shape !== "SCHEDULE" || nextPage.status !== "VALID") {
      return finish("INCOMPLETE", `PAGE_${pageNo}_${next.classification.kind}`, { totalCount, pagesFetched: pageNo - 1, lastClassification });
    }
    if (nextPage.totalCount !== totalCount) {
      return finish("INCOMPLETE", "TOTAL_COUNT_CHANGED_BETWEEN_PAGES", { totalCount, pagesFetched: pageNo, lastClassification });
    }
    drift = drift || nextPage.contract.status === "DRIFT";
    rows.push(...nextPage.rows);
  }
  if (rows.length !== totalCount) {
    return finish("INCOMPLETE", "ROW_COUNT_DIFFERS_FROM_TOTAL", { totalCount, pagesFetched: page.pagesNeeded, lastClassification });
  }
  return finish("COMPLETE", null, {
    rows,
    totalCount,
    contractStatus: drift ? "DRIFT" : "MATCH",
    pagesFetched: page.pagesNeeded,
    lastClassification,
  });
}
