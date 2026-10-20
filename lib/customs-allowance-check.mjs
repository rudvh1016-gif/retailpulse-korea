/**
 * Node-only, read-only source observation. Not a legal interpretation, approval,
 * publisher, scheduler or database writer. No visitor-facing module imports this.
 */
import { createHash } from 'node:crypto';
import {parseJapanNumericUpdate} from './customs-japan-parser.mjs';

export const LIMITS = Object.freeze({ maxRequests: 24, maxBytes: 1_048_576, timeoutMs: 15_000 });
const HASH = /^[a-f0-9]{64}$/;
const STATES = new Set(['known', 'unknown']);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const fail = code => { throw new Error(code); };

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}

/** Deliberately excludes observation/review clocks, not scope, units or wording. */
export function allowanceSemanticHash(country) {
  const fields = ['id', 'scope', 'conditions', 'results', 'notes', 'sources', 'effectiveDate', 'effectiveLabel'];
  return sha256(JSON.stringify(stable(Object.fromEntries(fields.filter(key => own(country, key)).map(key => [key, country[key]])))));
}

/**
 * For future structured input only. Current display prose is not automatically
 * extracted into quantities. Unknown is null; a known zero needs explicit evidence.
 */
export function validateQuantity(value) {
  if (!object(value) || !STATES.has(value.state)) return false;
  if (value.state === 'unknown') return value.amount === null;
  return typeof value.amount === 'number' && Number.isFinite(value.amount) && value.amount >= 0
    && typeof value.unit === 'string' && value.unit.trim().length > 0
    && typeof value.sourceQuote === 'string' && value.sourceQuote.trim().length > 0
    && (value.amount !== 0 || value.zeroExplicitlyConfirmed === true);
}

function sourceUrl(value, allowedHosts) {
  let url;
  try { url = new URL(value); } catch { fail('INVALID_SOURCE_URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || !allowedHosts.includes(url.hostname) || url.hostname === 'localhost'
    || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':')) fail('SOURCE_NOT_ALLOWLISTED');
  return url;
}

export function validateManifest(manifest) {
  if (!object(manifest) || manifest.version !== 1 || manifest.automaticCollectionEnabled !== false
    || manifest.publicationEnabled !== false || !Array.isArray(manifest.allowedHosts)
    || !manifest.allowedHosts.length || !Array.isArray(manifest.sources) || !manifest.sources.length
    || manifest.sources.length > 250) fail('INVALID_MANIFEST');
  const policy = manifest.policy;
  if (!object(policy) || !Number.isInteger(policy.maxRequests) || policy.maxRequests < 1 || policy.maxRequests > LIMITS.maxRequests
    || !Number.isInteger(policy.maxBytes) || policy.maxBytes < 1 || policy.maxBytes > LIMITS.maxBytes
    || !Number.isInteger(policy.timeoutMs) || policy.timeoutMs < 1 || policy.timeoutMs > LIMITS.timeoutMs
    || !Number.isInteger(policy.minIntervalHours) || policy.minIntervalHours < 24) fail('INVALID_POLICY');
  const ids = new Set();
  for (const source of manifest.sources) {
    if (!object(source) || !/^[A-Z]{2}-\d{2}$/.test(source.id) || ids.has(source.id)
      || source.jurisdiction !== source.id.slice(0, 2) || typeof source.label !== 'string' || !source.label.trim()
      || !['html', 'pdf'].includes(source.format)) fail('INVALID_SOURCE');
    ids.add(source.id);
    sourceUrl(source.url, manifest.allowedHosts);
    if (source.numericParser !== undefined && !(source.id === 'JP-01' && source.numericParser === 'jp-allowance-v1' && HASH.test(source.baseline?.numericTemplateSha256))) fail('INVALID_NUMERIC_PARSER');
    if (source.extractor !== undefined && !(source.id === 'TW-01' && source.extractor === 'tw-law-block-v1')) fail('INVALID_SOURCE_EXTRACTOR');
    if (source.baseline?.contentSha256 !== undefined && (!HASH.test(source.baseline.contentSha256) || source.extractor !== 'tw-law-block-v1')) fail('INVALID_CONTENT_BASELINE');
    if (source.encoding !== undefined && !['utf-8', 'shift_jis'].includes(source.encoding)) fail('INVALID_SOURCE_ENCODING');
    if (source.baseline !== null && (!object(source.baseline) || source.baseline.url !== source.url
      || !HASH.test(source.baseline.sha256) || !timestamp(source.baseline.reviewedAt))) fail('INVALID_BASELINE');
    if (source.accessReview !== null) {
      const review = source.accessReview;
      if (!object(review) || review.url !== source.url || review.automatedReadAllowed !== true
        || !timestamp(review.reviewedAt) || !Number.isInteger(review.minIntervalHours)
        || review.minIntervalHours < policy.minIntervalHours || typeof review.evidenceUrl !== 'string') fail('INVALID_ACCESS_REVIEW');
      sourceUrl(review.evidenceUrl, manifest.allowedHosts);
    }
  }
  return manifest;
}

