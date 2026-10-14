/**
 * Pure helpers for scripts/ga4-browser-probe.ts. Nothing here touches the
 * network, so every rule below is unit-tested (tests/ga4-probe.test.ts).
 *
 * Redaction is decided here, once: a recorded GA hit keeps its event name,
 * measurement ID, page path, title and session counters, never a cookie, a
 * full client or session ID, a query value or a referrer path.
 */
import { createHash } from 'node:crypto';

export const MARKER_PARAM = 'koretail_ga_check';
const MEASUREMENT_ID = /^G-[A-Z0-9]{4,20}$/;

export type RequestKind = 'tag-script' | 'collect' | 'other-google';

const MEASUREMENT_HOSTS = /(^|\.)(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net|googleadservices\.com|googlesyndication\.com)$/;
// www.google.com/ccm, /ads etc. Fonts live on googleapis.com/gstatic.com and are not matched.
const GOOGLE_SEARCH_HOSTS = /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/;

/** Every host a Google tag could report to; any request to one before consent is a failure. */
export function isGoogleMeasurementHost(hostname: string): boolean {
  return MEASUREMENT_HOSTS.test(hostname) || GOOGLE_SEARCH_HOSTS.test(hostname);
}

export function requestKind(url: URL): RequestKind {
  if (url.hostname === 'www.googletagmanager.com' && /^\/gtag\/(js|destination)$/.test(url.pathname)) return 'tag-script';
  if (/(^|\.)(google-analytics\.com|analytics\.google\.com)$/.test(url.hostname) && /\/g\/collect$/.test(url.pathname)) return 'collect';
  return 'other-google';
}

/** A GA4 request carries shared parameters in its URL and one line per event in its body. */
export function parseCollect(url: string, body: string | null): Record<string, string>[] {
  const shared = Object.fromEntries(new URL(url).searchParams.entries());
  const lines = (body ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [shared];
  return lines.map((line) => ({ ...shared, ...Object.fromEntries(new URLSearchParams(line).entries()) }));
}

export function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 10);
}

export interface EventSummary {
  en: string | null;
  tid: string | null;
  /** origin + path of `dl`; its query and fragment are never kept */
  page: string | null;
  pageQueryKeys: string[];
  pageHasFragment: boolean;
  title: string | null;
  referrer: 'absent' | 'empty' | 'present';
  counters: Record<string, string>;
  consent: Record<string, string>;
  eventParams: Record<string, string>;
  /** sha256 prefix; the client ID itself is never recorded */
  clientHash: string | null;
  sessionHash: string | null;
  /** `_p`, random per page load: a reload restarts gtag's hit counter within the same session */
  pageLoadHash: string | null;
  userIdPresent: boolean;
  /** user-agent brand list, recorded only to explain a possible bot filter */
  browserBrands: string | null;
  otherKeys: string[];
}

const COUNTER_KEYS = ['_s', '_ss', '_fv', '_nsi', '_ee', '_et', 'seg', 'sct', 'tfd'];
const CONSENT_KEYS = ['gcs', 'gcd', 'npa', 'dma', 'dma_cps', 'pscdl'];
const HANDLED = new Set(['v', 'tid', 'en', 'dl', 'dt', 'dr', 'cid', 'sid', '_p', 'uid', 'uafvl', ...COUNTER_KEYS, ...CONSENT_KEYS]);
const SENSITIVE_PARAM = /url|term|search|query|link|file|email|name|phone|address|text/i;

