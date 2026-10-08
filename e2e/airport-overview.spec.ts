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

async function open(page: Page, { lang = 'ko', width = 390, suffix = '', scheduleOnly = false, flightFailure = false } = {}) {
  await page.setViewportSize({ width, height: 900 });
  // scheduleOnly: today before its first collection (no recorded flights; the held schedule stands in).
  const scheduled = FLIGHTS.map((row) => ({ physicalFlightId: row.physicalFlightId, terminal: row.terminal, gate: row.gate, scheduledTime: row.scheduledAt.slice(11, 16), status: 'scheduled' }));
  const summary = { ...SUMMARY_FIXTURE, airport: { ...SUMMARY_FIXTURE.airport, sides: scheduleOnly ? airportSides(DATE, 'TODAY', [], [], scheduled, true, false, '2026-08-30T13:00:00Z') : airportSides(DATE, 'TODAY', [], FLIGHTS, [], false, false) } };
  await page.route('**/api/live/summary*', routeSummary(summary));
  const flightRequests: string[] = [];
  const historyRequests: string[] = [];
  await page.route('**/api/live/usual*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/live/airport-days*', (route) => { historyRequests.push(route.request().url()); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'airport-days', date: DATE, rowsRead: 0, withoutProfile: 0, history: [] }) }); });
  await page.route('**/api/live/flights*', (route) => {
    flightRequests.push(route.request().url());
    if (flightFailure) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    const apiFlights = [...FLIGHTS, { ...FLIGHTS[0], physicalFlightId: 'ARRIVAL-ONLY', direction: 'arrival' }];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'live-flights', basis: scheduleOnly ? 'OFFICIAL_DEPARTURE_SCHEDULE' : 'COLLECTED_FLIGHT_RECORDS', serviceDateKst: DATE, todayKst: DATE, flights: apiFlights, truncated: false, retrievedAt: '2026-08-31T05:00:00Z' }) });
  });
  await page.goto(`/${lang}/airport${suffix}`);
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  return { flightRequests, historyRequests };
}

test('the Airport page keeps one top summary and opens detailed maps one terminal at a time', async ({ page }) => {
  const { flightRequests, historyRequests } = await open(page);
  const overview = page.getByTestId('airport-departure-overview');
  await overview.scrollIntoViewIfNeeded();
  await expect(overview).toHaveAttribute('data-terminals', 'T1');
  const t1 = overview.getByTestId('overview-T1');
  await expect(t1.getByTestId('flight-split')).toHaveCount(0);
  await expect(page.getByTestId('airport-concept-model')).toBeVisible();
  await expect(t1.getByTestId('departure-map')).not.toBeVisible();
  await t1.getByTestId('departure-map-section').locator(':scope > summary').click();
  await expect(t1.getByTestId('departure-map')).toBeVisible();
  await expect(t1.getByTestId('map-groups')).not.toBeVisible();
  await t1.getByTestId('map-destinations').locator('summary').click();
  await expect(t1.getByTestId('map-groups')).toBeVisible();
  await expect(overview.getByTestId('overview-T2')).toHaveCount(0);
  await t1.getByTestId('day-radar-section').scrollIntoViewIfNeeded();
  await expect(t1.getByTestId('radar-no-history')).toBeVisible();
  // Switching to T2 shows T2 only, reusing the same two reads.
  await overview.getByTestId('overview-switch').getByRole('button', { name: /T2$/ }).click();
  await expect(overview).toHaveAttribute('data-terminals', 'T2');
  const t2 = overview.getByTestId('overview-T2');
  await t2.getByTestId('departure-map-section').locator(':scope > summary').click();
  await expect(t2.getByTestId('departure-map')).toBeVisible();
  await expect(t2.getByTestId('map-counts')).toContainText('편');
  await expect(overview.getByTestId('overview-T1')).toHaveCount(0);
  await t2.getByTestId('day-radar-section').scrollIntoViewIfNeeded();
  await expect(t2.getByTestId('radar-no-history')).toBeVisible();
  expect(flightRequests.length, 'one flights read per date, shared by both terminals').toBe(1);
  expect(historyRequests.length, 'one stored-history read per date, shared by both terminals').toBe(1);
  // The intro says what the counts are not; the data blocks never call flights customers.
  await expect(t2).not.toContainText('고객');
});

test('today before its first collection: the held schedule fills the map, labelled as the schedule', async ({ page }) => {
  await open(page, { scheduleOnly: true });
  await page.locator('.terminal-selector').getByRole('tab', { name: 'T2', exact: true }).click();
  const overview = page.getByTestId('airport-departure-overview');
  await overview.scrollIntoViewIfNeeded();
  const block = overview.getByTestId('overview-T2');
  await block.getByTestId('departure-map-section').locator(':scope > summary').click();
  await expect(block.getByTestId('departure-map')).toBeVisible();
  await expect(block.getByTestId('map-empty')).toHaveCount(0);
  await expect(block.getByTestId('map-counts')).not.toContainText('동편 0편 · 서편 0편');
  await expect(block).toContainText('공식 출발 예정표 기준');
  await expect(block.getByTestId('flight-split')).toHaveCount(0);
  await expect(page.getByTestId('airport-concept-model')).toBeVisible();
  await expect(page.getByTestId('airport-top-reference')).toHaveAttribute('data-state', 'READY');
});

