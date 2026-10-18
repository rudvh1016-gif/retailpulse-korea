import { test, expect } from '@playwright/test';

const core = '인천공항 출국장 대기·항공편 흐름과 서울 주요 상권의 혼잡·소비 정보를 한눈에';

test('legacy introduction redirects to its localized canonical without changing home discovery', async ({ request }) => {
  for (const [path, target] of [['/', '/ko'], ['/about', '/ko/about']]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(new URL(response.headers().location, response.url()).pathname).toBe(target);
  }
  const html = await (await request.get('/ko')).text();
  expect(html).toContain('코리테일 KORETAIL | 인천공항 출국장 대기·예상 출국객·서울 상권');
  expect(html).toContain(core);
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('/ko/about');
  expect(sitemap).not.toContain('/ko/airport-glance</loc>');
});

for (const width of [390, 1440]) {
  test(`introduction keeps service identity after hydration at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/ko/about');
    await expect(page.locator('.about-view')).toBeVisible();
    await expect(page).toHaveTitle('코리테일 소개 | 인천공항·서울 상권 데이터 서비스 KORETAIL');
    await expect(page.locator('.about-view .view-intro')).toContainText(core);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', new RegExp(core));
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/ko\/about$/);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', core);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
