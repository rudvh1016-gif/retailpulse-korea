import { test, expect } from '@playwright/test';
import { SUMMARY_FIXTURE } from './summary-fixture';
import { tofuCharacters } from './font-glyphs';

const today = '2026-09-21';
const oldDate = '2026-07-08';
const futureDate = '2026-09-24';
const labels = {
  ko: { dates: '보유 날짜', month: '조회 월', select: '저장된 날짜 선택', planned: '예정 출발편', forecast: '승객 예보', past: '지난 날짜는 기록으로만 봅니다' },
  en: { dates: 'Stored dates', month: 'Month to read', select: 'Select a stored date', planned: 'Scheduled departures', forecast: 'Passenger forecast', past: 'A past date is shown as a record only' },
  zh: { dates: '已存日期', month: '查询月份', select: '选择已存日期', planned: '计划出发航班', forecast: '旅客预测', past: '过去日期仅作为记录显示' },
  ja: { dates: '保存済みの日付', month: '照会月', select: '保存済みの日付を選択', planned: '出発予定便', forecast: '旅客予報', past: '過去の日付は記録としてのみ表示します' },
};

function responseFor(date: string, month: string) {
  const payload = structuredClone(SUMMARY_FIXTURE);
  payload.todayKst = today;
  payload.serviceDateKst = date;
  payload.generatedAt = `${today}T03:00:00Z`;
  payload.dayRelation = date < today ? 'PAST' : date > today ? 'FUTURE' : 'TODAY';
  Object.assign(payload.dateAvailability, {
    month, startDate: `${month}-01`, endDate: `${month === '2026-07' ? '2026-08' : '2026-10'}-01`,
    airportFlights: [oldDate, today].filter(d => d.startsWith(month)),
    airportPassengerForecast: [oldDate, today, '2026-09-22'].filter(d => d.startsWith(month)),
    airportDepartureSchedule: ['2026-09-22', futureDate].filter(d => d.startsWith(month)),
    seoulObserved: [],
    checkedAt: { airportFlights: `${today}T02:00:00Z`, airportPassengerForecast: `${today}T02:10:00Z`, airportDepartureSchedule: `${today}T02:20:00Z`, seoulObserved: null },
  });
  Object.assign(payload.airport, {
    serviceDateKst: date, congestion: [], arrivalCongestion: [], transferForecast: [],
    departuresTrackedToday: date === oldDate ? 17 : date === today ? 30 : null,
    departuresTrackedTodayByTerminal: {}, departuresTrackedTodayRetrievedAt: date <= today ? `${date}T05:00:00Z` : null,
    todayExpectedPassengersTotal: date === oldDate ? 700 : date === today ? 99991 : null,
    todayExpectedPassengersByTerminal: {}, passengerForecastRetrievedAt: date <= today ? `${date}T04:00:00Z` : null,
    passengerForecastRetrievedAtByTerminal: {}, passengerForecastTimeline: [], passengerForecastTimelineByTerminal: {},
    remainingExpectedPassengers: null, remainingExpectedPassengersByTerminal: {},
    peakExpectedTimeBand: null, peakExpectedTimeBandByTerminal: {},
    forecastCoverage: { all: date <= today ? 'COMPLETE' : 'UNAVAILABLE', byTerminal: {} },
    scheduledBriefing: date === futureDate ? {
      serviceDateKst: date, basis: 'OFFICIAL_DEPARTURE_SCHEDULE', capped: false,
      ranking: { all: { totalFlights: 2, airlines: [], countries: [], retrievedAt: `${today}T02:20:00Z` }, byTerminal: {} },
      scheduled: [{ terminal: 'T1', flights: 2, firstTime: '08:00', lastTime: '12:00', retrievedAt: `${today}T02:20:00Z` }],
    } : null,
  });
  return payload;
}

