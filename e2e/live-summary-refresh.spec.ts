import { test, expect, type Page } from '@playwright/test';
import { SUMMARY_FIXTURE } from './summary-fixture';
import type { LiveSummary } from '../app/live-signals';

const TODAY = '2026-08-31';
const TOMORROW = '2026-09-01';

function summaryFor(date: string, total = 47320): LiveSummary {
  const data = structuredClone(SUMMARY_FIXTURE) as unknown as LiveSummary;
  data.serviceDateKst = date;
  data.dayRelation = date === TODAY ? 'TODAY' : date < TODAY ? 'PAST' : 'FUTURE';
  data.airport.serviceDateKst = date;
  data.airport.todayExpectedPassengersTotal = total;
  return data;
}

function noAirportData(date: string): LiveSummary {
  const data = summaryFor(date);
  data.areas = {};
  Object.assign(data.airport, {
    todayExpectedPassengersTotal: null, todayExpectedPassengersByTerminal: {},
    passengerForecastTimeline: [], passengerForecastTimelineByTerminal: {},
    forecastCoverage: { all: 'UNAVAILABLE', byTerminal: {} },
    departuresTrackedToday: null, departuresTrackedTodayByTerminal: {},
    congestion: [], currentBusiestDepartureHallByTerminal: {},
    scheduled: [], passengerForecast: [], transferForecast: [],
    remainingExpectedPassengers: null, remainingExpectedPassengersByTerminal: {},
    peakExpectedTimeBand: null, peakExpectedTimeBandByTerminal: {},
    passengerForecastRetrievedAt: null, passengerForecastRetrievedAtByTerminal: {},
  });
  Object.assign(data.airport.arrivalForecast, {
    todayExpectedPassengersTotal: null, passengerForecastTimeline: [],
    forecastCoverage: { all: 'UNAVAILABLE', byTerminal: {} },
  });
  return data;
}

async function openAirport(page: Page) {
  await page.goto('/ko/airport');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.locator('.airport-current-brief')).toBeVisible();
}

async function selectDay(page: Page, day: 'today' | 'tomorrow') {
  await page.locator('.date-nav-shortcuts button').nth(day === 'today' ? 1 : 2).click();
}

for (const initial of ['http-error', 'no-data'] as const) {
  test(`same tab recovers tomorrow ${initial} after the summary API recovers`, async ({ page }) => {
    await page.clock.install({ time: new Date(SUMMARY_FIXTURE.generatedAt) });
    let recovered = false;
    let tomorrowRequests = 0;
    await page.route('**/api/live/summary*', async route => {
      const date = new URL(route.request().url()).searchParams.get('date') ?? TODAY;
      if (date !== TOMORROW) return route.fulfill({ json: summaryFor(date) });
      tomorrowRequests += 1;
      if (!recovered && initial === 'http-error') return route.fulfill({ status: 503, json: { error: 'temporarily unavailable' } });
      return route.fulfill({ json: recovered ? summaryFor(date, 53123) : noAirportData(date) });
    });
    await openAirport(page);
    await selectDay(page, 'tomorrow');
    await expect.poll(() => tomorrowRequests).toBe(1);
    if (initial === 'http-error') await expect(page.locator('.airport-empty-line').first()).toContainText('불러오지 못했습니다');
    else await expect(page.locator('.airport-brief-total')).toHaveCount(0);
    recovered = true;
    // The date is left and re-entered without a reload after the bounded
    // unsuccessful-result interval. The original permanent cache fails here.
    if (initial === 'no-data') await selectDay(page, 'today');
    await page.clock.fastForward(65_000);
    if (initial === 'no-data') await selectDay(page, 'tomorrow');
    await expect(page.locator('.airport-brief-total')).toContainText('53,123');
    expect(tomorrowRequests).toBe(2);
  });
}

