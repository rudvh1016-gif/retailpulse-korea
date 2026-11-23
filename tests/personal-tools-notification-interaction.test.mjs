import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { DepartureAlert } from '../app/personal-tools/departure-alert.tsx';
import { emptyPersonalState } from '../lib/personal-tools/model.ts';

test('checks immediately with existing permission, refreshes changed settings and emits once for the current shift', async t => {
  const dom = new JSDOM('', { url: 'https://koretail.test/ko/account', pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  const notifications = [];
  const reads = [];
  const accountId = '11111111-2222-3333-4444-555555555555';
  const now = Date.parse('2026-11-23T10:00:00+09:00');
  let revision = 'different-device';
  let refreshed = false;
  class TestNotification {
    static permission = 'granted';
    constructor(title, options) { notifications.push({ title, ...options }); }
  }
  Object.defineProperty(window.navigator, 'locks', { value: { request: async (_key, _opts, handler) => handler() } });
  const globals = {
    window, document, navigator: window.navigator, localStorage: window.localStorage,
    Notification: TestNotification, IS_REACT_ACT_ENVIRONMENT: true,
  };
  const original = Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const clock = t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    reads.push(url);
    if (url === '/api/account/revision') {
      assert.equal(options.headers['x-koretail-account'], accountId);
      return Response.json({ revision });
    }
    assert.equal(url, '/api/airport/departure-alert?terminal=T2');
    assert.equal(options.credentials, 'omit');
    await new Promise(resolve => setTimeout(resolve, 15));
    if (options.signal.aborted) throw options.signal.reason;
    return Response.json({ mode: 'departure-alert', dayRelation: 'TODAY', airport: { congestion: [{
      terminal: 'T2', zone: 'DG1_A', observedAt: new Date(Date.now() - 60_000).toISOString(),
      retrievedAt: new Date(Date.now() - 30_000).toISOString(), waitTimeMinutes: 35, waitTimeRaw: '35',
      freshness: 'LIVE', collectionStatus: 'LIVE',
    }] } });
  });
  const state = {
    ...emptyPersonalState(), revision: 'before-refresh',
    patterns: [{ id: 'day', label: '주간 근무', terminal: 'T2', side: null, open: '07:00', close: '15:00' }],
    assignments: [{ date: '2026-11-23', patternId: 'day' }],
    notificationPreferences: { beforeShiftMinutes: 0, briefingChanges: false, guideChanges: false, departureWaitMinutes: 30 },
  };
  const onRefresh = async () => { refreshed = true; return true; };
  const render = next => act(async () => root.render(createElement(DepartureAlert, {
    state: next, accountId, paused: false, onRefresh,
  })));
  async function until(predicate) {
    for (let attempt = 0; attempt < 40; attempt++) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
      if (predicate()) return;
    }
    assert.fail('Notification check did not finish');
  }
  await render(state);
  await until(() => refreshed);
  assert.equal(notifications.length, 0, 'a newer account revision must suppress delivery');
  clock.mock.mockImplementation(() => now + 5 * 60_000);
  await render({ ...state, revision });
  await until(() => notifications.length === 1);
  assert.match(notifications[0].body, /T2 .*대기 35분/);
  clock.mock.mockImplementation(() => now + 10 * 60_000);
  await act(async () => document.dispatchEvent(new window.Event('visibilitychange')));
  await until(() => reads.filter(url => url.includes('departure-alert')).length === 3);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  assert.equal(notifications.length, 1, 'the same shift must be deduplicated');
  assert.equal(reads.filter(url => url.endsWith('/revision')).length, 2);
});
