// @ts-check
/**
 * Bounded, read-only connection probe for the three PREPARED 인천국제공항공사
 * services: 15095071 국가별 여객, 15095070 시간대별 여객, 15114085 정기편 운항 일정.
 *
 * One request per service, three in total, no retry, nothing persisted. Each
 * output line carries only status, resultCode/resultMsg, item counts, field
 * NAMES and basis dates — never the key, a URL, a response body or a row value.
 *
 * How it runs, without a new workflow: the existing manually dispatched
 * "Smoke Public APIs" workflow (.github/workflows/smoke-public-apis.yml,
 * environment `production`, which supplies DATA_GO_KR_SERVICE_KEY) executes
 * `node scripts/smoke-public-apis.mjs`. A probe-only branch replaces that entry
 * with a two-line file calling runIncheonStatsProbeCli() — the route PR #369
 * used — and the workflow is dispatched from that branch. The swap is never
 * merged; main keeps the ordinary smoke. Locally: node scripts/probe-incheon-airport-stats.mjs
 *
 * Exit code 0 only when all three services are READY, otherwise 1, so a green
 * run can never be read as "connected" when it is not.
 */
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { redactDataGoKrSecrets } from "../lib/data-go-kr.mjs";
import {
  buildMonthlyStatsRequest,
  buildScheduledDeparturesRequest,
  kstMonth,
  shiftMonth,
} from "../lib/incheon-airport-stats.mjs";
import { readServiceKey, requestIncheonOperation } from "../lib/incheon-airport-stats-client.mjs";

/** @typedef {import("../lib/incheon-airport-stats.mjs").IncheonRequestPlan} IncheonRequestPlan */
/** @typedef {import("../lib/incheon-airport-stats-client.mjs").IncheonRequestResult} IncheonRequestResult */
/** @typedef {import("../lib/incheon-airport-stats-client.mjs").FetchLike} FetchLike */
/** @typedef {"READY" | "REVIEW" | "WAITING_FOR_APPROVAL" | "BLOCKED" | "UNREACHABLE"} ProbeVerdict */

export const PROBE_MAX_REQUESTS = 3;
const PROBE_TIMEOUT_MS = 30_000;
export const PROBE_LINE_PREFIX = "AIRPORT_STATS_PROBE ";

/**
 * One plan per service. The statistics ask for the month before last (KST),
 * which the provider has certainly published; whether the latest month is out
 * yet is a question for the collector, not for a connection probe.
 *
 * @param {Date} now
 * @returns {IncheonRequestPlan[]}
 */
export function buildProbePlans(now) {
  const month = shiftMonth(kstMonth(now), -2);
  return [
    buildMonthlyStatsRequest("ROUTE_COUNTRY_PASSENGERS", { fromMonth: month, toMonth: month, now }),
    buildMonthlyStatsRequest("TIME_BAND_PASSENGERS", { fromMonth: month, toMonth: month, now }),
    buildScheduledDeparturesRequest({ pageNo: 1 }),
  ];
}

/**
 * READY: an authenticated answer whose rows match the documented contract
 * (and, for the schedule, fit the page bound). REVIEW: the provider answered
 * 00/03 but something still needs a person — no rows, drift, invalid rows.
 *
 * @param {IncheonRequestResult} result
 * @returns {ProbeVerdict}
 */
export function probeVerdict({ classification, parsed }) {
  if (classification.kind === "NOT_REGISTERED") return "WAITING_FOR_APPROVAL";
  if (classification.kind === "TIMEOUT" || classification.kind === "NETWORK" || classification.kind === "SERVER_ERROR") return "UNREACHABLE";
  if (classification.kind === "GATEWAY_HTML" && classification.retryable) return "UNREACHABLE";
  if (classification.kind === "OK" && parsed && parsed.status === "VALID" && parsed.contract.status === "MATCH") {
    const fits = parsed.shape === "SCHEDULE" ? parsed.withinPagingBound !== false : parsed.complete !== false;
    if (fits) return "READY";
  }
  return classification.resultCode === "00" || classification.resultCode === "03" ? "REVIEW" : "BLOCKED";
}

/** @param {string} yyyymm */
function monthLabel(yyyymm) {
  return `${yyyymm.slice(0, 4)}-${yyyymm.slice(4)}`;
}