test('a failed flight read leaves no stale top reference', async ({ page }) => {
  await open(page, { lang: 'en', flightFailure: true });
  await page.getByTestId('overview-T1').getByTestId('departure-map-section').locator(':scope > summary').click();
  await expect(page.getByTestId('overview-T1').getByTestId('map-failed')).toBeVisible();
  await expect(page.getByTestId('airport-top-reference')).toHaveCount(0);
});

test('the jump link at the top of the departures tab reaches it', async ({ page }) => {
  await open(page);
  const jump = page.getByTestId('overview-jump');
  await expect(jump).toBeVisible();
  await jump.click();
  await expect(page).toHaveURL(/#airport-departure-overview$/);
  await expect(page.getByTestId('overview-T1').getByTestId('departure-map-section').locator(':scope > summary')).toBeVisible();
});

test('choosing one terminal shows only that terminal, with no switch', async ({ page }) => {
  await open(page);
  await page.locator('.terminal-selector').getByRole('tab', { name: 'T2', exact: true }).click();
  const overview = page.getByTestId('airport-departure-overview');
  await overview.scrollIntoViewIfNeeded();
  await expect(overview).toHaveAttribute('data-terminals', 'T2');
  await expect(overview.getByTestId('overview-T2')).toBeVisible();
  await expect(overview.getByTestId('overview-switch')).toHaveCount(0);
  await expect(overview.getByTestId('overview-T1')).toHaveCount(0);
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
    await overview.scrollIntoViewIfNeeded();
    await overview.getByTestId('departure-map-section').locator(':scope > summary').click();
    await expect(overview.getByTestId('overview-T1').getByTestId('departure-map')).toBeVisible();
    expect(await tofuCharacters(overview)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await overview.screenshot({ path: `test-results/airport-overview-${lang}-${width}.png` });
  });
}

test('the Blender reference follows the approved model with separate terminal denominators', async ({ page }) => {
  await open(page, { lang: 'en' });
  const slot = page.getByTestId('airport-departure-model-slot');
  const reference = slot.getByTestId('airport-top-reference');
  await expect(reference).toHaveAttribute('data-state','READY');
  await expect(reference.getByTestId('airport-reference-pillars').first()).toBeVisible();
  await expect(reference).toContainText('T1 and T2 are calculated separately');
  await expect(reference).toContainText('Not actual passenger counts by zone or passenger nationalities');
  for(const id of ['split-estimate','split-shares','flight-split'])await expect(page.getByTestId('overview-T1').getByTestId(id)).toHaveCount(0);
  await expect(slot.getByTestId('airport-concept-model')).toBeVisible();
  await expect(slot.getByTestId('map-zone-countries')).toBeVisible();
  const order = await slot.evaluate(node => Array.from(node.children).map(child => child.getAttribute('data-testid')));
  expect(order.slice(0, 3)).toEqual(['airport-concept-model', 'airport-top-reference', 'map-zone-countries']);
});
test('selected time and concourse withhold the estimate; explicit whole-day actions restore it', async ({ page }) => {
  await open(page, { lang: 'en' });
  const map = page.getByTestId('overview-T1').getByTestId('departure-map');
  const reference = page.getByTestId('airport-top-reference');
  await expect(reference).toHaveAttribute('data-state','READY');
  await page.getByTestId('overview-T1').getByTestId('departure-map-section').locator(':scope > summary').click();
  await map.locator('[data-preset="CUSTOM"]').click();
  await expect(reference).toHaveAttribute('data-state','time');
  await expect(reference.getByTestId('airport-reference-pillars')).toHaveCount(0);
  await reference.getByRole('button',{name:'View whole day'}).click();
  await expect(reference).toHaveAttribute('data-state','READY');
  await map.getByRole('button', { name: 'Concourse', exact: true }).click();
  await expect(page.getByTestId('airport-map-model-scope')).toHaveAttribute('data-terminal','CONCOURSE');
  await expect(reference).toHaveAttribute('data-state','concourse');
  await expect(reference.getByTestId('airport-reference-pillars')).toHaveCount(0);
  await reference.getByRole('button',{name:'View T1 whole day'}).click();
  await expect(page.getByTestId('airport-map-model-scope')).toHaveAttribute('data-terminal','T1');
  await expect(reference).toHaveAttribute('data-state','READY');
});

for (const width of [320, 390, 430]) {
  test(`real country evidence stays readable and keyboard reachable at ${width}px`, async ({ page }) => {
    await open(page, { lang: 'en', width });
    await expect(page.getByTestId('airport-top-reference')).toHaveAttribute('data-state','READY');
    const reference = page.getByTestId('map-zone-countries');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await reference.locator('details.prep-evidence > summary').first().focus();
    await page.keyboard.press('Enter');
    await expect(reference.locator('details.prep-evidence').first()).toHaveAttribute('open', '');
  });
}
