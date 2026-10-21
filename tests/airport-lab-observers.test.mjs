import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { installAirportLabObservers, collectAirportLabMeasurement } from '../scripts/airport-lab-observers.mjs';

function observerHarness() {
  const callbacks = {};
  const context = {
    window: {},
    PerformanceObserver: class {
      constructor(callback) { this.callback = callback; }
      observe({ type }) { callbacks[type] = this.callback; }
    },
  };
  // Match Playwright serialization: imported helpers cannot leak into scope.
  runInNewContext(`(${installAirportLabObservers.toString()})()`, context);
  return { state: context.window.__lab, emit: (type, entries) => callbacks[type]({ getEntries: () => entries }) };
}

const element = (text, { briefing = true, form = false } = {}) => ({
  tagName: 'SMALL', className: 'focus-event-row', textContent: text,
  closest: selector => selector === '.focus-report' ? briefing : form,
  querySelector: () => null,
  parentElement: { tagName: 'SPAN', className: 'focus-event-row' },
  previousElementSibling: { tagName: 'SMALL' },
});

test('LCP records capped candidates and fixture-only short text, while latest aggregate stays accurate', () => {
  const { state, emit } = observerHarness();
  const entries = Array.from({ length: 23 }, (_, index) => ({
    startTime: index + 100, renderTime: index + 100, loadTime: 0, size: 200,
    element: element(`공식 일정 ${'가'.repeat(200)}`),
  }));
  emit('largest-contentful-paint', entries);
  assert.equal(state.lcp, 122);
  assert.equal(state.lcpElement, 'SMALL.focus-event-row');
  assert.equal(state.lcpCandidates.length, 20);
  assert.equal(state.attributionDropped.lcpCandidates, 3);
  assert.equal(state.lcpCandidates[0].text.length, 100);
  assert.match(state.lcpCandidates[0].path, /span\.focus-event-row.*small\.focus-event-row:nth-of-type\(2\)/);

  const privateHarness = observerHarness();
  privateHarness.emit('largest-contentful-paint', [
    { startTime: 1, element: element('private outside briefing', { briefing: false }) },
    { startTime: 2, element: element('private form text', { form: true }) },
  ]);
  assert.ok(privateHarness.state.lcpCandidates.every(entry => entry.text === null));
  assert.doesNotMatch(JSON.stringify(privateHarness.state), /private/);
});

test('non-input shifts retain source rectangles without layout reads and keep the old cumulative budget', () => {
  const { state, emit } = observerHarness();
  const node = element('not captured');
  node.getBoundingClientRect = () => { throw Error('Attribution must not force layout'); };
  const source = { node, previousRect: { x: 1, y: 2.1234, width: 3, height: 4 }, currentRect: { x: 1, y: 9, width: 3, height: 4 } };
  emit('layout-shift', [{ startTime: 1, value: 0.5, hadRecentInput: true, sources: [source] }]);
  emit('layout-shift', Array.from({ length: 42 }, (_, index) => ({
    startTime: index + 2, value: 0.001, hadRecentInput: false, sources: Array(7).fill(source),
  })));
  assert.ok(Math.abs(state.cls - 0.042) < 1e-9);
  assert.equal(state.layoutShifts.length, 40);
  assert.equal(state.attributionDropped.layoutShifts, 2);
  assert.equal(state.layoutShifts[0].sources.length, 5);
  assert.equal(state.layoutShifts[0].sourcesDropped, 2);
  assert.equal(state.layoutShifts[0].sources[0].previousRect.y, 2.12);
  assert.doesNotMatch(JSON.stringify(state.layoutShifts), /not captured/);
  emit('longtask', [{ duration: 40 }, { duration: 80 }]);
  assert.equal(state.blockingMs, 30);
});

test('measurement strips query, fragment and URL credentials and caps timing detail, not byte totals', () => {
  const resources = Array.from({ length: 162 }, (_, index) => ({
    name: index === 0 ? 'https://user:password@example.org/font.woff2?secret=hidden#fragment'
      : index === 1 ? 'data:text/plain,credential' : `https://lab.test/api/live/summary?date=private-${index}#private`,
    initiatorType: 'fetch', transferSize: 300, encodedBodySize: 200,
    startTime: index, fetchStart: index + 1, requestStart: index + 2, responseStart: index + 3,
    responseEnd: index + 4, duration: 4, renderBlockingStatus: 'non-blocking',
  }));
  const context = {
    URL, window: { __lab: { lcp: 12, cls: 0.02 } },
    location: { href: 'https://lab.test/ko?private=true', origin: 'https://lab.test' },
    performance: {
      getEntriesByType: type => type === 'resource' ? resources
        : [{ transferSize: 1000, responseStart: 12, responseEnd: 15, domContentLoadedEventEnd: 20, loadEventEnd: 25 }],
      getEntriesByName: () => [{ startTime: 17 }],
    },
    document: { documentElement: { scrollWidth: 390 }, querySelector: selector => selector === '.app' ? { getAttribute: () => 'true' } : null },
    innerWidth: 390,
  };
  const report = runInNewContext(`(${collectAirportLabMeasurement.toString()})()`, context);
  assert.equal(report.resources.length, 162);
  assert.equal(report.resources.reduce((sum, entry) => sum + entry.bytes, 0), 48_600);
  assert.equal(report.resourceTimings.length, 160);
  assert.equal(report.resourceTimingsDropped, 2);
  assert.equal(report.resources[0].url, 'https://example.org/font.woff2');
  assert.equal(report.resources[1].url, '[non-http resource]');
  assert.equal(report.resources[2].url, '/api/live/summary');
  assert.equal(report.navigationTiming.responseStart, 12);
  assert.equal(report.fcp, 17);
  assert.equal(report.hydrated, true);
  assert.equal(report.overflow, false);
  assert.equal(report.noticeOpen, false);
  context.document.querySelector = () => ({ getAttribute: () => 'true' });
  const openNotice = runInNewContext(`(${collectAirportLabMeasurement.toString()})()`, context);
  assert.equal(openNotice.noticeOpen, true);
  assert.doesNotMatch(JSON.stringify(report), /password|secret|hidden|fragment|credential|private/);
});