/**
 * @typedef {object} ProbeLine
 * @property {string} service
 * @property {string} operation
 * @property {ProbeVerdict} verdict
 * @property {string} kind
 * @property {number | null} httpStatus
 * @property {string | null} resultCode
 * @property {string | null} resultMsg
 * @property {string | null} issue
 * @property {number} requests
 * @property {Record<string, string | number | string[] | null>} basis
 * @property {number} [itemCount]
 * @property {number | null} [totalCount]
 * @property {boolean | null} [complete]
 * @property {number} [providerAggregateRows]
 * @property {number} [duplicateRowKeys]
 * @property {number | null} [pagesNeeded]
 * @property {boolean | null} [withinPagingBound]
 * @property {string} [contractStatus]
 * @property {string[]} [fieldNames]
 * @property {string[]} [unknownFieldNames]
 * @property {string[]} [missingDocumentedFieldNames]
 * @property {string[]} [contractIssues]
 * @property {string[]} [schemaIssues]
 */

/**
 * Everything printed for one service. Each value is a fixed code, a number, a
 * provider field NAME, a date, or the sanitized provider message.
 *
 * @param {IncheonRequestPlan} plan
 * @param {IncheonRequestResult} result
 * @returns {ProbeLine}
 */
export function summarizeProbeResult(plan, result) {
  const { classification, parsed } = result;
  /** @type {ProbeLine["basis"]} */
  const requested = plan.monthRange
    ? { fromMonth: monthLabel(plan.monthRange.fromMonth), toMonth: monthLabel(plan.monthRange.toMonth), source: "REQUEST_PARAMETERS" }
    : { pageNo: plan.page?.pageNo ?? null, numOfRows: plan.page?.numOfRows ?? null, airportFilter: "BLANK_ALL_ROUTES" };
  /** @type {ProbeLine} */
  const line = {
    service: plan.datasetId,
    operation: plan.operationId,
    verdict: probeVerdict(result),
    kind: classification.kind,
    httpStatus: classification.httpStatus,
    resultCode: classification.resultCode,
    resultMsg: classification.resultMsg,
    issue: classification.issue,
    requests: result.attempts,
    basis: requested,
  };
  if (!parsed) return line;
  Object.assign(line, {
    itemCount: parsed.itemCount,
    totalCount: parsed.totalCount,
    duplicateRowKeys: parsed.duplicateKeyCount,
    contractStatus: parsed.contract.status,
    fieldNames: parsed.contract.observedFieldNames,
    unknownFieldNames: parsed.contract.unknownFieldNames,
    missingDocumentedFieldNames: parsed.contract.missingDocumentedFieldNames,
    contractIssues: parsed.contract.issues,
    schemaIssues: parsed.schemaIssues,
  });
  if (parsed.shape === "SCHEDULE") {
    line.pagesNeeded = parsed.pagesNeeded;
    line.withinPagingBound = parsed.withinPagingBound;
    line.basis = {
      ...requested,
      validFromMin: parsed.basis.validFromMin,
      validToMax: parsed.basis.validToMax,
      seasons: parsed.basis.seasons,
      source: "PROVIDER_ROWS",
    };
  } else {
    line.complete = parsed.complete;
    line.providerAggregateRows = parsed.aggregateRowCount;
  }
  return line;
}

/**
 * @typedef {object} ProbeSummary
 * @property {true} summary
 * @property {string} probe
 * @property {boolean} keyConfigured
 * @property {number} requestCount Provider requests actually made.
 * @property {number} maximumRequests
 * @property {boolean} persisted
 * @property {Record<string, ProbeVerdict>} verdicts
 * @property {boolean} allReady
 */

/**
 * @param {{
 *   env: Readonly<Record<string, string | undefined>>,
 *   fetchImpl: FetchLike,
 *   now: Date,
 *   write: (record: ProbeLine | ProbeSummary) => void,
 * }} io
 * @returns {Promise<{ lines: ProbeLine[], summary: ProbeSummary }>}
 */
