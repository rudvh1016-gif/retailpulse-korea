import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  analyzeTagContainer, compactUtc, cspFindings, evaluateStep, eventKey, isGa4Transport, isGoogleMeasurementHost, measurementIdsIn,
  parseCollect, requestKind, summarizeEvent, trafficSummary, withMarker, type StepEvidence,
} from '../scripts/ga4-probe-lib';

const COLLECT = 'https://region1.google-analytics.com/g/collect';
const CID = '1234567890.1760400000';

test('only Google tag and analytics hosts are intercepted, and requests are classified', () => {
  for (const host of ['www.googletagmanager.com', 'region1.google-analytics.com', 'region1.analytics.google.com', 'stats.g.doubleclick.net', 'www.google.com', 'www.google.co.kr']) assert.equal(isGoogleMeasurementHost(host), true, host);
  for (const host of ['koretaildata.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'notgoogle.com']) assert.equal(isGoogleMeasurementHost(host), false, host);
  assert.equal(requestKind(new URL('https://www.googletagmanager.com/gtag/js?id=G-TEST1234')), 'tag-script');
  assert.equal(requestKind(new URL(`${COLLECT}?v=2`)), 'collect');
  assert.equal(requestKind(new URL('https://www.google-analytics.com/g/collect?v=2')), 'collect');
  assert.equal(requestKind(new URL('https://www.googletagmanager.com/td?id=G-TEST1234')), 'other-google');
});

test('a batched GA4 request yields one event per body line with the shared URL parameters', () => {
  const single = parseCollect(`${COLLECT}?v=2&tid=G-TEST1234&cid=${CID}&en=page_view&_s=1`, null);
  assert.equal(single.length, 1);
  assert.equal(single[0].en, 'page_view');
  const batched = parseCollect(`${COLLECT}?v=2&tid=G-TEST1234&cid=${CID}&_s=3`, 'en=page_view&dl=https%3A%2F%2Fkoretaildata.com%2Fko%2Fairport\nen=user_engagement&_et=1200\n');
  assert.deepEqual(batched.map((event) => [event.en, event.tid, event._s]), [['page_view', 'G-TEST1234', '3'], ['user_engagement', 'G-TEST1234', '3']]);
});

test('summaries keep counters and paths but never a client ID, session ID, query value or referrer', () => {
  const [params] = parseCollect(`${COLLECT}?v=2&tid=G-TEST1234&cid=${CID}&sid=1760400000&sct=1&seg=0&_s=1&_ss=1&_fv=1&gcs=G101&en=page_view&dt=KORETAIL&dr=https%3A%2F%2Fexample.invalid%2Fprivate&dl=${encodeURIComponent('https://koretaildata.com/ko/more?email=private#frag')}&ep.search_term=private&ep.role=manager`, null);
  const summary = summarizeEvent(params);
  assert.equal(summary.page, 'https://koretaildata.com/ko/more');
  assert.deepEqual(summary.pageQueryKeys, ['email']);
  assert.equal(summary.pageHasFragment, true);
  assert.equal(summary.referrer, 'present');
  assert.deepEqual(summary.counters, { _s: '1', _ss: '1', _fv: '1', seg: '0', sct: '1' });
  assert.deepEqual(summary.consent, { gcs: 'G101' });
  assert.deepEqual(summary.eventParams, { 'ep.search_term': 'PRESENT', 'ep.role': 'manager' });
  assert.match(summary.clientHash ?? '', /^[0-9a-f]{10}$/);
  const printed = JSON.stringify(summary);
  for (const secret of [CID, '1760400000', 'private', 'example.invalid']) assert.ok(!printed.includes(secret), secret);
  assert.notEqual(eventKey(summary, 0), eventKey(summary, 1));
  // A reload in the same session can restart the hit counter; the page-load ID keeps the two apart.
  const before = summarizeEvent({ en: 'page_view', sid: '1760400000', _s: '1', _p: '111' });
  const afterReload = summarizeEvent({ en: 'page_view', sid: '1760400000', _s: '1', _p: '222' });
  assert.notEqual(eventKey(before, 0), eventKey(afterReload, 0));
  assert.equal(eventKey(before, 0), eventKey(summarizeEvent({ en: 'page_view', sid: '1760400000', _s: '1', _p: '111' }), 0));
});

test('the delivery marker is appended to the URL and to every event line, never re-encoding gtag parameters', () => {
  const url = `${COLLECT}?v=2&tid=G-TEST1234&dl=https%3A%2F%2Fkoretaildata.com%2Fko`;
  const marked = withMarker(url, 'en=page_view\nen=user_engagement', '20261014T110000Z');
  assert.equal(marked.url, `${url}&ep.koretail_ga_check=20261014T110000Z`);
  assert.equal(marked.body, 'en=page_view&ep.koretail_ga_check=20261014T110000Z\nen=user_engagement&ep.koretail_ga_check=20261014T110000Z');
  assert.equal(withMarker(url, null, '20261014T110000Z').body, null);
  assert.throws(() => withMarker(url, null, 'x&cid=1'));
  assert.match(compactUtc(new Date('2026-10-14T11:00:00.123Z')), /^20261014T110000Z$/);
});

test('bundle scanning finds literal measurement IDs and ignores the placeholder', () => {
  assert.deepEqual(measurementIdsIn('const a="G-AB12CD34EF",b=/^G-[A-Z0-9]{4,20}$/,c="G-XXXXXXXXXX";w[`ga-disable-${a}`]'), ['G-AB12CD34EF']);
  assert.deepEqual(measurementIdsIn('nothing here'), []);
});

test('gtag/js stream settings: EM templates are reported, absence is OFF, an unknown file is UNKNOWN', () => {
  const off = 'var data = {"resource":{"version":"1","tags":[{"function":"__ogt_google_signals","priority":8,"vtp_googleSignals":"DISABLED","vtp_serverMainRegion":["map"],"tag_id":4},{"function":"__gct","vtp_trackingId":"G-TEST1234","vtp_sessionDuration":0,"tag_id":1}]}};';
  const offResult = analyzeTagContainer(off, 'G-TEST1234');
  assert.equal(offResult.format, 'RECOGNISED');
  assert.equal(offResult.historyPageViews, 'OFF');
  assert.deepEqual(offResult.enhancedMeasurement, []);
  assert.equal(offResult.googleSignals, 'DISABLED');
  assert.equal(offResult.referencesMeasurementId, true);
  assert.deepEqual(offResult.settings[0].flags, { vtp_googleSignals: 'DISABLED', vtp_serverMainRegion: '[list]' });
  const on = '{"tags":[{"function":"__ccd_em_page_view","vtp_historyEvents":true,"vtp_includeParams":true,"vtp_instanceDestinationId":"G-TEST1234","tag_id":7},{"function":"__ccd_em_scroll","vtp_includeParams":true,"tag_id":8},{"function":"__gct","tag_id":1}]}';
  const onResult = analyzeTagContainer(on, 'G-OTHER123');
  assert.equal(onResult.historyPageViews, 'ON');
  assert.deepEqual(onResult.enhancedMeasurement.map((tag) => tag.name), ['__ccd_em_page_view', '__ccd_em_scroll']);
  assert.equal(onResult.referencesMeasurementId, false);
  assert.equal(analyzeTagContainer('!function(){}()', 'G-TEST1234').format, 'UNKNOWN');
  assert.equal(analyzeTagContainer('!function(){}()', 'G-TEST1234').historyPageViews, 'UNKNOWN');
});

test('tag-level automatic event detection and user-provided data settings are reported apart from GA4 Enhanced Measurement', () => {
  // The template set production served on 2026-10-14 (run 38521485610), values abbreviated.
  const served = '{"tags":[{"function":"__ogt_1p_data_v2","priority":12,"vtp_isAutoEnabled":true,"vtp_isManualEnabled":false,"vtp_autoEmailEnabled":true,"vtp_autoCollectExclusionSelectors":["list",["map","exclusionSelector",""]],"vtp_isEnabled":true,"tag_id":5},'
    + '{"function":"__ogt_auto_events","vtp_enableHistoryEvents":true,"vtp_enableScroll":true,"vtp_enablePageView":true,"vtp_enableInPageEventsHidden":false,"tag_id":6},'
    + '{"function":"__ccd_ga_first","vtp_instanceDestinationId":"G-TEST1234","tag_id":7},{"function":"__dest_ga","tag_id":8},{"function":"__gct","vtp_trackingId":"G-TEST1234","tag_id":1}]}';
  const result = analyzeTagContainer(served, 'G-TEST1234');
  assert.equal(result.format, 'RECOGNISED');
  assert.deepEqual(result.enhancedMeasurement, []);
  assert.deepEqual(result.autoEventDetection, { vtp_enableHistoryEvents: true, vtp_enableScroll: true, vtp_enablePageView: true, vtp_enableInPageEventsHidden: false });
  assert.deepEqual(result.userProvidedData, { vtp_isAutoEnabled: true, vtp_isManualEnabled: false, vtp_autoEmailEnabled: true, vtp_autoCollectExclusionSelectors: '[list]', vtp_isEnabled: true });
  assert.equal(analyzeTagContainer('{"tags":[{"function":"__gct","tag_id":1}]}', null).autoEventDetection, null);
});

test('only the tag script and GA4 collection count as GA4 transport when the CSP blocks a request', () => {
  assert.equal(isGa4Transport('https://www.google-analytics.com/g/collect'), true);
  assert.equal(isGa4Transport('https://region1.analytics.google.com/g/collect'), true);
  assert.equal(isGa4Transport('https://www.googletagmanager.com/gtag/js'), true);
  assert.equal(isGa4Transport('https://www.google.com/g/collect'), false);
  assert.equal(isGa4Transport('eval'), false);
});

function step(overrides: Partial<StepEvidence>): StepEvidence {
  return { id: 'x', label: 'x', consent: 'granted', expectPageViews: 1, googleRequests: 1, collectRequests: 1, events: [], retransmissions: 0, ...overrides };
}
const view = (path: string, extra = '') => summarizeEvent(parseCollect(`${COLLECT}?tid=G-TEST1234&cid=${CID}&sid=1&_s=1&en=page_view&dl=${encodeURIComponent(`https://koretaildata.com${path}`)}${extra}`, null)[0]);

test('step verdicts: pre-consent request, duplicate page_view, post-withdrawal event and EM event all fail', () => {
  assert.equal(evaluateStep(step({ consent: 'before', expectPageViews: 0, googleRequests: 1, collectRequests: 0 })).status, 'FAIL');
  assert.equal(evaluateStep(step({ consent: 'before', expectPageViews: 0, googleRequests: 0, collectRequests: 0 })).status, 'PASS');
  assert.equal(evaluateStep(step({ events: [view('/ko/airport')], expectPath: '/ko/airport' })).status, 'PASS');
  assert.equal(evaluateStep(step({ events: [view('/ko/airport'), view('/ko/airport', '&_s=2')], expectPath: '/ko/airport' })).status, 'FAIL');
  assert.equal(evaluateStep(step({ events: [view('/ko/more')], expectPath: '/ko/airport' })).status, 'FAIL');
  assert.equal(evaluateStep(step({ events: [] })).status, 'FAIL');
  assert.equal(evaluateStep(step({ consent: 'withdrawn', expectPageViews: 0, events: [view('/ko/airport')] })).status, 'FAIL');
  assert.equal(evaluateStep(step({ consent: 'withdrawn', expectPageViews: 0, events: [], retransmissions: 2 })).status, 'PASS');
  const scroll = summarizeEvent({ en: 'scroll', tid: 'G-TEST1234', 'epn.percent_scrolled': '90' });
  assert.equal(evaluateStep(step({ expectPageViews: 0, events: [scroll] })).status, 'FAIL');
});

test('traffic summary keeps event count, views and users apart', () => {
  const first = view('/ko/more', '&_fv=1&_ss=1');
  const engagement = summarizeEvent({ en: 'user_engagement', tid: 'G-TEST1234', cid: CID, _et: '900' });
  assert.deepEqual(trafficSummary([first, view('/ko/airport'), engagement]), {
    networkEvents: 3, eventsByName: { page_view: 2, user_engagement: 1 }, views: 2, derivedFirstVisit: 1, derivedSessionStart: 1, expectedGaEventCount: 5, users: 1,
  });
});

test('the served CSP from next.config.ts admits the tag and the collectors but not the image fallback', () => {
  const policy = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8').match(/"Content-Security-Policy", value: "([^"]+)"/)?.[1] ?? null;
  const csp = cspFindings(policy);
  assert.equal(csp.tagScriptAllowed, true);
  assert.deepEqual(csp.collectAllowed.map((row) => row.allowed), [true, true, true]);
  assert.equal(csp.imagePixelAllowed, false);
  assert.equal(cspFindings(null).present, false);
});

test('the analytics check workflow stays manual, secret-free and delivers nothing unless asked', () => {
  const workflow = readFileSync(new URL('../.github/workflows/analytics-check.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(workflow, /^\s*schedule\s*:/m);
  assert.doesNotMatch(workflow, /^\s*(push|pull_request|workflow_run)\s*:/m);
  assert.doesNotMatch(workflow, /secrets\./);
  assert.match(workflow, /deliver_test_hit:\s*\n(?:\s+[a-z_]+:.*\n)*?\s+default:\s*false/);
  assert.match(workflow, /DELIVER_TEST_HIT:\s*\$\{\{\s*inputs\.deliver_test_hit\s*\}\}/);
  assert.match(workflow, /permissions:\s*\n\s+contents:\s*read/);
});
