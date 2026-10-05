import {test, expect} from '@playwright/test';
import {routeSummary, SUMMARY_FIXTURE} from './summary-fixture';
import {airportAudienceCopy} from '../lib/airport-audience';
import {tofuCharacters} from './font-glyphs';

test.beforeEach(async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));
  await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
  await page.route('**/api/live/flights*', r => r.fulfill({json: {
    mode: 'live-flights', flights: [{physicalFlightId: 'audience-test', flightNumber: 'TEST123', terminal: 'T2',
      gate: '253', direction: 'departure', status: 'scheduled', airportCode: 'NRT',
      scheduledAt: `${SUMMARY_FIXTURE.todayKst}T09:00:00+09:00`, retrievedAt: SUMMARY_FIXTURE.generatedAt}],
    truncated: false, retrievedAt: SUMMARY_FIXTURE.generatedAt,
  }}));
});

const screens = [
  {lang: 'ko', width: 320}, {lang: 'ko', width: 390}, {lang: 'ko', width: 430}, {lang: 'ko', width: 1280},
  {lang: 'en', width: 390}, {lang: 'zh', width: 390}, {lang: 'ja', width: 390},
] as const;
for (const {lang, width} of screens) test(`passenger entry and staff figures ${lang} ${width}`, async ({page}) => {
  await page.setViewportSize({width, height: 900});
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`/${lang}/airport?terminal=T2`);
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  const c = airportAudienceCopy(lang), passenger = page.locator('#airport-passenger-panel');
  await expect(page.getByRole('button', {name: c.passenger, exact: true})).toHaveAttribute('aria-pressed', 'true');
  await expect(passenger.getByTestId('departure-preparation')).toHaveAttribute('open', '');
  await expect(passenger.getByTestId('passenger-basic-steps').locator(':scope > li')).toHaveCount(5);
  await expect(page.locator('#airport-staff-panel')).toBeHidden();
  await expect(page.getByTestId('airport-departure-overview')).toHaveCount(0);
  expect(await tofuCharacters(passenger)).toEqual([]);
  if (lang === 'ko' && (width === 390 || width === 1280)) {
    await page.screenshot({path: `test-results/airport-passenger-${width}.png`, fullPage: true});
  }
  await page.getByRole('button', {name: c.staff, exact: true}).click();
  const staff = page.locator('#airport-staff-panel');
  await expect(staff).toBeVisible();
  await expect(passenger).toBeHidden();
  await expect(staff.getByTestId('airport-departure-overview')).toBeVisible();
  await expect(staff.getByTestId('airport-concept-model')).toHaveAttribute('data-denominator', '1');
  await expect(staff.locator('.terminal-selector [aria-selected="true"]')).toHaveText('T2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  if (lang === 'ko' && (width === 390 || width === 1280)) {
    await page.screenshot({path: `test-results/airport-staff-${width}.png`, fullPage: true});
  }
  expect(errors).toEqual([]);
});

test('keyboard, duplicate clicks, browser Back and retained guide selections', async ({page}) => {
  await page.setViewportSize({width: 390, height: 900});
  await page.goto('/ko/airport');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  const prep = page.getByTestId('departure-preparation');
  await prep.getByTestId('prep-route').selectOption('T2');
  await prep.getByTestId('prep-taxRefund').selectOption('YES');
  const detail = prep.getByTestId('passenger-basic-steps').locator('details').first();
  await detail.locator('summary').focus();
  await page.keyboard.press('Space');
  await expect(detail).toHaveAttribute('open', '');
  await page.keyboard.press('Space');
  await expect(detail).not.toHaveAttribute('open', '');
  const staff = page.getByRole('button', {name: '직원용', exact: true});
  await staff.focus(); await page.keyboard.press('Enter');
  await expect(staff).toHaveAttribute('aria-pressed', 'true');
  const historyLength = await page.evaluate(() => history.length);
  await staff.click(); await staff.click();
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await page.goBack();
  await expect(page.getByRole('button', {name: '승객용', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await expect(prep.getByTestId('prep-route')).toHaveValue('T2');
  await expect(prep.getByTestId('prep-taxRefund')).toHaveValue('YES');
  await expect(prep.getByTestId('tax-refund-guide')).toHaveCount(1);
  await page.goForward();
  await expect(staff).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(staff).toHaveAttribute('aria-pressed', 'true');
});

test('passenger flight search and language changes preserve screen and terminal', async ({page}) => {
  await page.goto('/ko/airport?audience=passenger');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  const tools = page.getByTestId('passenger-flights');
  await tools.locator(':scope > summary').click();
  await tools.getByRole('button', {name: 'T2', exact: true}).click();
  await expect(page).toHaveURL(/terminal=T2/);
  await expect(page).toHaveURL(/audience=passenger/);
  const search = tools.locator('.flight-search-field input');
  await search.fill('TEST123');
  await expect(tools).toContainText('TEST123');
  await page.locator('.language-control select').selectOption('en');
  await expect(page).toHaveURL(/\/en\/airport/);
  await expect(page).toHaveURL(/audience=passenger/);
  await expect(tools.getByRole('button', {name: 'T2', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', {name: 'Passengers', exact: true})).toHaveAttribute('aria-pressed', 'true');
});

test('home and existing store deep links keep their original operational entry', async ({page}) => {
  await page.goto('/ko');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.locator('.airport-audience-choice')).toHaveCount(0);
  await expect(page.getByTestId('airport-departure-overview')).toBeVisible();
  await page.goto('/ko/airport?section=mystore&terminal=T2');
  await expect(page.getByRole('button', {name: '직원용', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#airport-staff-panel .airport-context-nav [aria-current="page"]')).toHaveText('매장·시설');
});
