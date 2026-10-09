import {expectDateSelection} from './date-selection';
import {test,expect,chromium,type Page} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
import {pc} from '../lib/personal-copy';
async function fixture(page:Page) {
  await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));
  await page.route('**/api/live/summary*',async route=>{
    const date=new URL(route.request().url()).searchParams.get('date')??SUMMARY_FIXTURE.todayKst;
    await route.fulfill({json:{...SUMMARY_FIXTURE,serviceDateKst:date,dayRelation:date===SUMMARY_FIXTURE.todayKst?'TODAY':date<SUMMARY_FIXTURE.todayKst?'PAST':'FUTURE',airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:date}}});
  });
}

test('a first visit answers with the information, not a questionnaire',async({page})=>{
    // Owner removed the public briefing entry; retain browser state/date/public-data coverage.
    await fixture(page);
    await page.goto('/ko');
    await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
    await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
    await expect(page.locator('.airport-today')).toBeVisible();
    await expect(page.locator('details.personal-existing')).toHaveCount(0);
    await expect(page.locator('.demand-home')).toHaveCount(0);
    await expect(page.locator('.top-nav a[href="/ko/myeongdong"]')).toHaveCount(1);
    await expect(page.locator('script[data-koretail-analytics]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: pc('startSetup', 'ko'), exact: true })).toHaveCount(0);
});

test('a deep link is never diverted to the home or the setup screen',async({page})=>{
  for(const path of ['/ko/myeongdong','/ko/airport','/ko/tourism-desk/myeongdong']) {
    await fixture(page);await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
  }
});

test('saved manager horizon is preserved while airport date controls remain explicit',async({page})=>{
    // Owner removed the public briefing entry; retain browser state/date/public-data coverage.
    await fixture(page);
    await page.goto('/ko');
    const stored = JSON.stringify({ version: 1, role: 'manager', location: 'airport', terminal: 'T2', selectedLocations: ['airport', 'hongdae'], selectedTerminals: ['T2', 'T1'], interests: ['passengers', 'weather'], day: 'tomorrow', selectedDays: ['tomorrow', 'today', 'yesterday'], analytics: false });
    await page.evaluate(value => localStorage.setItem('koretail-personal-v1', value), stored);
    await page.reload();
    await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
    await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
    await expect(page.locator('.airport-today')).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), 'koretail-personal-v1')).toBe(stored);
    await expectDateSelection(page, '2026-08-31');
    await page.locator('.date-nav-shortcuts button').last().click();
    await expectDateSelection(page, '2026-09-01');
    await expect(page.locator('.airport-today')).toContainText('2026-09-01');
    await expect(page.locator('.personal-preparation')).toHaveCount(0);
});

for(const lang of ['ko','en','zh','ja'] as const) for(const width of [390,768,1280,1920]) {
  test(`hidden briefing preserves settings and airport dates ${lang} ${width}`,async({page})=>{
    // Owner removed the public briefing entry; retain browser state/date/public-data coverage.
    await page.setViewportSize({ width, height: 900 });
    await fixture(page);
    await page.goto(`/${lang}`);
    const stored = JSON.stringify({ version: 1, role: 'manager', location: 'airport', terminal: 'T2', selectedLocations: ['airport', 'hongdae'], selectedTerminals: ['T2', 'T1'], interests: ['passengers', 'weather'], day: 'tomorrow', selectedDays: ['tomorrow', 'today', 'yesterday'], analytics: false });
    await page.evaluate(value => localStorage.setItem('koretail-personal-v1', value), stored);
    await page.reload();
    await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
    await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
    await expect(page.locator('.airport-today')).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), 'koretail-personal-v1')).toBe(stored);
    await expect(page.locator('script[data-koretail-analytics]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.locator('.date-nav-shortcuts button').last().click();
    await expectDateSelection(page, '2026-09-01');
    await page.reload();
    await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
    await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
    await expect(page.locator('.airport-today')).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), 'koretail-personal-v1')).toBe(stored);
});
}
test('reopening browser state preserves hidden briefing settings without feedback or reset actions',async({page,browser})=>{
    // Owner removed the public briefing entry; retain browser state/date/public-data coverage.
    await fixture(page);
    await page.goto('/ko');
    const stored = JSON.stringify({ version: 1, role: 'manager', location: 'airport', terminal: 'T2', selectedLocations: ['airport', 'hongdae'], selectedTerminals: ['T2', 'T1'], interests: ['passengers', 'weather'], day: 'tomorrow', selectedDays: ['tomorrow', 'today', 'yesterday'], analytics: false });
    await page.evaluate(value => localStorage.setItem('koretail-personal-v1', value), stored);
    const state = await page.context().storageState();
    const context = await browser.newContext({ storageState: state });
    const reopened = await context.newPage();
    await fixture(reopened);
    await reopened.goto('/ko');
    await expect(reopened.locator('.airport-today')).toBeVisible();
    expect(await reopened.evaluate(key => localStorage.getItem(key), 'koretail-personal-v1')).toBe(stored);
    await expect(reopened.getByTestId('personal-briefing')).toHaveCount(0);
    await expect(reopened.locator('.personal-feedback, .personal-onboarding')).toHaveCount(0);
    await reopened.reload();
    expect(await reopened.evaluate(key => localStorage.getItem(key), 'koretail-personal-v1')).toBe(stored);
    await context.close();
});

