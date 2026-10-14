// @ts-check
/**
 * 인천국제공항공사 services on data.go.kr that are PREPARED BUT NOT ACTIVE.
 *
 *   15095071  국가별 여객       AviationStatsByCountry   getTotalNumberOfPassenger · getTotalNumberOfFlight
 *   15095070  시간대별 여객     AviationStatsByTimeline  getTotalNumberOfPassenger
 *   15114085  정기편 운항 일정  StatusOfPaxFltSched      getPaxFltSchedDeparturesDeOdp
 *
 * Nothing imports this from a collector, a workflow, D1 or a page
 * (tests/incheon-airport-stats.test.ts asserts that). Endpoints and request
 * parameters are exactly the ones PR #369 sent in run 38402837925. The
 * response field lists are the ones PR #369 took from the official openapi.do
 * pages; no authenticated response has been observed yet — every call so far
 * returned HTTP 403 with resultCode 30. The parsers therefore report the field
 * names they actually receive, keep unknown fields out of their rows, and mark
 * the contract DRIFT or fail closed instead of guessing.
 *
 * Pure: no network, no environment access, no clock unless one is passed in.
 * Plain ESM so the dependency-free smoke workflow can run it with `node`.
 */
import { redactDataGoKrSecrets } from "./data-go-kr.mjs";

const BASE = "https://apis.data.go.kr/B551177";

/** @typedef {"ROUTE_COUNTRY_PASSENGERS" | "ROUTE_COUNTRY_FLIGHTS" | "TIME_BAND_PASSENGERS"} MonthlyOperationId */
/** @typedef {MonthlyOperationId | "SCHEDULED_DEPARTURES"} IncheonOperationId */

/**
 * @typedef {object} MonthlyStatsOperation
 * @property {MonthlyOperationId} operationId
 * @property {string} datasetId
 * @property {string} sourceId Reserved label for a later collector; nothing writes it today.
 * @property {string} endpoint
 * @property {"passengers" | "flights"} unit
 * @property {"country" | "time"} keyField The provider label that identifies a row.
 * @property {readonly string[]} optionalLabelFields
 * @property {Readonly<{ arrivals: string, departures: string, total: string }>} countFields
 */

/** @type {Readonly<Record<MonthlyOperationId, Readonly<MonthlyStatsOperation>>>} */
export const MONTHLY_STATS_OPERATIONS = Object.freeze({
  ROUTE_COUNTRY_PASSENGERS: Object.freeze({
    operationId: "ROUTE_COUNTRY_PASSENGERS",
    datasetId: "15095071",
    sourceId: "INCHEON_ROUTE_COUNTRY_PASSENGERS",
    endpoint: `${BASE}/AviationStatsByCountry/getTotalNumberOfPassenger`,
    unit: "passengers",
    keyField: "country",
    optionalLabelFields: Object.freeze(["region"]),
    countFields: Object.freeze({ arrivals: "arrPassenger", departures: "depPassenger", total: "passenger" }),
  }),
  ROUTE_COUNTRY_FLIGHTS: Object.freeze({
    operationId: "ROUTE_COUNTRY_FLIGHTS",
    datasetId: "15095071",
    sourceId: "INCHEON_ROUTE_COUNTRY_FLIGHTS",
    endpoint: `${BASE}/AviationStatsByCountry/getTotalNumberOfFlight`,
    unit: "flights",
    keyField: "country",
    optionalLabelFields: Object.freeze(["region"]),
    countFields: Object.freeze({ arrivals: "arrFlight", departures: "depFlight", total: "flights" }),
  }),
  TIME_BAND_PASSENGERS: Object.freeze({
    operationId: "TIME_BAND_PASSENGERS",
    datasetId: "15095070",
    sourceId: "INCHEON_TIME_BAND_PASSENGERS",
    endpoint: `${BASE}/AviationStatsByTimeline/getTotalNumberOfPassenger`,
    unit: "passengers",
    keyField: "time",
    optionalLabelFields: Object.freeze([]),
    countFields: Object.freeze({ arrivals: "arrPassenger", departures: "depPassenger", total: "passenger" }),
  }),
});

export const SCHEDULED_DEPARTURES_OPERATION = Object.freeze({
  operationId: /** @type {"SCHEDULED_DEPARTURES"} */ ("SCHEDULED_DEPARTURES"),
  datasetId: "15114085",
  sourceId: "INCHEON_REGULAR_SCHEDULE",
  endpoint: `${BASE}/StatusOfPaxFltSched/getPaxFltSchedDeparturesDeOdp`,
});

/** @type {ReadonlyArray<readonly ["monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday", Weekday]>} */
const WEEKDAY_FIELDS = Object.freeze([
  ["monday", "MON"], ["tuesday", "TUE"], ["wednesday", "WED"], ["thursday", "THU"],
  ["friday", "FRI"], ["saturday", "SAT"], ["sunday", "SUN"],
]);

/** Response fields PR #369 read from the official pages. Documented, never yet observed. */
const SCHEDULE_FIELDS = Object.freeze([
  "airline", "airport", "airportcode", "flightid", "masterflightid", "codeshare",
  "season", "firstdate", "lastdate", "st", ...WEEKDAY_FIELDS.map(([field]) => field),
]);

/**
 * @param {IncheonOperationId} operationId
 * @returns {readonly string[]}
 */
export function documentedFieldsOf(operationId) {
  if (operationId === "SCHEDULED_DEPARTURES") return SCHEDULE_FIELDS;
  const operation = MONTHLY_STATS_OPERATIONS[operationId];
  return [operation.keyField, ...operation.optionalLabelFields, ...Object.values(operation.countFields)];
}

/**
 * @param {IncheonOperationId} operationId
 * @returns {string}
 */
export function datasetIdOf(operationId) {
  return operationId === "SCHEDULED_DEPARTURES"
    ? SCHEDULED_DEPARTURES_OPERATION.datasetId
    : MONTHLY_STATS_OPERATIONS[operationId].datasetId;
}

/**
 * @typedef {object} TruthLabel
 * @property {string} metricDefinition
 * @property {"OFFICIAL_MONTHLY_STATISTICS" | "OFFICIAL_SCHEDULE"} nature
 * @property {"AIRPORT_WIDE"} terminalScope No terminal split unless the provider itself returns one.
 * @property {string} groupedBy
 * @property {string} ko
 * @property {string} en
 */

