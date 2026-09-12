import { test, expect, type Page } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import { PREFERENCE_KEY, type PersonalPreferences } from '../lib/personal-briefing';
import { pc } from '../lib/personal-copy';
import type { LiveSummary } from '../app/live-signals';

const preferences: PersonalPreferences = { version: 1, role: 'manager', location: 'myeongdong', terminal: 'T2', interests: ['weather'], day: 'today', analytics: false };
async function seed(page: Page, p: PersonalPreferences) {
  await page.addInitScript(({ key, p }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(p));
  }, { key: PREFERENCE_KEY, p });
}
async function fixture(page: Page) {
  await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));
  await page.route('**/api/live/summary*', async route => {
    const date = new URL(route.request().url()).searchParams.get('date') ?? SUMMARY_FIXTURE.todayKst;
    await route.fulfill({ json: { ...SUMMARY_FIXTURE, serviceDateKst: date, dayRelation: date === SUMMARY_FIXTURE.todayKst ? 'TODAY' : date < SUMMARY_FIXTURE.todayKst ? 'PAST' : 'FUTURE', airport: { ...SUMMARY_FIXTURE.airport, serviceDateKst: date } } });
  });
}

test('new personal home opens setup without a public area', async ({ page }) => {
  await fixture(page);
  await page.goto('/ko');
  await expect(page.getByTestId('personal-onboarding')).toBeVisible();
  await expect(page.getByRole('heading', { name: '내 브리핑', exact: true })).toBeVisible();
  await expect(page.locator('.demand-home, .area-current-brief, .airport-current-brief')).toHaveCount(0);
  await expect(page.locator('script[data-koretail-analytics]')).toHaveCount(0);
  await page.locator('.personal-existing > summary').click();
  await expect(page.locator('.demand-home')).toBeVisible();
});

test('saving Myeongdong and weather only excludes every unselected area and interest', async ({ page }) => {
  await fixture(page); await page.goto('/ko');
  const form = page.getByTestId('personal-onboarding');
  await form.locator('[data-role="manager"]').click();
  await form.getByRole('button', { name: '다음', exact: true }).click();
  await form.locator('[data-location="myeongdong"]').click();
  await form.locator('[data-location="airport"]').click();
  await form.getByRole('button', { name: '다음', exact: true }).click();
  for (const box of await form.getByRole('checkbox').all()) await box.uncheck();
  await form.getByRole('checkbox', { name: pc('weather', 'ko'), exact: true }).check();
  await form.getByRole('button', { name: '다음', exact: true }).click();
  await form.locator('[data-day="today"]').click();
  await form.locator('[data-day="tomorrow"]').click();
  await form.getByRole('button', { name: pc('finish', 'ko'), exact: true }).click();
  await expect(page.locator('[data-view-location]')).toHaveCount(1);
  await expect(page.locator('[data-view-location]')).toHaveAttribute('data-view-location', 'myeongdong');
  await expect(page.locator('[data-view-day]')).toHaveCount(1);
  await expect(page.locator('[data-view-day]')).toHaveAttribute('data-view-day', 'today');
  await expect(page.locator('.personal-place')).toContainText('명동');
  await expect(page.locator('.personal-facts [data-interest]')).toHaveCount(1);
  await expect(page.locator('.personal-facts [data-interest]')).toHaveAttribute('data-interest', 'weather');
  await expect(page.locator('.demand-home, .area-current-brief, .airport-current-brief')).toHaveCount(0);
  await expect(page.getByTestId('personal-briefing')).not.toContainText(/홍대|성수|인천공항/);
  await page.reload();
  await expect(page.locator('.personal-place')).toContainText('명동');
  await expect(page.locator('.personal-facts [data-interest]')).toHaveCount(1);
});