for (const lang of ['ko', 'en', 'zh', 'ja'] as const) for (const width of lang === 'en' ? [320, 390, 1280] : [390, 1280]) {
  test(`airport held dates ${lang} ${width}`, async ({ page }, info) => {
    const requests: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date(`${today}T03:00:00Z`));
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/live/summary*', async route => {
      const url = new URL(route.request().url());
      const date = url.searchParams.get('date') ?? today;
      const month = url.searchParams.get('month') ?? date.slice(0, 7);
      requests.push(`${date}/${month}`);
      await route.fulfill({ json: responseFor(date, month) });
    });
    await page.route('**/api/live/flights*', async route => {
      const date = new URL(route.request().url()).searchParams.get('date');
      await route.fulfill({ json: { mode: 'live-flights', serviceDateKst: date, basis: 'OFFICIAL_DEPARTURE_SCHEDULE', retrievedAt: `${today}T02:20:00Z`,
        flights: date === futureDate ? [{ flightNumber: 'KE902', airlineCode: 'KE', airportCode: 'NRT', direction: 'departure', terminal: 'T1', gate: null, checkinCounter: null, status: 'scheduled', scheduledAt: `${date}T08:00:00+09:00` }] : [],
      } });
    });
    await page.goto(`/${lang}/airport`);
    await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
    const nav = page.locator('.date-nav');
    await nav.getByText(labels[lang].dates, { exact: true }).click();
    await nav.getByLabel(labels[lang].month, { exact: true }).fill('2026-07');
    await expect.poll(() => requests.includes(`${today}/2026-07`)).toBe(true);
    const stored = nav.getByLabel(labels[lang].select, { exact: true });
    await expect(stored.locator(`option[value="${oldDate}"]`)).toContainText(labels[lang].forecast);
    await stored.selectOption(oldDate);
    await expect(nav.locator('input[type="date"]')).toHaveValue(oldDate);
    await expect(page.locator('.date-scope-note')).toContainText(labels[lang].past);
    await expect(page.locator('.airport-current-brief')).not.toContainText('99,991');
    await expect(nav.locator('input[type="date"]')).not.toHaveAttribute('min');

    await nav.getByLabel(labels[lang].month, { exact: true }).fill('2026-09');
    await expect(stored.locator(`option[value="${futureDate}"]`)).toContainText(labels[lang].planned);
    await stored.selectOption(futureDate);
    await expect(nav.locator('input[type="date"]')).toHaveValue(futureDate);
    await expect(page.locator('.date-scope-note')).toContainText(labels[lang].planned);
    await expect(page.locator('.airport-current-brief')).not.toContainText('99,991');
    await page.locator('.airport-context-nav').getByRole('button', { name: { ko: '항공편', en: 'FLIGHTS', zh: '航班', ja: 'フライト' }[lang], exact: true }).click();
    await expect(page.getByTestId('planned-flight-basis')).toContainText(futureDate);
    await expect(page.locator('.flight-rows')).toContainText('KE902');
    expect(await tofuCharacters(nav)).toEqual([]);
    expect(await tofuCharacters(page.locator('.date-scope-note'))).toEqual([]);
    expect(await tofuCharacters(page.getByTestId('planned-flight-basis'))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: info.outputPath(`held-dates-${lang}-${width}.png`) });

    await nav.locator('input[type="date"]').fill('2026-09-30');
    await expect(nav.locator('input[type="date"]')).toHaveValue('2026-09-30');
    await expect(page.locator('.date-scope-note')).not.toContainText('99,991');
    expect(errors).toEqual([]);
    // Viewing a month uses one shared summary call, never a provider call per date.
    expect(requests.filter(r => r === `${today}/2026-07`)).toHaveLength(1);
  });
}

for (const fixedDate of [false, true]) test(`KST midnight renews shortcuts and ${fixedDate ? 'keeps the fixed target' : 'rolls today'}`, async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-21T14:59:50Z') });
  let rolled = false;
  const requests: Array<string | null> = [];
  await page.route('**/api/live/summary*', async route => {
    const requested = new URL(route.request().url()).searchParams.get('date');
    requests.push(requested);
    const current = rolled ? '2026-09-22' : today;
    const date = requested ?? current;
    const payload = responseFor(date, date.slice(0, 7));
    payload.todayKst = current;
    payload.generatedAt = rolled ? '2026-09-21T15:00:01Z' : '2026-09-21T14:59:50Z';
    payload.dayRelation = date < current ? 'PAST' : date > current ? 'FUTURE' : 'TODAY';
    await route.fulfill({ json: payload });
  });
  await page.goto('/ko/airport');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  const nav = page.locator('.date-nav');
  if (fixedDate) {
    await nav.getByRole('button', { name: '내일', exact: true }).click();
    await expect(nav.locator('input[type="date"]')).toHaveValue('2026-09-22');
  }
  rolled = true;
  await page.clock.fastForward(11_000);
  await expect(nav.locator('input[type="date"]')).toHaveValue('2026-09-22');
  await expect(nav.getByRole('button', { name: '오늘', exact: true })).toHaveClass(/active/);
  await nav.getByRole('button', { name: '내일', exact: true }).click();
  await expect.poll(() => requests.includes('2026-09-23')).toBe(true);
});

test('month request failure is an error, and arrivals use their own collection time', async ({ page }) => {
  await page.clock.setFixedTime(new Date(`${today}T03:00:00Z`));
  await page.route('**/api/live/summary*', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.has('month')) return route.fulfill({ status: 503 });
    const payload = responseFor(today, '2026-09');
    Object.assign(payload.airport.arrivalForecast, { forecastCoverage: { all: 'COMPLETE', byTerminal: {} }, passengerForecastRetrievedAt: '2026-09-21T02:55:00Z' });
    await route.fulfill({ json: payload });
  });
  await page.goto('/ko/airport');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  await page.locator('.airport-context-nav').getByRole('button', { name: '입국', exact: true }).click();
  await expect(page.locator('.date-scope-note')).toContainText('11:55 KST');
  await expect(page.locator('.date-scope-note')).not.toContainText('13:00 KST');
  const nav = page.locator('.date-nav');
  await nav.getByText('보유 날짜', { exact: true }).click();
  await nav.getByLabel('조회 월', { exact: true }).fill('2026-07');
  await expect(nav.locator('[role="status"]')).toHaveAttribute('aria-busy', 'false');
  await expect(nav.locator('[role="status"]')).toContainText('불러오지 못했습니다');
});