export function summarizeEvent(params: Record<string, string>): EventSummary {
  let page: string | null = null;
  let pageQueryKeys: string[] = [];
  let pageHasFragment = false;
  if (params.dl) {
    try {
      const url = new URL(params.dl);
      page = url.origin + url.pathname;
      pageQueryKeys = [...new Set(url.searchParams.keys())];
      pageHasFragment = Boolean(url.hash);
    } catch {
      page = 'UNPARSEABLE';
    }
  }
  const pick = (keys: string[]) => Object.fromEntries(keys.filter((key) => key in params).map((key) => [key, params[key].slice(0, 40)]));
  const eventParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!/^epn?\./.test(key)) continue;
    eventParams[key] = SENSITIVE_PARAM.test(key) ? 'PRESENT' : value.slice(0, 64);
  }
  return {
    en: params.en ?? null,
    tid: params.tid ?? null,
    page,
    pageQueryKeys,
    pageHasFragment,
    title: params.dt === undefined ? null : params.dt.slice(0, 80),
    referrer: params.dr === undefined ? 'absent' : params.dr === '' ? 'empty' : 'present',
    counters: pick(COUNTER_KEYS),
    consent: pick(CONSENT_KEYS),
    eventParams,
    clientHash: params.cid ? shortHash(params.cid) : null,
    sessionHash: params.sid ? shortHash(params.sid) : null,
    pageLoadHash: params._p ? shortHash(params._p) : null,
    userIdPresent: 'uid' in params,
    browserBrands: params.uafvl ? params.uafvl.slice(0, 160) : null,
    otherKeys: Object.keys(params).filter((key) => !HANDLED.has(key) && !/^epn?\./.test(key)).sort(),
  };
}

/** The same logical hit seen twice is a transport retry, not a second event. */
export function eventKey(event: EventSummary, ordinal: number): string {
  return [event.pageLoadHash ?? '-', event.sessionHash ?? '-', event.counters._s ?? '-', event.en ?? '-', ordinal].join('|');
}

/**
 * Appends the visible test marker to one hit that is being delivered on
 * purpose. The page code removes queries from page_location by design, so a
 * marker in the address bar alone would never reach GA; it travels as an
 * event parameter instead. Raw append: re-encoding gtag's own query is avoided.
 */
export function withMarker(url: string, body: string | null, marker: string): { url: string; body: string | null } {
  if (!/^[0-9TZ]{16}$/.test(marker)) throw new Error('marker must be a compact UTC timestamp');
  const pair = `ep.${MARKER_PARAM}=${marker}`;
  const markedBody = body && body.trim()
    ? body.split('\n').map((line) => (line.trim() ? `${line}&${pair}` : line)).join('\n')
    : body;
  return { url: `${url}${url.includes('?') ? '&' : '?'}${pair}`, body: markedBody };
}

