import { test, expect } from '@playwright/test';

for (const width of [320, 390, 820, 821, 1440]) {
  test(`shopping entry preserves the airport shell at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/ko');
    const entry = page.locator(width <= 820 ? '.shopping-mobile-entry' : '.shopping-desktop-entry');
    await expect(entry).toBeVisible();
    await expect(entry).toHaveText(/외국인은 뭘 살까\?/);
    await expect(page.locator('.bottom-nav a')).toHaveCount(5);
    if (width <= 820) {
      const title = await page.locator('.glance-heading h1').boundingBox();
      const button = await entry.boundingBox();
      expect(button!.x).toBeGreaterThanOrEqual(title!.x + title!.width + 3);
      expect(button!.height).toBeGreaterThanOrEqual(44);
    } else {
      await expect(page.locator('.top-nav a')).toHaveText(['한눈에', '공항현황', '국가별 흐름', '미리 준비', '외국인은 뭘 살까?', '더보기']);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await entry.click();
    await expect(page).toHaveURL(/\/shopping-report\/(?:index\.html)?$/);
    await expect(page.locator('h1')).toHaveText('외국인 쇼핑,무엇을 사고 어디서 샀을까?');
    await expect(page.locator('.store-overview')).toHaveCount(6);
  });
}

test('report keeps all comparisons, monthly choices, source links and reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/shopping-report/index.html');
  await expect(page.locator('h1')).toHaveCSS('color', 'rgb(112, 43, 62)');
  await expect(page.locator('#quarters')).toContainText('74.1%');
  await expect(page.locator('#quarters')).toContainText('+1.2');
  await page.locator('#industry-choice').selectOption('5');
  await expect(page.locator('.index-group:visible')).toContainText('106.2');
  await page.locator('#monthly-mix summary').click();
  await page.locator('#month-category').selectOption('0');
  await page.locator('#month-store').selectOption('3');
  await expect(page.locator('#monthly-takeaway')).toContainText('8월 74.0% → 9월 75.5% (+1.5%p)');
  await expect(page.locator('.monthly-row')).toHaveCount(9);
  for (const summary of await page.locator('#store-case summary').all()) await summary.click();
  await expect(page.locator('.mix-list dd:visible')).toHaveCount(30);
  await expect(page.locator('.bar25').first()).toHaveCSS('transform', 'none');
  await expect(page.locator('#source a').first()).toHaveAttribute('href', /bcIdx=311046/);
  expect(errors).toEqual([]);
});

test('desktop detail charts keep a common growth scale and mobile disclosures', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/shopping-report/index.html');
  await expect(page.locator('#retail-detail')).toHaveAttribute('open', '');
  await expect(page.locator('.store-overview details[open]')).toHaveCount(6);
  await expect(page.locator('#monthly-mix details')).toHaveAttribute('open', '');
  await expect(page.locator('.monthly-desktop-reading')).toContainText('9월 구성비61.4%8월 64.9%8월 대비 변화−3.5%p');
  await expect(page.locator('.mix-comparison:visible')).toHaveCount(30);
  await expect(page.locator('.mix-list dd:visible')).toHaveCount(30);
  await expect(page.locator('.detail-chart b')).toHaveText(['+142.0%', '+48.7%', '+39.9%', '+59.1%', '+33.4%', '+33.0%', '+32.8%']);
  const widths = await page.locator('.detail-bar').evaluateAll(bars => bars.map(bar => parseFloat((bar as HTMLElement).style.width)));
  [142, 48.7, 39.9, 59.1, 33.4, 33, 32.8].forEach((value, i) => expect(widths[i]).toBeCloseTo(value / 150 * 100, 4));
  const bar = page.locator('.detail-bar').first();
  await expect(bar).toHaveCSS('transition-duration', '1.2s');
  await expect(bar).toHaveCSS('transform', 'matrix(0, 0, 0, 1, 0, 0)');
  await bar.scrollIntoViewIfNeeded();
  await expect.poll(() => bar.evaluate(e => new DOMMatrix(getComputedStyle(e).transform).a)).toBeGreaterThan(.99);
  await page.locator('#month-store').selectOption('3');
  await page.locator('#month-category').selectOption('0');
  await expect(page.locator('.monthly-desktop-reading')).toContainText('9월 구성비75.5%8월 74.0%8월 대비 변화+1.5%p');
  await expect(page.locator('.monthly-change').last()).toHaveCSS('font-weight', '700');
  await expect(page.locator('.index-group:visible')).toHaveCSS('border-bottom-width', '0px');
  await expect(page.locator('#retail-detail')).toHaveCSS('border-bottom-width', '0px');
  for (const line of await page.locator('.source-top .survey-facts').all()) await expect(line).toHaveCSS('font-weight', '700');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(bar).toHaveCSS('transition-duration', '0s');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#retail-detail')).not.toHaveAttribute('open');
  await expect(page.locator('.store-overview details[open]')).toHaveCount(0);
  await expect(page.locator('#monthly-mix details')).not.toHaveAttribute('open');
  await expect(page.locator('.index-group:visible')).toHaveCSS('border-bottom-width', '1px');
  await expect(page.locator('#retail-detail')).toHaveCSS('border-bottom-width', '1px');
  await page.locator('#retail-detail summary').click();
  await expect(page.locator('.detail-copy').first()).toBeVisible();
  await expect(page.locator('.detail-chart').first()).toBeHidden();
});
