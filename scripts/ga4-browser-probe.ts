/**
 * GA4 consent and page_view probe in a real browser against the live site.
 *
 *   npx tsx scripts/ga4-browser-probe.ts --origin=https://koretaildata.com
 *
 * Opens /ko in Chromium (phone and desktop), records every request to a
 * Google tag or analytics host, and walks the real UI: the menu to 더보기,
 * the 선택적 이용 통계 checkbox, two menu moves, history back, withdrawal on
 * the same checkbox, then more moves. By default every collection request is
 * ABORTED after it is recorded, so nothing reaches the GA property.
 *
 * DELIVER_TEST_HIT=true adds ONE marked visit whose collection requests are
 * let through, so the owner can watch GA Realtime receive them. Its marker
 * (also in the visit's address bar) travels as event parameter
 * koretail_ga_check because the page code strips queries from page_location.
 *
 * Never printed: cookies, full client or session IDs, query values.
 * This proves what the browser SENDS. Receipt in the GA property needs the
 * owner's account and stays UNVERIFIED here.
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromium, devices, type Browser, type BrowserContext, type Locator, type Page, type Request } from '@playwright/test';
import {
  analyzeTagContainer, compactUtc, cspFindings, ENHANCED_MEASUREMENT_EVENTS, evaluateStep, eventKey, isGoogleMeasurementHost,
  MARKER_PARAM, measurementIdsIn, parseCollect, requestKind, summarizeEvent, trafficSummary, withMarker,
  type ConsentPhase, type ContainerAnalysis, type EventSummary, type RequestKind, type StepEvidence, type StepVerdict,
} from './ga4-probe-lib';

const CONSENT_LABEL = '선택적 이용 통계';

interface Profile { id: string; descriptor: (typeof devices)[string]; touch: boolean }
const PROFILES: Profile[] = [
  { id: 'mobile', descriptor: devices['Pixel 7'], touch: true },
  { id: 'desktop', descriptor: devices['Desktop Chrome'], touch: false },
];

interface RecordedRequest {
  at: string;
  atMs: number;
  kind: RequestKind;
  host: string;
  path: string;
  method: string;
  resourceType: string;
  action: 'aborted' | 'continued' | 'delivered' | 'fulfilled-local-stub';
  scriptId: string | null;
  events: EventSummary[];
  status: number | string | null;
}
interface StepRecord extends StepEvidence { startedAt: string; requests: RecordedRequest[]; verdict?: StepVerdict; snapshot?: Snapshot }
interface Snapshot {
  path: string;
  tagElements: number;
  gtagDefined: boolean;
  dataLayerLength: number | null;
  disableFlag: unknown;
  storedChoice: string | null;
  gaCookieNames: string[];
}
export interface FlowResult {
  profile: string;
  delivered: boolean;
  marker: string | null;
  startUrl: string;
  browser: { userAgent: string; brands: string[] | null; webdriver: boolean } | null;
  buildSha: string | null;
  steps: StepRecord[];
  cspViolations: { directive: string; blocked: string; count: number }[];
  traffic: ReturnType<typeof trafficSummary>;
  error: string | null;
}
export interface ProbeOptions {
  origin: string;
  deliver: boolean;
  /** local verification only: answer gtag/js with this body instead of Google's */
  tagScriptOverride?: string;
  profiles?: string[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const kst = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().replace('T', ' ').slice(0, 19) + ' KST';

async function poll<T>(read: () => Promise<T>, accept: (value: T) => boolean, timeoutMs: number, what: string): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const value = await read().catch(() => undefined as T);
    if (accept(value)) return value;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await sleep(200);
  }
}

interface Shared {
  bundleIds: Map<string, Set<string>>;
  manualPageViewAssets: Set<string>;
  scanned: Set<string>;
  pendingScans: Promise<void>[];
  container: { status: number | null; body: string | null };
  documentCsp: string | null;
}