test('multiple locations, terminals and all three days persist and switch to the matching date',async({page})=>{
    // Owner removed the public briefing entry; retain browser state/date/public-data coverage.
    await page.setViewportSize({ width: 390, height: 900 });
    await fixture(page);
    await page.goto('/ko');
    const stored = JSON.stringify({ version: 1, role: 'manager', location: 'airport', terminal: 'T2', selectedLocations: ['airport', 'hongdae'], selectedTerminals: ['T2', 'T1'], interests: ['passengers', 'weather'], day: 'tomorrow', selectedDays: ['tomorrow', 'today', 'yesterday'], analytics: false });
    await page.evaluate(value => localStorage.setItem('koretail-personal-v1', value), stored);
    await page.reload();
    await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
    await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
    await expect(page.locator('.airport-today')).toBeVisible();
    for (const [index, date] of [[0, '2026-08-30'], [2, '2026-09-01'], [1, '2026-08-31']] as const) {
        await page.locator('.date-nav-shortcuts button').nth(index).click();
        await expectDateSelection(page, date);
        await page.getByRole('tab', { name: 'T2', exact: true }).click();
        await expect(page.locator('.airport-glance-strip')).toHaveCount(0);
        await expect(page.locator('.airport-current-brief .departure-hall-scope-note')).toContainText('제2터미널');
        expect(await page.evaluate(key => localStorage.getItem(key), 'koretail-personal-v1')).toBe(stored);
    }
    await page.goto('/ko/hongdae');
    await expect(page.locator('.area-current-brief')).toBeVisible();
    await page.reload();
    expect(await page.evaluate(key => localStorage.getItem(key), 'koretail-personal-v1')).toBe(stored);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
test('denied storage leaves airport date and terminal controls usable',async({page})=>{
    // Owner removed the public briefing entry; retain browser state/date/public-data coverage.
    await page.addInitScript(() => { Storage.prototype.setItem = function () { throw new DOMException('denied', 'SecurityError'); }; });
    await fixture(page);
    await page.goto('/ko');
    await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
    await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
    await expect(page.locator('.airport-today')).toBeVisible();
    await page.locator('.date-nav-shortcuts button').last().click();
    await expectDateSelection(page, '2026-09-01');
    await page.getByRole('tab', { name: 'T2', exact: true }).click();
    await expect(page.locator('.airport-glance-strip')).toHaveCount(0);
    await expect(page.locator('.airport-current-brief .departure-hall-scope-note')).toContainText('제2터미널');
});
test('public detail routes remain directly available without onboarding',async({page})=>{
  await fixture(page);await page.goto('/ko/airport');
  await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
  await expect(page.locator('h1')).toBeVisible();
});
test('settings survive closing and relaunching a persistent browser',async({},testInfo)=>{
    // Owner removed the public briefing entry; retain browser state/date/public-data coverage.
    const profile = testInfo.outputPath('device-profile');
    const baseURL = String(testInfo.project.use.baseURL);
    let context = await chromium.launchPersistentContext(profile, { headless: true });
    let page = await context.newPage();
    await fixture(page);
    await page.goto(baseURL + '/ko');
    const stored = JSON.stringify({ version: 1, role: 'manager', location: 'airport', terminal: 'T2', selectedLocations: ['airport', 'hongdae'], selectedTerminals: ['T2', 'T1'], interests: ['passengers', 'weather'], day: 'tomorrow', selectedDays: ['tomorrow', 'today', 'yesterday'], analytics: false });
    await page.evaluate(value => localStorage.setItem('koretail-personal-v1', value), stored);
    await context.close();
    context = await chromium.launchPersistentContext(profile, { headless: true });
    page = await context.newPage();
    await fixture(page);
    await page.goto(baseURL + '/ko');
    await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
    await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
    await expect(page.locator('.airport-today')).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), 'koretail-personal-v1')).toBe(stored);
    await context.close();
});
test('brand returns to airport-first root while Seoul navigation retains the area route',async({page})=>{
    // Owner removed the public briefing entry; retain browser state/date/public-data coverage.
    await fixture(page);
    await page.goto('/ko');
    const stored = JSON.stringify({ version: 1, role: 'manager', location: 'airport', terminal: 'T2', selectedLocations: ['airport', 'hongdae'], selectedTerminals: ['T2', 'T1'], interests: ['passengers', 'weather'], day: 'tomorrow', selectedDays: ['tomorrow', 'today', 'yesterday'], analytics: false });
    await page.evaluate(value => localStorage.setItem('koretail-personal-v1', value), stored);
    await page.reload();
    await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
    await page.locator('.top-nav a[href="/ko/airport"]').click();
    await expect(page).toHaveURL(new RegExp("/ko/airport$"));
    await page.getByRole('button', { name: 'KORETAIL home', exact: true }).click();
    await expect(page).toHaveURL(new RegExp("/ko$"));
    await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
    await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
    await expect(page.locator('.airport-today')).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), 'koretail-personal-v1')).toBe(stored);
    await page.locator('.top-nav a[href="/ko/myeongdong"]').click();
    await expect(page).toHaveURL(new RegExp("/ko/myeongdong$"));
    await expect(page.locator('.area-current-brief')).toBeVisible();
});

