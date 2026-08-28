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
const MAX_AUTH_CALLS = 4;

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

/** The portal prints a sample call containing the official service name. */
function extractServiceNames(html) {
  const names = new Set();
  for (const m of html.matchAll(/openapi\.seoul\.go\.kr:8088\/[^/\s"'<]+\/(?:xml|json)\/([A-Za-z0-9_]+)/gi)) {
    names.add(m[1]);
  }
  for (const m of html.matchAll(/(?:서비스명|SERVICE\s*NAME|샘플\s*URL)[\s\S]{0,200}?([A-Za-z][A-Za-z0-9_]{5,40})/g)) {
    const value = m[1];
    if (!/^(openapi|seoul|http|https|sample|json|xml|KEY)$/i.test(value)) names.add(value);
  }
  return [...names];
}

function looksLikeShortStayForeign(title) {
  return /단기|외국인/.test(title);
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

// ---------------------------------------------------------------- catalog
const searchTerms = [
  "생활인구 250",
  "단기외국인 생활인구",
  "단기체류외국인",
];

const candidates = new Map();

for (const term of searchTerms) {
  const url = `https://data.seoul.go.kr/dataList/datasetList.do?srchWord=${encodeURIComponent(term)}&srchDataGubun=&srchOrgId=&srchDetailWord=`;
  try {
    const page = await fetchText(url, term);
    const found = extractCandidates(page.text);
    log({
      step: "catalog_search",
      term,
      httpStatus: page.status,
      htmlBytes: page.text.length,
      candidateCount: found.length,
      candidates: found.slice(0, 20),
    });
    for (const entry of found) {
      if (!candidates.has(entry.datasetId) || (entry.title && !candidates.get(entry.datasetId))) {
        candidates.set(entry.datasetId, entry.title);
      }
    }
  } catch (error) {
    log({ step: "catalog_search", term, error: redact(error instanceof Error ? error.message : "fetch_failed") });
  }
}

// Prefer titles that actually mention short-stay foreigners.
const ranked = [...candidates.entries()]
  .map(([datasetId, title]) => ({ datasetId, title }))
  .sort((a, b) => Number(looksLikeShortStayForeign(b.title)) - Number(looksLikeShortStayForeign(a.title)))
  .slice(0, MAX_CANDIDATES);

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

log({ step: "service_names_discovered", serviceNames: [...serviceNames.entries()].map(([name, datasetId]) => ({ name, datasetId })) });

// -------------------------------------------------------- authenticated probe
const keyDiag = keyDiagnostics(SEOUL_KEY);
if (!keyDiag.present) {
  log({ step: "auth_probe", authStatus: "BLOCKED", reason: "SEOUL_OPEN_DATA_KEY missing" });
} else {
  let calls = 0;
  for (const [name, datasetId] of serviceNames) {
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
      log({ step: "auth_probe", service: name, datasetId, ...summarizeSeoul(response.status, payload, payload ? null : redact(text)) });
    } catch (error) {
      log({ step: "auth_probe", service: name, datasetId, authStatus: "ERROR", reason: redact(error instanceof Error ? error.message : "fetch_failed") });
    }
  }
}

for (const line of out) console.log(JSON.stringify(line));
console.log(JSON.stringify({
  summary: true,
  seoulKey: keyDiag,
  dataGoKrCalls: 0,
  candidatesFound: candidates.size,
  serviceNamesDiscovered: [...serviceNames.keys()],
  passingServices: out.filter((entry) => entry.step === "auth_probe" && entry.authStatus === "PASS").map((entry) => entry.service),
}));