test('failed refresh retains same-date values and original collection and observation times', async ({ page }) => {
  await page.clock.install({ time: new Date(SUMMARY_FIXTURE.generatedAt) });
  let fail = false;
  let requests = 0;
  await page.route('**/api/live/summary*', route => {
    requests += 1;
    return fail
      ? route.fulfill({ status: 503, json: { error: 'temporarily unavailable' } })
      : route.fulfill({ json: summaryFor(TODAY) });
  });
  await openAirport(page);
  await expect(page.locator('.airport-brief-total')).toContainText('47,320');
  await expect(page.locator('.airport-current-brief')).toContainText('09:05 수집');
  await expect(page.locator('.airport-wait-brief')).toContainText('14:06');
  await expect(page.getByTestId('summary-refresh-failed')).toHaveCount(0);
  const initialRequests = requests;
  fail = true;
  await page.clock.fastForward(301_000);
  await expect.poll(() => requests).toBe(initialRequests + 1);
  await expect(page.locator('.airport-brief-total')).toContainText('47,320');
  await expect(page.locator('.airport-current-brief')).toContainText('09:05 수집');
  await expect(page.locator('.airport-wait-brief')).toContainText('14:06');
  await expect(page.getByTestId('summary-refresh-failed')).toContainText('화면 갱신 실패 · 마지막 정상 자료를 표시합니다.');
  await page.clock.fastForward(30_000);
  expect(requests).toBe(initialRequests + 1);
  fail = false;
  await page.clock.fastForward(31_000);
  await expect.poll(() => requests).toBe(initialRequests + 2);
  await expect(page.getByTestId('summary-refresh-failed')).toHaveCount(0);
});

test('visibility recheck shares one request and stays quiet while hidden or fresh', async ({ page }) => {
  await page.clock.install({ time: new Date(SUMMARY_FIXTURE.generatedAt) });
  let total = 47320;
  let requests = 0;
  await page.route('**/api/live/summary*', route => {
    requests += 1;
    return route.fulfill({ json: summaryFor(TODAY, total) });
  });
  await openAirport(page);
  const initialRequests = requests;
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  total = 58234;
  await page.clock.fastForward(600_000);
  expect(requests).toBe(initialRequests);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    for (let i = 0; i < 5; i += 1) document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('.airport-brief-total')).toContainText('58,234');
  expect(requests).toBe(initialRequests + 1);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.clock.fastForward(30_000);
  expect(requests).toBe(initialRequests + 1);
});

test('partial coverage rechecks before the normal five-minute interval', async ({ page }) => {
  await page.clock.install({ time: new Date(SUMMARY_FIXTURE.generatedAt) });
  let complete = false;
  let requests = 0;
  await page.route('**/api/live/summary*', route => {
    requests += 1;
    const data = summaryFor(TODAY, 59234);
    if (!complete) {
      data.airport.forecastCoverage.all = 'PARTIAL';
      data.airport.todayExpectedPassengersTotal = null;
    }
    return route.fulfill({ json: data });
  });
  await openAirport(page);
  await expect(page.locator('.airport-brief-total')).toHaveCount(0);
  const initialRequests = requests;
  complete = true;
  await page.clock.fastForward(61_000);
  expect(requests).toBe(initialRequests);
  await page.clock.fastForward(60_000);
  await expect(page.locator('.airport-brief-total')).toContainText('59,234');
  expect(requests).toBe(initialRequests + 1);
});

