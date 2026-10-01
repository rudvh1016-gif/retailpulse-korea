import { test, expect, type Page } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import { tofuCharacters } from './font-glyphs';
import { airportSides } from '../lib/airport-sides-summary';

// The departure comparison on the Airport page (/airport, 출국). SUMMARY_FIXTURE is 2026-08-31 14:10 KST. Mocked records.
const DATE = '2026-08-31';
let seq = 0;
const flight = (terminal: string, gate: string, time: string, airportCode: string) => ({
  physicalFlightId: `O${++seq}`, flightNumber: `KE${100 + seq}`, airlineCode: '대한항공', airportCode, direction: 'departure',
  terminal, gate, checkinCounter: null, status: 'scheduled', scheduledAt: `${DATE}T${time}:00+09:00`, retrievedAt: '2026-08-31T05:00:00Z',
});
const FLIGHTS = [
  flight('T2', '274', '09:10', '도쿄/나리타'), flight('T2', '231', '14:50', '후쿠오카'), flight('T2', '270', '14:40', '상하이/푸동'),
  flight('T2', '208', '15:00', '방콕/수완나품'), flight('T1', '9', '14:15', '도쿄/나리타'), flight('T1', '29', '14:45', '타이베이'),
  flight('T1', '27', '15:10', '싱가포르'),
];

async function open(page: Page, { lang = 'ko', width = 390, suffix = '' } = {}) {
  await page.setViewportSize({ width, height: 900 });
  const summary = { ...SUMMARY_FIXTURE, airport: { ...SUMMARY_FIXTURE.airport, sides: airportSides(DATE, 'TODAY', [], FLIGHTS, [], false, false) } };
  await page.route('**/api/live/summary*', routeSummary(summary));
  const flightRequests: string[] = [];
  const historyRequests: string[] = [];
  await page.route('**/api/live/usual*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/live/airport-days*', (route) => { historyRequests.push(route.request().url()); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'airport-days', date: DATE, rowsRead: 0, withoutProfile: 0, history: [] }) }); });
  await page.route('**/api/live/flights*', (route) => {
    flightRequests.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'live-flights', basis: 'COLLECTED_FLIGHT_RECORDS', serviceDateKst: DATE, todayKst: DATE, flights: FLIGHTS, truncated: false, retrievedAt: '2026-08-31T05:00:00Z' }) });
  });
  await page.goto(`/${lang}/airport${suffix}`);
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  return { flightRequests, historyRequests };
}

test('the Airport page departures tab shows east/west, the open gate map and destination regions', async ({ page }) => {
  const { flightRequests, historyRequests } = await open(page);
  const overview = page.getByTestId('airport-departure-overview');
  await expect(overview).toBeVisible();
  await expect(overview).toHaveAttribute('data-terminals', 'T1,T2');
  for (const terminal of ['T1', 'T2']) {
    const block = overview.getByTestId(`overview-${terminal}`);
    await expect(block.getByTestId('flight-split')).toBeVisible();
    await expect(block.getByTestId('departure-map')).toBeVisible();
    await expect(block.getByTestId('map-groups')).toBeVisible();
  }
  await expect(overview.getByTestId('overview-T2').getByTestId('map-counts')).toContainText('편');
  expect(flightRequests.length, 'one flights read per date, shared by both terminals').toBe(1);
  for (const terminal of ['T1', 'T2']) {
    await overview.getByTestId(`overview-${terminal}`).getByTestId('day-radar-section').scrollIntoViewIfNeeded();
    await expect(overview.getByTestId(`overview-${terminal}`).getByTestId('radar-no-history')).toBeVisible();
  }
  expect(historyRequests.length, 'one stored-history read per date, shared by both terminals').toBe(1);
  // The intro says what the counts are not; the data blocks never call flights customers.
  for (const terminal of ['T1', 'T2']) await expect(overview.getByTestId(`overview-${terminal}`)).not.toContainText('고객');
});

test('the jump link at the top of the departures tab reaches it', async ({ page }) => {
  await open(page);
  const jump = page.getByTestId('overview-jump');
  await expect(jump).toBeVisible();
  await jump.click();
  await expect(page).toHaveURL(/#airport-departure-overview$/);
});

test('choosing one terminal shows only that terminal', async ({ page }) => {
  await open(page);
  await page.locator('.terminal-selector').getByRole('tab', { name: 'T1' }).click();
  const overview = page.getByTestId('airport-departure-overview');
  await expect(overview).toHaveAttribute('data-terminals', 'T1');
  await expect(overview.getByTestId('overview-T2')).toHaveCount(0);
});

test('other tabs do not carry it', async ({ page }) => {
  await open(page);
  await page.locator('.airport-context-nav').getByRole('button', { name: '입국' }).click();
  await expect(page.getByTestId('airport-departure-overview')).toHaveCount(0);
});

for (const [lang, width] of [['ko', 360], ['en', 360], ['zh', 360], ['ja', 360], ['ko', 1280]] as const) {
  test(`fits with no missing glyph: ${lang} at ${width}px`, async ({ page }) => {
    await open(page, { lang, width });
    const overview = page.getByTestId('airport-departure-overview');
    await expect(overview.getByTestId('overview-T2').getByTestId('departure-map')).toBeVisible();
    expect(await tofuCharacters(overview)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await overview.screenshot({ path: `test-results/airport-overview-${lang}-${width}.png` });
  });
}