async function runFlow(browser: Browser, profile: Profile, options: ProbeOptions, shared: Shared, marker: string | null): Promise<FlowResult> {
  const t0 = Date.now();
  const startUrl = `${options.origin}/ko${marker ? `?${MARKER_PARAM}=${marker}` : ''}`;
  const result: FlowResult = { profile: profile.id, delivered: Boolean(marker), marker, startUrl, browser: null, buildSha: null, steps: [], cspViolations: [], traffic: trafficSummary([]), error: null };
  const context: BrowserContext = await browser.newContext({ ...profile.descriptor, locale: 'ko-KR', timezoneId: 'Asia/Seoul', serviceWorkers: 'block' });
  const byRequest = new WeakMap<Request, RecordedRequest>();
  const seen = new Set<string>();
  let current: StepRecord | null = null;
  let lastGoogleAt = 0;

  await context.addInitScript(() => {
    const store = window as unknown as { __koretailProbeCsp?: { directive: string; blocked: string }[] };
    store.__koretailProbeCsp = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      let blocked = event.blockedURI;
      try { const url = new URL(blocked); blocked = url.origin + url.pathname; } catch { /* keyword such as 'inline' */ }
      store.__koretailProbeCsp!.push({ directive: event.effectiveDirective || event.violatedDirective, blocked });
    });
  });

  await context.route((url) => isGoogleMeasurementHost(url.hostname), async (route, request) => {
    const url = new URL(request.url());
    const kind = requestKind(url);
    const now = Date.now();
    lastGoogleAt = now;
    const record: RecordedRequest = {
      at: new Date(now).toISOString(), atMs: now - t0, kind, host: url.hostname, path: url.pathname, method: request.method(),
      resourceType: request.resourceType(), action: 'aborted', scriptId: kind === 'tag-script' ? url.searchParams.get('id') : null, events: [], status: null,
    };
    if (kind === 'collect') {
      const counts = new Map<string, number>();
      for (const params of parseCollect(request.url(), request.postData())) {
        const event = summarizeEvent(params);
        const ordinal = counts.get(event.en ?? '') ?? 0;
        counts.set(event.en ?? '', ordinal + 1);
        record.events.push(event);
        const key = eventKey(event, ordinal);
        if (seen.has(key)) { if (current) current.retransmissions += 1; continue; }
        seen.add(key);
        current?.events.push(event);
      }
    }
    if (current) {
      current.requests.push(record);
      current.googleRequests += 1;
      if (kind === 'collect') current.collectRequests += 1;
    }
    byRequest.set(request, record);
    if (kind === 'tag-script') {
      if (options.tagScriptOverride !== undefined) {
        record.action = 'fulfilled-local-stub';
        await route.fulfill({ status: 200, contentType: 'application/javascript', body: options.tagScriptOverride });
        return;
      }
      record.action = 'continued';
      await route.continue();
      return;
    }
    if (kind === 'collect' && marker) {
      const marked = withMarker(request.url(), request.postData(), marker);
      record.action = 'delivered';
      await route.continue({ url: marked.url, ...(marked.body !== null ? { postData: marked.body } : {}) });
      return;
    }
    await route.abort('blockedbyclient');
  });
  context.on('requestfinished', (request) => {
    const record = byRequest.get(request);
    if (record) void request.response().then((response) => { record.status = response?.status() ?? null; }).catch(() => undefined);
  });
  context.on('requestfailed', (request) => {
    const record = byRequest.get(request);
    if (record) record.status = request.failure()?.errorText ?? 'failed';
  });
  context.on('response', (response) => {
    let url: URL;
    try { url = new URL(response.url()); } catch { return; }
    if (requestKind(url) === 'tag-script' && isGoogleMeasurementHost(url.hostname) && shared.container.body === null) {
      shared.container.status = response.status();
      shared.pendingScans.push(response.text().then((text) => { shared.container.body = text; }).catch(() => undefined));
      return;
    }
    // Production ships hashed .js assets; a local dev server serves .ts modules.
    if (url.origin !== options.origin || !/\.(m?js|tsx?)$/.test(url.pathname) || shared.scanned.has(url.pathname)) return;
    shared.scanned.add(url.pathname);
    shared.pendingScans.push(response.text().then((text) => {
      for (const id of measurementIdsIn(text)) {
        if (!shared.bundleIds.has(id)) shared.bundleIds.set(id, new Set());
        shared.bundleIds.get(id)!.add(url.pathname);
      }
      // The consent-gated analytics module: its opt-out flag and its manual page_view.
      if (text.includes('ga-disable-') && /["'`]page_view["'`]/.test(text)) shared.manualPageViewAssets.add(url.pathname);
    }).catch(() => undefined));
  });

  const page: Page = await context.newPage();
  const measurementId = () => [...shared.bundleIds.keys()][0] ?? null;
  const activate = async (locator: Locator) => { if (profile.touch) await locator.tap(); else await locator.click(); };
  const snapshot = async (): Promise<Snapshot> => {
    const inPage = await page.evaluate((id) => {
      const w = window as unknown as Record<string, unknown>;
      let storedChoice: string | null;
      try { storedChoice = window.localStorage.getItem('koretail-analytics-consent-v1'); } catch { storedChoice = 'UNREADABLE'; }
      return {
        path: window.location.pathname,
        tagElements: document.querySelectorAll('script[src*="googletagmanager.com"]').length,
        gtagDefined: typeof w.gtag === 'function',
        dataLayerLength: Array.isArray(w.dataLayer) ? (w.dataLayer as unknown[]).length : null,
        disableFlag: id ? w[`ga-disable-${id}`] ?? null : null,
        storedChoice,
      };
    }, measurementId());
    const gaCookieNames = (await context.cookies()).map((cookie) => cookie.name).filter((name) => /^_ga/.test(name)).sort();
    return { ...inPage, gaCookieNames };
  };
  const settle = async (minMs: number, maxMs: number, quietMs: number, until?: () => boolean) => {
    const started = Date.now();
    for (;;) {
      const elapsed = Date.now() - started;
      if (elapsed >= maxMs) return;
      if (elapsed >= minMs && (!until || until()) && Date.now() - Math.max(lastGoogleAt, started) >= quietMs) return;
      await sleep(250);
    }
  };
  const step = async (id: string, label: string, consent: ConsentPhase, expectPageViews: number | null, expectPath: string | undefined, action: () => Promise<void>, wait = { minMs: 4000, maxMs: 20_000, quietMs: 2500 }, takeSnapshot = true) => {
    const record: StepRecord = { id, label, consent, expectPageViews, expectPath, startedAt: new Date().toISOString(), googleRequests: 0, collectRequests: 0, events: [], retransmissions: 0, requests: [] };
    result.steps.push(record);
    current = record;
    await action();
    const views = () => record.events.filter((event) => event.en === 'page_view').length;
    await settle(wait.minMs, wait.maxMs, wait.quietMs, expectPageViews ? () => views() >= expectPageViews : undefined);
    if (takeSnapshot) record.snapshot = await snapshot().catch(() => undefined);
    record.verdict = evaluateStep(record);
  };
  const menu = async (path: string) => {
    await activate(page.locator(`nav[aria-label="Primary"] a[href="${path}"]:visible`).first());
    await page.waitForURL((url) => url.pathname === path, { timeout: 20_000 });
  };
  const choice = () => page.getByRole('checkbox', { name: CONSENT_LABEL });
  // Read and clear the page's CSP log; a reload starts a new document and a new log.
  const cspCounts = new Map<string, { directive: string; blocked: string; count: number }>();
  const collectCsp = async () => {
    const violations = await page.evaluate(() => {
      const store = window as unknown as { __koretailProbeCsp?: { directive: string; blocked: string }[] };
      const list = store.__koretailProbeCsp ?? [];
      store.__koretailProbeCsp = [];
      return list;
    }).catch(() => []);
    for (const violation of violations) {
      const key = `${violation.directive} ${violation.blocked}`;
      cspCounts.set(key, { ...violation, count: (cspCounts.get(key)?.count ?? 0) + 1 });
    }
  };

  try {
    await step('pre_consent_load', `open ${new URL(startUrl).pathname}${marker ? ' (marked)' : ''}, no choice made`, 'before', 0, undefined, async () => {
      const response = await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      shared.documentCsp ??= response?.headers()['content-security-policy'] ?? null;
      await page.locator('.app[data-hydrated="true"]').waitFor({ timeout: 45_000 });
    }, { minMs: 5000, maxMs: 12_000, quietMs: 3000 });
    result.buildSha = await page.locator('meta[name="koretail-build-sha"]').getAttribute('content', { timeout: 5000 }).catch(() => null);
    result.browser = await page.evaluate(() => {
      const data = (navigator as Navigator & { userAgentData?: { brands?: { brand: string; version: string }[] } }).userAgentData;
      return { userAgent: navigator.userAgent, brands: data?.brands?.map((brand) => `${brand.brand}/${brand.version}`) ?? null, webdriver: navigator.webdriver };
    });
    await step('pre_consent_menu_more', 'menu → 더보기 before any choice', 'before', 0, undefined, async () => {
      await menu('/ko/more');
      await poll(() => choice().isEnabled(), (value) => value === true, 20_000, 'the consent checkbox');
    }, { minMs: 3000, maxMs: 10_000, quietMs: 2500 });
    await step('consent_granted', `check ${CONSENT_LABEL} on 더보기`, 'granted', 1, '/ko/more', async () => {
      await activate(choice());
      await poll(() => choice().isChecked(), (value) => value === true, 10_000, 'the checkbox to be checked');
    }, { minMs: 5000, maxMs: 25_000, quietMs: 3000 });
    await step('nav_airport', 'menu → 공항', 'granted', 1, '/ko/airport', () => menu('/ko/airport'));
    await step('nav_where_to', 'menu → 서울 한눈에', 'granted', 1, '/ko/where-to', () => menu('/ko/where-to'));
    await step('scroll_to_end', 'scroll to the end of the page (Enhanced Measurement scroll check)', 'granted', 0, undefined, async () => {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await sleep(800);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    });
    await step('history_back', 'browser back (popstate) → 공항', 'granted', 1, '/ko/airport', async () => {
      await page.goBack({ waitUntil: 'commit' });
      await page.waitForURL((url) => url.pathname === '/ko/airport', { timeout: 20_000 });
    });
    await step('reload_with_consent', 'reload with consent stored (returning visitor)', 'granted', 1, '/ko/airport', async () => {
      await collectCsp();
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.locator('.app[data-hydrated="true"]').waitFor({ timeout: 45_000 });
    }, { minMs: 5000, maxMs: 25_000, quietMs: 3000 });
    await step('nav_more_again', 'menu → 더보기 to withdraw', 'granted', 1, '/ko/more', () => menu('/ko/more'));
    await step('withdrawal', `uncheck ${CONSENT_LABEL}`, 'withdrawn', 0, undefined, async () => {
      await activate(choice());
      await poll(() => choice().isChecked(), (value) => value === false, 10_000, 'the checkbox to be unchecked');
    }, { minMs: 6000, maxMs: 15_000, quietMs: 3000 });
    await step('after_withdrawal_nav_airport', 'menu → 공항 after withdrawal', 'withdrawn', 0, undefined, () => menu('/ko/airport'), { minMs: 6000, maxMs: 15_000, quietMs: 3000 });
    await step('after_withdrawal_back', 'browser back after withdrawal', 'withdrawn', 0, undefined, async () => {
      await page.goBack({ waitUntil: 'commit' });
      await page.waitForURL((url) => url.pathname === '/ko/more', { timeout: 20_000 });
    }, { minMs: 5000, maxMs: 15_000, quietMs: 3000 });
    await step('after_withdrawal_hidden', 'simulated tab hide (visibilitychange) after withdrawal', 'withdrawn', 0, undefined, async () => {
      // A string, not a function: tsx's keepNames would inject an __name helper the page lacks.
      await page.evaluate(`Object.defineProperty(document, 'visibilityState', { configurable: true, get: function () { return 'hidden'; } });
        Object.defineProperty(document, 'hidden', { configurable: true, get: function () { return true; } });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('pagehide'));`);
    }, { minMs: 4000, maxMs: 10_000, quietMs: 3000 });
    await collectCsp();
    await step('after_withdrawal_close', 'close the tab after withdrawal', 'withdrawn', 0, undefined, async () => {
      await page.close({ runBeforeUnload: true });
      await sleep(3000);
    }, { minMs: 0, maxMs: 0, quietMs: 0 }, false);
  } catch (error) {
    result.error = error instanceof Error ? error.message.split('\n')[0] : String(error);
  } finally {
    current = null;
    result.cspViolations = [...cspCounts.values()];
    await context.close().catch(() => undefined);
  }
  result.traffic = trafficSummary(result.steps.flatMap((step) => step.events));
  return result;
}

type Status = 'PASS' | 'FAIL' | 'UNKNOWN';
interface Requirement { id: string; title: string; status: Status; evidence: string[] }

function requirements(flows: FlowResult[], shared: Shared, container: ContainerAnalysis | null): Requirement[] {
  const all = flows.flatMap((flow) => flow.steps.map((step) => ({ flow, step })));
  const failures = (filter: (step: StepRecord) => boolean) => all.filter(({ step }) => filter(step) && step.verdict?.status === 'FAIL').map(({ flow, step }) => `${flow.profile}${flow.delivered ? '(delivered)' : ''}/${step.id}: ${step.verdict!.reasons.join('; ')}`);
  const errors = flows.filter((flow) => flow.error).map((flow) => `${flow.profile}: probe stopped — ${flow.error}`);
  const ran = (id: string) => flows.every((flow) => flow.steps.some((step) => step.id === id));
  const verdict = (problems: string[], complete: boolean): Status => (problems.length ? 'FAIL' : complete ? 'PASS' : 'UNKNOWN');

  const bundle = [...shared.bundleIds.keys()];
  const scriptIds = [...new Set(all.flatMap(({ step }) => step.requests.map((request) => request.scriptId)).filter((id): id is string => Boolean(id)))];
  const tids = [...new Set(all.flatMap(({ step }) => step.events.map((event) => event.tid)).filter((id): id is string => Boolean(id)))];
  const idProblems: string[] = [];
  if (bundle.length !== 1) idProblems.push(`bundle carries ${bundle.length} measurement ID(s)`);
  if (scriptIds.some((id) => !bundle.includes(id)) || tids.some((id) => !bundle.includes(id))) idProblems.push('tag/hit ID differs from the bundle ID');
  const pre = all.filter(({ step }) => step.consent === 'before');
  const preProblems = [...failures((step) => step.consent === 'before'),
    ...pre.filter(({ step }) => step.snapshot && (step.snapshot.tagElements > 0 || step.snapshot.gtagDefined || step.snapshot.dataLayerLength !== null || step.snapshot.gaCookieNames.length > 0))
      .map(({ flow, step }) => `${flow.profile}/${step.id}: tag or GA cookie present before consent`)];
  const withdrawn = all.filter(({ step }) => step.consent === 'withdrawn');
  const lateRetries = withdrawn.reduce((sum, { step }) => sum + step.retransmissions, 0);
  const emEvents = all.flatMap(({ step }) => step.events).filter((event) => event.en && ENHANCED_MEASUREMENT_EVENTS.includes(event.en)).map((event) => event.en);
  const navIds = ['nav_airport', 'nav_where_to', 'history_back', 'nav_more_again'];
  const cspGoogle = flows.flatMap((flow) => flow.cspViolations.filter((violation) => /google|doubleclick/.test(violation.blocked)).map((violation) => `${flow.profile}: ${violation.directive} blocked ${violation.blocked}`));
  const csp = cspFindings(shared.documentCsp);

  return [
    { id: 'R1', title: 'Production serves one measurement ID, and the tag and every hit use it', status: verdict(idProblems, bundle.length === 1 && scriptIds.length > 0 && tids.length > 0),
      evidence: [`bundle: ${bundle.map((id) => `${id} in ${[...shared.bundleIds.get(id)!].join(', ')}`).join(' | ') || 'none'}`, `gtag/js id: ${scriptIds.join(', ') || 'none'}`, `hit tid: ${tids.join(', ') || 'none'}`,
        `bundle contains manual page_view code: ${shared.manualPageViewAssets.size ? [...shared.manualPageViewAssets].join(', ') : 'NOT FOUND'}`,
        `gtag/js HTTP ${shared.container.status ?? 'not loaded'}, container references the ID: ${container ? container.referencesMeasurementId : 'n/a'}`, ...idProblems] },
    { id: 'E0', title: 'The probe completed every step of every visit', status: errors.length ? 'FAIL' : 'PASS', evidence: errors.length ? errors : [`${flows.length} visit(s), ${all.length} step(s)`] },
    { id: 'R2', title: 'No Google tag or analytics request before consent (load + menu move)', status: verdict(preProblems, ran('pre_consent_menu_more')),
      evidence: [...pre.map(({ flow, step }) => `${flow.profile}${flow.delivered ? '(delivered)' : ''}/${step.id}: ${step.googleRequests} Google request(s), tag elements ${step.snapshot?.tagElements ?? '?'}, dataLayer ${step.snapshot?.dataLayerLength ?? 'absent'}, GA cookies ${step.snapshot?.gaCookieNames.length ?? '?'}`), ...preProblems] },
    { id: 'R3', title: 'Consent on the 더보기 checkbox, and a reload with consent stored, each send exactly one page_view', status: verdict(failures((step) => step.id === 'consent_granted' || step.id === 'reload_with_consent'), ran('consent_granted') && ran('reload_with_consent')),
      evidence: all.filter(({ step }) => step.id === 'consent_granted' || step.id === 'reload_with_consent').map(({ flow, step }) => `${flow.profile}${flow.delivered ? '(delivered)' : ''}/${step.id}: ${describe(step)}`) },
    { id: 'R4', title: 'Withdrawal through the same checkbox stops all sending', status: verdict(failures((step) => step.consent === 'withdrawn'), ran('after_withdrawal_close')),
      evidence: [...withdrawn.map(({ flow, step }) => `${flow.profile}${flow.delivered ? '(delivered)' : ''}/${step.id}: ${step.events.length} new event(s), ${step.googleRequests} Google request(s)${step.snapshot ? `, ga-disable=${String(step.snapshot.disableFlag)}` : ''}`),
        lateRetries ? `${lateRetries} retransmission(s) of hits created BEFORE withdrawal (abort-induced transport retry, not new events)` : 'no retransmissions after withdrawal'] },
    { id: 'R5', title: 'Each in-app menu move or back sends exactly one page_view (no gtag automatic duplicate)', status: verdict(failures((step) => navIds.includes(step.id)), navIds.every(ran)),
      evidence: all.filter(({ step }) => navIds.includes(step.id)).map(({ flow, step }) => `${flow.profile}${flow.delivered ? '(delivered)' : ''}/${step.id}: ${describe(step)}`) },
    { id: 'P1', title: 'Enhanced Measurement off for the stream (policy: no automatic events outside the allowlist)',
      status: emEvents.length || (container && (container.enhancedMeasurement.length > 0)) ? 'FAIL' : container?.format === 'RECOGNISED' && ran('scroll_to_end') ? 'PASS' : 'UNKNOWN',
      evidence: [`observed automatic events: ${emEvents.join(', ') || 'none'}`, container ? `gtag/js format ${container.format}; __ccd_em_* templates: ${container.enhancedMeasurement.map((tag) => `${tag.name} ${JSON.stringify(tag.flags)}`).join(' | ') || 'none'}; history page views ${container.historyPageViews}; google signals ${container.googleSignals ?? 'not stated'}` : 'gtag/js not captured'] },
    ...flows.filter((flow) => flow.delivered).map((flow): Requirement => {
      const sent = flow.steps.flatMap((step) => step.requests.filter((request) => request.action === 'delivered'));
      const rejected = sent.filter((request) => typeof request.status !== 'number' || request.status < 200 || request.status >= 300);
      const times = sent.map((request) => request.at);
      return { id: 'D1', title: `Marked test visit ${flow.marker} handed to the GA collector (transport only, not receipt)`, status: !sent.length || rejected.length ? 'FAIL' : 'PASS',
        evidence: [`${sent.length} delivered request(s); HTTP ${[...new Set(sent.map((request) => String(request.status)))].join(', ') || 'none'}`,
          times.length ? `first ${times[0]} (${kst(times[0])}), last ${times[times.length - 1]} (${kst(times[times.length - 1])})` : 'nothing delivered',
          `GA should show for this visit: views ${flow.traffic.views}; event count about ${flow.traffic.expectedGaEventCount} = sent ${JSON.stringify(flow.traffic.eventsByName)} + first_visit ${flow.traffic.derivedFirstVisit} + session_start ${flow.traffic.derivedSessionStart} (GA derives these two); users ${flow.traffic.users}`,
          `marker: event parameter ${MARKER_PARAM}=${flow.marker} on every delivered event (page_location carries no query by design)`] };
    }),
    { id: 'P2', title: 'Served CSP lets the tag load and report; no Google request blocked by CSP', status: cspGoogle.length || !csp.tagScriptAllowed || csp.collectAllowed.some((row) => !row.allowed) ? 'FAIL' : csp.present ? 'PASS' : 'UNKNOWN',
      evidence: [`script-src allows www.googletagmanager.com: ${csp.tagScriptAllowed}`, `connect-src: ${csp.collectAllowed.map((row) => `${row.host}=${row.allowed}`).join(', ')}`, `img-src allows GA pixel: ${csp.imagePixelAllowed} (only a fallback transport)`, `CSP violations on Google hosts: ${cspGoogle.join(' | ') || 'none'}`] },
  ];
}

function describe(step: StepRecord): string {
  const views = step.events.filter((event) => event.en === 'page_view');
  const others = step.events.filter((event) => event.en !== 'page_view').map((event) => event.en);
  const path = (page: string | null) => { try { return page ? new URL(page).pathname : '?'; } catch { return page ?? '?'; } };
  return `page_view ${views.length} [${views.map((view) => `${path(view.page)} dt=${view.title} _s=${view.counters._s ?? '-'}${view.counters._ss ? ' _ss' : ''}${view.counters._fv ? ' _fv' : ''}`).join('; ')}]${others.length ? `, other: ${others.join(', ')}` : ''}, requests ${step.collectRequests}${step.retransmissions ? `, retransmissions ${step.retransmissions}` : ''}`;
}

function markdown(flows: FlowResult[], reqs: Requirement[], meta: { origin: string; deliver: boolean; marker: string | null; buildSha: string | null; measurementId: string | null }): string {
  const lines = [`## GA4 browser probe — ${meta.origin}`, '', `Build SHA served: \`${meta.buildSha ?? 'unknown'}\` · Measurement ID served: \`${meta.measurementId ?? 'none'}\` · Delivery: ${meta.deliver ? `**ON** (marker \`${meta.marker}\`)` : 'off (every collection request aborted in the browser)'}`, '',
    '| | Requirement | Result |', '|---|---|---|', ...reqs.map((req) => `| ${req.id} | ${req.title} | **${req.status}** |`), '',
    ...reqs.filter((req) => req.id === 'D1').flatMap((req) => [...req.evidence.map((line) => `- ${line}`),
      `- In GA: Reports → Realtime → "Event count by Event name" → page_view → parameter \`koretail_ga_check\` should list \`${meta.marker}\`. This visit is development test traffic.`, '']),
    '| Visit | Step | page_view | other events | requests | verdict |', '|---|---|---|---|---|---|'];
  for (const flow of flows) for (const step of flow.steps) {
    lines.push(`| ${flow.profile}${flow.delivered ? ' (delivered)' : ''} | ${step.label} | ${step.events.filter((event) => event.en === 'page_view').length} | ${step.events.filter((event) => event.en !== 'page_view').map((event) => event.en).join(', ') || '—'} | ${step.googleRequests} | ${step.verdict?.status ?? '—'} |`);
  }
  lines.push('', 'GA numbers: **event count** counts every event (GA also derives first_visit/session_start from the first hit), **views** counts page_view only, **users** counts distinct browsers.');
  for (const flow of flows) {
    const t = flow.traffic;
    lines.push(`- ${flow.profile}${flow.delivered ? ' (DELIVERED test visit)' : ' (aborted, nothing reached GA)'}: views ${t.views}, network events ${t.networkEvents} ${JSON.stringify(t.eventsByName)}, +first_visit ${t.derivedFirstVisit} +session_start ${t.derivedSessionStart} → expected GA event count ${t.expectedGaEventCount}, users ${t.users}${flow.error ? ` — STOPPED: ${flow.error}` : ''}`);
  }
  lines.push('', 'GA4 account receipt: **UNVERIFIED** here (no account access).');
  return lines.join('\n');
}

