import { test, expect, type Page } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import { tofuCharacters } from './font-glyphs';
import { weekCopy } from '../lib/week-copy';
import { reviewCopy } from '../lib/review-copy';

// The fixture moved to 2026-09-28 (a Monday): China's National Day holiday
// (10/01–10/07, State Council notice) falls inside the week ahead.
const WEEK = { ...SUMMARY_FIXTURE, generatedAt: '2026-09-28T05:10:00Z', todayKst: '2026-09-28', serviceDateKst: '2026-09-28', dayRelation: 'TODAY', holidays: [] };

async function open(page: Page, payload: unknown = WEEK, path = '/ko/business', lang = 'ko') {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route('**/api/live/summary*', routeSummary(payload));
  await page.route('**/api/live/usual*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.goto(path.replace('/ko/', `/${lang}/`));
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  return page.getByTestId('business-prep');
}

test('the week ahead shows official holidays once, labels what is unknown, and hides nothing', async ({ page }) => {
  const prep = await open(page);
  const week = prep.getByTestId('week-ahead');
  // Counted per country: KASI's months are missing in this fixture, so Korea is unknown, not zero.
  await expect(week.locator('summary').first()).toHaveText('이번 주 준비 (09/28–10/04) · 한국 공휴일 미확인 · 중국 공휴일 4일 · 행사 0건');
  await week.locator('summary').first().click();
  const october = week.locator('.prep-week-days > li').nth(3);
  await expect(october).toContainText('10/01 (목)');
  await expect(october).toContainText('확정 일정 중국 공휴일 · 국경절 (国庆节) 10/01–10/07');
  await expect(week.locator('.prep-week-days > li').first()).toContainText('오늘');
  await expect(week.getByTestId('week-korean-unavailable')).toHaveText(weekCopy.koreanUnavailable.ko);
  await expect(week.getByTestId('week-no-events')).toHaveText(weekCopy.noEvents.ko);
  await expect(week).toContainText(weekCopy.population.ko);
  expect(await tofuCharacters(week)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test('a Chinese holiday date turns into a prep action with its official source', async ({ page }) => {
  const prep = await open(page, { ...WEEK, serviceDateKst: '2026-10-02', dayRelation: 'FUTURE' }, '/ko/business?date=2026-10-02');
  const holiday = prep.getByTestId('prep-actions').locator('li[data-rule="HOLIDAY"]');
  await expect(holiday).toContainText('중국 공식 연휴 기간입니다: 국경절 (国庆节).');
  await holiday.locator('summary').click();
  await expect(holiday).toContainText('国办发明电〔2025〕7号');
});

test('China\'s adjusted working day is never shown as a holiday', async ({ page }) => {
  const prep = await open(page, { ...WEEK, serviceDateKst: '2026-10-10', dayRelation: 'FUTURE' }, '/ko/business?date=2026-10-10');
  await expect(prep.locator('li[data-rule="HOLIDAY"]')).toHaveCount(0);
});

for (const lang of ['en', 'zh', 'ja'] as const) {
  test(`the week ahead reads in ${lang} without missing glyphs`, async ({ page }) => {
    const prep = await open(page, WEEK, '/ko/business', lang);
    const week = prep.getByTestId('week-ahead');
    await week.locator('summary').first().click();
    await expect(week.locator('.prep-week-days > li').nth(3)).toContainText(lang === 'zh' ? '国庆节' : lang === 'ja' ? '国庆节' : 'National Day (国庆节)');
    expect(await tofuCharacters(week)).toEqual([]);
  });
}

test('the weekly review names its categories and never calls card activity sales', async ({ page }) => {
  const prep = await open(page);
  const review = prep.getByTestId('weekly-review');
  await review.locator('summary').first().click();
  await expect(review).toContainText('화장품: 소비활동 매우 활발 · 4/4');
  await expect(review).toContainText(reviewCopy.categoriesNote.ko);
  await expect(review).toContainText(reviewCopy.quarterly.ko);
  await expect(review).toContainText('지난주 같은 요일 대비');
});

test('the removed feeling entry preserves existing device records and the weekly review', async ({ page }) => {
  const saved = [{ date: '2026-09-28', place: 'area:myeongdong', industry: 'beauty', feeling: 'BUSIER' }];
  await page.addInitScript((records) => {
    localStorage.setItem('koretail-feeling-v1', JSON.stringify(records));
  }, saved);
  const prep = await open(page);
  await expect(prep.getByTestId('feeling-log')).toHaveCount(0);
  await prep.getByTestId('weekly-review').locator('summary').first().click();
  await expect(prep.getByTestId('weekly-review')).toContainText(reviewCopy.categoriesNote.ko);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('koretail-feeling-v1') ?? '[]'))).toEqual(saved);
  await page.reload();
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.getByTestId('feeling-log')).toHaveCount(0);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('koretail-feeling-v1') ?? '[]'))).toEqual(saved);
});

test('the weekly review remains available with the removed entry and blocked storage', async ({ page }) => {
  await page.addInitScript(() => {
    const deny = () => { throw new DOMException('blocked', 'SecurityError'); };
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => ({ getItem: deny, setItem: deny, removeItem: deny, key: deny, clear: deny, length: 0 }) });
  });
  const prep = await open(page);
  await expect(prep.getByTestId('feeling-log')).toHaveCount(0);
  await prep.getByTestId('weekly-review').locator('summary').first().click();
  await expect(prep.getByTestId('weekly-review')).toContainText(reviewCopy.categoriesNote.ko);
});
