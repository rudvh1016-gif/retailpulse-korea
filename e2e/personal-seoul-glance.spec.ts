import { test, expect, type Page } from '@playwright/test';
import { SUMMARY_FIXTURE } from './summary-fixture';
import { PREFERENCE_KEY } from '../lib/personal-briefing';

async function fixture(page: Page) {
  await page.route('**/api/live/summary*', async route => {
    const date = new URL(route.request().url()).searchParams.get('date') ?? SUMMARY_FIXTURE.todayKst;
    await route.fulfill({
      json: {
        ...SUMMARY_FIXTURE,
        serviceDateKst: date,
        dayRelation: date === SUMMARY_FIXTURE.todayKst ? 'TODAY' : date < SUMMARY_FIXTURE.todayKst ? 'PAST' : 'FUTURE',
        airport: { ...SUMMARY_FIXTURE.airport, serviceDateKst: date },
      },
    });
  });
}

test('personal briefing gives every Seoul area an at-a-glance explanation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(({ key }) => {
    localStorage.setItem(key, JSON.stringify({
      version: 1,
      role: 'manager',
      location: 'myeongdong',
      selectedLocations: ['myeongdong', 'hongdae', 'seongsu'],
      terminal: 'all',
      selectedTerminals: ['all'],
      interests: ['passengers', 'crowding', 'weather', 'events'],
      day: 'today',
      selectedDays: ['today'],
      analytics: false,
    }));
  }, { key: PREFERENCE_KEY });
  await fixture(page);
  await page.goto('/ko');

  const brief = page.getByTestId('personal-briefing');
  const glance = brief.locator('.current-brief');
  await expect(glance).toBeVisible();
  await expect(glance).toContainText('현재 추정 인구');
  await expect(glance).toContainText('23,000–25,000');

  await page.locator('[data-view-location="hongdae"]').click();
  await expect(glance).toContainText('18,000–20,000');
  await expect(glance).toContainText('서울시 공식 예측');

  await page.locator('[data-view-location="seongsu"]').click();
  await expect(glance).toContainText('12,000–14,000');
  await expect(page.locator('.personal-place')).toContainText('성수');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