/** Structural checks only. Does not pronounce the legal content correct. */
export function validatePreviewDataset(data, manifest) {
  validateManifest(manifest);
  const errors = [];
  if (!object(data) || !Array.isArray(data.countries)) return ['DATASET_COUNTRIES_REQUIRED'];
  const ids = new Set();
  for (const country of data.countries) {
    const id = country?.id;
    if (!/^[A-Z]{2}$/.test(id) || ids.has(id)) { errors.push('COUNTRY_ID_INVALID'); continue; }
    ids.add(id);
    if (typeof country.scope !== 'string' || !country.scope.trim()) errors.push(`${id}:SCOPE_REQUIRED`);
    const conditions = new Map();
    for (const condition of country.conditions ?? []) {
      if (!condition?.id || conditions.has(condition.id) || !Array.isArray(condition.options)
        || !condition.options.length || condition.options.some(option => !option?.id)
        || new Set(condition.options.map(option => option.id)).size !== condition.options.length) {
        errors.push(`${id}:CONDITION_INVALID`); continue;
      }
      conditions.set(condition.id, new Set(condition.options.map(option => option.id)));
    }
    if (!conditions.size || !Array.isArray(country.results) || !country.results.length) errors.push(`${id}:RESULT_SCOPE_REQUIRED`);
    const validWhen = when => object(when) && Object.keys(when).length > 0 && Object.entries(when).every(([key, values]) =>
      conditions.has(key) && Array.isArray(values) && values.length > 0 && values.every(value => conditions.get(key).has(value)));
    for (const condition of country.conditions ?? []) if (condition.when && !validWhen(condition.when)) errors.push(`${id}:CONDITION_REFERENCE_INVALID`);
    for (const result of country.results ?? []) {
      if (!validWhen(result.when)) errors.push(`${id}:RESULT_REFERENCE_INVALID`);
      if (!Array.isArray(result.facts) || !result.facts.length || result.facts.some(fact =>
        !object(fact) || typeof fact.label !== 'string' || !fact.label.trim()
        || !(fact.value === null || typeof fact.value === 'string' && fact.value.trim().length > 0))) errors.push(`${id}:FACT_INVALID`);
    }
    const expected = new Set(manifest.sources.filter(source => source.jurisdiction === id).map(source => source.url));
    const actual = new Set((country.sources ?? []).map(source => source.url));
    if (!expected.size || expected.size !== actual.size || [...expected].some(url => !actual.has(url))) errors.push(`${id}:SOURCE_MANIFEST_MISMATCH`);
    // A missing effective date is not inferred from a check date.
    if (country.effectiveDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(country.effectiveDate)) errors.push(`${id}:EFFECTIVE_DATE_INVALID`);
  }
  for (const source of manifest.sources) if (!ids.has(source.jurisdiction)) errors.push(`${source.jurisdiction}:COUNTRY_MISSING`);
  return [...new Set(errors)];
}

