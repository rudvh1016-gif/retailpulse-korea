import { test, expect, type Page } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import { prepCopy } from '../lib/business-prep-copy';

async function prepare(page: Page, width = 390) {
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
  await page.route('**/api/live/usual*', route => route.fulfill({ status: 503, json: {} }));
  await page.route('**/api/live/airport-months*', route => route.fulfill({ json: { status: 'UNAVAILABLE', data: null } }));
  await page.route('**/api/live/flights*', route => route.fulfill({ json: { status: 'OK', flights: [], serviceDate: SUMMARY_FIXTURE.serviceDateKst, retrievedAt: SUMMARY_FIXTURE.generatedAt, truncated: false } }));
}

async function seedSeoul(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('koretail-business-v1')) localStorage.setItem('koretail-business-v1', JSON.stringify({ version: 1, place: 'area', terminal: 'T2', side: 'WEST', hours: null }));
    if (!localStorage.getItem('retailpulse-preferences')) localStorage.setItem('retailpulse-preferences', JSON.stringify({ lang: 'ko', area: 'hongdae', terminal: 'T2', industry: 'food' }));
  });
}

for (const width of [390, 1440]) test(`a new store reader starts at the airport with no invented industry at ${width}px`, async ({ page }) => {
  await prepare(page, width);
  await page.goto('/ko/business');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.getByTestId('prep-place')).toContainText('인천공항');
  await expect(page.getByTestId('prep-industry')).toHaveText('업종 선택 전');
  await expect(page.locator('.business-view .area-tabs [aria-selected=true]')).toHaveText('인천공항');
  await expect(page.getByTestId('industry-unselected')).toBeVisible();
  await expect(page.getByTestId('industry-guide').locator('img')).toHaveCount(0);
  await expect(page.getByTestId('industry-guide').locator('[aria-pressed=true]')).toHaveCount(0);
  const stored = await page.evaluate(() => ({ business: localStorage.getItem('koretail-business-v1'), general: JSON.parse(localStorage.getItem('retailpulse-preferences') ?? '{}') }));
  expect(stored.business).toBeNull();
  expect(stored.general.industry).toBeNull();
  const share = page.getByTestId('prep-share');
  await share.locator('summary').click();
  await expect(share.getByTestId('share-preview')).toContainText('업종 선택 전');
  await expect(share.getByTestId('share-preview')).not.toContainText('뷰티·화장품');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('an airport visit uses one scope throughout and leaves the saved Seoul store intact', async ({ page }) => {
  await prepare(page);
  await seedSeoul(page);
  await page.goto('/ko/business?place=airport&terminal=T2&side=EAST');
  await expect(page.getByTestId('prep-place')).toHaveText('인천공항 T2 동편');
  await expect(page.locator('.business-view .area-tabs [aria-selected=true]')).toHaveText('인천공항');
  await expect(page.getByTestId('industry-guide')).toHaveAttribute('id', 'airport-industry-guide');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('koretail-business-v1') ?? '{}').place)).toBe('area');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('retailpulse-preferences') ?? '{}').area)).toBe('hongdae');
  await page.goto('/ko/business');
  await expect(page.getByTestId('prep-place')).toHaveText('홍대');
  await expect(page.getByTestId('prep-industry')).toHaveText('식음료·카페');
  await expect(page.locator('.business-view .area-tabs [aria-selected=true]')).toHaveText('홍대');
});

test('a shared Seoul scope does not replace the saved area until the reader saves', async ({ page }) => {
  await prepare(page);
  await seedSeoul(page);
  await page.goto('/ko/business?place=area&area=seongsu');
  await expect(page.getByTestId('prep-place')).toHaveText('성수');
  await expect(page.locator('.business-view .area-tabs [aria-selected=true]')).toHaveText('성수');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('retailpulse-preferences') ?? '{}').area)).toBe('hongdae');
  await page.locator('.bottom-nav a').last().click();
  const businessLink = page.locator('.more-section-links a[href*="/business"]');
  await expect(businessLink).toHaveAttribute('href', /area=seongsu/);
  await businessLink.click();
  await expect(page.getByTestId('prep-place')).toHaveText('성수');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('retailpulse-preferences') ?? '{}').area)).toBe('hongdae');
  await page.getByTestId('business-prep').getByRole('button', { name: prepCopy.change.ko }).click();
  await page.locator('.prep-form').getByRole('button', { name: prepCopy.save.ko, exact: true }).click();
  await expect(page).not.toHaveURL(/place=/);
  await page.reload();
  await expect(page.getByTestId('prep-place')).toHaveText('성수');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('retailpulse-preferences') ?? '{}').area)).toBe('seongsu');
});

test('a terminal saved in store conditions survives More independently of the airport header', async ({ page }) => {
  await prepare(page);
  await page.goto('/ko/business?place=airport&terminal=T1');
  await expect(page.getByTestId('prep-place')).toHaveText('인천공항 T1');
  await page.getByTestId('business-prep').getByRole('button', { name: prepCopy.change.ko }).click();
  await page.locator('.prep-form').getByRole('radio', { name: 'T2', exact: true }).check();
  await page.locator('.prep-form').getByRole('button', { name: prepCopy.save.ko, exact: true }).click();
  await expect(page.getByTestId('prep-place')).toHaveText('인천공항 T2');
  await page.locator('.bottom-nav a').last().click();
  const link = page.locator('.more-section-links a[href*="/business"]');
  await expect(link).toHaveAttribute('href', /terminal=T2/);
  await link.click();
  await expect(page.getByTestId('prep-place')).toHaveText('인천공항 T2');
  await expect(page.locator('.business-view .area-tabs [aria-selected=true]')).toHaveText('인천공항');
});

for (const width of [390, 1440]) test(`changing the home terminal carries that choice through More at ${width}px`, async ({ page }) => {
  await prepare(page, width);
  await page.goto('/ko?terminal=T1');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  await page.locator('.glance-controls').getByRole('button', { name: 'T2', exact: true }).click();
  const nav = page.locator(width < 1000 ? '.bottom-nav' : '.top-nav');
  await expect(nav.locator('a').last()).toHaveAttribute('href', /terminal=T2/);
  await nav.locator('a').last().click();
  const link = page.locator('.more-section-links a[href*="/business"]');
  await expect(link).toHaveAttribute('href', /place=airport/);
  await expect(link).toHaveAttribute('href', /terminal=T2/);
  await link.click();
  await expect(page.getByTestId('prep-place')).toContainText('인천공항 T2');
});

for (const width of [390, 1440]) test(`airport to More to store carries its terminal at ${width}px`, async ({ page }) => {
  await prepare(page, width);
  await seedSeoul(page);
  await page.goto('/ko/airport?terminal=T2');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  const nav = page.locator(width < 1000 ? '.bottom-nav' : '.top-nav');
  await nav.locator('a').last().click();
  const link = page.locator('.more-section-links a[href*="/business"]');
  await expect(link).toHaveAttribute('href', /place=airport/);
  await expect(link).toHaveAttribute('href', /terminal=T2/);
  await link.click();
  await expect(page.getByTestId('prep-place')).toContainText('인천공항 T2');
  await expect(page.locator('.business-view .area-tabs [aria-selected=true]')).toHaveText('인천공항');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('koretail-business-v1') ?? '{}').place)).toBe('area');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('retailpulse-preferences') ?? '{}').area)).toBe('hongdae');
});