export function compactUtc(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** Distinct measurement IDs written as string literals in a JavaScript asset. */
export function measurementIdsIn(source: string): string[] {
  return [...new Set([...source.matchAll(/["'`](G-[A-Z0-9]{4,20})["'`]/g)].map((match) => match[1]).filter((id) => MEASUREMENT_ID.test(id) && !/^G-X+$/.test(id)))];
}

const EM_FEATURES: Record<string, string> = {
  __ccd_em_page_view: 'page views on browser-history changes',
  __ccd_em_scroll: 'scrolls',
  __ccd_em_outbound_click: 'outbound clicks',
  __ccd_em_site_search: 'site search',
  __ccd_em_video: 'video engagement',
  __ccd_em_download: 'file downloads',
  __ccd_em_form: 'form interactions',
};
/** Events only Enhanced Measurement sends; the page code never sends these. */
export const ENHANCED_MEASUREMENT_EVENTS = ['scroll', 'click', 'view_search_results', 'file_download', 'form_start', 'form_submit', 'video_start', 'video_progress', 'video_complete'];

type Flag = string | number | boolean;
export interface TagTemplate { name: string; flags: Record<string, Flag> }
export interface ContainerAnalysis {
  format: 'RECOGNISED' | 'UNKNOWN';
  templates: string[];
  referencesMeasurementId: boolean;
  /** GA4 Enhanced Measurement templates (`__ccd_em_*`) */
  enhancedMeasurement: (TagTemplate & { feature: string })[];
  historyPageViews: 'ON' | 'OFF' | 'UNKNOWN';
  googleSignals: string | null;
  /** Google tag settings (`__ogt_*`): tag-level, separate from the GA4 stream's Enhanced Measurement */
  settings: TagTemplate[];
  /** `__ogt_auto_events`: the Google tag's automatic event detection listeners */
  autoEventDetection: Record<string, Flag> | null;
  /** `__ogt_1p_data_v2`: user-provided data capabilities of the Google tag */
  userProvidedData: Record<string, Flag> | null;
}

function objectAt(source: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length && index - start < 50_000; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return null;
}

function templateAt(source: string, start: number, name: string): TagTemplate {
  const flags: Record<string, Flag> = {};
  const text = objectAt(source, start);
  if (text) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      for (const [key, value] of Object.entries(parsed)) {
        if (!key.startsWith('vtp_')) continue;
        if (typeof value === 'boolean' || typeof value === 'number') flags[key] = value;
        else if (typeof value === 'string' && value.length <= 60) flags[key] = value;
        else flags[key] = Array.isArray(value) ? '[list]' : '[object]';
      }
    } catch {
      flags.unparsed = true;
    }
  }
  return { name, flags };
}

/**
 * Reads the stream settings Google embeds in gtag/js for this measurement ID.
 * Enabled Enhanced Measurement features ship as `__ccd_em_*` tag templates, so
 * their presence is visible without account access. The format is Google's
 * and undocumented: an unrecognised file is reported as UNKNOWN, never as off.
 */
export function analyzeTagContainer(source: string, measurementId: string | null): ContainerAnalysis {
  const templates = [...new Set([...source.matchAll(/"function"\s*:\s*"(__[A-Za-z0-9_]+)"/g)].map((match) => match[1]))].sort();
  const enhancedMeasurement: ContainerAnalysis['enhancedMeasurement'] = [];
  const settings: TagTemplate[] = [];
  for (const match of source.matchAll(/\{\s*"function"\s*:\s*"(__[A-Za-z0-9_]+)"/g)) {
    const name = match[1];
    if (name.startsWith('__ccd_em_')) enhancedMeasurement.push({ ...templateAt(source, match.index ?? 0, name), feature: EM_FEATURES[name] ?? 'unrecognised enhanced-measurement template' });
    else if (/^__ogt_/.test(name)) settings.push(templateAt(source, match.index ?? 0, name));
  }
  const pageView = enhancedMeasurement.find((tag) => tag.name === '__ccd_em_page_view');
  const recognised = templates.includes('__gct') || templates.some((name) => name.startsWith('__ccd_') || name.startsWith('__ogt_'));
  const signals = settings.find((tag) => tag.name === '__ogt_google_signals')?.flags.vtp_googleSignals;
  return {
    format: recognised ? 'RECOGNISED' : 'UNKNOWN',
    templates,
    referencesMeasurementId: Boolean(measurementId && source.includes(`"${measurementId}"`)),
    enhancedMeasurement,
    historyPageViews: !recognised ? 'UNKNOWN' : !pageView ? 'OFF' : pageView.flags.vtp_historyEvents === false ? 'OFF' : pageView.flags.vtp_historyEvents === true ? 'ON' : 'UNKNOWN',
    googleSignals: typeof signals === 'string' ? signals : null,
    settings,
    autoEventDetection: settings.find((tag) => tag.name === '__ogt_auto_events')?.flags ?? null,
    userProvidedData: settings.find((tag) => tag.name === '__ogt_1p_data_v2')?.flags ?? null,
  };
}

/** The GA4 collection endpoint or the tag itself; blocking either loses measurement. */
export function isGa4Transport(url: string): boolean {
  try {
    const parsed = new URL(url);
    return requestKind(parsed) === 'collect' || requestKind(parsed) === 'tag-script';
  } catch {
    return false;
  }
}

/** Only the directives that decide whether the tag can load and report. */
export function cspFindings(csp: string | null) {
  const directive = (name: string) => csp?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) ?? null;
  const allows = (value: string | null, host: string) => Boolean(value && value.split(/\s+/).some((token) => {
    if (token === `https://${host}`) return true;
    const wildcard = token.match(/^https:\/\/\*\.(.+)$/);
    return Boolean(wildcard && host.endsWith(`.${wildcard[1]}`));
  }));
  const scriptSrc = directive('script-src') ?? directive('default-src');
  const connectSrc = directive('connect-src') ?? directive('default-src');
  const imgSrc = directive('img-src') ?? directive('default-src');
  return {
    present: Boolean(csp),
    scriptSrc,
    connectSrc,
    imgSrc,
    tagScriptAllowed: allows(scriptSrc, 'www.googletagmanager.com'),
    collectAllowed: ['region1.google-analytics.com', 'www.google-analytics.com', 'region1.analytics.google.com'].map((host) => ({ host, allowed: allows(connectSrc, host) })),
    imagePixelAllowed: allows(imgSrc, 'region1.google-analytics.com') || allows(imgSrc, 'www.google-analytics.com'),
  };
}

export type ConsentPhase = 'before' | 'granted' | 'withdrawn';
export interface StepEvidence {
  id: string;
  label: string;
  consent: ConsentPhase;
  /** exact number of new page_view events this step must produce; null is informational */
  expectPageViews: number | null;
  expectPath?: string;
  googleRequests: number;
  collectRequests: number;
  /** de-duplicated events first seen in this step */
  events: EventSummary[];
  /** the same logical hit sent again (abort-induced transport retry) */
  retransmissions: number;
}
export interface StepVerdict { status: 'PASS' | 'FAIL' | 'INFO'; reasons: string[] }

export function evaluateStep(step: StepEvidence): StepVerdict {
  const reasons: string[] = [];
  const views = step.events.filter((event) => event.en === 'page_view');
  if (step.consent === 'before' && step.googleRequests > 0) reasons.push(`${step.googleRequests} Google request(s) before consent`);
  if (step.consent === 'withdrawn' && step.events.length > 0) reasons.push(`${step.events.length} new GA event(s) after withdrawal: ${step.events.map((event) => event.en).join(', ')}`);
  if (step.expectPageViews !== null && views.length !== step.expectPageViews) reasons.push(`page_view ${views.length}, expected ${step.expectPageViews}`);
  if (step.expectPath && views.length && views.some((view) => view.page === null || !view.page.endsWith(step.expectPath!))) reasons.push(`page_view path ${views.map((view) => view.page).join(', ')} does not end with ${step.expectPath}`);
  const automatic = step.events.filter((event) => event.en && ENHANCED_MEASUREMENT_EVENTS.includes(event.en));
  if (automatic.length) reasons.push(`Enhanced Measurement event(s): ${automatic.map((event) => event.en).join(', ')}`);
  if (reasons.length) return { status: 'FAIL', reasons };
  return { status: step.expectPageViews === null && step.consent === 'granted' ? 'INFO' : 'PASS', reasons: [] };
}

/** Event count, views and users are different GA numbers; keep them apart. */
export function trafficSummary(events: EventSummary[]) {
  const byName: Record<string, number> = {};
  for (const event of events) byName[event.en ?? '(none)'] = (byName[event.en ?? '(none)'] ?? 0) + 1;
  const firstVisit = events.filter((event) => event.counters._fv === '1' || event.counters._fv === '2').length;
  const sessionStart = events.filter((event) => event.counters._ss === '1' || event.counters._ss === '2').length;
  return {
    networkEvents: events.length,
    eventsByName: byName,
    views: byName.page_view ?? 0,
    derivedFirstVisit: firstVisit,
    derivedSessionStart: sessionStart,
    expectedGaEventCount: events.length + firstVisit + sessionStart,
    users: new Set(events.map((event) => event.clientHash).filter(Boolean)).size,
  };
}
