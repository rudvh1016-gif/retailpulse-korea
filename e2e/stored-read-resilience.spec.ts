import {test, expect} from '@playwright/test';
import {routeSummary, SUMMARY_FIXTURE} from './summary-fixture';
import {airportNewsCopy} from '../lib/airport-customs-news-copy';

test('stalled customs news reaches the existing error state and a manual retry recovers', async ({page}) => {
  let release!: () => void, calls = 0;
  const held = new Promise<void>(resolve => {release = resolve;});
  await page.route('**/api/airport/news', async route => {
    calls++;
    if (calls === 1) {await held; await route.abort().catch(() => {}); return;}
    await route.fulfill({json: {status: 'MISSING', today: '2026-10-06', items: []}});
  });
  try {
    await page.goto('/ko/airport-news');
    await expect(page.getByRole('status')).toHaveText(airportNewsCopy.ko.loading);
    await expect(page.getByRole('alert')).toContainText(airportNewsCopy.ko.unavailable, {timeout: 20_000});
    expect(calls).toBe(1);
    await page.getByRole('button', {name: airportNewsCopy.ko.retry, exact: true}).click();
    await expect(page.getByRole('status')).toHaveText(airportNewsCopy.ko.empty);
    expect(calls).toBe(2);
  } finally {release();}
});

test('retired Seoul archive: stalled monthly records expose the existing retry without inventing zero data', async ({page}) => {
 const langCode = 'ko';
 const retiredReads: string[] = [];
 await page.route('**/api/**',route => route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 page.on('request',request => { const url = new URL(request.url()); if (url.pathname === '/api/live/predictions' || url.searchParams.get('view') === 'records') retiredReads.push(request.url()); });
 await page.goto(`/${langCode}/forecast?area=hongdae&date=2026-08-31#prediction-score`);
 await expect(page).toHaveURL(url => url.pathname === `/${langCode}`);
 await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
 await expect(page.locator('.prediction-history, .records-chart, .area-tabs')).toHaveCount(0);
 expect(retiredReads).toEqual([]);
});

test('stalled facility directory becomes a failed read and the next filter can recover', async ({page}) => {
  let release!: () => void, calls = 0;
  const held = new Promise<void>(resolve => {release = resolve;});
  await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
  await page.route('**/api/airport/facilities*', async route => {
    calls++;
    if (calls === 1) {await held; await route.abort().catch(() => {}); return;}
    await route.fulfill({json: {mode: 'airport-facilities', facilities: [], hasMore: false}});
  });
  try {
    await page.goto('/ko/airport');
    await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
    await page.locator('.airport-context-nav button').filter({hasText: '매장·시설'}).click();
    const directory = page.locator('.airport-facilities');
    await expect(directory.getByTestId('facility-load-failed')).toBeVisible({timeout: 20_000});
    await expect(directory).not.toContainText('해당하는 공식 시설 정보가 없습니다');
    expect(calls).toBe(1);
    await directory.locator('.facility-filter-row button').filter({hasText: '약국'}).click();
    await expect(directory).toContainText('해당하는 공식 시설 정보가 없습니다');
    await expect(directory.getByTestId('facility-load-failed')).toHaveCount(0);
    expect(calls).toBe(2);
  } finally {release();}
});

test('retired Seoul entry: an invalid event cursor cannot append rows or create a repeated pagination loop', async ({page}) => {
 const langCode = 'ko';
 await page.route('**/api/**', route => route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
 await page.goto(`/${langCode}/myeongdong?date=2026-08-31`);
 await expect(page).toHaveURL(url => url.pathname === `/${langCode}` || url.pathname === `/${langCode}/`);
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
 await expect(page.locator('.area-tabs, .tourism-desk, .commercial-miniature-card, .population-outlook, .seoul-weather-panel')).toHaveCount(0);
 await expect(page.locator('a[href*="/myeongdong"], a[href*="/tourism-desk"], a[href*="/consumption"]')).toHaveCount(0);
});