test('mobile back navigation returns to airport-first root with one active item',async({page})=>{
    // Owner removed the public briefing entry; retain browser state/date/public-data coverage.
    await page.setViewportSize({ width: 390, height: 844 });
    await fixture(page);
    await page.goto('/ko');
    const stored = JSON.stringify({ version: 1, role: 'manager', location: 'airport', terminal: 'T2', selectedLocations: ['airport', 'hongdae'], selectedTerminals: ['T2', 'T1'], interests: ['passengers', 'weather'], day: 'tomorrow', selectedDays: ['tomorrow', 'today', 'yesterday'], analytics: false });
    await page.evaluate(value => localStorage.setItem('koretail-personal-v1', value), stored);
    await page.reload();
    await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
    const nav = page.locator('nav.bottom-nav');
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(nav.locator('a')).toHaveCount(6);
    await expect(nav.locator('a[href="/ko/where-to"]')).toHaveCount(1);
    await expect(nav.locator('a[href="/ko/consumption"]')).toHaveCount(1);
    await nav.locator('a[href="/ko/myeongdong"]').click();
    await expect(page.locator('.area-current-brief')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
    await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
    await expect(page.locator('.airport-today')).toBeVisible();
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    expect(await page.evaluate(key => localStorage.getItem(key), 'koretail-personal-v1')).toBe(stored);
});

test('airport root and deep link share selected-day meaning and keep KST out of large values',async({page})=>{
    // Owner removed the public briefing entry; retain browser state/date/public-data coverage.
    await page.setViewportSize({ width: 390, height: 844 });
    await fixture(page);
    await page.goto('/ko');
    await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
    await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
    await expect(page.locator('.airport-today')).toBeVisible();
    await page.locator('.date-nav-shortcuts button').last().click();
    const overview = page.locator('.airport-current-brief');
    await expect(overview).toBeVisible();
    await expect(overview).toContainText('2026-09-01');
    await expect(overview).toContainText('출국장');
    await expect(page.locator('.airport-metric-value').filter({ hasText: 'KST' })).toHaveCount(0);
    await expect(page.locator('.airport-metric-value')).toContainText('47,320');
    const before = await overview.innerText();
    await page.goto('/ko/airport?date=2026-09-01');
    await expect(page.locator('.airport-current-brief')).toHaveText(before, { useInnerText: true });
});
