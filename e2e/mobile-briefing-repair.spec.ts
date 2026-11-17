import {expectDateSelection} from './date-selection';
import {expectNavigationHref} from './navigation-context';
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

async function enterAirportDetail(page: Page) {
  await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
  await page.locator(':is(.top-nav,.bottom-nav) a[href$="/airport"]:visible').click();
  await expect(page.locator('.airport-today')).toBeVisible();
}

test('airport-glance-first home shows public information with briefing setup hidden', async ({ page }) => {
    // Owner removed the public briefing entry; retain browser state/date/public-data coverage.
    await fixture(page);
    await page.goto('/ko');
    await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
    await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
    await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
    await expect(page.locator('.demand-home')).toHaveCount(0);
    const moreLink = page.locator('.top-nav a[href^="/ko/more?"]');
    await expect(moreLink).toBeVisible();
    await expectNavigationHref(page, moreLink, '/ko/more', { place: 'airport', terminal: 'T1', area: null, date: null });
    await expect(page.locator('.footer-links a[href="/ko/myeongdong"]')).toHaveCount(0);
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
    await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), PREFERENCE_KEY)).toBe(JSON.stringify(preferences));
    await page.goto('/ko/myeongdong');
    await expect(page).toHaveURL(/\/ko$/);await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
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
    await enterAirportDetail(page);
    await page.getByRole('tab', { name: 'T2', exact: true }).click();
    await expect(page.locator('.airport-glance-strip')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'T2', exact: true })).toHaveAttribute('aria-selected', 'true');
    for (const [index, date] of [[0, '2026-08-30'], [2, '2026-09-01'], [1, '2026-08-31']] as const) {
        await page.locator('.date-nav-shortcuts button').nth(index).click();
        await expectDateSelection(page, date);
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
    await enterAirportDetail(page);
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
  test(`retired area redirect, airport date and safe-area geometry ${lang} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await fixture(page, chartFixture());
    await page.goto(`/${lang}/hongdae`);
    await expect(page).toHaveURL(new RegExp(`/${lang}$`));
    await expect(page.getByTestId('population-outlook')).toHaveCount(0);
    await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
    await page.addStyleTag({content:':root { --safe-area-top: 59px; --safe-area-bottom: 34px; }'});
    await expect(page.locator('.site-header')).toHaveCSS('padding-top','59px');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.evaluate(({ key, p }) => localStorage.setItem(key, JSON.stringify(p)), { key: PREFERENCE_KEY, p: allDayPreferences });
    await page.goto(`/${lang}`);
    await enterAirportDetail(page);
    await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
    expect(await page.evaluate(key=>localStorage.getItem(key),PREFERENCE_KEY)).toBe(JSON.stringify(allDayPreferences));
    await expect(page.locator('.date-nav-shortcuts button')).toHaveCount(3);
    const days = await page.locator('.date-nav-shortcuts button').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y }; }));
    days.forEach((r, i) => { expect(r.right).toBeLessThanOrEqual(width); expect(r.y).toBe(days[0].y); if (i) expect(r.x).toBeGreaterThanOrEqual(days[i - 1].right); });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const width of [390, 1440]) test(`airport-glance home screenshots ${width}`, async ({ page }, info) => {
    // Owner removed the public briefing entry; retain browser state/date/public-data coverage.
    await page.setViewportSize({ width, height: 900 });
    await fixture(page);
    await page.goto('/ko');
    await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
    await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
    await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`airport-first-${width}.png`) });
    await page.evaluate(({ key, p }) => localStorage.setItem(key, JSON.stringify(p)), { key: PREFERENCE_KEY, p: preferences });
    await page.reload();
    await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
    await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
    await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), PREFERENCE_KEY)).toBe(JSON.stringify(preferences));
    await page.screenshot({ path: info.outputPath(`preserved-settings-${width}.png`) });
});

for (const width of [360, 390]) test(`owner UI lock across main screens ${width}`, async ({ page }, info) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width, height: 844 });
  const saved: PersonalPreferences = { ...allDayPreferences, location: 'airport', selectedLocations: ['airport', 'hongdae'], selectedTerminals: ['T2', 'T1'], interests: ['passengers', 'crowding'] };
  await seed(page, saved); await fixture(page, chartFixture());
  for (const route of ['', '/airport', '/airport-countries', '/airport-prepare', '/more']) {
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
    if (!route) {
      // Approved glance root retains its existing compact type and flat tabs.
      await expect(page.getByTestId('airport-glance-preview')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(page.locator('.glance-preview')).toHaveCSS('font-size', '12px');
      await expect(page.locator('.glance-heading h1')).toHaveCSS('font-size', '28px');
      for (const tab of await page.locator('.glance-controls>div button').all()) {
        await expect(tab).toHaveCSS('border-top-width', '0px');
        await expect(tab).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    }
    if (route === '/airport') {
      await expect(page.locator('.airport-metric-value')).toBeVisible();
      // The airport detail page keeps its approved large daily value.
      expect(await page.locator('.airport-metric-value').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(34);
    }
    // Reference controls are inside a closed disclosure; inspect them expanded.

    // The approved terminal rail has a white outlined selection and transparent inactive choices.
    // All other controls retain their white fill, hairline, and touch-target locks.
    if (route === '/airport') await expect(page.locator('.airport-view .terminal-selector button')).toHaveCount(4);
    const controls = page.locator('.personal-switches .personal-inline button, .area-tabs button, .terminal-selector button, .airport-context-nav button, .prediction-view .segmented button');
    for (const style of await controls.evaluateAll(els => els.map(el => { const s = getComputedStyle(el); return { label:el.textContent, terminal:el.matches('.airport-view .terminal-selector button'), selected:el.getAttribute('aria-selected')==='true', top:s.borderTopWidth, left:s.borderLeftWidth, right:s.borderRightWidth, bottom:s.borderBottomWidth, background:s.backgroundColor, height:el.getBoundingClientRect().height }; }))) {
      const sideWidth=style.terminal?'1px':'0px';
      expect(style.top).toBe(sideWidth); expect(style.left).toBe(sideWidth); expect(style.right).toBe(sideWidth);
      expect(style.bottom).toBe('1px');
      expect(style.background, `${route}: ${style.label}`).toBe(style.terminal&&!style.selected?'rgba(0, 0, 0, 0)':'rgb(255, 255, 255)');
      expect(style.height, `${route}: ${style.label}`).toBeGreaterThanOrEqual(style.terminal?52:44);
    }
    for (const control of await page.locator('.date-nav-shortcuts button').all()) {
      await expect(control).toHaveCSS('border-top-width', '0px');
      // Airport pills no longer share a rectangle; other screens keep their lock.
      await expect(page.locator('.date-nav-shortcuts')).toHaveCSS('border-top-width', route === '/airport' ? '0px' : '1px');
      if (route === '/airport') {
        const expectedGap=0;
        expect(parseFloat(await page.locator('.date-nav-shortcuts').evaluate(el=>getComputedStyle(el).gap))).toBeCloseTo(expectedGap,2);
      }
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(route === '/airport' ? 56 : 48);
      if (route === '/airport') expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(56);
    }
    if (!route || route === '/airport') {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({ path: info.outputPath(`owner-${route.slice(1) || 'personal'}-${width}.png`) });
    }

  }
});
