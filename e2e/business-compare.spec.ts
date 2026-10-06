import { test, expect, type Page } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import { compareCopy } from '../lib/compare-copy';
import { tofuCharacters } from './font-glyphs';

// SUMMARY_FIXTURE is 2026-08-31 14:10 KST; myeongdong has a "busy" band at 17:00.
const usual = (area: string, overrides: Record<string, unknown> = {}) => ({
  area, basis: 'USUAL', verdict: 'HIGHER',
  current: { observedAt: '2026-08-31T14:05:00+09:00', min: 30000, max: 32000, level: 3 },
  range: { min: 20100, max: 24000 },
  weeks: [1, 2, 3, 4].map((week) => ({ weekOffset: week, date: `2026-08-${String(31 - week * 7).padStart(2, '0')}`, status: 'VALID', observedAt: null, min: 20100, max: 24000 })),
  validDays: 4, holidayCheck: 'UNAVAILABLE', todayIsHoliday: null, generatedAt: '2026-08-31T05:10:00Z', ...overrides,
});

async function open(page: Page, usualBody: unknown, status = 200) {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
  await page.route('**/api/live/usual*', (route) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(usualBody) }));
  await page.goto('/ko/business');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  return page.getByTestId('business-prep');
}

test('a usual comparison states the verdict in range terms and shows its basis', async ({ page }) => {
  const prep = await open(page, usual('myeongdong'));
  const block = prep.getByTestId('usual-comparison');
  await expect(block.getByTestId('usual-headline')).toHaveText('평소 비교 범위보다 높은 구간입니다.');
  await block.locator('summary').click();
  await expect(block).toContainText('비교 범위 20,100~24,000명');
  await expect(block).toContainText(compareCopy.holidayUnchecked.ko);
  await expect(block).not.toContainText('%');
  expect(await tofuCharacters(block)).toEqual([]);
});

test('a new area says it is still collecting instead of borrowing another area', async ({ page }) => {
  const prep = await open(page, usual('itaewon', { basis: 'COLLECTING', verdict: null, range: null, validDays: 0, weeks: [] }));
  await page.locator('.business-view .area-tabs').getByRole('tab', { name: '이태원' }).click();
  await prep.getByTestId('usual-comparison').locator(':scope > summary').click();
  await expect(prep.getByTestId('usual-headline')).toHaveText(compareCopy.collecting.ko);
});

test('only last week available is labelled as last week', async ({ page }) => {
  const prep = await open(page, usual('myeongdong', { basis: 'LAST_WEEK', verdict: 'OVERLAPS', validDays: 1 }));
  await expect(prep.getByTestId('usual-headline')).toHaveText('지난주 같은 시간대와 겹칩니다.');
});

test('a failed comparison request is reported, not guessed', async ({ page }) => {
  const prep = await open(page, { error: 'usual_comparison_unavailable' }, 503);
  await expect(prep.getByTestId('usual-comparison').locator('summary')).toContainText(compareCopy.loadFailed.ko);
  await expect(prep.getByTestId('usual-comparison')).not.toHaveAttribute('open', '');
  await prep.getByTestId('usual-comparison').locator('summary').click();
  await expect(prep.getByTestId('usual-comparison')).toContainText(compareCopy.unavailable.ko);
  await expect(prep.getByTestId('prep-actions')).toBeVisible();
});

test('the airport is never compared with usual', async ({ page }) => {
  const prep = await open(page, usual('myeongdong'));
  await page.locator('.business-view .area-tabs').getByRole('tab', { name: '인천공항' }).click();
  await expect(prep.getByTestId('usual-comparison')).toHaveCount(0);
});

test('the first look says so, and a later look shows only real value changes', async ({ page }) => {
  const prep = await open(page, usual('myeongdong'));
  await expect(prep.getByTestId('last-check-first')).not.toBeVisible();
  await prep.getByTestId('last-check').locator('summary').click();
  await expect(prep.getByTestId('last-check-first')).toBeVisible();
  // Pretend the previous look saw 17:00 as "moderate" and no crowd action.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('koretail-last-check-v1'))).not.toBeNull();
  await page.evaluate(() => {
    const ledger = JSON.parse(localStorage.getItem('koretail-last-check-v1') ?? '[]');
    ledger[0].checkedAt = '2026-08-31T04:30:00.000Z';
    ledger[0].signature.crowd['2026-08-31T17:00:00+09:00'] = 2;
    ledger[0].signature.actions = ledger[0].signature.actions.filter((rule: string) => rule !== 'CROWD');
    localStorage.setItem('koretail-last-check-v1', JSON.stringify(ledger));
  });
  await page.reload();
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  const block = page.getByTestId('last-check');
  await expect(block.getByTestId('last-check-headline')).toHaveText('지난 확인(13:30) 이후 달라진 점');
  await expect(block.getByTestId('last-check-changes')).toContainText('새 준비할 일: 혼잡 예측 시간 전에 준비');
  await expect(block.getByTestId('last-check-changes')).toContainText('17:00 혼잡 예측 보통 → 붐빔');
  // A reload with nothing new reports no change rather than repeating the old one.
  await page.reload();
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.getByTestId('last-check-headline')).not.toBeVisible();
  await page.getByTestId('last-check').locator('summary').click();
  await expect(page.getByTestId('last-check-headline')).toContainText('달라진 공식 값은 없습니다');
});

test('blocked storage hides the last-look block without breaking the briefing', async ({ page }) => {
  await page.addInitScript(() => {
    const deny = () => { throw new DOMException('blocked', 'SecurityError'); };
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => ({ getItem: deny, setItem: deny, removeItem: deny, key: deny, clear: deny, length: 0 }) });
  });
  const prep = await open(page, usual('myeongdong'));
  await expect(prep.getByTestId('prep-actions')).toBeVisible();
  await expect(prep.getByTestId('last-check')).toHaveCount(0);
});