test('saved Hongdae and airport restrict switches, preserve T2 and prefill edits', async ({ page }) => {
  const p: PersonalPreferences = { ...preferences, location: 'hongdae', selectedLocations: ['hongdae', 'airport'], selectedDays: ['today', 'yesterday', 'tomorrow'], selectedTerminals: ['T2'], interests: ['passengers', 'crowding', 'weather'] };
  await seed(page, p); await fixture(page); await page.goto('/ko');
  await expect(page.locator('[data-view-location]')).toHaveCount(2);
  await expect(page.locator('[data-view-location="myeongdong"], [data-view-location="seongsu"]')).toHaveCount(0);
  await page.locator('[data-view-location="airport"]').click();
  await expect(page.locator('[data-view-terminal]')).toHaveCount(1);
  await expect(page.locator('.personal-place')).toContainText('T2');
  await expect(page.locator('.airport-current-brief')).not.toContainText('출발 운항');
  for (const [day, date] of [['yesterday', '2026-08-30'], ['tomorrow', '2026-09-01'], ['today', '2026-08-31']]) {
    await page.locator(`[data-view-day="${day}"]`).click();
    await expect(page.locator('.personal-place')).toContainText(date);
  }
  await page.getByRole('button', { name: '설정 변경', exact: true }).click();
  const form = page.getByTestId('personal-onboarding');
  await expect(form.locator('[data-role="manager"]')).toHaveAttribute('aria-pressed', 'true');
  await form.getByRole('button', { name: '다음', exact: true }).click();
  for (const location of ['hongdae', 'airport']) await expect(form.locator(`[data-location="${location}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(form.getByRole('button', { name: 'T2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await form.locator('[data-location="myeongdong"]').click();
  await form.locator('[data-location="hongdae"]').click();
  await form.locator('[data-location="airport"]').click();
  await form.getByRole('button', { name: '다음', exact: true }).click();
  await expect(form.getByRole('checkbox', { name: pc('weather', 'ko'), exact: true })).toBeChecked();
  await form.getByRole('button', { name: '다음', exact: true }).click();
  await form.getByRole('button', { name: pc('finish', 'ko'), exact: true }).click();
  await expect(page.locator('[data-view-location]')).toHaveCount(1);
  await expect(page.locator('.personal-place')).toContainText('명동');
  await page.reload();
  await expect(page.locator('.personal-place')).toContainText('명동');
});

test('passenger-only airport keeps reference arithmetic but hides queue and flight interests', async ({ page }) => {
  await seed(page, { ...preferences, location: 'airport', interests: ['passengers'] });
  await fixture(page); await page.goto('/ko');
  await expect(page.locator('.airport-brief-total')).toBeVisible();
  await expect(page.locator('.passenger-transfer-limitation')).toBeVisible();
  await expect(page.locator('.airport-wait-brief')).toHaveCount(0);
  await expect(page.locator('.airport-current-brief')).not.toContainText('대기 최장');
  await expect(page.locator('.airport-current-brief')).not.toContainText('출발 운항');
  await expect(page.locator('.personal-facts [data-interest]')).toHaveCount(1);
});

// Dense observations and sparse overnight forecasts reproduce the collision.
// Local test data only. Original collection/query and forecast maths are untouched.
function chartFixture() {
  const data = structuredClone(SUMMARY_FIXTURE) as unknown as LiveSummary;
  const area = data.areas.hongdae!;
  Object.assign(area.realtime!, { populationMin: 96000, populationMax: 98000 });
  const start = Date.parse('2026-08-31T09:10:00+09:00');
  Object.assign(area, {
    observedSeries: Array.from({ length: 60 }, (_, i) => ({ observedAt: new Date(start + i * 300_000).toISOString(), populationMin: 96000, populationMax: 98000 })),
    realtimeForecast: ['2026-08-31T15:00:00+09:00', '2026-08-31T16:00:00+09:00', '2026-08-31T22:00:00+09:00', '2026-09-01T00:00:00+09:00', '2026-09-01T03:00:00+09:00'].map(targetAt => ({ targetAt, issuedAt: area.realtime!.observedAt, populationMin: 60000, populationMax: 62000, congestionLevel: 2 })),
  });
  return data;
}
for (const width of [360, 390]) for (const lang of ['ko', 'en', 'zh', 'ja'] as const) {
  test(`mobile date, chart and safe-area geometry ${lang} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));
    await page.route('**/api/live/summary*', routeSummary(chartFixture()));
    await page.goto(`/${lang}/hongdae`);
    await expect(page.locator('.population-chart')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const ticks = page.locator('.flow-tick');
    await expect(ticks).toHaveCount(3);
    const rects = await ticks.evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, right: r.right }; }));
    rects.forEach((r, i) => { expect(r.x).toBeGreaterThanOrEqual(0); expect(r.right).toBeLessThanOrEqual(width); if (i) expect(r.x - rects[i - 1].right).toBeGreaterThan(8); });
    await expect(page.locator('.flow-tick-date')).toHaveCount(1);
    await expect(page.locator('.flow-tick-date')).toHaveText('9/1');
    await expect(page.locator('.flow-observed circle')).toHaveCount(1);
    const buttons = await page.locator('.date-nav-shortcuts button').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return { x: r.x, right: r.right, y: r.y, bottom: r.bottom, height: r.height, border: s.borderTopWidth }; }));
    expect(buttons).toHaveLength(3);
    buttons.forEach((r, i) => { expect(r.height).toBeGreaterThanOrEqual(44); expect(r.border).toBe('0px'); if (i) expect(r.x).toBeGreaterThanOrEqual(buttons[i - 1].right); });
    const tools = await page.locator('.date-nav-tools').boundingBox();
    expect(tools!.y).toBeGreaterThanOrEqual(buttons[0].bottom);
    const slider = page.getByRole('slider');
    await slider.press('Home');
    await expect(slider).toHaveAttribute('aria-valuetext', /96,000–98,000/);
    await slider.press('End');
    await expect(slider).toHaveAttribute('aria-valuetext', /09-01 03:00/);
    await expect(page.locator('.flow-forecast .flow-bound').first()).toHaveCSS('stroke-dasharray', '4px, 5px');
    const chart = await page.locator('.population-chart').boundingBox();
    await page.locator('.population-chart').click({ position: { x: 46, y: 100 } });
    await expect(slider).toHaveValue('0');
    expect(chart!.width).toBeLessThan(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // Inset simulation tests layout composition; it is not a physical iPhone test.
    await page.addStyleTag({ content: ':root { --safe-area-top: 59px; --safe-area-bottom: 34px; }' });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const header = await page.locator('.topbar').boundingBox(), title = await page.locator('h1').boundingBox();
    expect(header!.y).toBeGreaterThanOrEqual(59);
    expect(title!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
    const padding = await page.locator('.page-shell').evaluate(el => parseFloat(getComputedStyle(el).paddingBottom));
    expect(padding).toBeGreaterThanOrEqual(146);
    if (lang === 'ko') await page.screenshot({ path: info.outputPath(`hongdae-safe-area-${width}.png`), fullPage: true });
    await page.locator('.date-nav-shortcuts button').first().click();
    await expect(page.locator('.date-nav-picker input')).toHaveValue('2026-08-30');
    await page.locator('.date-nav-shortcuts button').last().click();
    await expect(page.locator('.date-nav-picker input')).toHaveValue('2026-09-01');
    await page.locator('.date-nav-shortcuts button').nth(1).click();
    await expect(page.locator('.date-nav-picker input')).toHaveValue('2026-08-31');
  });
}

for (const width of [390, 1440]) test(`personal home screenshots ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); await fixture(page); await page.goto('/ko');
  await expect(page.getByTestId('personal-onboarding')).toBeVisible();
  await page.screenshot({ path: info.outputPath(`setup-${width}.png`) });
  await page.evaluate(({ key, p }) => { localStorage.setItem(key, JSON.stringify(p)); }, { key: PREFERENCE_KEY, p: preferences });
  await page.reload();
  await expect(page.getByTestId('personal-briefing')).toBeVisible();
  await page.screenshot({ path: info.outputPath(`personal-${width}.png`) });
});
