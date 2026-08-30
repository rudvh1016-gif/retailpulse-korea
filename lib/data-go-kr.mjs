/**
 * Normalize either data.go.kr portal representation exactly once.
 * URLSearchParams owns the sole transport encoding after this step.
 * Malformed percent input is preserved instead of being guessed or retried.
 *
 * @param {string} value
 * @returns {string}
 */
export function normalizeDataGoKrServiceKey(value) {
  const trimmed = value.trim();
  if (!/%[0-9A-Fa-f]{2}/.test(trimmed)) return trimmed;
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

/**
 * Build one official request with exactly one service-key transport encoding.
 *
 * @param {string} endpoint
 * @param {string} serviceKey
 * @param {Record<string, string>} params
 * @returns {URL}
 */
export function buildDataGoKrUrl(endpoint, serviceKey, params) {
  const url = new URL(endpoint);
  url.searchParams.set("serviceKey", normalizeDataGoKrServiceKey(serviceKey));
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return url;
}

/**
 * Remove decoded, encoded, and keyed-URL forms from diagnostics.
 *
 * @param {string} value
 * @param {string} serviceKey
 * @returns {string}
 */
export function redactDataGoKrSecrets(value, serviceKey) {
  let output = value.replace(/([?&]serviceKey=)[^&\s|]+/gi, "$1[REDACTED]");
  const original = serviceKey.trim();
  const normalized = normalizeDataGoKrServiceKey(original);
  const variants = new Set([original, normalized, encodeURIComponent(normalized)]);
  for (const variant of [...variants].filter(Boolean).sort((a, b) => b.length - a.length)) {
    output = output.replaceAll(variant, "[REDACTED]");
  }
  return output;
}

/**
 * Return only secret-safe contract metadata and one exact smoke classification.
 * Airport/KMA success is `00`; TourAPI success is `0000`; `03` is NO_DATA.
 *
 * @param {{status:number, payload:unknown, textSnippet:string|null}} result
 * @param {string} expectedSuccessCode
 * @param {string} serviceKey
 */
export function summarizeDataGoKrResponse(result, expectedSuccessCode, serviceKey) {
  const payload = result.payload && typeof result.payload === "object" && !Array.isArray(result.payload)
    ? result.payload
    : null;
  const gateway = payload?.OpenAPI_ServiceResponse?.cmmMsgHeader ?? {};
  const envelope = payload?.response;
  const header = envelope?.header;
  const body = envelope?.body;
  const resultCode = header?.resultCode ?? gateway.returnReasonCode ?? null;
  const resultMessage = header?.resultMsg ?? gateway.returnAuthMsg ?? gateway.errMsg ?? "";
  const safeMessage = redactDataGoKrSecrets(String(resultMessage), serviceKey).slice(0, 200);
  const code = resultCode === null || resultCode === undefined ? null : String(resultCode);

  let authStatus;
  if (result.status === 403 || code === "30") authStatus = "AUTH_BLOCKED";
  else if (result.status !== 200) authStatus = "REQUEST_ERROR";
  else if (!payload || !envelope || !header) authStatus = "SCHEMA_ERROR";
  else if (code === "03") authStatus = "VALID_NO_DATA";
  else if (code !== expectedSuccessCode) authStatus = "REQUEST_ERROR";
  else if (!body || typeof body !== "object") authStatus = "SCHEMA_ERROR";
  else authStatus = null;

  const rawItems = body?.items?.item ?? body?.items;
  const items = Array.isArray(rawItems)
    ? rawItems
    : rawItems && typeof rawItems === "object"
      ? [rawItems]
      : [];
  if (authStatus === null) authStatus = items.length > 0 ? "PASS" : "VALID_NO_DATA";

  return {
    httpStatus: result.status,
    format: payload ? "json" : "non-json",
    officialResultCode: code,
    officialResultMessage: safeMessage,
    recordCount: items.length,
    totalCount: body?.totalCount ?? null,
    firstRecordFieldNames: Object.keys(items[0] ?? {}).sort(),
    authStatus,
    nonJsonSnippet: result.textSnippet
      ? redactDataGoKrSecrets(result.textSnippet, serviceKey).slice(0, 200)
      : null,
  };
}

/**
 * Perform one bounded provider request. This deliberately has no retry loop:
 * a workflow run calls each approved source exactly once.
 *
 * @param {{
 *   url: URL,
 *   expectedSuccessCode: string,
 *   serviceKey: string,
 *   timeoutMs?: number,
 *   fetcher?: typeof fetch,
 *   now?: () => number,
 *   setTimer?: typeof setTimeout,
 *   clearTimer?: typeof clearTimeout,
 * }} options
 */
export async function requestDataGoKrOnce({
  url,
  expectedSuccessCode,
  serviceKey,
  timeoutMs = 30_000,
  fetcher = fetch,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  const startedAt = now();
  const controller = new AbortController();
  const timer = setTimer(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      // The classifier reports non-JSON without printing the raw body.
    }
    return {
      ...summarizeDataGoKrResponse({
        status: response.status,
        payload,
        textSnippet: payload ? null : redactDataGoKrSecrets(text, serviceKey).slice(0, 200),
      }, expectedSuccessCode, serviceKey),
      elapsedMs: Math.max(0, now() - startedAt),
    };
  } catch (error) {
    const timedOut = controller.signal.aborted
      || (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name));
    return {
      httpStatus: null,
      format: null,
      officialResultCode: null,
      officialResultMessage: "",
      recordCount: 0,
      totalCount: null,
      firstRecordFieldNames: [],
      authStatus: "REQUEST_ERROR",
      nonJsonSnippet: null,
      elapsedMs: Math.max(0, now() - startedAt),
      reason: timedOut ? "client_timeout" : "network_connection_error",
    };
  } finally {
    clearTimer(timer);
  }
}

/** Run independently so one source failure cannot reject the whole smoke. */
export async function runDataGoKrSmoke(sources, request) {
  const results = [];
  for (const source of sources) {
    try {
      results.push({ sourceId: source.sourceId, ...(await request(source)) });
    } catch {
      results.push({
        sourceId: source.sourceId,
        authStatus: "REQUEST_ERROR",
        httpStatus: null,
        elapsedMs: null,
        reason: "request_runner_error",
      });
    }
  }
  return results;
}
