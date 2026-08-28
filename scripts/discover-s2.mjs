/**
 * S2 discovery probe — current official Seoul short-stay foreign living
 * population (250m grid) product.
 *
 * Why this exists: the dong-level 단기체류외국인 생활인구 series (OA-14993
 * family) stopped updating after the 2026-06-09 portal reorganization. The
 * successor's exact dataset ID and OpenAPI service name are UNVERIFIED in
 * docs/DATA_SOURCES.md, and they must be read from the live portal rather
 * than guessed.
 *
 * Scope contract:
 * - Seoul hosts ONLY. This script makes zero data.go.kr requests; the
 *   owner's data.go.kr account is externally blocked and must not be probed.
 * - Reads the official portal CATALOG (dataset list / dataset view) to learn
 *   the dataset ID, title and the officially published OpenAPI service name.
 *   This is metadata discovery, not data scraping: no observation values are
 *   harvested from HTML, and every actual data read goes through the official
 *   OpenAPI with the official key.
 * - Authenticated calls are limited to service names DISCOVERED from the
 *   portal, capped by MAX_AUTH_CALLS, 5 rows each.
 * - Nothing is persisted.
 * - The key, full request URLs and unredacted gateway text are never printed.
 *
 * Exit code stays 0 unless the script itself crashes: the output lines are
 * the diagnostic result, and a blocked source is a finding, not a CI bug.
 */

const SEOUL_KEY = process.env.SEOUL_OPEN_DATA_KEY ?? "";
const MAX_CANDIDATES = 8;
const MAX_AUTH_CALLS = 22;

const SECRETS = [SEOUL_KEY].filter(Boolean);

function redact(value) {
  if (typeof value !== "string") return null;
  let out = value;
  for (const secret of SECRETS) {
    out = out.replaceAll(secret, "[REDACTED]");
    out = out.replaceAll(encodeURIComponent(secret), "[REDACTED]");
    try {
      out = out.replaceAll(decodeURIComponent(secret), "[REDACTED]");
    } catch {
      // A non-decodable key has no decoded form to leak.
    }
  }
  // Any Seoul OpenAPI URL carries the key in its path; strip the path segment.
  out = out.replace(/(openapi\.seoul\.go\.kr:8088\/)[^/\s]+/gi, "$1[REDACTED]");
  return out.slice(0, 400);
}

function keyDiagnostics(value) {
  return {
    present: Boolean(value),
    looksPercentEncoded: /%[0-9A-Fa-f]{2}/.test(value),
    hasWhitespace: /\s/.test(value),
  };
}

async function fetchText(url, label) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/json",
      // The portal returns an error page to an unidentified client.
      "user-agent": "KORETAIL-source-verification/1.0 (+https://koretaildata.com)",
    },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  return { label, status: response.status, text };
}

function decodeEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .trim();
}

function stripTags(value) {
  return decodeEntities(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));
}

/**
 * Pull `OA-#####` ids out of a portal listing page together with the nearest
 * following link text, which is the dataset title on datasetList.do.
 */
function extractCandidates(html) {
  const found = new Map();
  const linkPattern = /dataList\/(OA-\d+)\/[A-Za-z]\/\d+\/datasetView\.do[^>]*>([\s\S]{0,300}?)<\/a>/g;
  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    const id = match[1];
    const title = stripTags(match[2]);
    if (title && !found.has(id)) found.set(id, title);
  }
  // Fallback: ids with no capturable anchor text still deserve a follow-up.
  for (const bare of html.matchAll(/(OA-\d+)/g)) {
    if (!found.has(bare[1])) found.set(bare[1], "");
  }
  return [...found.entries()].map(([datasetId, title]) => ({ datasetId, title }));
}

/** Template ids the portal ships unfilled; never real service names. */
const TEMPLATE_PLACEHOLDER = /^(API_SERVICE_NAME|REQ_PRM_EXP|RES_PRM_EXP|SAMPLE_URL|SERVICE_NAME|DATA_SET)$/;

