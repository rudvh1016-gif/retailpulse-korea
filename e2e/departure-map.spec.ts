import { test, expect, type Page } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import { tofuCharacters } from './font-glyphs';
import { airportSides } from '../lib/airport-sides-summary';

// SUMMARY_FIXTURE is 2026-08-31 14:10 KST (today). Mocked records, not production data.
const DATE = '2026-08-31';
let seq = 0;
const flight = (terminal: string | null, gate: string | null, time: string, airportCode: string, extra: Record<string, unknown> = {}) => ({
  physicalFlightId: `M${++seq}`, flightNumber: `KE${100 + seq}`, airlineCode: '대한항공', airportCode, direction: 'departure',
  terminal, gate, checkinCounter: null, status: 'scheduled', scheduledAt: `${DATE}T${time}:00+09:00`, retrievedAt: '2026-08-31T05:00:00Z', ...extra,
});
const FLIGHTS = [
  flight('T2', '274', '09:10', '도쿄/나리타'), flight('T2', '274', '14:20', '오사카/ 간사이'), flight('T2', '270', '14:40', '상하이/푸동'),
  flight('T2', '231', '14:50', '후쿠오카'), flight('T2', '231', '16:30', '홍콩'), flight('T2', '208', '15:00', '방콕/수완나품'),
  flight('T2', null, '15:30', '다낭'), flight('T2', '228', '17:00', '로스앤젤레스'), flight('T2', '250', '20:00', '어딘가'),
  flight('T2', '231', '14:30', '칭다오', { status: 'cancelled' }),
  flight('T1', '9', '14:15', '도쿄/나리타'), flight('T1', '29', '14:45', '타이베이'), flight('T1', '27', '15:10', '싱가포르'),
  flight(null, '110', '14:35', '다낭'), flight(null, '7', '14:55', '마닐라'),
];
// Same codeshare pair: one physical flight.
FLIGHTS.push({ ...FLIGHTS[0], flightNumber: 'DL9', physicalFlightId: FLIGHTS[0].physicalFlightId });

async function open(page: Page, { lang = 'ko', width = 390, terminal = 'T2' }: { lang?: string; width?: number; terminal?: string } = {}) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript((stored) => localStorage.setItem('koretail-business-v1', stored), JSON.stringify({ version: 1, place: 'airport', terminal, side: null, hours: null }));
  const summary = { ...SUMMARY_FIXTURE, airport: { ...SUMMARY_FIXTURE.airport, sides: airportSides(DATE, 'TODAY', [], FLIGHTS, [], false, false) } };
  await page.route('**/api/live/summary*', routeSummary(summary));
  await page.route('**/api/live/usual*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  const flightRequests: string[] = [];
  await page.route('**/api/live/flights*', (route) => {
    flightRequests.push(route.request().url());
    const date = new URL(route.request().url()).searchParams.get('date');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      mode: 'live-flights', basis: date === DATE ? 'COLLECTED_FLIGHT_RECORDS' : 'OFFICIAL_DEPARTURE_SCHEDULE', serviceDateKst: date, todayKst: DATE,
      flights: date === DATE ? FLIGHTS : [], truncated: false, retrievedAt: '2026-08-31T05:00:00Z',
    }) });
  });
  await page.goto(`/${lang}/business`);
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  const sides = page.getByTestId('business-prep').getByTestId('airport-sides');
  await expect(sides).toBeVisible();
  return { sides, flightRequests };
}

async function openMap(page: Page, options: Parameters<typeof open>[1] = {}) {
  const opened = await open(page, options);
  expect(opened.flightRequests, 'nothing is fetched for the map until it is opened').toEqual([]);
  await opened.sides.getByTestId('departure-map-section').locator('summary').click();
  const map = opened.sides.getByTestId('departure-map');
  await expect(map).toBeVisible();
  await expect(map.getByTestId('map-groups')).not.toBeVisible();
  await map.getByTestId('map-destinations').locator('summary').click();
  await expect(map.getByTestId('map-T2')).toHaveCount(0);
  await map.getByTestId('map-official-coordinates').locator('summary').click();
  return { ...opened, map };
}

test('the whole day agrees with the comparison card, flight for flight', async ({ page }) => {
  const { sides, map, flightRequests } = await openMap(page);
  await expect(map.getByTestId('map-counts')).toHaveText('동편 3편 · 서편 2편 · 중앙 0편 · 위치 미확인 4편 · 건물 미확인 1편');
  await expect(sides.getByTestId('split-flights')).toContainText('동편 3편 60% · 서편 2편 40% · 중앙 0편 · 위치 미확인 4편');
  await expect(map.getByTestId('map-lead')).toHaveText('확인된 항공편 기준 동편이 1편 더 많음 (위치 미확인 4편에 따라 달라질 수 있음)');
  expect(flightRequests).toHaveLength(1);
  // Dots add up to the flights that have an official gate position; the rest are listed apart.
  const drawn = await map.locator('[data-flights]').evaluateAll((nodes) => nodes.reduce((sum, node) => sum + Number(node.getAttribute('data-flights')), 0));
  await map.getByTestId('map-unplaced').locator('summary').click();
  await expect(map.getByTestId('map-unplaced-list').locator('li')).toHaveCount(2);
  expect(drawn).toBe(9 - 2);
  await expect(map.getByTestId('map-unplaced-list')).toContainText('탑승구 미배정');
  await expect(map.getByTestId('map-unplaced-list')).toContainText('탑승구 228');
});

