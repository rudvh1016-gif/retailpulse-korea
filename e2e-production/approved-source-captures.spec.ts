import { test, expect } from '@playwright/test';

// Real production data only. The shared production setup checks the exact
// deployed revision before and after the suite; no response is intercepted.
test('official route-country passenger section live 1440', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ko/airport-countries#airport-route-passengers');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  const section = page.getByTestId('airport-route-passengers');
  await expect(section).toBeVisible();
  await expect(section.getByRole('heading', { level: 4 })).toHaveText('노선 국가별 출발 여객 · 공식 월 실적');
  await expect(section.locator('.route-passenger-period')).toContainText('공항 전체 · 명/월');
  // Eight displayed routes are the bounded leading table, not a fabricated
  // country total. Dates and values remain whatever the official source serves.
  const table = section.locator('table').first();
  await expect(table.locator('tbody tr')).toHaveCount(8);
  await expect(section.locator('a[href="https://www.data.go.kr/data/15095071/openapi.do"]')).toBeVisible();
  await section.scrollIntoViewIfNeeded();
  await expect.poll(() => section.locator('.route-passenger-heading img, table:first-of-type .route-country-name img')
    .evaluateAll(images => images.filter(image => image.getClientRects().length > 0)
      .every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await testInfo.attach('official-route-country-passengers-1440.png', {
    body: await section.screenshot(), contentType: 'image/png',
  });
});

test('whole-airport official hourly comparison live 1440', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ko/airport?terminal=all#airport-hourly-comparison');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.getByRole('tablist', { name: 'Terminal', exact: true })
    .getByRole('tab', { name: /전체/ })).toHaveAttribute('aria-selected', 'true');
  const section = page.locator('.airport-forecast');
  await expect(section.locator('#airport-hourly-comparison')).toBeVisible();
  // A terminal-only chart cannot satisfy this check: official historical
  // reference data and its basis must actually be rendered for the whole airport.
  await expect(section.locator('.airport-flow-reference')).toHaveAttribute('data-month', /^\d{4}-\d{2}$/);
  await expect(section.getByTestId('airport-flow-reference-legend')).toBeVisible();
  await expect(section.locator('.airport-flow-reference-note a')).toHaveAttribute('href', 'https://www.data.go.kr/data/15095070/openapi.do');
  await testInfo.attach('official-whole-airport-hourly-comparison-1440.png', {
    body: await section.screenshot(), contentType: 'image/png',
  });
});