/** The portal prints a sample call containing the official service name. */
function extractServiceNames(html) {
  const names = new Set();
  for (const m of html.matchAll(/openapi\.seoul\.go\.kr:8088\/[^/\s"'<]+\/(?:xml|json)\/([A-Za-z0-9_]+)/gi)) {
    names.add(m[1]);
  }
  // Run 4 showed this proximity match harvests markup and template ids
  // (defaultUrl, caption, strong, Bypass, API_SERVICE_NAME, REQ_PRM_EXP) and
  // then burns one authenticated call on each. A real Seoul service name is
  // SCREAMING_SNAKE with at least one underscore, so require that shape.
  for (const m of html.matchAll(/(?:서비스명|SERVICE\s*NAME|샘플\s*URL)[\s\S]{0,200}?\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g)) {
    if (!TEMPLATE_PLACEHOLDER.test(m[1])) names.add(m[1]);
  }
  return [...names];
}

function looksLikeShortStayForeign(title) {
  return /단기|외국인/.test(title);
}

/**
 * Seoul service names are SCREAMING_SNAKE (e.g. SPOP_LOCAL_RESD_DONG). Run 2
 * showed the dataset page renders its sample URL client-side, so the visible
 * table is empty server-side — but the name may still ship inside inline JS.
 * Collect the shape directly and drop known HTML/JS/analytics noise.
 */
const TOKEN_NOISE =
  /^(DOCTYPE|UTF|GET|POST|XMLHTTPREQUEST|OPEN|API|JSON|XML|CSV|HTML|HEAD|BODY|SCRIPT|STYLE|CDATA|FALSE|TRUE|NULL|UNDEFINED|FUNCTION|RETURN|WINDOW|DOCUMENT|CONTENT|CHARSET|VIEWPORT|KEYWORDS|DESCRIPTION|GOOGLE|ANALYTICS|GTAG|DATALAYER|JQUERY|BOOTSTRAP|CONTAINER|WRAPPER|SEOUL|DATASET|DATALIST|DEFAULT|OPTIONS|REQUIRED)$/;

function extractUppercaseTokens(html) {
  const counts = new Map();
  for (const match of html.matchAll(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){2,}\b/g)) {
    const token = match[0];
    if (TOKEN_NOISE.test(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([token, count]) => ({ token, count }));
}

/** The `.do` endpoints a client-rendered page calls are the real transport. */
function extractDoEndpoints(html) {
  const found = new Set();
  for (const match of html.matchAll(/["'`]([^"'`\s]*\/[A-Za-z0-9_]+\.do)(?:[?"'`])/g)) {
    found.add(match[1]);
  }
  return [...found].slice(0, 30);
}

function listify(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null || value === "" ? [] : [value];
}

/** Summarize a Seoul open-data envelope ({SERVICE:{RESULT,row}} or {RESULT}). */
function summarizeSeoul(status, payload, textSnippet) {
  const body = payload ?? {};
  const keys = Object.keys(body);
  const serviceKeyName = keys.find(
    (key) => body[key] && typeof body[key] === "object" && !Array.isArray(body[key]) && (body[key].RESULT || body[key].row),
  );
  const service = serviceKeyName ? body[serviceKeyName] : null;
  const resultBlock = service?.RESULT ?? body.RESULT ?? {};
  const code = resultBlock.CODE ?? resultBlock["RESULT.CODE"] ?? null;
  const rows = listify(service?.row ?? keys.map((key) => body[key]).find(Array.isArray));
  const ok = status === 200 && (code === "INFO-000" || (!code && rows.length > 0));
  const first = rows[0] ?? {};
  return {
    httpStatus: status,
    format: payload ? "json" : "non-json",
    envelopeKey: serviceKeyName ?? null,
    officialResultCode: code,
    officialResultMessage: redact(String(resultBlock.MESSAGE ?? resultBlock["RESULT.MESSAGE"] ?? "")),
    listTotalCount: service?.list_total_count ?? null,
    recordCount: rows.length,
    firstRecordFieldNames: Object.keys(first).sort(),
    // A single sample row is required to determine real field semantics
    // (grid id, coordinates, reference time, nationality, population).
    firstRecordSample: redact(JSON.stringify(first)),
    authStatus: ok ? "PASS" : "BLOCKED",
    nonJsonSnippet: textSnippet,
  };
}

const out = [];
const log = (line) => out.push(line);

// ------------------------------------------------------- catalog transport
// Run 1 (2026-08-28) proved datasetList.do is a client-rendered shell: three
// different search terms all returned byte-identical HTML, so the query never
// reached the server. Locate the JSON transport the page actually uses before
// trying to read the catalog again.
const TERM = "단기외국인 생활인구";
const encoded = encodeURIComponent(TERM);

const transportCandidates = [
  { method: "GET", url: `https://data.seoul.go.kr/dataList/datasetList.do?srchWord=${encoded}` },
  { method: "GET", url: `https://data.seoul.go.kr/dataList/datasetListAjax.do?srchWord=${encoded}` },
  { method: "POST", url: "https://data.seoul.go.kr/dataList/datasetListAjax.do", body: `srchWord=${encoded}` },
  { method: "POST", url: "https://data.seoul.go.kr/dataList/datasetList.do", body: `srchWord=${encoded}` },
  { method: "GET", url: `https://data.seoul.go.kr/dataList/selectDatasetList.do?srchWord=${encoded}` },
  { method: "GET", url: `https://data.seoul.go.kr/together/aiSearch/searchList.do?srchWord=${encoded}` },
  { method: "GET", url: `https://data.seoul.go.kr/dataList/dataListSearch.do?srchWord=${encoded}` },
  // The OpenAPI tab of a dataset page; /A/ is the API view of the 250m
  // 내국인 grid product recorded in docs/DATA_SOURCES.md as OA-22784.
  { method: "GET", url: "https://data.seoul.go.kr/dataList/OA-22784/A/1/datasetView.do" },
  { method: "GET", url: "https://data.seoul.go.kr/dataList/OA-22784/S/1/datasetView.do" },
];

const candidates = new Map();

for (const probe of transportCandidates) {
  try {
    const response = await fetch(probe.url, {
      method: probe.method,
      headers: {
        accept: "application/json, text/javascript, text/html;q=0.8",
        "x-requested-with": "XMLHttpRequest",
        "user-agent": "KORETAIL-source-verification/1.0 (+https://koretaildata.com)",
        ...(probe.body ? { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" } : {}),
      },
      body: probe.body,
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    const found = extractCandidates(text);
    let isJson = false;
    try {
      JSON.parse(text);
      isJson = true;
    } catch {
      isJson = false;
    }
    log({
      step: "transport_probe",
      method: probe.method,
      url: probe.url.replace(encoded, "<TERM>"),
      httpStatus: response.status,
      contentType: response.headers.get("content-type"),
      bytes: text.length,
      isJson,
      mentionsTerm: text.includes("단기") || text.includes("생활인구"),
      candidateCount: found.length,
      candidates: found.slice(0, 15),
      head: redact(text.slice(0, 300)),
    });
    for (const entry of found) {
      if (!candidates.has(entry.datasetId) || (entry.title && !candidates.get(entry.datasetId))) {
        candidates.set(entry.datasetId, entry.title);
      }
    }
  } catch (error) {
    log({
      step: "transport_probe",
      method: probe.method,
      url: probe.url.replace(encoded, "<TERM>"),
      error: redact(error instanceof Error ? error.message : "fetch_failed"),
    });
  }
}

// Run 2 already resolved these titles from the portal, and the transport that
// surfaced them is incidental (a related-dataset block), so re-deriving them
// each run is unstable — run 3 ranked two unrelated ids instead. Seed the
// confirmed ids directly and let discovery only add to them.
const CONFIRMED = [
  { datasetId: "OA-22786", title: "[단기외국인] 서울 생활인구(250m)" },
  { datasetId: "OA-23018", title: "[단기외국인] 행정동별 서울 생활인구(250m)" },
  { datasetId: "OA-22894", title: "[단기외국인] 서울 체류인구(250m)" },
  { datasetId: "OA-22785", title: "[장기외국인] 서울 생활인구(250m)" },
];

for (const entry of CONFIRMED) {
  if (!candidates.get(entry.datasetId)) candidates.set(entry.datasetId, entry.title);
}

// Prefer titles that actually mention short-stay foreigners.
const ranked = [
  ...CONFIRMED,
  ...[...candidates.entries()]
    .map(([datasetId, title]) => ({ datasetId, title }))
    .filter((entry) => !CONFIRMED.some((seed) => seed.datasetId === entry.datasetId))
    .sort((a, b) => Number(looksLikeShortStayForeign(b.title)) - Number(looksLikeShortStayForeign(a.title))),
].slice(0, MAX_CANDIDATES);

log({ step: "candidates_ranked", total: candidates.size, inspecting: ranked });

// ------------------------------------------------------------ dataset view
const serviceNames = new Map();

for (const candidate of ranked) {
  const url = `https://data.seoul.go.kr/dataList/${candidate.datasetId}/S/1/datasetView.do`;
  try {
    const page = await fetchText(url, candidate.datasetId);
    const text = stripTags(page.text);
    const names = extractServiceNames(page.text);
    const titleMatch = page.text.match(/<title>([\s\S]{0,200}?)<\/title>/i);
    log({
      step: "dataset_view",
      datasetId: candidate.datasetId,
      httpStatus: page.status,
      pageTitle: titleMatch ? stripTags(titleMatch[1]) : null,
      listTitle: candidate.title || null,
      serviceNames: names,
      mentions250m: /250\s*[mM]/.test(text),
      mentionsShortStay: /단기/.test(text),
      mentionsOpenApi: /OPEN\s*API|오픈\s*API/i.test(text),
      mentionsFile: /파일|FILE|CSV/i.test(text),
      // Run 2: the rendered table is empty server-side, so read the raw HTML
      // for the service-name shape and for the transport the page calls.
      uppercaseTokens: extractUppercaseTokens(page.text),
      doEndpoints: extractDoEndpoints(page.text),
      // Portal metadata rows worth reading verbatim in the log.
      excerpt: redact(text.slice(0, 1200)),
    });
    for (const name of names) {
      if (!serviceNames.has(name)) serviceNames.set(name, candidate.datasetId);
    }
  } catch (error) {
    log({ step: "dataset_view", datasetId: candidate.datasetId, error: redact(error instanceof Error ? error.message : "fetch_failed") });
  }
}

// ---------------------------------------------------------- openApiView.do
// Run 3 dumped the endpoints the dataset page calls. `/dataList/openApiView.do`
// is the OpenAPI tab renderer — the one place the portal publishes the sample
// URL, and therefore the service name. The parameter form is unknown, so try
// the documented shapes and let the response adjudicate.
for (const candidate of ranked.slice(0, 4)) {
  const forms = [
    { method: "GET", url: `https://data.seoul.go.kr/dataList/openApiView.do?infId=${candidate.datasetId}` },
    { method: "GET", url: `https://data.seoul.go.kr/dataList/${candidate.datasetId}/S/1/openApiView.do` },
    { method: "POST", url: "https://data.seoul.go.kr/dataList/openApiView.do", body: `infId=${candidate.datasetId}&srvType=S&serviceKind=1` },
  ];
  for (const form of forms) {
    try {
      const response = await fetch(form.url, {
        method: form.method,
        headers: {
          accept: "text/html,application/json",
          "x-requested-with": "XMLHttpRequest",
          "user-agent": "KORETAIL-source-verification/1.0 (+https://koretaildata.com)",
          ...(form.body ? { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" } : {}),
        },
        body: form.body,
        signal: AbortSignal.timeout(15_000),
      });
      const text = await response.text();
      const names = extractServiceNames(text);
      const tokens = extractUppercaseTokens(text);
      log({
        step: "open_api_view",
        datasetId: candidate.datasetId,
        method: form.method,
        url: form.url,
        httpStatus: response.status,
        bytes: text.length,
        serviceNames: names,
        uppercaseTokens: tokens,
        mentionsSampleUrl: /openapi\.seoul\.go\.kr/i.test(text),
        doEndpoints: extractDoEndpoints(text),
        excerpt: redact(stripTags(text).slice(0, 1500)),
      });
      for (const name of names) if (!serviceNames.has(name)) serviceNames.set(name, candidate.datasetId);
      // A token that appears on the OpenAPI tab and nowhere in the site chrome
      // is the strongest available service-name signal; probe it for real.
      for (const { token } of tokens) if (!serviceNames.has(token)) serviceNames.set(token, candidate.datasetId);
    } catch (error) {
      log({ step: "open_api_view", datasetId: candidate.datasetId, method: form.method, url: form.url, error: redact(error instanceof Error ? error.message : "fetch_failed") });
    }
  }
}

// -------------------------------------------------------- getReqParam.do
// Run 4 read the OpenAPI tab's own script: it fills the spec by POSTing
// {infId} to /together/mypage/getReqParam.do and expects JSON back. That is
// the endpoint holding the real parameter list, and plausibly the service
// name the template leaves as API_SERVICE_NAME.
for (const candidate of ranked.slice(0, 4)) {
  try {
    const response = await fetch("https://data.seoul.go.kr/together/mypage/getReqParam.do", {
      method: "POST",
      headers: {
        accept: "application/json, text/javascript",
        "x-requested-with": "XMLHttpRequest",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        referer: `https://data.seoul.go.kr/dataList/${candidate.datasetId}/S/1/datasetView.do`,
        "user-agent": "KORETAIL-source-verification/1.0 (+https://koretaildata.com)",
      },
      body: `infId=${candidate.datasetId}`,
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
    const names = extractServiceNames(text);
    log({
      step: "req_param",
      datasetId: candidate.datasetId,
      httpStatus: response.status,
      isJson: payload !== null,
      bytes: text.length,
      topLevelKeys: payload && typeof payload === "object" ? Object.keys(payload).slice(0, 20) : null,
      serviceNames: names,
      uppercaseTokens: extractUppercaseTokens(text),
      // The parameter spec is small; log enough of it to read field semantics.
      body: redact(payload ? JSON.stringify(payload) : stripTags(text).slice(0, 1200)),
    });
    for (const name of names) if (!serviceNames.has(name)) serviceNames.set(name, candidate.datasetId);
  } catch (error) {
    log({ step: "req_param", datasetId: candidate.datasetId, error: redact(error instanceof Error ? error.message : "fetch_failed") });
  }
}

// ------------------------------------------------------- template trace
// Run 5 separated the products: OA-23018 (dong-aggregated short-stay foreign)
// returns a real parameter list — YMD, TT, H_DNG_CD — while the three pure
// 250m-grid ids return {paramList:[],filterList:[]}, i.e. no OpenAPI at all.
// So OA-23018 is the one service worth naming. Its tab ships the name as the
// literal API_SERVICE_NAME placeholder, so read what surrounds that token to
// find whatever fills it.
try {
  const response = await fetch("https://data.seoul.go.kr/dataList/openApiView.do", {
    method: "POST",
    headers: {
      accept: "text/html,application/json",
      "x-requested-with": "XMLHttpRequest",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      referer: "https://data.seoul.go.kr/dataList/OA-23018/S/1/datasetView.do",
      "user-agent": "KORETAIL-source-verification/1.0 (+https://koretaildata.com)",
    },
    body: "infId=OA-23018&srvType=S&serviceKind=1",
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  const at = text.indexOf("API_SERVICE_NAME");
  log({
    step: "template_trace",
    datasetId: "OA-23018",
    httpStatus: response.status,
    bytes: text.length,
    placeholderIndex: at,
    doEndpoints: extractDoEndpoints(text),
    // The raw window around the placeholder names whatever substitutes it.
    around: at >= 0 ? redact(text.slice(Math.max(0, at - 700), at + 700)) : null,
  });
} catch (error) {
  log({ step: "template_trace", datasetId: "OA-23018", error: redact(error instanceof Error ? error.message : "fetch_failed") });
}

// --------------------------------------------------- getOpenApiSample.do
// Run 6 traced the tab's scripts: the sample call is built by
// /dataList/getOpenApiSample.do. That is where the portal finally emits the
// real service name, so ask it for every confirmed id — including the three
// grid ids, to confirm from the portal itself that they publish no service.
for (const candidate of ranked.slice(0, 4)) {
  for (const body of [`infId=${candidate.datasetId}`, `infId=${candidate.datasetId}&srvType=S&serviceKind=1&reqType=json`]) {
    try {
      const response = await fetch("https://data.seoul.go.kr/dataList/getOpenApiSample.do", {
        method: "POST",
        headers: {
          accept: "application/json, text/javascript, text/html",
          "x-requested-with": "XMLHttpRequest",
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          referer: `https://data.seoul.go.kr/dataList/${candidate.datasetId}/S/1/datasetView.do`,
          "user-agent": "KORETAIL-source-verification/1.0 (+https://koretaildata.com)",
        },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      const text = await response.text();
      const names = extractServiceNames(text);
      log({
        step: "open_api_sample",
        datasetId: candidate.datasetId,
        bodyShape: body.includes("srvType") ? "full" : "infId-only",
        httpStatus: response.status,
        bytes: text.length,
        serviceNames: names,
        tokens: extractUppercaseTokens(text).map((t) => t.token),
        sample: redact(text.slice(0, 600)),
      });
      for (const name of names) if (!serviceNames.has(name)) serviceNames.set(name, candidate.datasetId);
    } catch (error) {
      log({ step: "open_api_sample", datasetId: candidate.datasetId, error: redact(error instanceof Error ? error.message : "fetch_failed") });
    }
  }
}

log({ step: "service_names_discovered", serviceNames: [...serviceNames.entries()].map(([name, datasetId]) => ({ name, datasetId })) });

// -------------------------------------------------------- authenticated probe
// Service names read from the catalog are authoritative. When the catalog is
// unreadable, the official OpenAPI is itself the authority on whether a
// service name exists: a wrong name returns a distinct official error code,
// and only an INFO-000 response with a real schema is treated as verified.
// Nothing here is assumed correct without that response.
const nameCandidates = [
  // Documented dong-level living-population family, to confirm the naming
  // convention and to read the legacy series' last published period.
  "SPOP_LOCAL_RESD_DONG",
  "SPOP_FORN_RESD_DONG",
  "SPOP_TEMP_FORN_RESD_DONG",
  "SPOP_LONG_FORN_RESD_DONG",
  // Plausible 250m-grid successors following the same convention.
  "SPOP_LOCAL_RESD_GRID",
  "SPOP_FORN_RESD_GRID",
  "SPOP_TEMP_FORN_RESD_GRID",
  "SPOP_LONG_FORN_RESD_GRID",
  // Negative control. Run 2 returned ERROR-500 for every foreign variant, but
  // that code is only evidence of discontinuation if a name that certainly
  // never existed returns something else. Without this the run cannot tell
  // "service retired" from "service name wrong".
  "KORETAIL_CONTROL_NO_SUCH_SERVICE",
];

// Discovered names go first (they carry actual portal evidence), but the
// budget must never starve the control — its answer is what makes every other
// ERROR-500 in this run interpretable.
const CONTROL = "KORETAIL_CONTROL_NO_SUCH_SERVICE";
const probeTargets = [
  ...[...serviceNames.entries()].slice(0, 10).map(([name, datasetId]) => ({ name, datasetId, origin: "discovered" })),
  ...nameCandidates.filter((name) => name !== CONTROL).map((name) => ({ name, datasetId: null, origin: "candidate" })),
  { name: CONTROL, datasetId: null, origin: "control" },
];

const keyDiag = keyDiagnostics(SEOUL_KEY);
if (!keyDiag.present) {
  log({ step: "auth_probe", authStatus: "BLOCKED", reason: "SEOUL_OPEN_DATA_KEY missing" });
} else {
  let calls = 0;
  for (const { name, datasetId, origin } of probeTargets) {
    if (calls >= MAX_AUTH_CALLS) {
      log({ step: "auth_probe", skipped: name, reason: "MAX_AUTH_CALLS reached" });
      continue;
    }
    calls += 1;
    const url = `http://openapi.seoul.go.kr:8088/${SEOUL_KEY}/json/${name}/1/5/`;
    try {
      const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
      const text = await response.text();
      let payload = null;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
      log({ step: "auth_probe", service: name, datasetId, origin, ...summarizeSeoul(response.status, payload, payload ? null : redact(text)) });
    } catch (error) {
      log({ step: "auth_probe", service: name, datasetId, origin, authStatus: "ERROR", reason: redact(error instanceof Error ? error.message : "fetch_failed") });
    }
  }
}

for (const line of out) console.log(JSON.stringify(line));

const probes = out.filter((entry) => entry.step === "auth_probe" && entry.service);
const control = probes.find((entry) => entry.service === "KORETAIL_CONTROL_NO_SUCH_SERVICE");
const foreignCodes = probes
  .filter((entry) => /FORN/.test(entry.service))
  .map((entry) => entry.officialResultCode);

console.log(JSON.stringify({
  summary: true,
  seoulKey: keyDiag,
  dataGoKrCalls: 0,
  candidatesFound: candidates.size,
  serviceNamesDiscovered: [...serviceNames.keys()],
  passingServices: probes.filter((entry) => entry.authStatus === "PASS").map((entry) => entry.service),
  controlResultCode: control?.officialResultCode ?? null,
  // Printed last and compactly on purpose: the dataset_view excerpts dominate
  // this log, and the parameter spec is the part worth reading each run.
  openApiSample: out
    .filter((entry) => entry.step === "open_api_sample")
    .map((entry) => ({
      datasetId: entry.datasetId,
      bodyShape: entry.bodyShape,
      httpStatus: entry.httpStatus,
      bytes: entry.bytes,
      serviceNames: entry.serviceNames,
      tokens: entry.tokens,
      sample: typeof entry.sample === "string" ? entry.sample.slice(0, 300) : null,
      error: entry.error ?? null,
    })),
  reqParamDigest: out
    .filter((entry) => entry.step === "req_param")
    .map((entry) => ({
      datasetId: entry.datasetId,
      httpStatus: entry.httpStatus,
      isJson: entry.isJson,
      bytes: entry.bytes,
      topLevelKeys: entry.topLevelKeys,
      serviceNames: entry.serviceNames,
      tokens: (entry.uppercaseTokens ?? []).map((t) => t.token),
      body: typeof entry.body === "string" ? entry.body.slice(0, 500) : null,
      error: entry.error ?? null,
    })),
  // If the control returns the same code as every foreign name, that code means
  // "no such service" and proves nothing about discontinuation.
  foreignCodeInterpretation:
    control && foreignCodes.length > 0 && foreignCodes.every((code) => code === control.officialResultCode)
      ? "INDISTINGUISHABLE_FROM_UNKNOWN_SERVICE_NAME"
      : control
        ? "DISTINCT_FROM_UNKNOWN_SERVICE_NAME"
        : "CONTROL_MISSING",
}));
