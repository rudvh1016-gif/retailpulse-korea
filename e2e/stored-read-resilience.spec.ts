import {test, expect} from '@playwright/test';
import {routeSummary, SUMMARY_FIXTURE} from './summary-fixture';
import {recordsFixture} from './monthly-records-fixture';
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

test('stalled monthly records expose the existing retry without inventing zero data', async ({page}) => {
  let release!: () => void, calls = 0;
  const held = new Promise<void>(resolve => {release = resolve;});
  await page.clock.setFixedTime(new Date('2026-10-06T10:00:00Z'));
  await page.route('**/api/live/summary*', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('view') !== 'records') {await route.fulfill({json: SUMMARY_FIXTURE}); return;}
    calls++;
    if (calls === 1) {await held; await route.abort().catch(() => {}); return;}
    await route.fulfill({json: recordsFixture()});
  });
  try {
    await page.goto('/ko/forecast');
    const panel = page.locator('.monthly-records');
    await expect(panel.getByRole('status')).toContainText('불러오지 못했습니다', {timeout: 20_000});
    await expect(page.getByTestId('monthly-records-result')).toHaveCount(0);
    expect(calls).toBe(1);
    await page.getByRole('button', {name: '다시 불러오기', exact: true}).click();
    await expect(page.getByTestId('monthly-records-result')).toBeVisible();
    await expect(page.getByTestId('record-month-2026-10')).toContainText('27,000–29,000');
    expect(calls).toBe(2);
  } finally {release();}
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

test('an invalid event cursor cannot append rows or create a repeated pagination loop', async ({page}) => {
  await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
  let valid = false, calls = 0;
  await page.route('**/api/live/events*', async route => {
    calls++;
    await route.fulfill({json: {events: SUMMARY_FIXTURE.areas.myeongdong.events, nextOffset: valid ? null : 0}});
  });
  await page.goto('/ko/myeongdong');
  const panel = page.locator('.event-signal-panel');
  await panel.getByRole('button', {name: '수집된 행사 전체 보기', exact: true}).click();
  await expect(panel.getByRole('status')).toHaveText('행사를 불러오지 못했습니다. 다시 눌러주세요.');
  await expect(panel.locator('.event-card')).toHaveCount(3);
  expect(calls).toBe(1);
  valid = true;
  await panel.getByRole('button', {name: '행사 더 보기', exact: true}).click();
  await expect(panel.locator('.event-card')).toHaveCount(4);
  await expect(panel.getByRole('status')).toHaveCount(0);
  await expect(panel.getByRole('button', {name: '행사 더 보기', exact: true})).toHaveCount(0);
  expect(calls).toBe(2);
});
