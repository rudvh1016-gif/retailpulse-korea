import { test, expect, type Page } from '@playwright/test';
import { SUMMARY_FIXTURE } from './summary-fixture';
import { PREFERENCE_KEY, parsePreferences, type PersonalPreferences } from '../lib/personal-briefing';
import { pc } from '../lib/personal-copy';
import type { LiveSummary } from '../app/live-signals';

const preferences: PersonalPreferences = { version: 1, role: 'manager', location: 'myeongdong', terminal: 'T2', interests: ['weather'], day: 'today', analytics: false };
const allDayPreferences: PersonalPreferences = { ...preferences, selectedDays: ['today', 'yesterday', 'tomorrow'] };
// The existing storage contract requires the primary day to be first.
expect(parsePreferences(JSON.stringify(allDayPreferences))).toEqual(allDayPreferences);
async function seed(page: Page, p: PersonalPreferences) {
  expect(parsePreferences(JSON.stringify(p))).toEqual(p);
  await page.addInitScript(({ key, p }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(p));
  }, { key: PREFERENCE_KEY, p });
}
async function fixture(page: Page, payload: unknown = SUMMARY_FIXTURE) {
  const data = payload as typeof SUMMARY_FIXTURE;
  await page.clock.setFixedTime(new Date(data.generatedAt));
  await page.route('**/api/live/summary*', async route => {
    const date = new URL(route.request().url()).searchParams.get('date') ?? data.todayKst;
    await route.fulfill({ json: { ...data, serviceDateKst: date, dayRelation: date === data.todayKst ? 'TODAY' : date < data.todayKst ? 'PAST' : 'FUTURE', airport: { ...data.airport, serviceDateKst: date } } });
  });
}

test('airport-first home shows public information with briefing setup hidden', async ({ page }) => {
    // Owner removed the public briefing entry; retain browser state/date/public-data coverage.
    await fixture(page);
    await page.goto('/ko');
    await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
    await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
    await expect(page.locator('.airport-today')).toBeVisible();
    await expect(page.locator('.demand-home')).toBeVisible();
    await expect(page.locator('script[data-koretail-analytics]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: pc('startSetup', 'ko'), exact: true })).toHaveCount(0);
});

test('saved Myeongdong weather preferences survive hidden briefing entry', async ({ page }) => {
    // Owner removed the public briefing entry; retain browser state/date/public-data coverage.
    await seed(page, preferences);
    await fixture(page);
    await page.goto('/ko');
    await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
    await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
    await expect(page.locator('.airport-today')).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), PREFERENCE_KEY)).toBe(JSON.stringify(preferences));
    await page.goto('/ko/myeongdong');
    await expect(page.locator('.area-current-brief')).toBeVisible();
    await page.reload();
    expect(await page.evaluate(key => localStorage.getItem(key), PREFERENCE_KEY)).toBe(JSON.stringify(preferences));
    await expect(page.locator('script[data-koretail-analytics]')).toHaveCount(0);
});

test('saved Hongdae airport preferences survive explicit terminal and date switches', async ({ page }) => {
    // Owner removed the public briefing entry; retain browser state/date/public-data coverage.
    const p: PersonalPreferences = { ...preferences, location: 'hongdae', selectedLocations: ['hongdae', 'airport'], selectedDays: ['today', 'yesterday', 'tomorrow'], selectedTerminals: ['T2'], interests: ['passengers', 'crowding', 'weather'] };
    await seed(page, p);
    await fixture(page);
    await page.goto('/ko');
    await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
    await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
    await expect(page.locator('.airport-today')).toBeVisible();
    await page.getByRole('tab', { name: 'T2', exact: true }).click();
    await expect(page.locator('.airport-glance-strip')).toHaveAttribute('data-scope', 'T2');
    for (const [index, date] of [[0, '2026-08-30'], [2, '2026-09-01'], [1, '2026-08-31']] as const) {
        await page.locator('.date-nav-shortcuts button').nth(index).click();
        await expect(page.locator('.date-nav-picker input')).toHaveValue(date);
    }
    await page.reload();
    expect(await page.evaluate(key => localStorage.getItem(key), PREFERENCE_KEY)).toBe(JSON.stringify(p));
    await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
});

