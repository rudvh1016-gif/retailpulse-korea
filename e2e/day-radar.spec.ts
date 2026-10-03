import { test, expect, type Page } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import { tofuCharacters } from './font-glyphs';
import { airportSides } from '../lib/airport-sides-summary';
import { dailyFlightProfile } from '../lib/airport-day-profile';
import { terminalDay } from '../lib/airport-day-compare';

// SUMMARY_FIXTURE is Monday 2026-08-31, 14:10 KST (today). Mocked records, not production data.
const DATE = '2026-08-31';
let seq = 0;
const flight = (day: string, gate: string, time: string, airportCode = '도쿄/나리타') => ({
  physicalFlightId: `D${++seq}`, flightNumber: `KE${seq}`, airlineCode: '대한항공', airportCode, direction: 'departure',
  terminal: 'T2', gate, checkinCounter: null, status: 'scheduled', scheduledAt: `${day}T${time}:00+09:00`, retrievedAt: `${day}T00:00:00Z`,
});
const many = (day: string, n: number, gate: string, hour: string, dest?: string) => Array.from({ length: n }, (_, i) => flight(day, gate, `${hour}:${String(i).padStart(2, '0')}`, dest));
const TODAY_ROWS = [...many(DATE, 20, '274', '09'), ...many(DATE, 10, '231', '14'), ...many(DATE, 6, '231', '15', '상하이/푸동')];
const shift = (days: number) => new Date(Date.UTC(2026, 7, 31) - days * 86_400_000).toISOString().slice(0, 10);
const HISTORY = [7, 14, 21, 28].map((back, index) => {
  const day = shift(back);
  const rows = [...many(day, 10 + index, '274', '09'), ...many(day, 10, '231', '14')];
  const profile = dailyFlightProfile(rows, day, true);
  return { T1: terminalDay(profile, 'T1'), T2: terminalDay(profile, 'T2') };
});
// A Tuesday shaped like today: the closest "similar day".
{
  const day = shift(6);
  const profile = dailyFlightProfile([...many(day, 20, '274', '09'), ...many(day, 10, '231', '14'), ...many(day, 6, '231', '15', '상하이/푸동')], day, true);
  HISTORY.push({ T1: terminalDay(profile, 'T1'), T2: terminalDay(profile, 'T2') });
}

async function open(page: Page, { lang = 'ko', width = 390, history = HISTORY as unknown[] | null } = {}) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript((stored) => localStorage.setItem('koretail-business-v1', stored), JSON.stringify({ version: 1, place: 'airport', terminal: 'T2', side: null, hours: null }));
  const summary = { ...SUMMARY_FIXTURE, airport: { ...SUMMARY_FIXTURE.airport, sides: airportSides(DATE, 'TODAY', [], TODAY_ROWS, [], false, false) } };
  await page.route('**/api/live/summary*', routeSummary(summary));
  await page.route('**/api/live/usual*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  const requests: string[] = [];
  await page.route('**/api/live/flights*', (route) => {
    requests.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'live-flights', basis: 'COLLECTED_FLIGHT_RECORDS', flights: TODAY_ROWS, truncated: false, retrievedAt: '2026-08-31T05:00:00Z' }) });
  });
  await page.route('**/api/live/airport-days*', (route) => {
    requests.push(route.request().url());
    return history ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mode: 'airport-days', date: DATE, rowsRead: history.length, withoutProfile: 0, history }) })
      : route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ mode: 'degraded', history: [] }) });
  });
  await page.goto(`/${lang}/business`);
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  const section = page.getByTestId('business-prep').getByTestId('day-radar-section');
  await section.scrollIntoViewIfNeeded();
  return { section, requests };
}

test('what is different today: same-weekday range, the fixed rule, and its evidence', async ({ page }) => {
  const { section, requests } = await open(page);
  const radar = section.getByTestId('day-radar');
  await expect(radar).toBeVisible();
  const items = radar.getByTestId('radar-items').locator('li');
  await expect(items.first()).toHaveAttribute('data-kind', 'WEEKDAY_TOTAL');
  await expect(items.first()).toHaveText('T2 출발편 수 36편: 평소(같은 요일 최근 4일, 20편–23편)보다 많음');
  await expect(items).toHaveCount(3);
  await expect(radar.getByTestId('radar-items')).not.toContainText('고객');
  await radar.locator('details').first().locator('summary').click();
  await expect(radar.getByTestId('radar-days')).toContainText('2026-08-24');
  // One flights read, shared with the map; one history read.
  expect(requests.filter((url) => url.includes('/api/live/flights'))).toHaveLength(1);
  expect(requests.filter((url) => url.includes('/api/live/airport-days'))).toHaveLength(1);
  await section.locator('xpath=ancestor::*[@data-testid="airport-sides"]').getByTestId('departure-map-section').locator('summary').click();
  await expect(page.getByTestId('departure-map')).toBeVisible();
  expect(requests.filter((url) => url.includes('/api/live/flights')), 'the map reuses the same flights read').toHaveLength(1);
});

test('days like today: numbers, not a similarity score, and the table opens', async ({ page }) => {
  const { section } = await open(page);
  const similar = section.getByTestId('similar-days').locator('li');
  await expect(similar.first()).toHaveAttribute('data-day', '2026-08-25');
  await expect(similar.first()).toContainText('가까운 날: 2026-08-25');
  await expect(similar.first()).toContainText('출발편 수(2026-08-31 36 · 2026-08-25 36)');
  await expect(similar.first()).toContainText('그날 기록에서 가장 많은 출발 시간대: 09–10시 20편');
  await similar.first().getByTestId('similar-open').click();
  await expect(similar.first().getByTestId('similar-table')).toBeVisible();
  await expect(similar.first().getByTestId('similar-hours')).toBeVisible();
});

test('no stored history: says so, never "about usual"', async ({ page }) => {
  const { section } = await open(page, { history: [] });
  await expect(section.getByTestId('radar-no-history')).toBeVisible();
  await expect(section.getByTestId('similar-none')).toBeVisible();
  await expect(section.getByTestId('day-radar')).not.toContainText('평소');
});

test('history that cannot be read says it could not compare', async ({ page }) => {
  const { section } = await open(page, { history: null });
  await expect(section.getByTestId('radar-failed')).toBeVisible();
});

for (const [lang, width] of [['ko', 360], ['en', 360], ['zh', 360], ['ja', 360], ['ko', 1280]] as const) {
  test(`the comparison fits and has no missing glyph: ${lang} at ${width}px`, async ({ page }) => {
    const { section } = await open(page, { lang, width });
    await expect(section.getByTestId('day-radar')).toBeVisible();
    await section.getByTestId('similar-open').first().click();
    for (const details of await section.locator('details').all()) await details.locator('summary').click();
    expect(await tofuCharacters(section)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await section.screenshot({ path: `test-results/day-radar-${lang}-${width}.png` });
  });
}
