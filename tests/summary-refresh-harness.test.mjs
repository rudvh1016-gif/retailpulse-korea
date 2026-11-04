import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as policy from '../lib/summary-refresh-policy.ts';
import {shortensSummaryRecheck} from '../lib/summary-recheck.ts';
import {kstDayOf} from '../lib/kst.ts';

// Execute the production loader, not a test copy. Only I/O and the wall clock
// are replaced, while validation, backoff and freshness use their real modules.
const source = readFileSync(new URL('../app/live-summary.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(`${source}\nexport {loadSummary, summaryCache, summaryPending};`, {
  compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX},
}).outputText;
const START = Date.parse('2026-11-04T11:01:00+09:00');
const good = (now = START) => ({mode: 'live-summary', generatedAt: new Date(now).toISOString(),
  todayKst: '2026-11-04', serviceDateKst: '2026-11-04', dayRelation: 'TODAY', areas: {}, sources: [],
  airport: {todayExpectedPassengersTotal: 42, forecastCoverage: {all: 'COMPLETE'},
    arrivalForecast: {forecastCoverage: {all: 'COMPLETE'}}, congestion: [{terminal: 'T2', zone: 'DG1_A',
      observedAt: new Date(now - 4 * 60_000).toISOString(), retrievedAt: new Date(now - 3 * 60_000).toISOString(),
      freshness: 'LIVE', collectionStatus: 'LIVE', waitTimeMinutes: 0, waitTimeRaw: '0'}]}});