test('a late tomorrow response cannot replace the newly selected today', async ({ page }) => {
  await page.clock.install({ time: new Date(SUMMARY_FIXTURE.generatedAt) });
  let releaseTomorrow: (() => void) | undefined;
  let tomorrowRequested = false;
  let tomorrowCompleted = false;
  const waitForRelease = new Promise<void>(resolve => { releaseTomorrow = resolve; });
  await page.route('**/api/live/summary*', async route => {
    const date = new URL(route.request().url()).searchParams.get('date') ?? TODAY;
    if (date === TOMORROW) {
      tomorrowRequested = true;
      await waitForRelease;
      await route.fulfill({ json: summaryFor(date, 61234) });
      tomorrowCompleted = true;
      return;
    }
    await route.fulfill({ json: summaryFor(date, 47320) });
  });
  await openAirport(page);
  await selectDay(page, 'tomorrow');
  await expect.poll(() => tomorrowRequested).toBe(true);
  // Browser history changes the selection even while the slow day's request
  // is pending; the old completion must not repaint that selected date.
  await page.evaluate(() => {
    history.pushState(null, '', '/ko/airport?date=2026-08-31');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('.airport-brief-total')).toContainText('47,320');
  releaseTomorrow!();
  await expect.poll(() => tomorrowCompleted).toBe(true);
  await page.clock.fastForward(1_000);
  await expect(page.locator('.airport-brief-total')).toContainText('47,320');
  await expect(page.locator('.airport-current-brief')).not.toContainText('61,234');
  await selectDay(page, 'tomorrow');
  await expect(page.locator('.airport-brief-total')).toContainText('61,234');
});

test('an HTTP-success payload for the wrong date preserves the selected date last-good values', async ({ page }) => {
  await page.clock.install({ time: new Date(SUMMARY_FIXTURE.generatedAt) });
  let wrongDate = false;
  let tomorrowRequests = 0;
  await page.route('**/api/live/summary*', route => {
    const date = new URL(route.request().url()).searchParams.get('date') ?? TODAY;
    if (date === TOMORROW) tomorrowRequests += 1;
    return route.fulfill({ json: summaryFor(wrongDate ? TODAY : date, wrongDate ? 99123 : 47320) });
  });
  await openAirport(page);
  await selectDay(page, 'tomorrow');
  await expect(page.locator('.airport-brief-total')).toContainText('47,320');
  await expect.poll(() => tomorrowRequests).toBe(1);
  wrongDate = true;
  await page.clock.fastForward(301_000);
  await expect.poll(() => tomorrowRequests).toBe(2);
  await expect(page.locator('.airport-brief-total')).toContainText('47,320');
  await expect(page.locator('.airport-current-brief')).not.toContainText('99,123');
  await expect(page.locator('.airport-forecast .flow-note')).toContainText(TOMORROW);
});

test('official future schedules are partial data, not an empty-result one-minute retry', async ({ page }) => {
  await page.clock.install({ time: new Date(SUMMARY_FIXTURE.generatedAt) });
  let tomorrowRequests = 0;
  await page.route('**/api/live/summary*', route => {
    const date = new URL(route.request().url()).searchParams.get('date') ?? TODAY;
    if (date !== TOMORROW) return route.fulfill({ json: summaryFor(date) });
    tomorrowRequests += 1;
    const data = noAirportData(date);
    data.airport.scheduled = [{ terminal: 'T1', flights: 1, firstTime: '1000', lastTime: '1000' }];
    return route.fulfill({ json: data });
  });
  await openAirport(page);
  await selectDay(page, 'tomorrow');
  await expect.poll(() => tomorrowRequests).toBe(1);
  await expect(page.locator('.airport-brief-total')).toHaveCount(0);
  await page.clock.fastForward(61_000);
  expect(tomorrowRequests).toBe(1);
  await page.clock.fastForward(60_000);
  await expect.poll(() => tomorrowRequests).toBe(2);
});

test('a valid no-data response clears a prior browser refresh failure', async ({ page }) => {
  await page.clock.install({ time: new Date(SUMMARY_FIXTURE.generatedAt) });
  let state: 'normal' | 'failed' | 'empty' = 'normal';
  let requests = 0;
  await page.route('**/api/live/summary*', route => {
    requests += 1;
    if (state === 'failed') return route.fulfill({ status: 503, json: { error: 'temporarily unavailable' } });
    return route.fulfill({ json: state === 'empty' ? noAirportData(TODAY) : summaryFor(TODAY) });
  });
  await openAirport(page);
  const initialRequests = requests;
  state = 'failed';
  await page.clock.fastForward(301_000);
  await expect(page.getByTestId('summary-refresh-failed')).toContainText('화면 갱신 실패 · 마지막 정상 자료를 표시합니다.');
  await expect(page.locator('.airport-brief-total')).toContainText('47,320');
  state = 'empty';
  await page.clock.fastForward(61_000);
  await expect.poll(() => requests).toBe(initialRequests + 2);
  await expect(page.getByTestId('summary-refresh-failed')).toHaveCount(0);
  await expect(page.locator('.airport-brief-total')).toHaveCount(0);
});
