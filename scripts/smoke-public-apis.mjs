import { runSeoulS2Smoke } from "./smoke-public-apis-lib.mjs";
import { buildDataGoKrUrl, redactDataGoKrSecrets } from "../lib/data-go-kr.mjs";

/**
 * Read-only smoke verification for KORETAIL official data sources.
 *
 * `SMOKE_SCOPE` selects which providers are contacted: `all` (default) or
 * `seoul` to contact Seoul hosts only. Use `seoul` while the owner's
 * data.go.kr account is externally blocked, so a Seoul-side check never
 * spends calls against — or reports noise from — a provider that is known
 * to be unreachable for account reasons.
 *
 * Safety contract:
 * - one normal request per source, plus at most ONE structurally justified
 *   alternate construction call against the first airport API when the
 *   gateway reports code 30 and the stored key looks percent-encoded;
 * - nothing is persisted;
 * - keys, full request URLs and unredacted gateway text are never printed;
 * - output is one safe JSON line per source plus a final summary line.
 *
 * Exit code stays 0 unless the script itself crashes: the output lines are
 * the diagnostic result, and a blocked source is a finding, not a CI bug.
 */

const DATA_KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? "";
const SEOUL_KEY = process.env.SEOUL_OPEN_DATA_KEY ?? "";
const SCOPE = (process.env.SMOKE_SCOPE ?? "all").trim().toLowerCase();
const SEOUL_ONLY = SCOPE === "seoul";

function keyDiagnostics(value) {
  return {
    present: Boolean(value),
    looksPercentEncoded: /%[0-9A-Fa-f]{2}/.test(value),
    hasWhitespace: /\s/.test(value),
  };
}

const SECRETS = [DATA_KEY, SEOUL_KEY].filter(Boolean);

function redact(value) {
  if (typeof value !== "string") return null;
  let out = DATA_KEY ? redactDataGoKrSecrets(value, DATA_KEY) : value;
  for (const secret of SECRETS) {
    out = out.replaceAll(secret, "[REDACTED]");
    out = out.replaceAll(encodeURIComponent(secret), "[REDACTED]");
    try {
      out = out.replaceAll(decodeURIComponent(secret), "[REDACTED]");
    } catch {
      // A non-decodable key has no decoded form to leak.
    }
  }
  return out.slice(0, 200);
}

function kstDate(offsetDays = 0) {
  const now = new Date(Date.now() + 9 * 3_600_000 + offsetDays * 86_400_000);
  return now.toISOString().slice(0, 10).replaceAll("-", "");
}

async function fetchOnce(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  return { status: response.status, payload, textSnippet: payload ? null : redact(text) };
}

function listify(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null || value === "" ? [] : [value];
}

/** Summarize a data.go.kr-style envelope (airport, KMA, TourAPI). */
function summarizeDataGoKr(result) {
  const payload = result.payload ?? {};
  const envelope = payload.response ?? payload;
  const header = envelope?.header ?? {};
  const body = envelope?.body ?? {};
  const gateway = payload.OpenAPI_ServiceResponse?.cmmMsgHeader ?? {};
  const items = listify(body?.items?.item ?? body?.items);
  const resultCode = header.resultCode ?? null;
  const gatewayCode = gateway.returnReasonCode ? redact(String(gateway.returnReasonCode)) : null;
  // KMA succeeds with "00", TourAPI with "0000"; "03" is official NO_DATA.
  const ok = result.status === 200 && ["0", "00", "0000"].includes(String(resultCode));
  const noData = result.status === 200 && String(resultCode) === "03";
  return {
    httpStatus: result.status,
    format: result.payload ? "json" : "non-json",
    officialResultCode: resultCode ?? gatewayCode,
    officialResultMessage: redact(String(header.resultMsg ?? gateway.returnAuthMsg ?? gateway.errMsg ?? "")),
    topLevelKeys: Object.keys(payload).sort().slice(0, 12),
    recordCount: items.length,
    totalCount: body.totalCount ?? null,
    pageNo: body.pageNo ?? null,
    numOfRows: body.numOfRows ?? null,
    firstRecordFieldNames: Object.keys(items[0] ?? {}).sort(),
    authStatus: ok ? "PASS" : noData ? "NO_DATA" : result.status === 403 || gateway.returnReasonCode ? "BLOCKED" : "ERROR",
    nonJsonSnippet: result.textSnippet,
  };
}