function harness(read) {
  let now = START;
  const calls = [];
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const exports = {};
  vm.runInNewContext(compiled, {exports, Date: Clock, URLSearchParams,
    require(name) {
      if (name.endsWith('/demand-presentation')) return {kstDay: kstDayOf};
      if (name.endsWith('/summary-recheck')) return {shortensSummaryRecheck};
      if (name.endsWith('/summary-refresh-policy')) return policy;
      if (name.endsWith('/read-stored-json')) return {readStoredJson(url, init) {calls.push({url, init}); return read(url, init);}};
      if (name === 'react' || name === 'react/jsx-runtime') return {};
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  return {...exports, calls, advance(ms) {now += ms;}, now: () => now,
    load: (date = null, key = 'today') => exports.loadSummary(date, undefined, key),
    due(key = 'today') {now = exports.summaryCache.get(key).recheckAt;},
  };
}

test('malformed HTTP success releases the pending slot and later recovers', async () => {
  let malformed = true;
  const h = harness(() => malformed ? {...good(), sources: {}} : good(h.now()));
  assert.equal(await h.load(), null);
  assert.equal(h.summaryPending.size, 0);
  assert.equal(h.summaryCache.get('today').failures, 1);
  assert.equal(h.summaryCache.get('today').recheckAt - h.now(), 60_000);
  malformed = false; h.due();
  assert.equal((await h.load()).airport.todayExpectedPassengersTotal, 42);
  assert.equal(h.calls.length, 2);
  assert.equal(h.summaryPending.size, 0);
  assert.equal(h.summaryCache.get('today').failures, 0);
});

test('malformed refresh preserves exact last-good provider values and clocks', async () => {
  let broken = false;
  const h = harness(() => broken ? {...good(), airport: []} : good());
  const initial = await h.load();
  broken = true; h.due();
  const retained = await h.load();
  assert.equal(retained.airport, initial.airport);
  assert.equal(retained.generatedAt, initial.generatedAt);
  assert.equal(retained.airport.congestion[0].waitTimeMinutes, 0);
  assert.equal(retained.airport.congestion[0].observedAt, initial.airport.congestion[0].observedAt);
  assert.equal(retained.clientRefresh.failedAt, new Date(h.now()).toISOString());
  assert.equal(initial.clientRefresh, undefined);
  assert.equal(h.summaryPending.size, 0);
});

test('synchronous read throws and asynchronous body failures cannot stop retries', async () => {
  let attempt = 0;
  const h = harness(() => {
    if (++attempt === 1) throw new TypeError('sync loader error');
    if (attempt === 2) return Promise.reject(new SyntaxError('invalid JSON body'));
    return good(h.now());
  });
  assert.equal(await h.load(), null);
  assert.equal(h.summaryPending.size, 0);
  h.due(); assert.equal(await h.load(), null);
  assert.equal(h.summaryPending.size, 0);
  h.due(); assert.equal((await h.load()).mode, 'live-summary');
  assert.equal(attempt, 3);
});

test('concurrent subscribers share one request and healthy cache prevents extra reads', async () => {
  let release;
  const wait = new Promise(resolve => {release = resolve;});
  const h = harness(() => wait);
  const a = h.load(), b = h.load(), c = h.load();
  await Promise.resolve();
  assert.equal(h.calls.length, 1);
  assert.equal(h.summaryPending.size, 1);
  release(good());
  const results = await Promise.all([a, b, c]);
  assert.equal(results[0], results[1]);
  assert.equal(results[0], results[2]);
  assert.equal(h.summaryPending.size, 0);
  await h.load();
  assert.equal(h.calls.length, 1);
});

test('failure cadence backs off, stays capped, and resets after success', async () => {
  let fail = true;
  const h = harness(() => fail ? Promise.reject(new Error('offline')) : good(h.now()));
  for (const delay of [60_000, 120_000, 240_000, 300_000, 300_000]) {
    assert.equal(await h.load(), null);
    assert.equal(h.summaryCache.get('today').recheckAt - h.now(), delay);
    h.due();
  }
  assert.equal(h.summaryCache.get('today').failures, 4);
  fail = false;
  assert.equal((await h.load()).clientRefresh, undefined);
  assert.equal(h.summaryCache.get('today').failures, 0);
  fail = true; h.due(); await h.load();
  assert.equal(h.summaryCache.get('today').recheckAt - h.now(), 60_000);
});

test('initial read consumes preload, subsequent reads avoid browser cache without busting URLs', async () => {
  const h = harness(() => good(h.now()));
  await h.load(); h.due(); await h.load();
  assert.equal(h.calls[0].init.cache, 'default');
  assert.equal(h.calls[1].init.cache, 'no-cache');
  assert.equal(h.calls[0].url, '/api/live/summary');
  assert.equal(h.calls[1].url, h.calls[0].url);
});

test('wrong-date success is rejected and midnight bounds the existing key retry', async () => {
  const h = harness(() => good(h.now()));
  assert.equal(await h.load('2026-11-05', 'tomorrow'), null);
  assert.equal(h.summaryPending.size, 0);
  h.advance(Date.parse('2026-11-04T23:59:30+09:00') - h.now());
  await h.load(null, 'night');
  assert.equal(h.summaryCache.get('night').recheckAt, Date.parse('2026-11-05T00:00:00+09:00'));
});

test('a future generated clock cannot pin the cache against correctly timed recovery', async () => {
  let future = true;
  const h = harness(() => ({...good(h.now()), generatedAt: new Date(h.now() + (future ? 86_400_000 : 0)).toISOString()}));
  const initial = await h.load();
  assert.equal(Date.parse(initial.generatedAt) > h.now(), true);
  assert.equal(h.summaryCache.get('today').recheckAt - h.now(), 60_000);
  future = false; h.due();
  const recovered = await h.load();
  assert.equal(recovered.generatedAt, new Date(h.now()).toISOString());
  assert.equal(recovered.clientRefresh, undefined);
  assert.equal(h.summaryCache.get('today').failures, 0);
  assert.equal(h.calls.length, 2);
});

test('an older nonfuture snapshot preserves last-good clocks until a newer response arrives', async () => {
  let state = 'initial';
  const h = harness(() => good(state === 'older' ? START - 60_000 : h.now()));
  const initial = await h.load();
  state = 'older'; h.due();
  const retained = await h.load();
  assert.equal(retained.generatedAt, initial.generatedAt);
  assert.equal(retained.airport, initial.airport);
  assert.equal(retained.airport.congestion[0].observedAt, initial.airport.congestion[0].observedAt);
  assert.equal(retained.clientRefresh.failedAt, new Date(h.now()).toISOString());
  assert.equal(h.summaryCache.get('today').failures, 1);
  assert.equal(h.summaryPending.size, 0);
  state = 'newer'; h.due();
  const recovered = await h.load();
  assert.equal(recovered.generatedAt, new Date(h.now()).toISOString());
  assert.equal(recovered.clientRefresh, undefined);
  assert.equal(h.summaryCache.get('today').failures, 0);
  assert.equal(h.calls.length, 3);
});