test('the time selection moves the counts, the dots and the list together', async ({ page }) => {
  const { map } = await openMap(page);
  await map.getByRole('button', { name: '지금부터 1시간' }).click();
  await expect(map).toHaveAttribute('data-window', '850-910');
  await expect(map.getByTestId('map-counts')).toHaveText('동편 2편 · 서편 1편 · 중앙 0편 · 위치 미확인 1편 · 건물 미확인 1편');
  await map.getByTestId('map-flights').locator('summary').click();
  await expect(map.getByTestId('map-flight-list').locator('li')).toHaveCount(4);
  const drawn = await map.locator('[data-flights]').evaluateAll((nodes) => nodes.reduce((sum, node) => sum + Number(node.getAttribute('data-flights')), 0));
  expect(drawn).toBe(4);
  await map.getByRole('button', { name: '직접 선택' }).click();
  await map.getByTestId('map-from').selectOption('16');
  await map.getByTestId('map-to').selectOption('18');
  await expect(map).toHaveAttribute('data-window', '960-1080');
  await expect(map.getByTestId('map-counts')).toHaveText('동편 0편 · 서편 1편 · 중앙 0편 · 위치 미확인 1편');
});

test('a destination region filters the map and the list; shares keep their own base', async ({ page }) => {
  const { map } = await openMap(page);
  const groups = map.getByTestId('map-groups');
  await expect(groups.locator('tr[data-group="JP"]')).toContainText('3편 · 33.3%');
  await expect(groups.locator('tr[data-group="UNKNOWN"]')).toContainText('1편');
  await expect(map.getByTestId('map-groups-basis')).toContainText('출발편 9편 기준(목적지 지역 미확인 1편 포함)');
  await groups.getByRole('button', { name: '일본' }).click();
  await expect(map).toHaveAttribute('data-filter', 'JP');
  await map.getByTestId('map-flights').locator('summary').click();
  await expect(map.getByTestId('map-flight-list').locator('li')).toHaveCount(3);
  await expect(map.getByTestId('map-flight-list').locator('li[data-group]:not([data-group="JP"])')).toHaveCount(0);
  // The side counts stay the whole selection; the filter is named, not hidden.
  await expect(map.getByTestId('map-counts')).toContainText('동편 3편');
  await map.getByTestId('map-clear-filter').click();
  await expect(map).toHaveAttribute('data-filter', 'ALL');
});

test('a gate opens its flights, by keyboard as well as by pointer', async ({ page }) => {
  const { map } = await openMap(page);
  await map.locator('[data-gate="231"]').click();
  await expect(map.getByTestId('map-gate-list').locator('li')).toHaveCount(2);
  await expect(map.getByTestId('map-gate-list')).toContainText('후쿠오카');
  const gate = map.locator('[data-gate="274"]');
  await expect(gate).toHaveAttribute('data-flights', '2');
  await gate.focus();
  await page.keyboard.press('Enter');
  await expect(map.getByTestId('map-gate-list')).toContainText('도쿄/나리타');
  await expect(map.getByTestId('map-gate-list')).toContainText('예정');
  await page.keyboard.press('Enter');
  await expect(map.getByTestId('map-gate-flights')).toHaveCount(0);
  // A gate with no flight in the window is not a control.
  await expect(map.locator('[data-flights="0"]').first()).toHaveAttribute('tabindex', '-1');
});

test('T1 shows the concourse as its own building and counts it apart', async ({ page }) => {
  const { map } = await openMap(page, { terminal: 'T1' });
  await expect(map.getByTestId('map-T1')).toBeVisible();
  await expect(map.getByTestId('map-CONCOURSE')).toBeVisible();
  await expect(map.getByTestId('map-counts')).toHaveText('동편 1편 · 서편 1편 · 중앙 1편 · 위치 미확인 0편 · 탑승동 1편 · 건물 미확인 1편');
});

test('the copied text carries the date, window, filter and limits', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const { map } = await openMap(page);
  await map.getByRole('button', { name: '3시간', exact: true }).click();
  await map.getByTestId('map-groups').getByRole('button', { name: '일본' }).click();
  await map.getByTestId('map-copy').click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('2026-08-31 T2 · 14:10–17:10');
  expect(text).toContain('목적지 필터: 일본');
  expect(text).toContain('확인된 항공편 기준');
  expect(text).toContain('항공편 수이며 사람 수나 매장 방문객이 아닙니다.');
});

for (const [lang, width] of [['ko', 360], ['en', 360], ['zh', 360], ['ja', 360], ['ko', 1280]] as const) {
  test(`the map fits and has no missing glyph: ${lang} at ${width}px`, async ({ page }) => {
    const { map } = await openMap(page, { lang, width });
    await map.getByTestId('map-flights').locator('summary').click();
    expect(await tofuCharacters(map)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await map.screenshot({ path: `test-results/departure-map-${lang}-${width}.png` });
  });
}

test('a failed flight read says so instead of showing an empty airport', async ({ page }) => {
  const { sides } = await open(page);
  await page.unroute('**/api/live/flights*');
  await page.route('**/api/live/flights*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'degraded', flights: [] }) }));
  await sides.getByTestId('departure-map-section').locator('summary').click();
  await expect(sides.getByTestId('map-failed')).toBeVisible();
  await expect(sides.getByTestId('map-counts')).toHaveCount(0);
});