export async function runProbe(options: ProbeOptions) {
  const startedAt = new Date().toISOString();
  const marker = options.deliver ? compactUtc() : null;
  // Printed before the visit starts, so the owner watching the live log can look for it in Realtime.
  if (marker) console.log(`DELIVERY ON — marked test visit starting now (${kst(startedAt)}); GA marker ${MARKER_PARAM}=${marker}`);
  const shared: Shared = { bundleIds: new Map(), manualPageViewAssets: new Set(), scanned: new Set(), pendingScans: [], container: { status: null, body: null }, documentCsp: null };
  let browser: Browser;
  let channel = 'chromium (new headless)';
  try {
    browser = await chromium.launch({ channel: 'chromium' });
  } catch {
    channel = 'chromium headless shell';
    browser = await chromium.launch();
  }
  const flows: FlowResult[] = [];
  try {
    const selected = PROFILES.filter((profile) => !options.profiles || options.profiles.includes(profile.id));
    // The delivered visit goes first so the owner watching Realtime waits least.
    if (marker) flows.push(await runFlow(browser, PROFILES.find((profile) => profile.id === 'desktop')!, options, shared, marker));
    for (const profile of selected) flows.push(await runFlow(browser, profile, options, shared, null));
  } finally {
    await browser.close();
  }
  await Promise.all(shared.pendingScans);
  const measurementId = [...shared.bundleIds.keys()][0] ?? null;
  const container = shared.container.body ? analyzeTagContainer(shared.container.body, measurementId) : null;
  const reqs = requirements(flows, shared, container);
  const buildSha = flows.find((flow) => flow.buildSha)?.buildSha ?? null;
  const overall = reqs.some((req) => req.status === 'FAIL') ? 'FAIL' : reqs.some((req) => req.status === 'UNKNOWN') ? 'INCOMPLETE' : 'PASS';
  const evidence = {
    probe: 'ga4-browser-probe v1', startedAt, finishedAt: new Date().toISOString(), origin: options.origin, browserChannel: channel,
    deliver: options.deliver, marker, buildSha, measurementId, overall, requirements: reqs,
    container: container ? { ...container, httpStatus: shared.container.status } : null, csp: cspFindings(shared.documentCsp), flows,
    gaAccountReceipt: 'UNVERIFIED_NO_ACCOUNT_ACCESS',
  };
  return { evidence, markdown: markdown(flows, reqs, { origin: options.origin, deliver: options.deliver, marker, buildSha, measurementId }) };
}