test('hidden passenger preferences remain stored without inventing missing transfer arithmetic', async ({ page }) => {
    // Owner removed the public briefing entry; retain browser state/date/public-data coverage.
    const p = { ...preferences, location: 'airport' as const, interests: ['passengers' as const] };
    await seed(page, p);
    await fixture(page);
    await page.goto('/ko');
    await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
    await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
    await expect(page.locator('.airport-today')).toBeVisible();
    await expect(page.locator('.airport-brief-total')).toBeVisible();
    await expect(page.locator('.passenger-transfer-limitation')).toBeVisible();
    await expect(page.locator('[data-basis="ARITHMETIC_ONLY"]')).toHaveCount(0);
    expect(await page.evaluate(key => localStorage.getItem(key), PREFERENCE_KEY)).toBe(JSON.stringify(p));
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
    await fixture(page, chartFixture());
    await page.goto(`/${lang}/hongdae`);
    await expect(page.locator('.population-chart')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    // Apply insets before focus/drag can trigger browser scroll anchoring.
    // This is layout emulation, not a physical iPhone test.
    await page.addStyleTag({ content: ':root { --safe-area-top: 59px; --safe-area-bottom: 34px; }' });
    await expect(page.locator('.site-header')).toHaveCSS('padding-top', '59px');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(() => page.locator('.topbar').evaluate(el => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(59);
    const header = await page.locator('.topbar').boundingBox(), title = await page.locator('h1').boundingBox();
    expect(title!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
    const padding = await page.locator('.page-shell').evaluate(el => parseFloat(getComputedStyle(el).paddingBottom));
    expect(padding).toBeGreaterThanOrEqual(146);
    const ticks = page.locator('.flow-tick');
    await expect(ticks).toHaveCount(3);
    const rects = await ticks.evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, right: r.right }; }));
    rects.forEach((r, i) => { expect(r.x).toBeGreaterThanOrEqual(0); expect(r.right).toBeLessThanOrEqual(width); if (i) expect(r.x - rects[i - 1].right).toBeGreaterThan(8); });
    await expect(page.locator('.flow-tick-date')).toHaveCount(1);
    await expect(page.locator('.flow-tick-date')).toHaveText('9/1');
    await expect(page.locator('.flow-observed circle')).toHaveCount(1);
    await expect(page.locator('.flow-observed').first()).toHaveCSS('stroke', 'rgb(17, 17, 17)');
    await expect(page.locator('.demand-number strong')).toHaveCSS('font-size', '17px');
    await expect(page.locator('.flow-now rect')).toHaveCount(0);
    const buttons = await page.locator('.date-nav-shortcuts button').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return { x: r.x, right: r.right, y: r.y, bottom: r.bottom, height: r.height, border: s.borderTopWidth }; }));
    expect(buttons).toHaveLength(3);
    buttons.forEach((r, i) => { expect(r.height).toBeGreaterThanOrEqual(48); expect(r.border).toBe('0px'); if (i) expect(r.x).toBeGreaterThanOrEqual(buttons[i - 1].right); });
    const tools = await page.locator('.date-nav-tools').boundingBox();
    expect(tools!.y).toBeGreaterThanOrEqual(buttons[0].bottom);
    const slider = page.getByRole('slider');
    await slider.press('Home');
    await expect(slider).toHaveAttribute('aria-valuetext', /96,000–98,000/);
    await slider.press('End');
    await expect(slider).toHaveAttribute('aria-valuetext', /09-01 03:00/);
    await expect(page.locator('.flow-forecast .flow-bound').first()).toHaveCSS('stroke-dasharray', '4px, 5px');
    // Each contiguous segment retains its exact range band and only one quiet edge.
    expect(await page.locator('.flow-forecast path.flow-bound').count()).toBe(2 * await page.locator('.flow-forecast path.flow-range').count());
    const chart = await page.locator('.population-chart').boundingBox();
    await page.locator('.population-chart').click({ position: { x: 46, y: 100 } });
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
    // The custom handle must sit at the same real screen x as the chart's own
    // selection line, however irregular the observed/forecast cadence is
    // (5-minute observations mixed with hourly overnight forecast rows).
    // A native <input type="range"> would put the thumb at index/(length-1)
    // instead of at the point's actual time, which is the bug this replaces.
    const thumbBox = await page.locator('.flow-slider-thumb').boundingBox();
    const selectionBox = await page.locator('.flow-selection line').boundingBox();
    expect(Math.abs((thumbBox!.x + thumbBox!.width / 2) - (selectionBox!.x + selectionBox!.width / 2))).toBeLessThanOrEqual(2);
    expect(chart!.width).toBeLessThan(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (lang === 'ko') await page.screenshot({ path: info.outputPath(`hongdae-safe-area-${width}.png`), fullPage: true });
    await page.locator('.date-nav-shortcuts button').first().click();
    await expect(page.locator('.date-nav-picker input')).toHaveValue('2026-08-30');
    await page.locator('.date-nav-shortcuts button').last().click();
    await expect(page.locator('.date-nav-picker input')).toHaveValue('2026-09-01');
    await page.locator('.date-nav-shortcuts button').nth(1).click();
    await expect(page.locator('.date-nav-picker input')).toHaveValue('2026-08-31');
    await page.evaluate(({ key, p }) => localStorage.setItem(key, JSON.stringify(p)), { key: PREFERENCE_KEY, p: allDayPreferences });
    await page.goto(`/${lang}`);
    await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
    expect(await page.evaluate(key=>localStorage.getItem(key),PREFERENCE_KEY)).toBe(JSON.stringify(allDayPreferences));
    await expect(page.locator('.date-nav-shortcuts button')).toHaveCount(3);
    const days = await page.locator('.date-nav-shortcuts button').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y }; }));
    days.forEach((r, i) => { expect(r.right).toBeLessThanOrEqual(width); expect(r.y).toBe(days[0].y); if (i) expect(r.x).toBeGreaterThanOrEqual(days[i - 1].right); });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const width of [390, 1440]) test(`airport-first home screenshots ${width}`, async ({ page }, info) => {
    // Owner removed the public briefing entry; retain browser state/date/public-data coverage.
    await page.setViewportSize({ width, height: 900 });
    await fixture(page);
    await page.goto('/ko');
    await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
    await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
    await expect(page.locator('.airport-today')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`airport-first-${width}.png`) });
    await page.evaluate(({ key, p }) => localStorage.setItem(key, JSON.stringify(p)), { key: PREFERENCE_KEY, p: preferences });
    await page.reload();
    await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
    await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
    await expect(page.locator('.airport-today')).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), PREFERENCE_KEY)).toBe(JSON.stringify(preferences));
    await page.screenshot({ path: info.outputPath(`preserved-settings-${width}.png`) });
});

