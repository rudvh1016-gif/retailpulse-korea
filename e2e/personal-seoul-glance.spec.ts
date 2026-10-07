import { test, expect, type Page } from '@playwright/test';
import { SUMMARY_FIXTURE } from './summary-fixture';
import { PREFERENCE_KEY } from '../lib/personal-briefing';

async function fixture(page: Page) {
  await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));
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

test('Seoul deep links retain every area at-a-glance explanation after briefing removal', async ({ page }) => {
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
  await page.goto('/ko/myeongdong');

  await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
  const glance = page.locator('.current-brief');
  await expect(glance).toBeVisible();
  await expect(glance.locator('.demand-metric-label')).toHaveText('최근 관측 인구');
  await expect(glance).toContainText('23,000–25,000');

  await page.goto('/ko/hongdae');
  await expect(glance).toContainText('18,000–20,000');
  await expect(glance).toContainText('서울시 공식 예측');

  await page.goto('/ko/seongsu');
  await expect(glance).toContainText('12,000–14,000');
  await expect(page.locator('h1')).toContainText('성수');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