/**
 * What each number is, attached to every parse result so no consumer has to
 * remember it. The country service groups by the country of the flight's
 * route as the provider defines it; it says nothing about who travelled.
 *
 * @type {Readonly<Record<IncheonOperationId, Readonly<TruthLabel>>>}
 */
export const INCHEON_TRUTH_LABELS = Object.freeze({
  ROUTE_COUNTRY_PASSENGERS: Object.freeze({
    metricDefinition: "route_country_passengers",
    nature: "OFFICIAL_MONTHLY_STATISTICS",
    terminalScope: "AIRPORT_WIDE",
    groupedBy: "ROUTE_COUNTRY_AS_DEFINED_BY_PROVIDER",
    ko: "제공기관이 정한 운항 노선 국가(출발·도착 공항이 속한 나라) 기준으로 묶은 공항 전체 여객 수입니다. 여행자 개인의 속성을 나눈 값이 아니고 터미널별 값도 아닙니다.",
    en: "Airport-wide passenger counts grouped by the country of each flight's route (the country of the origin or destination airport) as the provider defines it. They do not describe the travellers themselves and are not per-terminal figures.",
  }),
  ROUTE_COUNTRY_FLIGHTS: Object.freeze({
    metricDefinition: "route_country_flights",
    nature: "OFFICIAL_MONTHLY_STATISTICS",
    terminalScope: "AIRPORT_WIDE",
    groupedBy: "ROUTE_COUNTRY_AS_DEFINED_BY_PROVIDER",
    ko: "제공기관이 정한 운항 노선 국가 기준으로 묶은 공항 전체 운항 편수입니다. 여객 수가 아니고 터미널별 값도 아닙니다.",
    en: "Airport-wide flight counts grouped by the country of each flight's route as the provider defines it. Flights, not passengers; not per-terminal figures.",
  }),
  TIME_BAND_PASSENGERS: Object.freeze({
    metricDefinition: "time_band_passengers",
    nature: "OFFICIAL_MONTHLY_STATISTICS",
    terminalScope: "AIRPORT_WIDE",
    groupedBy: "PROVIDER_TIME_BAND",
    ko: "요청한 달 기간의 공항 전체 여객 수를 제공기관의 시간대 구분으로 나눈 값입니다. 특정 하루의 흐름이나 예보가 아니고 터미널별 값도 아닙니다.",
    en: "Airport-wide passenger counts for the requested month range, split by the provider's own time bands. Not a single day's flow, not a forecast, not per-terminal.",
  }),
  SCHEDULED_DEPARTURES: Object.freeze({
    metricDefinition: "scheduled_regular_departures",
    nature: "OFFICIAL_SCHEDULE",
    terminalScope: "AIRPORT_WIDE",
    groupedBy: "SCHEDULE_ROW",
    ko: "정기편 출발 운항 계획(예정)입니다. 실제 운항 실적이나 탑승객 수가 아니며, 공동운항 행에는 같은 실제 항공편이 여러 번 나올 수 있습니다. 제공기관이 주지 않은 터미널은 추정하지 않습니다.",
    en: "Planned regular departures. Not operated flights and not passenger counts; codeshare rows can repeat one physical flight. No terminal is inferred when the provider does not give one.",
  }),
});

// ── Request building ────────────────────────────────────────────────────────

/** PR #369's page size and page ceiling: at most 3,000 schedule rows per run. */
export const SCHEDULE_PAGE_SIZE = 1000;
export const MAX_SCHEDULE_PAGES = 3;
/** One statistics request never spans more than a year of months. */
export const MAX_MONTH_SPAN = 12;

/**
 * @typedef {object} IncheonRequestPlan
 * @property {IncheonOperationId} operationId
 * @property {string} datasetId
 * @property {string} endpoint
 * @property {Readonly<Record<string, string>>} params Never contains the service key.
 * @property {Readonly<{ fromMonth: string, toMonth: string }> | null} monthRange YYYYMM, exactly as sent.
 * @property {Readonly<{ pageNo: number, numOfRows: number }> | null} page
 */

/** @param {unknown} value @returns {value is string} */
export function isYyyymm(value) {
  return typeof value === "string" && /^\d{4}(?:0[1-9]|1[0-2])$/.test(value);
}

/** @param {string} yyyymm */
function monthIndex(yyyymm) {
  return Number(yyyymm.slice(0, 4)) * 12 + Number(yyyymm.slice(4)) - 1;
}

/**
 * The KST calendar month (YYYYMM) an instant falls in.
 * @param {Date} now
 */