/** Immutable result. Even UNCHANGED_SOURCE proves only bytes at this one URL. */
export function assessObservation(source, observation, lastGood = null) {
  if (!timestamp(observation.observedAt)) fail('INVALID_OBSERVATION_TIME');
  let state;
  if (observation.kind === 'error') {
    state = ['ACCESS_REVIEW_REQUIRED', 'HTTP_401', 'HTTP_403', 'HTTP_429', 'REDIRECT_BLOCKED', 'BLOCK_PAGE'].includes(observation.code)
      ? 'COLLECTION_BLOCKED' : 'COLLECTION_FAILED';
  } else if (observation.kind === 'not-modified') {
    state = source.baseline ? 'NOT_MODIFIED_RESPONSE' : 'BASELINE_REVIEW_REQUIRED';
  } else if (observation.kind === 'bytes' && HASH.test(observation.sha256)) {
    state = !source.baseline ? 'BASELINE_REVIEW_REQUIRED'
      : (source.baseline.contentSha256 ? source.baseline.contentSha256 === observation.contentSha256 : source.baseline.sha256 === observation.sha256) ? 'UNCHANGED_SOURCE' : 'SOURCE_CHANGED_REVIEW_REQUIRED';
  } else fail('INVALID_OBSERVATION');
  return {
    sourceId: source.id, jurisdiction: source.jurisdiction, url: source.url, state,
    checkedAt: observation.observedAt, sourceSha256: observation.sha256 ?? null,
    numericCandidate: observation.numericCandidate ?? null,
    reason: observation.code ?? null, lastGood: structuredClone(lastGood),
    lastGoodPreserved: true, legalInterpretationVerified: false,
    regulationChanged: null, mayPublish: false, automaticCollectionEnabled: false,
  };
}

