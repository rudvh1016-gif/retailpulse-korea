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