export async function runIncheonStatsProbe({ env, fetchImpl, now, write }) {
  let requestCount = 0;
  /** @type {FetchLike} */
  const boundedFetch = (input, init) => {
    requestCount += 1;
    // Defence in depth: three plans with one attempt each can never need more.
    if (requestCount > PROBE_MAX_REQUESTS) return Promise.reject(new Error("probe_request_bound"));
    return fetchImpl(input, init);
  };
  /** @type {ProbeLine[]} */
  const lines = [];
  for (const plan of buildProbePlans(now)) {
    const result = await requestIncheonOperation(plan, { env, fetchImpl: boundedFetch, maxAttempts: 1, timeoutMs: PROBE_TIMEOUT_MS });
    const line = summarizeProbeResult(plan, result);
    lines.push(line);
    write(line);
  }
  /** @type {ProbeSummary} */
  const summary = {
    summary: true,
    probe: "incheon-airport-stats-v1",
    keyConfigured: readServiceKey(env) !== null,
    requestCount,
    maximumRequests: PROBE_MAX_REQUESTS,
    persisted: false,
    verdicts: Object.fromEntries(lines.map((line) => [line.service, line.verdict])),
    allReady: lines.length === 3 && lines.every((line) => line.verdict === "READY"),
  };
  write(summary);
  return { lines, summary };
}

/**
 * @param {ProbeLine | ProbeSummary} record
 * @param {string} serviceKey
 */
export function formatProbeLine(record, serviceKey) {
  return PROBE_LINE_PREFIX + redactDataGoKrSecrets(JSON.stringify(record), serviceKey);
}

/** @type {Readonly<Record<string, string>>} */
const SERVICE_LABELS = Object.freeze({
  15095071: "15095071 국가별 여객 (노선 국가 기준)",
  15095070: "15095070 시간대별 여객",
  15114085: "15114085 정기편 운항 일정 (출발)",
});

/** @type {Readonly<Record<ProbeVerdict, string>>} */
const VERDICT_LABELS = Object.freeze({
  READY: "연결 확인",
  REVIEW: "인증 통과 · 응답 구조 검토 필요",
  WAITING_FOR_APPROVAL: "미등록 키(30) · 승인 또는 반영 대기",
  BLOCKED: "차단 · 확인 필요",
  UNREACHABLE: "접속 실패 · 나중에 다시 실행",
});

/** @param {unknown} value */
function cell(value) {
  if (value === null || value === undefined || value === "") return "—";
  return (Array.isArray(value) ? value.join(", ") : String(value)).replace(/[|\r\n]/g, " ");
}

/**
 * The run page's step summary, in Korean, with the same safe fields.
 *
 * @param {ProbeLine[]} lines
 * @param {ProbeSummary} summary
 */
export function renderStepSummary(lines, summary) {
  const rows = lines.map((line) => {
    const basis = line.basis.fromMonth
      ? `${cell(line.basis.fromMonth)} (요청 월)`
      : line.basis.validFromMin
        ? `${cell(line.basis.validFromMin)} ~ ${cell(line.basis.validToMax)}`
        : "—";
    return `| ${SERVICE_LABELS[line.service] ?? cell(line.service)} | ${VERDICT_LABELS[line.verdict]} | ${cell(line.httpStatus)} | ${cell(line.resultCode)} | ${cell(line.resultMsg)} | ${cell(line.itemCount)} / ${cell(line.totalCount)} | ${basis} |`;
  });
  return [
    "### 인천공항 통계 API 3종 연결 점검 (읽기 전용)",
    "",
    "| 서비스 | 판정 | HTTP | 결과코드 | 메시지 | 받은 행 / 전체 | 기준 |",
    "|---|---|---|---|---|---|---|",
    ...rows,
    "",
    `요청 ${summary.requestCount}회 (상한 ${summary.maximumRequests}회) · 재시도 없음 · 저장 없음 · 전체: ${summary.allReady ? "3종 모두 연결 확인" : "아직 3종 모두 연결 확인은 아님"}`,
    "",
  ].join("\n");
}

/** Entry used by `node scripts/probe-incheon-airport-stats.mjs` and by the probe-branch smoke entry. */
export async function runIncheonStatsProbeCli() {
  const serviceKey = readServiceKey(process.env) ?? "";
  const { lines, summary } = await runIncheonStatsProbe({
    env: process.env,
    fetchImpl: fetch,
    now: new Date(),
    write: (record) => console.log(formatProbeLine(record, serviceKey)),
  });
  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) appendFileSync(stepSummary, redactDataGoKrSecrets(renderStepSummary(lines, summary), serviceKey));
  process.exitCode = summary.allReady ? 0 : 1;
}

const invokedDirectly = typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) await runIncheonStatsProbeCli();