export function kstMonth(now) {
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  return `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * @param {string} yyyymm
 * @param {number} delta
 */
export function shiftMonth(yyyymm, delta) {
  if (!isYyyymm(yyyymm) || !Number.isInteger(delta)) throw new RangeError("invalid_month");
  const index = monthIndex(yyyymm) + delta;
  return `${Math.floor(index / 12)}${String((index % 12) + 1).padStart(2, "0")}`;
}

/**
 * The last KST month that has fully ended. A statistic for the running month
 * is partial by construction and is never requested.
 * @param {Date} now
 */
export function latestCompleteMonth(now) {
  return shiftMonth(kstMonth(now), -1);
}

/**
 * @param {MonthlyOperationId} operationId
 * @param {{ fromMonth: string, toMonth: string, now?: Date }} range
 * @returns {Readonly<IncheonRequestPlan>}
 */
export function buildMonthlyStatsRequest(operationId, { fromMonth, toMonth, now = new Date() }) {
  const operation = MONTHLY_STATS_OPERATIONS[operationId];
  if (!operation) throw new RangeError("unknown_monthly_operation");
  if (!isYyyymm(fromMonth) || !isYyyymm(toMonth)) throw new RangeError("month_must_be_yyyymm");
  if (fromMonth > toMonth) throw new RangeError("month_range_reversed");
  if (monthIndex(toMonth) - monthIndex(fromMonth) + 1 > MAX_MONTH_SPAN) throw new RangeError("month_range_too_long");
  if (toMonth > latestCompleteMonth(now)) throw new RangeError("month_not_yet_complete");
  return Object.freeze({
    operationId,
    datasetId: operation.datasetId,
    endpoint: operation.endpoint,
    // Exactly the parameters PR #369 sent. No paging parameter is documented
    // for these operations, so completeness is checked against totalCount.
    params: Object.freeze({ from_month: fromMonth, to_month: toMonth, type: "json" }),
    monthRange: Object.freeze({ fromMonth, toMonth }),
    page: null,
  });
}

/**
 * @param {{ pageNo?: number, numOfRows?: number, airport?: string }} [options]
 * @returns {Readonly<IncheonRequestPlan>}
 */
export function buildScheduledDeparturesRequest({ pageNo = 1, numOfRows = SCHEDULE_PAGE_SIZE, airport = "" } = {}) {
  if (!Number.isInteger(pageNo) || pageNo < 1 || pageNo > MAX_SCHEDULE_PAGES) throw new RangeError("page_out_of_bounds");
  if (!Number.isInteger(numOfRows) || numOfRows < 1 || numOfRows > SCHEDULE_PAGE_SIZE) throw new RangeError("page_size_out_of_bounds");
  if (airport !== "" && !/^[A-Z]{3}$/.test(airport)) throw new RangeError("airport_must_be_blank_or_iata");
  return Object.freeze({
    operationId: SCHEDULED_DEPARTURES_OPERATION.operationId,
    datasetId: SCHEDULED_DEPARTURES_OPERATION.datasetId,
    endpoint: SCHEDULED_DEPARTURES_OPERATION.endpoint,
    // Same names, order and values PR #369 sent. A blank `airport` asks for
    // every route; whether the provider honours a blank value is one of the
    // things the first authenticated probe has to establish.
    params: Object.freeze({ pageNo: String(pageNo), numOfRows: String(numOfRows), type: "json", airport, lang: "K" }),
    monthRange: null,
    page: Object.freeze({ pageNo, numOfRows }),
  });
}

/**
 * Everything about a request that may be logged. The key is never part of a
 * plan; it is added only when the URL is built for the actual fetch.
 * @param {IncheonRequestPlan} plan
 */
export function describeRequest(plan) {
  return {
    operationId: plan.operationId,
    datasetId: plan.datasetId,
    endpointPath: new URL(plan.endpoint).pathname,
    params: { ...plan.params },
  };
}

// ── Response classification ─────────────────────────────────────────────────

/**
 * @typedef {"OK" | "NO_DATA" | "NOT_REGISTERED" | "EXPIRED" | "LIMIT_EXCEEDED" | "RATE_LIMITED"
 *   | "AUTH_REJECTED" | "REQUEST_REJECTED" | "PROVIDER_ERROR" | "SERVER_ERROR" | "GATEWAY_HTML"
 *   | "TIMEOUT" | "NETWORK" | "SCHEMA_ERROR" | "KEY_NOT_CONFIGURED"} IncheonOutcomeKind
 */

/**
 * Safe to log in full: no URL, no key, no body, no row value.
 * @typedef {object} IncheonClassification
 * @property {IncheonOutcomeKind} kind
 * @property {number | null} httpStatus
 * @property {string | null} resultCode
 * @property {string | null} resultMsg Sanitized and redacted provider message.
 * @property {"json" | "xml" | "html" | "text" | "empty" | null} bodyFormat
 * @property {boolean} retryable Only transport failures, HTTP 5xx and 5xx gateway pages.
 * @property {boolean} authFailure
 * @property {string | null} issue Short machine code, e.g. HTTP_403 or EMPTY_BODY.
 */

/**
 * data.go.kr common result codes (공공데이터포털 OpenAPI 에러 코드).
 * @type {Readonly<Record<string, IncheonOutcomeKind>>}
 */
const RESULT_CODE_KINDS = Object.freeze({
  "00": "OK",
  "03": "NO_DATA",
  "01": "PROVIDER_ERROR", // APPLICATION_ERROR
  "02": "PROVIDER_ERROR", // DB_ERROR
  "04": "PROVIDER_ERROR", // HTTP_ERROR
  "05": "PROVIDER_ERROR", // SERVICETIME_OUT
  "99": "PROVIDER_ERROR", // UNKNOWN_ERROR
  "10": "REQUEST_REJECTED", // INVALID_REQUEST_PARAMETER_ERROR
  "11": "REQUEST_REJECTED", // NO_MANDATORY_REQUEST_PARAMETERS_ERROR
  "12": "REQUEST_REJECTED", // NO_OPENAPI_SERVICE_ERROR
  "20": "AUTH_REJECTED", // SERVICE_ACCESS_DENIED_ERROR
  "21": "AUTH_REJECTED", // TEMPORARILY_DISABLE_THE_SERVICEKEY_ERROR
  "22": "LIMIT_EXCEEDED", // LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR
  "23": "RATE_LIMITED", // LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR
  "30": "NOT_REGISTERED", // SERVICE_KEY_IS_NOT_REGISTERED_ERROR
  "31": "EXPIRED", // DEADLINE_HAS_EXPIRED_ERROR
  "32": "AUTH_REJECTED", // UNREGISTERED_IP_ERROR
  "33": "AUTH_REJECTED", // UNSIGNED_CALL_ERROR
});

/** Codes that decide the outcome whatever the HTTP status says. Never retried. */
const BLOCKING_CODES = new Set(["20", "21", "22", "23", "30", "31", "32", "33"]);
const AUTH_KINDS = new Set(["NOT_REGISTERED", "EXPIRED", "AUTH_REJECTED"]);

/**
 * When a body carries no numeric code, the gateway's documented message
 * constant still identifies it, as does the one Korean wording actually
 * observed (run 38402837925). Unobserved Korean wordings are not guessed.
 * @type {ReadonlyArray<readonly [RegExp, string, string]>}
 */
const MESSAGE_CODES = Object.freeze([
  [/SERVICE_KEY_IS_NOT_REGISTERED_ERROR|등록되지\s*않은\s*서비스\s*키/, "30", "SERVICE_KEY_IS_NOT_REGISTERED_ERROR"],
  [/DEADLINE_HAS_EXPIRED_ERROR/, "31", "DEADLINE_HAS_EXPIRED_ERROR"],
  [/LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR/, "23", "LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR"],
  [/LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR/, "22", "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR"],
  [/UNREGISTERED_IP_ERROR/, "32", "UNREGISTERED_IP_ERROR"],
  [/SERVICE_ACCESS_DENIED_ERROR/, "20", "SERVICE_ACCESS_DENIED_ERROR"],
  [/TEMPORARILY_DISABLE_THE_SERVICEKEY_ERROR/, "21", "TEMPORARILY_DISABLE_THE_SERVICEKEY_ERROR"],
  [/UNSIGNED_CALL_ERROR/, "33", "UNSIGNED_CALL_ERROR"],
  [/NO_OPENAPI_SERVICE_ERROR/, "12", "NO_OPENAPI_SERVICE_ERROR"],
]);

/** A body this large is not a statistics page; it is never parsed. */
const MAX_BODY_CHARS = 5_000_000;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Marks a present-but-unreadable value, as distinct from an absent one (null). */
const INVALID = Symbol("invalid");

/**
 * A provider count: integral and non-negative. Absent stays null and is never
 * turned into zero; an explicit "0" is a real zero.
 * @param {unknown} value
 * @returns {number | null | typeof INVALID}
 */
function readCount(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? value : INVALID;
  if (typeof value !== "string") return INVALID;
  let text = value.trim();
  if (/^\d{1,3}(?:,\d{3})+(?:\.0+)?$/.test(text)) text = text.replace(/,/g, "");
  if (!/^\d+(?:\.0+)?$/.test(text)) return INVALID;
  const count = Number(text);
  return Number.isSafeInteger(count) ? count : INVALID;
}

/** @param {unknown} value @returns {string | null} */
function normalizeResultCode(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 1000) return String(value).padStart(2, "0");
  if (typeof value === "string" && /^\s*\d{1,3}\s*$/.test(value)) return value.trim().padStart(2, "0");
  return null;
}

/** @param {unknown} text @returns {{ code: string, constant: string } | null} */
function codeFromMessage(text) {
  if (typeof text !== "string" || !text) return null;
  for (const [pattern, code, constant] of MESSAGE_CODES) if (pattern.test(text)) return { code, constant };
  return null;
}

/**
 * Provider wording is printed, so it is redacted first and then reduced to a
 * short run of letters, digits and plain punctuation.
 * @param {unknown} raw
 * @param {string} serviceKey
 * @returns {string | null}
 */
export function sanitizeProviderMessage(raw, serviceKey) {
  if (typeof raw !== "string") return null;
  const cleaned = redactDataGoKrSecrets(raw, serviceKey)
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S*/gi, "[URL]")
    .replace(/serviceKey/gi, "[PARAM]")
    .replace(/[^\p{L}\p{N} ._,:()[\]/-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || null;
}

/**
 * The first of `names` present as a simple XML element, in preference order.
 * @param {string} text
 * @param {readonly string[]} names
 * @returns {string | null}
 */
function xmlTagValue(text, names) {
  for (const name of names) {
    const match = new RegExp(`<${name}>([^<]{0,200})</${name}>`, "i").exec(text);
    if (match) return match[1].trim();
  }
  return null;
}

/**
 * @param {string | null} contentType
 * @param {string} text
 * @returns {"json" | "xml" | "html" | "text" | "empty"}
 */
function detectBodyFormat(contentType, text) {
  const head = text.trimStart().slice(0, 512).toLowerCase();
  if (!head) return "empty";
  if (head.includes("<!doctype html") || /<html[\s>]/.test(head) || (/text\/html/i.test(contentType ?? "") && head.startsWith("<"))) return "html";
  if (head.startsWith("<")) return "xml";
  if (head.startsWith("{") || head.startsWith("[")) return "json";
  return "text";
}

/**
 * The envelopes data.go.kr is known to use: the service `response.header`,
 * the gateway `OpenAPI_ServiceResponse.cmmMsgHeader`, a bare `header`, and a
 * flat `{resultCode, resultMsg}`.
 *
 * @param {unknown} payload
 * @returns {{ code: unknown, message: unknown, body: unknown } | null}
 */
function jsonEnvelope(payload) {
  if (!isRecord(payload)) return null;
  const response = payload.response;
  if (isRecord(response)) {
    const header = isRecord(response.header) ? response.header : {};
    return { code: header.resultCode, message: header.resultMsg, body: response.body };
  }
  const gateway = payload.OpenAPI_ServiceResponse;
  if (isRecord(gateway) && isRecord(gateway.cmmMsgHeader)) {
    const header = gateway.cmmMsgHeader;
    return { code: header.returnReasonCode, message: header.returnAuthMsg ?? header.errMsg, body: undefined };
  }
  if (isRecord(payload.header)) return { code: payload.header.resultCode, message: payload.header.resultMsg, body: payload.body };
  if ("resultCode" in payload) return { code: payload.resultCode, message: payload.resultMsg, body: payload.body };
  return null;
}

/**
 * @typedef {object} ItemsRead
 * @property {true} ok
 * @property {Record<string, unknown>[]} items
 * @property {number | null} totalCount
 */

/**
 * @param {unknown} body
 * @returns {ItemsRead | { ok: false, issue: string }}
 */
function readItems(body) {
  if (!isRecord(body)) return { ok: false, issue: "BODY_MISSING" };
  const totalCount = readCount(body.totalCount);
  if (totalCount === INVALID) return { ok: false, issue: "TOTAL_COUNT_INVALID" };
  const raw = body.items;
  /** @type {unknown[]} */
  let list;
  if (raw === undefined || raw === null || raw === "") list = [];
  else if (Array.isArray(raw)) list = raw;
  else if (isRecord(raw)) {
    const item = raw.item;
    list = item === undefined || item === null || item === "" ? [] : Array.isArray(item) ? item : [item];
  } else return { ok: false, issue: "ITEMS_MALFORMED" };
  /** @type {Record<string, unknown>[]} */
  const items = [];
  for (const entry of list) {
    if (!isRecord(entry)) return { ok: false, issue: "ITEM_NOT_OBJECT" };
    items.push(entry);
  }
  return { ok: true, items, totalCount };
}

/**
 * Classify one HTTP response. The payload is handed back only for OK, and
 * only for the parser; it never belongs in a log line.
 *
 * Order matters: an auth or quota code decides the outcome whatever the HTTP
 * status, then HTTP-level failures, then the body of an HTTP 200.
 *
 * @param {{ status: number, contentType?: string | null, bodyText: string, serviceKey?: string }} response
 * @returns {{ classification: IncheonClassification, payload: unknown }}
 */
export function inspectIncheonResponse({ status, contentType = null, bodyText, serviceKey = "" }) {
  const text = typeof bodyText === "string" ? bodyText : "";
  /** @type {IncheonClassification["bodyFormat"]} */
  let format = detectBodyFormat(contentType, text);
  /** @type {unknown} */
  let payload = null;
  if (format === "json" && text.length <= MAX_BODY_CHARS) {
    try {
      payload = JSON.parse(text);
    } catch {
      format = "text";
    }
  }

  const envelope = format === "json" ? jsonEnvelope(payload) : null;
  let code = normalizeResultCode(envelope?.code);
  /** @type {unknown} */
  let message = envelope?.message ?? null;
  if (format === "xml") {
    code = normalizeResultCode(xmlTagValue(text, ["resultCode", "returnReasonCode"]));
    message = xmlTagValue(text, ["resultMsg", "returnAuthMsg", "errMsg"]);
  }
  if (code === null) {
    // Plain text or HTML is never echoed; only a recognised constant is.
    const known = codeFromMessage(format === "json" || format === "xml" ? message : text.slice(0, 4000));
    if (known) {
      code = known.code;
      if (format !== "json" && format !== "xml") message = known.constant;
    }
  }
  if (format === "text" || format === "html" || format === "empty") {
    message = typeof message === "string" && MESSAGE_CODES.some(([, , constant]) => constant === message) ? message : null;
  }
  const resultMsg = sanitizeProviderMessage(message, serviceKey);

  /**
   * @param {IncheonOutcomeKind} kind
   * @param {string | null} [issue]
   * @param {boolean} [retryable]
   */
  const done = (kind, issue = null, retryable = false) => ({
    classification: {
      kind,
      httpStatus: status,
      resultCode: code,
      resultMsg,
      bodyFormat: format,
      retryable,
      authFailure: AUTH_KINDS.has(kind),
      issue,
    },
    payload: kind === "OK" ? payload : null,
  });

  if (code !== null && BLOCKING_CODES.has(code)) return done(RESULT_CODE_KINDS[code]);
  if (status === 429) return done("RATE_LIMITED", "HTTP_429");
  if (status >= 300 && status < 400) return done("REQUEST_REJECTED", "UNEXPECTED_REDIRECT");
  if (format === "html") return done("GATEWAY_HTML", `HTTP_${status}`, status >= 500);
  if (status === 401 || status === 403) return done("AUTH_REJECTED", code ? `RESULT_CODE_${code}` : `HTTP_${status}`);
  if (status >= 500) return done("SERVER_ERROR", `HTTP_${status}`, true);
  if (status !== 200) return done("REQUEST_REJECTED", code ? `RESULT_CODE_${code}` : `HTTP_${status}`);

  if (text.length > MAX_BODY_CHARS) return done("SCHEMA_ERROR", "BODY_TOO_LARGE");
  if (format === "empty") return done("SCHEMA_ERROR", "EMPTY_BODY");
  if (code === null) {
    return done("SCHEMA_ERROR", format === "json" ? "RESULT_CODE_MISSING" : format === "xml" ? "XML_WITHOUT_RESULT_CODE" : "MALFORMED_BODY");
  }
  const kind = RESULT_CODE_KINDS[code] ?? "PROVIDER_ERROR";
  if (kind === "NO_DATA") return done("NO_DATA", "RESULT_CODE_03");
  if (kind !== "OK") return done(kind, `RESULT_CODE_${code}`);
  if (format !== "json") return done("SCHEMA_ERROR", "SUCCESS_BODY_NOT_JSON");

  const items = readItems(envelope?.body);
  if (!items.ok) return done("SCHEMA_ERROR", items.issue);
  if (items.items.length === 0) {
    // An empty success is a valid "nothing published", never a zero.
    return items.totalCount === null || items.totalCount === 0
      ? done("NO_DATA", "EMPTY_SUCCESS")
      : done("SCHEMA_ERROR", "EMPTY_ITEMS_WITH_POSITIVE_TOTAL");
  }
  return done("OK");
}

// ── Parsing ─────────────────────────────────────────────────────────────────

/**
 * @param {unknown} value
 * @param {number} maxLength
 * @returns {string | null | typeof INVALID}
 */
function readText(value, maxLength) {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  if (typeof value !== "string") return INVALID;
  const text = value.trim();
  if (!text) return null;
  return text.length <= maxLength ? text : INVALID;
}

/**
 * @param {unknown} value
 * @param {RegExp} pattern
 * @returns {string | null | typeof INVALID}
 */
function readCode(value, pattern) {
  const text = readText(value, 16);
  if (text === null || text === INVALID) return text;
  const upper = text.toUpperCase();
  return pattern.test(upper) ? upper : INVALID;
}

/**
 * A provider calendar date (YYYYMMDD, KST) kept as a calendar date.
 * @param {unknown} value
 * @returns {string | null | typeof INVALID}
 */
function readCalendarDate(value) {
  const text = readText(value, 10);
  if (text === null || text === INVALID) return text;
  const match = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(text);
  if (!match) return INVALID;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return INVALID;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * A provider schedule time (`st`, HHMM or HH:MM, local time) as HH:MM.
 * @param {unknown} value
 * @returns {string | null | typeof INVALID}
 */
function readScheduleTime(value) {
  const text = readText(value, 5);
  if (text === null || text === INVALID) return text;
  const match = /^(\d{1,2}):?(\d{2})$/.exec(/^\d{3}$/.test(text) ? `0${text}` : text);
  if (!match) return INVALID;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return INVALID;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

/**
 * @param {unknown} value
 * @returns {boolean | typeof INVALID}
 */
function readWeekdayFlag(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value === "string") {
    const flag = value.trim().toUpperCase();
    if (flag === "Y" || flag === "1") return true;
    if (flag === "N" || flag === "0") return false;
  }
  return INVALID;
}

/** A total or subtotal row the provider itself includes. Never summed with its parts. */
const AGGREGATE_LABEL = /^(?:합계|총계|소계|계|전체|total|grand\s*total|sub\s*total|subtotal|sum)$/i;

/**
 * Reads a provider time band only when it is unambiguous ("00~01", "0-1",
 * "00시~01시", "00:00~01:00", "0000~0100", "23~24", "7", "07시"). Anything else
 * stays raw with no hour, and the contract is flagged for review.
 *
 * @param {string} label
 * @returns {Readonly<{ startHour: number, endHour: number }> | null}
 */
export function parseHourBand(label) {
  const text = label.trim();
  const range = /^(\d{1,2})(?::?00)?\s*시?\s*[~\-–_]\s*(\d{1,2})(?::?(?:00|59))?\s*시?$/.exec(text);
  const single = /^(\d{1,2})\s*시?$/.exec(text);
  let startHour;
  let endHour;
  if (range) {
    startHour = Number(range[1]);
    endHour = Number(range[2]);
    if (/:?59$/.test(text)) endHour += 1;
    if (endHour === 0 && startHour === 23) endHour = 24;
  } else if (single) {
    startHour = Number(single[1]);
    endHour = startHour + 1;
  } else {
    return null;
  }
  if (startHour < 0 || startHour > 23 || endHour <= startHour || endHour > 24) return null;
  return Object.freeze({ startHour, endHour });
}

/**
 * @typedef {object} ContractReport
 * @property {"MATCH" | "DRIFT" | "UNOBSERVED"} status UNOBSERVED when there was no row to compare.
 * @property {string[]} observedFieldNames
 * @property {string[]} unknownFieldNames Received but undocumented; kept out of the rows.
 * @property {string[]} missingDocumentedFieldNames Documented but absent from every row.
 * @property {number} unprintableFieldNameCount
 * @property {string[]} issues
 */

const PRINTABLE_FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
/** An undocumented field that may carry a terminal split must be reviewed before any scope label changes. */
const TERMINAL_HINT = /terminal|^t[12]|^p0[13]$/i;

/**
 * @param {Record<string, unknown>[]} items
 * @param {readonly string[]} documented
 * @param {Iterable<string>} issues
 * @returns {ContractReport}
 */
function contractReport(items, documented, issues) {
  /** @type {Set<string>} */
  const observed = new Set();
  for (const item of items) for (const name of Object.keys(item)) observed.add(name);
  const printable = [...observed].filter((name) => PRINTABLE_FIELD_NAME.test(name)).sort();
  const unknown = printable.filter((name) => !documented.includes(name));
  const missing = items.length ? documented.filter((name) => !observed.has(name)) : [];
  const allIssues = new Set(issues);
  if (unknown.some((name) => TERMINAL_HINT.test(name))) allIssues.add("PROVIDER_TERMINAL_FIELD_UNREVIEWED");
  const unprintableFieldNameCount = observed.size - printable.length;
  const drift = unknown.length > 0 || missing.length > 0 || unprintableFieldNameCount > 0 || allIssues.size > 0;
  return {
    status: items.length === 0 ? "UNOBSERVED" : drift ? "DRIFT" : "MATCH",
    observedFieldNames: printable,
    unknownFieldNames: unknown,
    missingDocumentedFieldNames: missing,
    unprintableFieldNameCount,
    issues: [...allIssues].sort(),
  };
}

/** @param {Set<string>} issues */
function cappedIssues(issues) {
  return [...issues].sort().slice(0, 12);
}

/**
 * @typedef {object} MonthlyStatsRow
 * @property {string} label The provider's own label: country name or time band.
 * @property {string | null} region
 * @property {number | null} arrivals
 * @property {number | null} departures
 * @property {number | null} total The provider's own total field; never computed here.
 * @property {boolean} isProviderAggregate A total/subtotal row: use it OR its parts, never both.
 * @property {Readonly<{ startHour: number, endHour: number }> | null} hourBand Time-band rows only.
 */

/**
 * @typedef {object} ParsedMonthlyStats
 * @property {"MONTHLY_STATS"} shape
 * @property {"VALID" | "EMPTY" | "SCHEMA_ERROR"} status EMPTY is the provider's valid "no data", never zero.
 * @property {MonthlyOperationId} operationId
 * @property {MonthlyStatsRow[]} rows Empty unless status is VALID.
 * @property {number} itemCount
 * @property {number | null} totalCount
 * @property {boolean | null} complete null when the provider gives no totalCount.
 * @property {number} aggregateRowCount
 * @property {number} duplicateKeyCount
 * @property {Readonly<{ fromMonth: string, toMonth: string, source: "REQUEST_PARAMETERS" }>} basis
 * @property {ContractReport} contract
 * @property {string[]} schemaIssues
 * @property {Readonly<TruthLabel>} truth
 */

/**
 * @param {IncheonRequestPlan} plan
 * @returns {Readonly<MonthlyStatsOperation>}
 */
function monthlyOperationOf(plan) {
  const operation = plan.operationId === "SCHEDULED_DEPARTURES" ? undefined : MONTHLY_STATS_OPERATIONS[plan.operationId];
  if (!operation || !plan.monthRange) throw new RangeError("not_a_monthly_stats_plan");
  return operation;
}

/**
 * @param {Readonly<MonthlyStatsOperation>} operation
 * @param {Readonly<{ fromMonth: string, toMonth: string }>} monthRange
 * @returns {ParsedMonthlyStats}
 */
function monthlyShell(operation, monthRange) {
  return {
    shape: "MONTHLY_STATS",
    status: "EMPTY",
    operationId: operation.operationId,
    rows: [],
    itemCount: 0,
    totalCount: null,
    complete: null,
    aggregateRowCount: 0,
    duplicateKeyCount: 0,
    // The response is not known to echo its period, so the basis is the
    // complete month range that was requested.
    basis: Object.freeze({ fromMonth: monthRange.fromMonth, toMonth: monthRange.toMonth, source: "REQUEST_PARAMETERS" }),
    contract: contractReport([], documentedFieldsOf(operation.operationId), []),
    schemaIssues: [],
    truth: INCHEON_TRUTH_LABELS[operation.operationId],
  };
}

/**
 * Parse an OK response of a monthly statistics operation. Any invalid value
 * fails the whole response closed (no partial rows); undocumented fields,
 * duplicates, unreadable time bands and similar are reported as DRIFT.
 *
 * @param {IncheonRequestPlan} plan
 * @param {unknown} payload
 * @returns {ParsedMonthlyStats}
 */
export function parseMonthlyStats(plan, payload) {
  const operation = monthlyOperationOf(plan);
  const shell = monthlyShell(operation, /** @type {Readonly<{ fromMonth: string, toMonth: string }>} */ (plan.monthRange));
  const read = readItems(jsonEnvelope(payload)?.body);
  if (!read.ok) return { ...shell, status: "SCHEMA_ERROR", schemaIssues: [read.issue] };

  /** @type {Set<string>} */
  const schemaIssues = new Set();
  /** @type {Set<string>} */
  const contractIssues = new Set();
  /** @type {MonthlyStatsRow[]} */
  const rows = [];
  for (const item of read.items) {
    const label = readText(item[operation.keyField], 80);
    if (label === null || label === INVALID) {
      schemaIssues.add(`${operation.keyField}:${label === null ? "MISSING" : "INVALID"}`);
      continue;
    }
    const region = operation.optionalLabelFields.includes("region") ? readText(item.region, 80) : null;
    if (region === INVALID) {
      schemaIssues.add("region:INVALID");
      continue;
    }
    /** @type {{ arrivals: number | null, departures: number | null, total: number | null }} */
    const counts = { arrivals: null, departures: null, total: null };
    let countsValid = true;
    for (const role of /** @type {const} */ (["arrivals", "departures", "total"])) {
      const field = operation.countFields[role];
      const value = readCount(item[field]);
      if (value === INVALID) {
        schemaIssues.add(`${field}:INVALID`);
        countsValid = false;
      } else {
        counts[role] = value;
      }
    }
    if (!countsValid) continue;
    if (counts.arrivals === null && counts.departures === null && counts.total === null) {
      schemaIssues.add("COUNTS_ALL_ABSENT");
      continue;
    }
    const isProviderAggregate = AGGREGATE_LABEL.test(label) || (region !== null && AGGREGATE_LABEL.test(region));
    const hourBand = operation.keyField === "time" && !isProviderAggregate ? parseHourBand(label) : null;
    if (operation.keyField === "time" && !isProviderAggregate && hourBand === null) contractIssues.add("TIME_BAND_UNRECOGNIZED");
    if (counts.arrivals !== null && counts.departures !== null && counts.total !== null && counts.arrivals + counts.departures !== counts.total) {
      contractIssues.add("PROVIDER_TOTAL_DIFFERS_FROM_ARRIVALS_PLUS_DEPARTURES");
    }
    rows.push({ label, region, ...counts, isProviderAggregate, hourBand });
  }

  /** @type {Set<string>} */
  const seen = new Set();
  let duplicateKeyCount = 0;
  for (const row of rows) {
    if (row.isProviderAggregate) continue;
    const key = `${row.region ?? ""}\u0000${row.label}`;
    if (seen.has(key)) duplicateKeyCount += 1;
    seen.add(key);
  }
  if (duplicateKeyCount) contractIssues.add("DUPLICATE_ROW_KEYS");
  const complete = read.totalCount === null ? null : read.totalCount === read.items.length;
  if (complete === false) contractIssues.add("TOTAL_COUNT_DIFFERS_FROM_ITEMS");

  const valid = schemaIssues.size === 0;
  return {
    ...shell,
    status: valid ? "VALID" : "SCHEMA_ERROR",
    rows: valid ? rows : [],
    itemCount: read.items.length,
    totalCount: read.totalCount,
    complete,
    aggregateRowCount: valid ? rows.filter((row) => row.isProviderAggregate).length : 0,
    duplicateKeyCount,
    contract: contractReport(read.items, documentedFieldsOf(operation.operationId), contractIssues),
    schemaIssues: cappedIssues(schemaIssues),
  };
}

/** @typedef {"MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN"} Weekday */

/**
 * @typedef {object} ScheduledDepartureRow
 * @property {string} flightId
 * @property {string | null} masterFlightId
 * @property {string | null} codeshare Kept as given; codeshare semantics are not yet verified.
 * @property {string | null} airline
 * @property {string | null} airport
 * @property {string | null} airportCode
 * @property {string | null} season
 * @property {string} validFrom YYYY-MM-DD, the provider's firstdate (KST calendar date).
 * @property {string} validTo YYYY-MM-DD, the provider's lastdate (KST calendar date).
 * @property {string} scheduledTime HH:MM local time from the provider's `st`.
 * @property {Weekday[]} weekdays
 */

/**
 * @typedef {object} ParsedSchedulePage
 * @property {"SCHEDULE"} shape
 * @property {"VALID" | "EMPTY" | "SCHEMA_ERROR"} status
 * @property {"SCHEDULED_DEPARTURES"} operationId
 * @property {ScheduledDepartureRow[]} rows Empty unless status is VALID.
 * @property {number} itemCount
 * @property {number | null} totalCount
 * @property {number} pageNo
 * @property {number} numOfRows
 * @property {number | null} pagesNeeded
 * @property {boolean | null} withinPagingBound Whether every row fits in MAX_SCHEDULE_PAGES pages.
 * @property {boolean | null} complete Whether this page alone holds every row.
 * @property {number} duplicateKeyCount
 * @property {Readonly<{ validFromMin: string | null, validToMax: string | null, seasons: string[], source: "PROVIDER_ROWS" }>} basis
 * @property {ContractReport} contract
 * @property {string[]} schemaIssues
 * @property {Readonly<TruthLabel>} truth
 */

/**
 * @param {IncheonRequestPlan} plan
 * @returns {ParsedSchedulePage}
 */
function scheduleShell(plan) {
  if (plan.operationId !== "SCHEDULED_DEPARTURES" || !plan.page) throw new RangeError("not_a_schedule_plan");
  return {
    shape: "SCHEDULE",
    status: "EMPTY",
    operationId: "SCHEDULED_DEPARTURES",
    rows: [],
    itemCount: 0,
    totalCount: null,
    pageNo: plan.page.pageNo,
    numOfRows: plan.page.numOfRows,
    pagesNeeded: null,
    withinPagingBound: null,
    complete: null,
    duplicateKeyCount: 0,
    basis: Object.freeze({ validFromMin: null, validToMax: null, seasons: [], source: "PROVIDER_ROWS" }),
    contract: contractReport([], SCHEDULE_FIELDS, []),
    schemaIssues: [],
    truth: INCHEON_TRUTH_LABELS.SCHEDULED_DEPARTURES,
  };
}

const FLIGHT_ID = /^[A-Z0-9]{3,8}$/;
const AIRPORT_CODE = /^[A-Z0-9]{3,4}$/;
/** Season is informational: any short label is accepted, only a plain one is echoed in the basis. */
const PRINTABLE_SEASON = /^[\p{L}\p{N} _-]{1,24}$/u;

/** @param {string | null} value @returns {value is string} */
function isPrintableSeason(value) {
  return value !== null && PRINTABLE_SEASON.test(value);
}

/**
 * Parse one OK page of scheduled departures. Rows are planned operations,
 * never actual ones, and carry no terminal unless the provider adds one.
 *
 * @param {IncheonRequestPlan} plan
 * @param {unknown} payload
 * @returns {ParsedSchedulePage}
 */
export function parseScheduledDepartures(plan, payload) {
  const shell = scheduleShell(plan);
  const read = readItems(jsonEnvelope(payload)?.body);
  if (!read.ok) return { ...shell, status: "SCHEMA_ERROR", schemaIssues: [read.issue] };

  /** @type {Set<string>} */
  const schemaIssues = new Set();
  /** @type {Set<string>} */
  const contractIssues = new Set();
  /** @type {ScheduledDepartureRow[]} */
  const rows = [];
  for (const item of read.items) {
    const flightId = readCode(item.flightid, FLIGHT_ID);
    const masterFlightId = readCode(item.masterflightid, FLIGHT_ID);
    const airportCode = readCode(item.airportcode, AIRPORT_CODE);
    const season = readText(item.season, 24);
    const codeshare = readText(item.codeshare, 20);
    const airline = readText(item.airline, 60);
    const airport = readText(item.airport, 60);
    const validFrom = readCalendarDate(item.firstdate);
    const validTo = readCalendarDate(item.lastdate);
    const scheduledTime = readScheduleTime(item.st);
    /** @type {Array<readonly [string, unknown]>} */
    const checks = [
      ["flightid", flightId], ["masterflightid", masterFlightId], ["airportcode", airportCode], ["season", season],
      ["codeshare", codeshare], ["airline", airline], ["airport", airport],
      ["firstdate", validFrom], ["lastdate", validTo], ["st", scheduledTime],
    ];
    let rowValid = true;
    for (const [field, value] of checks) {
      if (value === INVALID) {
        schemaIssues.add(`${field}:INVALID`);
        rowValid = false;
      }
    }
    for (const [field, value] of /** @type {const} */ ([["flightid", flightId], ["firstdate", validFrom], ["lastdate", validTo], ["st", scheduledTime]])) {
      if (value === null) {
        schemaIssues.add(`${field}:MISSING`);
        rowValid = false;
      }
    }
    /** @type {Weekday[]} */
    const weekdays = [];
    for (const [field, day] of WEEKDAY_FIELDS) {
      const flag = readWeekdayFlag(item[field]);
      if (flag === INVALID) {
        schemaIssues.add(`${field}:UNRECOGNIZED_VALUE`);
        rowValid = false;
      } else if (flag) {
        weekdays.push(day);
      }
    }
    if (!rowValid) continue;
    if (typeof validFrom === "string" && typeof validTo === "string" && validFrom > validTo) {
      schemaIssues.add("firstdate:AFTER_LASTDATE");
      continue;
    }
    rows.push({
      flightId: /** @type {string} */ (flightId),
      masterFlightId: /** @type {string | null} */ (masterFlightId),
      codeshare: /** @type {string | null} */ (codeshare),
      airline: /** @type {string | null} */ (airline),
      airport: /** @type {string | null} */ (airport),
      airportCode: /** @type {string | null} */ (airportCode),
      season: /** @type {string | null} */ (season),
      validFrom: /** @type {string} */ (validFrom),
      validTo: /** @type {string} */ (validTo),
      scheduledTime: /** @type {string} */ (scheduledTime),
      weekdays,
    });
  }

  /** @type {Set<string>} */
  const seen = new Set();
  let duplicateKeyCount = 0;
  for (const row of rows) {
    const key = [row.flightId, row.airportCode, row.scheduledTime, row.validFrom, row.validTo, row.season, row.weekdays.join(",")].join("\u0000");
    if (seen.has(key)) duplicateKeyCount += 1;
    seen.add(key);
  }
  if (duplicateKeyCount) contractIssues.add("DUPLICATE_ROW_KEYS");

  const { pageNo, numOfRows } = shell;
  const totalCount = read.totalCount;
  const expectedOnPage = totalCount === null ? null : Math.max(0, Math.min(numOfRows, totalCount - (pageNo - 1) * numOfRows));
  if (expectedOnPage !== null && expectedOnPage !== read.items.length) contractIssues.add("PAGE_ITEM_COUNT_MISMATCH");
  const pagesNeeded = totalCount === null ? null : Math.ceil(totalCount / numOfRows);
  const valid = schemaIssues.size === 0;
  const validFroms = rows.map((row) => row.validFrom).sort();
  const validTos = rows.map((row) => row.validTo).sort();
  return {
    ...shell,
    status: valid ? "VALID" : "SCHEMA_ERROR",
    rows: valid ? rows : [],
    itemCount: read.items.length,
    totalCount,
    pagesNeeded,
    withinPagingBound: pagesNeeded === null ? null : pagesNeeded <= MAX_SCHEDULE_PAGES,
    complete: totalCount === null ? null : pageNo === 1 && totalCount === read.items.length,
    duplicateKeyCount,
    basis: Object.freeze({
      validFromMin: validFroms[0] ?? null,
      validToMax: validTos[validTos.length - 1] ?? null,
      seasons: [...new Set(rows.map((row) => row.season).filter(isPrintableSeason))].sort().slice(0, 6),
      source: "PROVIDER_ROWS",
    }),
    contract: contractReport(read.items, SCHEDULE_FIELDS, contractIssues),
    schemaIssues: cappedIssues(schemaIssues),
  };
}

/**
 * The parse result for NO_DATA: a valid empty answer. Rows are empty and no
 * total exists; a consumer shows "not published", never 0.
 *
 * @param {IncheonRequestPlan} plan
 * @returns {ParsedMonthlyStats | ParsedSchedulePage}
 */
export function emptyResultFor(plan) {
  return plan.operationId === "SCHEDULED_DEPARTURES"
    ? scheduleShell(plan)
    : monthlyShell(monthlyOperationOf(plan), /** @type {Readonly<{ fromMonth: string, toMonth: string }>} */ (plan.monthRange));
}

/**
 * @param {IncheonRequestPlan} plan
 * @param {unknown} payload
 * @returns {ParsedMonthlyStats | ParsedSchedulePage}
 */
export function parseIncheonPayload(plan, payload) {
  return plan.operationId === "SCHEDULED_DEPARTURES" ? parseScheduledDepartures(plan, payload) : parseMonthlyStats(plan, payload);
}