function printReport(evidence: Awaited<ReturnType<typeof runProbe>>['evidence']) {
  const out = (line = '') => console.log(line);
  out(`KORETAIL GA4 browser probe — ${evidence.origin} (${evidence.browserChannel})`);
  out(`started ${evidence.startedAt} (${kst(evidence.startedAt)}), build SHA served ${evidence.buildSha ?? 'unknown'}`);
  out(`MEASUREMENT_ID_SERVED: ${evidence.measurementId ?? 'NONE'}`);
  if (evidence.deliver) {
    out('');
    out(`DELIVERY ON — ONE marked test visit is sent to GA. MARKER ${MARKER_PARAM}=${evidence.marker}`);
    out('Look in GA Realtime: Event count by Event name → page_view → parameter koretail_ga_check');
  } else out('DELIVERY OFF — every collection request was recorded and aborted inside the browser; nothing reached GA');
  for (const flow of evidence.flows) {
    out('');
    out(`=== ${flow.profile}${flow.delivered ? ' — DELIVERED TEST VISIT' : ''} — ${flow.startUrl}`);
    if (flow.browser) out(`browser: ${flow.browser.userAgent} | brands ${flow.browser.brands?.join(', ') ?? 'n/a'} | webdriver ${flow.browser.webdriver}`);
    for (const step of flow.steps) {
      out(`[${step.verdict?.status ?? '----'}] ${step.id} — ${step.label} @ ${step.startedAt}`);
      out(`       ${describe(step)}; Google requests ${step.googleRequests}${step.verdict?.reasons.length ? ` — ${step.verdict.reasons.join('; ')}` : ''}`);
      if (step.snapshot) out(`       state: path ${step.snapshot.path}, tag scripts ${step.snapshot.tagElements}, gtag ${step.snapshot.gtagDefined}, dataLayer ${step.snapshot.dataLayerLength ?? 'absent'}, stored choice ${step.snapshot.storedChoice ?? 'none'}, ga-disable ${String(step.snapshot.disableFlag)}, GA cookie names ${step.snapshot.gaCookieNames.join(',') || 'none'}`);
      for (const request of step.requests) {
        out(`       ${request.at} +${request.atMs}ms ${request.action.toUpperCase()} ${request.method} ${request.host}${request.path} (${request.resourceType}) status ${request.status ?? '-'}${request.scriptId ? ` id=${request.scriptId}` : ''}`);
        for (const event of request.events) {
          out(`         en=${event.en} tid=${event.tid} page=${event.page}${event.pageQueryKeys.length ? ` (dl carries query keys ${event.pageQueryKeys.join(',')}; values withheld here)` : ''}${event.pageHasFragment ? ' (dl carries a fragment)' : ''} dt=${event.title} dr=${event.referrer} ${Object.entries(event.counters).map(([key, value]) => `${key}=${value}`).join(' ')} ${Object.entries(event.consent).map(([key, value]) => `${key}=${value}`).join(' ')} cid#${event.clientHash ?? '-'} sid#${event.sessionHash ?? '-'}${Object.keys(event.eventParams).length ? ` params ${JSON.stringify(event.eventParams)}` : ''}${event.userIdPresent ? ' uid PRESENT' : ''}`);
        }
      }
    }
    if (flow.cspViolations.length) out(`CSP violations: ${flow.cspViolations.map((violation) => `${violation.directive} ${violation.blocked} ×${violation.count}`).join(' | ')}`);
    const t = flow.traffic;
    out(`traffic: views ${t.views} | network events ${t.networkEvents} ${JSON.stringify(t.eventsByName)} | derived first_visit ${t.derivedFirstVisit}, session_start ${t.derivedSessionStart} | expected GA event count ${t.expectedGaEventCount} | users ${t.users}${flow.delivered ? ' — DEVELOPMENT TEST TRAFFIC' : ' — not delivered'}`);
    if (flow.error) out(`PROBE STOPPED: ${flow.error}`);
  }
  out('');
  if (evidence.container) {
    out(`gtag/js container: HTTP ${evidence.container.httpStatus}, format ${evidence.container.format}, references ID ${evidence.container.referencesMeasurementId}`);
    out(`  templates: ${evidence.container.templates.join(', ')}`);
    out(`  enhanced measurement templates: ${evidence.container.enhancedMeasurement.map((tag) => `${tag.name} (${tag.feature}) ${JSON.stringify(tag.flags)}`).join(' | ') || 'none'}`);
    out(`  stream settings: ${evidence.container.settings.map((tag) => `${tag.name} ${JSON.stringify(tag.flags)}`).join(' | ') || 'none'}`);
  } else out('gtag/js container: not captured');
  out(`CSP: script-src ${evidence.csp.scriptSrc ?? 'absent'}`);
  out(`     connect-src ${evidence.csp.connectSrc ?? 'absent'}`);
  out(`     img-src ${evidence.csp.imgSrc ?? 'absent'}`);
  out('');
  for (const req of evidence.requirements) {
    out(`${req.id} ${req.status} — ${req.title}`);
    for (const line of req.evidence) out(`   ${line}`);
  }
  out('');
  out('GA4_ACCOUNT_RECEIPT: UNVERIFIED (no account access; a 2xx from the collector is not receipt in the property)');
  out(`GA4_BROWSER_PROBE: ${evidence.overall}`);
}

async function main() {
  const arg = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
  const origin = new URL(arg('origin') ?? process.env.KORETAIL_PROBE_ORIGIN ?? 'https://koretaildata.com').origin;
  const deliver = process.env.DELIVER_TEST_HIT === 'true' || process.argv.includes('--deliver-test-hit');
  const { evidence, markdown: summary } = await runProbe({ origin, deliver, profiles: arg('profiles')?.split(',') });
  printReport(evidence);
  writeFileSync(arg('out') ?? 'ga4-probe-evidence.json', `${JSON.stringify(evidence, null, 2)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  if (evidence.overall === 'FAIL') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