/** Summarize a Seoul open-data envelope ({SERVICE:{RESULT,row}} or {RESULT}). */
function summarizeSeoul(result) {
  const payload = result.payload ?? {};
  const keys = Object.keys(payload);
  const serviceKeyName = keys.find((key) => payload[key] && typeof payload[key] === "object" && !Array.isArray(payload[key]) && (payload[key].RESULT || payload[key].row));
  const service = serviceKeyName ? payload[serviceKeyName] : null;
  const resultBlock = service?.RESULT ?? payload.RESULT ?? {};
  const code = resultBlock.CODE ?? resultBlock["RESULT.CODE"] ?? null;
  const rows = listify(service?.row ?? keys.map((key) => payload[key]).find(Array.isArray));
  const ok = result.status === 200 && (code === "INFO-000" || (!code && rows.length > 0));
  return {
    httpStatus: result.status,
    format: result.payload ? "json" : "non-json",
    officialResultCode: code,
    officialResultMessage: redact(String(resultBlock.MESSAGE ?? resultBlock["RESULT.MESSAGE"] ?? "")),
    topLevelKeys: keys.sort().slice(0, 12),
    listTotalCount: service?.list_total_count ?? null,
    recordCount: rows.length,
    firstRecordFieldNames: Object.keys(rows[0] ?? {}).sort().slice(0, 40),
    authStatus: ok ? "PASS" : "BLOCKED",
    nonJsonSnippet: result.textSnippet,
  };
}

const KST_TODAY = kstDate(0);
const KST_YESTERDAY = kstDate(-1);

const dataGoKrSources = [
  {
    id: "A1_flight_detail",
    endpoint: "https://apis.data.go.kr/B551177/statusOfAllFltDeOdp/getFltDeparturesDeOdp",
    params: { pageNo: "1", numOfRows: "2", type: "json" },
  },
  {
    id: "A2_duty_free_actual",
    endpoint: "https://apis.data.go.kr/B551177/statusOfAPaxFlt4DutyFree/getAPaxFlt4DutyFreeDepartures",
    params: { pageNo: "1", numOfRows: "2", type: "json" },
  },
  {
    id: "A3_duty_free_schedule",
    endpoint: "https://apis.data.go.kr/B551177/statusOfSPaxFlt4DutyFree/getSPaxFlt4DutyFreeDepartures",
    params: { pageNo: "1", numOfRows: "2", type: "json" },
  },
  {
    // terminalId P01 = T1; P03 = T2 (T2 row presence must be verified live).
    id: "A4_departure_congestion",
    endpoint: "https://apis.data.go.kr/B551177/statusOfDepartureCongestion/getDepartureCongestion",
    params: { pageNo: "1", numOfRows: "3", type: "json", terminalId: "P01" },
  },
  {
    id: "W1_kma_vilage_fcst",
    endpoint: "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst",
    params: { pageNo: "1", numOfRows: "12", dataType: "JSON", base_date: KST_YESTERDAY, base_time: "2300", nx: "60", ny: "127" },
  },
  {
    // Success code is "0000" for TourAPI. No geographic filter here: the smoke
    // goal is auth + field names, and v4.4 is migrating areaCode → lDong codes.
    id: "T1_tourapi_festival",
    endpoint: "https://apis.data.go.kr/B551011/KorService2/searchFestival2",
    params: { pageNo: "1", numOfRows: "2", MobileOS: "ETC", MobileApp: "KORETAIL", _type: "json", eventStartDate: KST_TODAY },
  },
];

