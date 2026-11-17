import { test, expect, type Page } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import { compareCopy } from '../lib/compare-copy';
import { tofuCharacters } from './font-glyphs';

// Historical Seoul responses must no longer affect the retained airport briefing.
const usual = (area: string, overrides: Record<string, unknown> = {}) => ({
  area, basis: 'USUAL', verdict: 'HIGHER',
  current: { observedAt: '2026-08-31T14:05:00+09:00', min: 30000, max: 32000, level: 3 },
  range: { min: 20100, max: 24000 },
  weeks: [1, 2, 3, 4].map((week) => ({ weekOffset: week, date: `2026-08-${String(31 - week * 7).padStart(2, '0')}`, status: 'VALID', observedAt: null, min: 20100, max: 24000 })),
  validDays: 4, holidayCheck: 'UNAVAILABLE', todayIsHoliday: null, generatedAt: '2026-08-31T05:10:00Z', ...overrides,
});

const usualReads=new WeakMap<Page,{count:number}>();
async function open(page: Page, usualBody: unknown, status = 200) {
  const reads={count:0};usualReads.set(page,reads);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
  await page.route('**/api/live/usual*', (route) => {reads.count++;return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(usualBody) });});
  await page.goto('/ko/business?place=area&area=myeongdong');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  return page.getByTestId('business-prep');
}

test('a usual comparison states the verdict in range terms and shows its basis', async ({ page }) => {
  const prep = await open(page, usual('myeongdong'));
  await expect(prep).toHaveAttribute('data-place','airport');
  await expect(prep.getByTestId('usual-comparison')).toHaveCount(0);
  expect(usualReads.get(page)?.count).toBe(0);
  expect(await tofuCharacters(prep)).toEqual([]);
});

test('a retired area link keeps only the airport tab without borrowing a Seoul comparison', async ({ page }) => {
  const prep = await open(page, usual('itaewon', { basis: 'COLLECTING', verdict: null, range: null, validDays: 0, weeks: [] }));
  await expect(prep).toHaveAttribute('data-place','airport');
  const tabs = page.locator('.business-view .area-tabs').getByRole('tab');
  await expect(tabs).toHaveCount(1);
  await expect(tabs).toHaveText('인천공항');
  await expect(tabs).toHaveAttribute('aria-selected', 'true');
  await expect(prep.getByTestId('usual-comparison')).toHaveCount(0);
  expect(usualReads.get(page)?.count).toBe(0);
});

test('only last week available is labelled as last week', async ({ page }) => {
  const prep = await open(page, usual('myeongdong', { basis: 'LAST_WEEK', verdict: 'OVERLAPS', validDays: 1, current: {observedAt:'2026-08-31T14:05:00+09:00',min:23000,max:25000,level:3},weeks:[{weekOffset:1,date:'2026-08-24',status:'VALID',observedAt:'2026-08-24T14:00:00+09:00',min:20100,max:24000}] }));
  await expect(prep).toHaveAttribute('data-place','airport');
  await expect(prep.getByTestId('usual-headline')).toHaveCount(0);
  expect(usualReads.get(page)?.count).toBe(0);
});

test('a failed comparison request is reported, not guessed', async ({ page }) => {
  const prep = await open(page, { error: 'usual_comparison_unavailable' }, 503);
  await expect(prep.getByTestId('usual-comparison')).toHaveCount(0);
  await expect(prep).not.toContainText(compareCopy.loadFailed.ko);
  await expect(prep.getByTestId('prep-actions')).toBeVisible();
  expect(usualReads.get(page)?.count).toBe(0);
});

test('the airport is never compared with usual', async ({ page }) => {
  const prep = await open(page, usual('myeongdong'));
  await expect(prep).toHaveAttribute('data-place','airport');
  await expect(prep.getByTestId('usual-comparison')).toHaveCount(0);
});

test('the first look says so, and a later look shows only real value changes', async ({ page }) => {
  const prep = await open(page, usual('myeongdong'));
  await expect(prep.getByTestId('last-check-first')).not.toBeVisible();
  await prep.getByTestId('last-check').locator('summary').click();
  await expect(prep.getByTestId('last-check-first')).toBeVisible();
  // The last-look regression still detects a real airport passenger change.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('koretail-last-check-v1'))).not.toBeNull();
  await page.evaluate(() => {
    const ledger = JSON.parse(localStorage.getItem('koretail-last-check-v1') ?? '[]');
    ledger[0].checkedAt = '2026-08-31T04:30:00.000Z';
    const at=Object.keys(ledger[0].signature.airport)[0];
    if(!at)throw Error('airport fixture must have an official band');
    ledger[0].signature.airport[at]=Math.max(1,Math.floor(ledger[0].signature.airport[at]/2));
    localStorage.setItem('koretail-last-check-v1', JSON.stringify(ledger));
  });
  await page.reload();
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  const block = page.getByTestId('last-check');
  await expect(block.getByTestId('last-check-headline')).toHaveText('지난 확인(13:30) 이후 달라진 점');
  await expect(block.getByTestId('last-check-changes')).not.toContainText('혼잡 예측 보통');
  await expect(block.getByTestId('last-check-changes')).toContainText('출국 예상 약');
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

test('switching terminals and back in one visit keeps the earlier T1 comparison', async ({ page }) => {
  const prep = await open(page, usual('myeongdong'));
  await expect(prep.getByTestId('prep-place')).toContainText('T1');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('koretail-last-check-v1'))).not.toBeNull();
  await page.evaluate(() => {
    const ledger = JSON.parse(localStorage.getItem('koretail-last-check-v1') ?? '[]');
    const previous = ledger.find((entry: {place: string}) => entry.place === 'airport:T1');
    if (!previous) throw Error('airport T1 snapshot must have been saved');
    previous.checkedAt = '2026-08-31T04:30:00.000Z';
    const at=Object.keys(previous.signature.airport)[0];
    if(!at)throw Error('airport fixture must have an official band');
    previous.signature.airport[at]=Math.max(1,Math.floor(previous.signature.airport[at]/2));
    localStorage.setItem('koretail-last-check-v1', JSON.stringify(ledger));
  });
  await page.reload();
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.getByTestId('last-check-headline')).toHaveText('지난 확인(13:30) 이후 달라진 점');
  // Use the real condition controls: page.goto would start another document
  // visit and correctly compare against the snapshot this visit already wrote.
  await prep.locator('.prep-change').click();
  await prep.getByRole('radio', {name:'T2', exact:true}).check();
  await prep.locator('.prep-form button[type=submit]').click();
  await expect(prep.getByTestId('prep-place')).toContainText('T2');
  await expect(prep).toHaveAttribute('data-place','airport');
  await expect.poll(() => page.evaluate(() => {
    const ledger = JSON.parse(localStorage.getItem('koretail-last-check-v1') ?? '[]');
    return ledger.some((entry: {place: string}) => entry.place === 'airport:T2');
  })).toBe(true);
  await prep.getByTestId('last-check').locator(':scope > summary').click();
  await expect(prep.getByTestId('last-check-first')).toBeVisible();
  await expect(prep.getByTestId('last-check-changes')).toHaveCount(0);
  await prep.locator('.prep-change').click();
  await prep.getByRole('radio', {name:'T1', exact:true}).check();
  await prep.locator('.prep-form button[type=submit]').click();
  await expect(prep.getByTestId('prep-place')).toContainText('T1');
  await expect(page.getByTestId('last-check-headline')).toHaveText('지난 확인(13:30) 이후 달라진 점');
  await expect(page.getByTestId('last-check-changes')).toContainText('출국 예상 약');
  expect(usualReads.get(page)?.count).toBe(0);
});