/** Reject common challenge/error shells; this is not a complete legal-text parser. */
export function inspectSourceBytes(source, bytes, contentType) {
  if (source.format === 'pdf') {
    if (!/^application\/pdf(?:;|$)/i.test(contentType) || Buffer.from(bytes.subarray(0, 5)).toString() !== '%PDF-') fail('FORMAT_MISMATCH');
    if (!Buffer.from(bytes.subarray(Math.max(0, bytes.length - 1024))).includes(Buffer.from('%%EOF'))) fail('INCOMPLETE_PDF');
    return { sha256: sha256(bytes), parsedLegalFacts: false };
  }
  if (!/^text\/html(?:;|$)/i.test(contentType)) fail('FORMAT_MISMATCH');
  const charset = /charset\s*=\s*["']?([^;"'\s]+)/i.exec(contentType)?.[1].toLowerCase();
  const encoding = source.encoding ?? 'utf-8';
  if (charset && !(encoding === 'shift_jis' ? ['shift_jis', 'shift-jis', 'sjis'] : ['utf-8', 'utf8', 'us-ascii']).includes(charset)) fail('UNSUPPORTED_ENCODING');
  let html;
  try { html = new TextDecoder(encoding, { fatal: true }).decode(bytes); } catch { fail('UNSUPPORTED_ENCODING'); }
  if (/<title[^>]*>\s*(?:access denied|just a moment|attention required|robot check|403|429)\b/i.test(html)
    || /cf-chl-|g-recaptcha|hcaptcha|verify you are human|request (?:has been )?blocked/i.test(html)) fail('BLOCK_PAGE');
  if (!/<\/html\s*>/i.test(html) || !/<(?:html|body)\b/i.test(html)) fail('INCOMPLETE_HTML');
  let contentSha256;
  if (source.extractor === 'tw-law-block-v1') {
    // Exact reviewed main-law block includes title, amendment date, attachments and all articles.
    // Excludes rotating ASP.NET state outside the block; no quantities/conditions are interpreted.
    const start = html.indexOf('<div class="table-title">'), end = html.indexOf('<!-- 主要內容結束 -->');
    if (start < 0 || end <= start || html.indexOf('<div class="table-title">', start + 1) >= 0) fail('SOURCE_STRUCTURE_CHANGED');
    const block = html.slice(start, end);
    if (!block.includes('入境旅客攜帶行李物品報驗稅放辦法') || !block.includes('第 18 條')) fail('SOURCE_STRUCTURE_CHANGED');
    contentSha256 = sha256(block.replace(/\s+/g, ' ').trim());
  }
  return { sha256: sha256(bytes), ...(contentSha256 ? { contentSha256 } : {}), numericCandidate: parseJapanNumericUpdate(source, html), parsedLegalFacts: false };
}

/**
 * Exact allowlisted URL only, no retries or redirects. Caller supplies a reviewed
 * manifest. Request budget includes unsuccessful HTTP responses, never visitors.
 * The timeout covers BOTH headers and complete streamed body.
 */
export async function checkSource(source, manifest, { fetchImpl = fetch, now = () => new Date(), budget = { requests: 0 }, lastGood = /** @type {object|null} */ (null) } = {}) {
  validateManifest(manifest);
  const configured = manifest.sources.find(item => item.id === source.id);
  if (!configured || JSON.stringify(configured) !== JSON.stringify(source)) fail('SOURCE_NOT_IN_MANIFEST');
  const observedAt = now().toISOString();
  const result = observation => assessObservation(source, { ...observation, observedAt }, lastGood);
  if (!source.accessReview) return result({ kind: 'error', code: 'ACCESS_REVIEW_REQUIRED' });
  if (!Number.isInteger(budget.requests) || budget.requests < 0 || budget.requests >= manifest.policy.maxRequests) return result({ kind: 'error', code: 'REQUEST_LIMIT' });
  budget.requests += 1;
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('TIMEOUT')); }, manifest.policy.timeoutMs);
  });
  const operation = async () => {
    const url = sourceUrl(source.url, manifest.allowedHosts);
    url.hash = '';
    const response = await fetchImpl(url.href, { redirect: 'manual', signal: controller.signal,
      headers: { accept: source.format === 'pdf' ? 'application/pdf' : 'text/html' } });
    if (response.status >= 300 && response.status < 400 && response.status !== 304) fail('REDIRECT_BLOCKED');
    // No conditional header is sent in this preparation. An unsolicited 304
    // cannot establish same bytes, even when a baseline happens to exist.
    if (response.status === 304) fail('UNEXPECTED_304');
    if (!response.ok) fail(`HTTP_${response.status}`);
    if (response.redirected || response.url && response.url !== url.href) fail('REDIRECT_BLOCKED');
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > manifest.policy.maxBytes)) fail('RESPONSE_LIMIT');
    const reader = response.body?.getReader();
    if (!reader) fail('EMPTY_BODY');
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > manifest.policy.maxBytes) { await reader.cancel(); fail('RESPONSE_LIMIT'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    if (!size) fail('EMPTY_BODY');
    const bytes = Buffer.concat(chunks);
    const inspected = inspectSourceBytes(source, bytes, response.headers.get('content-type') ?? '');
    return result({ kind: 'bytes', sha256: inspected.sha256, contentSha256: inspected.contentSha256, numericCandidate: inspected.numericCandidate });
  };
  try { return await Promise.race([operation(), timeout]); }
  catch (error) {
    const safeCodes = /^(HTTP_\d{3}|REDIRECT_BLOCKED|UNEXPECTED_304|RESPONSE_LIMIT|EMPTY_BODY|FORMAT_MISMATCH|UNSUPPORTED_ENCODING|INCOMPLETE_HTML|INCOMPLETE_PDF|SOURCE_STRUCTURE_CHANGED|BLOCK_PAGE|TIMEOUT)$/;
    const code = controller.signal.aborted ? 'TIMEOUT' : safeCodes.test(error?.message) ? error.message : 'NETWORK_ERROR';
    return result({ kind: 'error', code });
  } finally { clearTimeout(timer); controller.abort(); }
}
