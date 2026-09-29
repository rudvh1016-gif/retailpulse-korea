import { test, expect, type Page } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import { tofuCharacters } from './font-glyphs';
import { prepCopy, statusLine } from '../lib/business-prep-copy';
import { industryProfiles } from '../lib/industry-guidance';

// SUMMARY_FIXTURE is 2026-08-31 14:10 KST. Myeongdong has an official
// "busy" band at 17:00 (issued 14:00), a 60% rain hour at 18:00 and two
// official events running that day; the airport's T1 timeline has one
// official band, 15:00–16:00, 3,500 departures.

async function open(page: Page, lang = 'ko', width = 390) {
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
  await page.goto(`/${lang}/business`);
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  const prep = page.getByTestId('business-prep');
  await expect(prep.getByTestId('prep-facts')).toBeVisible();
  return prep;
}

for (const lang of ['ko', 'en', 'zh', 'ja'] as const) {
  test(`prep briefing reads the official rows inside the day, ${lang}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const prep = await open(page, lang);
    await expect(prep.getByTestId('prep-hours')).toHaveText(prepCopy.wholeDay[lang]);
    await expect(prep.getByTestId('prep-industry')).toHaveText(industryProfiles.beauty.label[lang]);
    const actions = prep.getByTestId('prep-actions').locator('> li');
    await expect(actions).toHaveCount(3);
    await expect(actions.nth(0)).toHaveAttribute('data-rule', 'CROWD');
    await expect(actions.nth(1)).toHaveAttribute('data-rule', 'RAIN');
    await expect(actions.nth(2)).toHaveAttribute('data-rule', 'EVENT');
    // The forecast covers one hour of the day; the rest is said out loud.
    await expect(prep.locator('.prep-coverage').first()).toContainText('17:00–18:00');
    await expect(prep.getByTestId('prep-status')).toHaveCount(0);
    await expect(actions.nth(0)).toContainText('17:00–18:00');
    // Every action can be checked by hand.
    await actions.nth(0).locator('summary').click();
    await expect(actions.nth(0).locator('dl')).toContainText(prepCopy.limit[lang]);
    // The screen order a reader about to open needs: prep, then graphs, then the standing guide.
    const order = await page.evaluate(() => ['business-prep', 'area-demand-card', 'industry-guide']
      .map((id) => (document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect().top ?? -1e9) + scrollY));
    expect(order[0]).toBeGreaterThan(0);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
    expect(await tofuCharacters(prep)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await prep.scrollIntoViewIfNeeded();
    await prep.screenshot({ path: test.info().outputPath(`business-prep-${lang}.png`) });
    expect(errors).toEqual([]);
  });
}

for (const width of [360, 430, 1280]) {
  test(`prep briefing fits ${width}px without horizontal scroll`, async ({ page }) => {
    const prep = await open(page, 'ko', width);
    await prep.getByRole('button', { name: prepCopy.change.ko }).click();
    await expect(prep.locator('form.prep-form')).toBeVisible();
    for (const details of await prep.locator('details > summary').all()) await details.click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  });
}

test('saved hours narrow the briefing and survive a reload', async ({ page }) => {
  const prep = await open(page);
  await prep.getByRole('button', { name: prepCopy.change.ko }).click();
  await prep.getByLabel(prepCopy.wholeDayOption.ko).uncheck();
  await prep.getByLabel(prepCopy.open.ko).selectOption('10:00');
  await prep.getByLabel(prepCopy.closeTime.ko).selectOption('16:00');
  await prep.getByRole('button', { name: prepCopy.save.ko, exact: true }).click();
  await expect(prep.getByTestId('prep-hours')).toHaveText('10:00–16:00');
  // 17:00 and 18:00 are after closing: only the date-wide event remains, and
  // the hours themselves are reported as not judgeable, never "no change".
  const actions = prep.getByTestId('prep-actions').locator('> li');
  await expect(actions).toHaveCount(1);
  await expect(actions.first()).toHaveAttribute('data-rule', 'EVENT');
  await expect(prep.getByTestId('prep-status')).toHaveText(statusLine('INSUFFICIENT', 'ko'));
  await page.reload();
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.getByTestId('business-prep').getByTestId('prep-hours')).toHaveText('10:00–16:00');
  const stored = await page.evaluate(() => localStorage.getItem('koretail-business-v1'));
  expect(JSON.parse(stored ?? 'null')).toEqual({ version: 1, place: 'area', terminal: 'T1', side: null, hours: { open: '10:00', close: '16:00' } });
});

test('hours past midnight are labelled and a first visit saves nothing', async ({ page }) => {
  const prep = await open(page);
  expect(await page.evaluate(() => localStorage.getItem('koretail-business-v1'))).toBeNull();
  await prep.getByRole('button', { name: prepCopy.change.ko }).click();
  await prep.getByLabel(prepCopy.wholeDayOption.ko).uncheck();
  await prep.getByLabel(prepCopy.open.ko).selectOption('23:00');
  await prep.getByLabel(prepCopy.closeTime.ko).selectOption('02:00');
  await prep.getByRole('button', { name: prepCopy.save.ko, exact: true }).click();
  await expect(prep.getByTestId('prep-hours')).toHaveText(`23:00–02:00 (${prepCopy.crossesMidnight.ko})`);
});

test('an unreadable or foreign saved value falls back to the whole day', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('koretail-business-v1', '{"version":1,"place":"moon","terminal":"T9","hours":{"open":"25:00"}}'));
  const prep = await open(page);
  await expect(prep.getByTestId('prep-hours')).toHaveText(prepCopy.wholeDay.ko);
  await expect(prep.getByTestId('prep-actions').locator('> li')).toHaveCount(3);
});

test('blocked storage keeps the chosen hours for the visit and says so', async ({ page }) => {
  await page.addInitScript(() => {
    const deny = () => { throw new DOMException('blocked', 'SecurityError'); };
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => ({ getItem: deny, setItem: deny, removeItem: deny, key: deny, clear: deny, length: 0 }) });
  });
  const prep = await open(page);
  await prep.getByRole('button', { name: prepCopy.change.ko }).click();
  await prep.getByLabel(prepCopy.wholeDayOption.ko).uncheck();
  await prep.getByLabel(prepCopy.open.ko).selectOption('09:00');
  await prep.getByLabel(prepCopy.closeTime.ko).selectOption('21:00');
  await prep.getByRole('button', { name: prepCopy.save.ko, exact: true }).click();
  await expect(prep.getByTestId('prep-hours')).toHaveText('09:00–21:00');
  await expect(prep.getByText(prepCopy.storageBlocked.ko)).toBeVisible();
});

test('the airport tab briefs a terminal and keeps the area tabs and guide consistent', async ({ page }) => {
  const prep = await open(page);
  await page.locator('.business-view .area-tabs').getByRole('tab', { name: '인천공항' }).click();
  await expect(prep.getByTestId('prep-place')).toHaveText('인천공항 T1');
  const actions = prep.getByTestId('prep-actions').locator('> li');
  await expect(actions).toHaveCount(1);
  await expect(actions.first()).toHaveAttribute('data-rule', 'AIRPORT_PEAK');
  await expect(actions.first()).toContainText('15:00–16:00');
  await expect(page.getByTestId('area-demand-card')).toHaveCount(0);
  await expect(page.locator('#store-industry-guide, #airport-industry-guide')).toHaveAttribute('id', 'airport-industry-guide');
  // Terminal choice lives in the conditions.
  await prep.getByRole('button', { name: prepCopy.change.ko }).click();
  await prep.getByLabel('T2').check();
  await prep.getByRole('button', { name: prepCopy.save.ko, exact: true }).click();
  await expect(prep.getByTestId('prep-place')).toHaveText('인천공항 T2');
  await expect(prep.getByTestId('prep-actions').locator('> li').first()).toContainText('16:00–17:00');
  // Back to an area: the area graph returns and the airport choice is not left behind.
  await page.locator('.business-view .area-tabs').getByRole('tab', { name: '홍대' }).click();
  await expect(prep.getByTestId('prep-place')).toHaveText('홍대');
  await expect(page.getByTestId('area-demand-card')).toBeVisible();
});

test('the business type is one choice shared by the briefing and the guide', async ({ page }) => {
  const prep = await open(page);
  await page.getByTestId('industry-guide').getByRole('button', { name: industryProfiles.food.label.ko, exact: true }).click();
  await expect(prep.getByTestId('prep-industry')).toHaveText(industryProfiles.food.label.ko);
  await prep.getByRole('button', { name: prepCopy.change.ko }).click();
  await prep.getByLabel(prepCopy.industry.ko).selectOption('fashion');
  await expect(page.getByTestId('industry-guide').getByRole('button', { name: industryProfiles.fashion.label.ko, exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('a past date gets a plain note instead of a briefing', async ({ page }) => {
  await page.route('**/api/live/summary*', routeSummary({ ...SUMMARY_FIXTURE, serviceDateKst: '2026-08-30', dayRelation: 'PAST' }));
  await page.goto('/ko/business?date=2026-08-30');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.getByTestId('business-prep').getByTestId('prep-status')).toHaveText(statusLine('PAST', 'ko'));
});

test('a tourist personal setting leaves the business briefing intact', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('koretail-personal-v1', JSON.stringify({
    version: 1, role: 'tourist', location: 'myeongdong', terminal: 'all', interests: ['crowding'], day: 'today', analytics: false,
  })));
  const prep = await open(page);
  await expect(prep.getByTestId('prep-actions').locator('> li')).toHaveCount(3);
});