const seoulSources = [
  {
    // Official hotspot codes: POI003 명동 관광특구, POI007 홍대 관광특구,
    // POI068 성수카페거리. POI codes avoid Korean URL-encoding pitfalls.
    id: "S1_seoul_citydata_ppltn",
    service: "citydata_ppltn",
    pathTail: "POI003",
  },
  {
    // 추정매출-상권 (OA-15572). Live verification 2026-08-27: only the quarter
    // positional filter applies; trade-area segments are ignored, so the
    // collector sweeps quarter pages and filters client-side.
    id: "S3_seoul_estimated_sales",
    service: "VwsmTrdarSelngQq",
    pathTail: "20261",
  },
];

const results = [];

async function runDataGoKr() {
  const diag = keyDiagnostics(DATA_KEY);
  if (SEOUL_ONLY) {
    for (const source of dataGoKrSources) results.push({ sourceId: source.id, authStatus: "SKIPPED", reason: "SMOKE_SCOPE=seoul" });
    return { construction: null, diag, skipped: true };
  }
  if (!diag.present) {
    for (const source of dataGoKrSources) results.push({ sourceId: source.id, authStatus: "BLOCKED", reason: "DATA_GO_KR_SERVICE_KEY missing" });
    return { construction: null, diag };
  }

  const construction = "normalized-single-encoding";
  const [first, ...rest] = dataGoKrSources;

  try {
    const firstResult = summarizeDataGoKr(await fetchOnce(buildDataGoKrUrl(first.endpoint, DATA_KEY, first.params)));
    results.push({ sourceId: first.id, construction, ...firstResult });
  } catch (error) {
    results.push({ sourceId: first.id, authStatus: "ERROR", reason: redact(error instanceof Error ? error.message : "fetch_failed") });
  }

  for (const source of rest) {
    const url = buildDataGoKrUrl(source.endpoint, DATA_KEY, source.params);
    try {
      results.push({ sourceId: source.id, construction, ...summarizeDataGoKr(await fetchOnce(url)) });
    } catch (error) {
      results.push({ sourceId: source.id, authStatus: "ERROR", reason: redact(error instanceof Error ? error.message : "fetch_failed") });
    }
  }
  return { construction, diag };
}

async function runSeoul() {
  const diag = keyDiagnostics(SEOUL_KEY);
  if (!diag.present) {
    for (const source of seoulSources) results.push({ sourceId: source.id, authStatus: "BLOCKED", reason: "SEOUL_OPEN_DATA_KEY missing" });
    return { diag };
  }
  for (const source of seoulSources) {
    const tail = source.pathTail ? `/${source.pathTail}` : "";
    const url = `http://openapi.seoul.go.kr:8088/${SEOUL_KEY}/json/${source.service}/1/5${tail}`;
    try {
      results.push({ sourceId: source.id, ...summarizeSeoul(await fetchOnce(url)) });
    } catch (error) {
      results.push({ sourceId: source.id, authStatus: "ERROR", reason: redact(error instanceof Error ? error.message : "fetch_failed") });
    }
  }
  results.push(await runSeoulS2Smoke({ key: SEOUL_KEY }));
  return { diag };
}

let dataGoKrRun = { construction: null, diag: keyDiagnostics(DATA_KEY) };
try {
  dataGoKrRun = await runDataGoKr();
} catch (error) {
  results.push({ sourceId: "data.go.kr", authStatus: "ERROR", reason: redact(error instanceof Error ? error.message : "fetch_failed") });
}
const seoulRun = await runSeoul();

for (const line of results) console.log(JSON.stringify(line));

const dataGoKrBlocked = results.filter((entry) => /^(A|W|T)/.test(entry.sourceId) && entry.authStatus === "BLOCKED").length;
console.log(JSON.stringify({
  summary: true,
  scope: SCOPE,
  dataGoKrKey: dataGoKrRun.diag,
  seoulKey: seoulRun.diag,
  construction: dataGoKrRun.construction,
  classification: !dataGoKrRun.skipped && dataGoKrBlocked === dataGoKrSources.length && dataGoKrRun.diag.present
    ? "DATA_GO_KR_AUTH_PROPAGATION_OR_REGISTRATION_BLOCKED"
    : null,
  sources: results.map((entry) => ({ sourceId: entry.sourceId, authStatus: entry.authStatus ?? "UNKNOWN" })),
}));