for (const width of [360, 390]) test(`owner UI lock across main screens ${width}`, async ({ page }, info) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width, height: 844 });
  const saved: PersonalPreferences = { ...allDayPreferences, location: 'airport', selectedLocations: ['airport', 'hongdae'], selectedTerminals: ['T2', 'T1'], interests: ['passengers', 'crowding'] };
  await seed(page, saved); await fixture(page, chartFixture());
  for (const route of ['', '/hongdae', '/airport', '/predictions', '/forecast', '/more']) {
    await page.goto(`/ko${route}`);
    await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
    await page.addStyleTag({ content: ':root { --safe-area-top: 59px; --safe-area-bottom: 34px; } html { scroll-behavior: auto; }' });
    await expect(page.locator('.site-header')).toHaveCount(1);
    await expect(page.locator('.site-header')).toHaveCSS('padding-top', '59px');
    // Both initial paint and scrolled content must leave the status-bar region clear.
    for (const top of [0, 250]) {
      await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), top);
      await expect.poll(() => page.locator('.site-header').evaluate(el => el.getBoundingClientRect().top)).toBe(0);
      expect((await page.locator('.brand').boundingBox())!.y).toBeGreaterThanOrEqual(59);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (!route || route === '/airport') {
      await expect(page.locator('.airport-metric-value')).toBeVisible();
      // The airport page leads with the day's one big number (2026-10-02 visual
      // rules); the personal home keeps the plain 16px figure.
      // Root now renders the same approved airport view as its deep link.
      expect(await page.locator('.airport-metric-value').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(34);
    }
    const controls = page.locator('.personal-switches .personal-inline button, .area-tabs button, .terminal-selector button, .airport-context-nav button, .prediction-view .segmented button');
    for (const style of await controls.evaluateAll(els => els.map(el => { const s = getComputedStyle(el); return { top:s.borderTopWidth, left:s.borderLeftWidth, right:s.borderRightWidth, bottom:s.borderBottomWidth, background:s.backgroundColor, height:el.getBoundingClientRect().height }; }))) {
      expect(style.top).toBe('0px'); expect(style.left).toBe('0px'); expect(style.right).toBe('0px');
      expect(style.bottom).toBe('1px'); expect(style.background).toBe('rgb(255, 255, 255)'); expect(style.height).toBeGreaterThanOrEqual(44);
    }
    for (const control of await page.locator('.date-nav-shortcuts button').all()) {
      await expect(control).toHaveCSS('border-top-width', '0px');
      await expect(page.locator('.date-nav-shortcuts')).toHaveCSS('border-top-width', '1px');
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    }
    if (!route || route === '/airport' || route === '/hongdae') {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({ path: info.outputPath(`owner-${route.slice(1) || 'personal'}-${width}.png`) });
    }
    if (route === '/hongdae') {
      await page.locator('.flow-inspector').scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(`owner-chart-${width}.png`) });
    }
  }
});
