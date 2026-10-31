import { test, expect } from '@playwright/test';

const shareDescription = '인천공항 시간대별 예상 여객과 출발편 집중시간, 국가별 여객 흐름, 주요 휴일과 도착국 면세한도를 확인하세요. 날짜·터미널별로 비교하며 공식 출처와 자료 기준일을 함께 봅니다.';
const aboutIntro = '인천공항 항공편·여객 흐름과 여행 준비 정보를 중심으로 제공하는 코리테일 KORETAIL은 Korea와 Retail을 합친 이름입니다. 자료별 기준일과 출처를 함께 안내합니다.';
const aboutDescription = '인천공항 항공편·여객 흐름과 여행 준비 정보를 제공하는 코리테일을 소개합니다. 자료의 출처와 기준일, 관측·예상·과거 기록의 차이를 안내합니다.';

test('legacy introduction redirects to its localized canonical without changing home discovery', async ({ request }) => {
  for (const [path, target] of [['/', '/ko'], ['/about', '/ko/about']]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(new URL(response.headers().location, response.url()).pathname).toBe(target);
  }
  const homeResponse = await request.get('/ko');
  const html = await homeResponse.text();
  expect(html).toContain('코리테일 KORETAIL | 인천공항 항공편·여객 흐름·여행 준비 정보');
  expect(html).toContain(shareDescription);
  const footer = html.match(/<footer\b[^>]*class="site-footer"[^>]*>([\s\S]*?)<\/footer>/)?.[1];
  expect(footer).toContain('코리테일 KORETAIL');
  const structuredData = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .flatMap(([, json]) => JSON.parse(json));
  const websites = structuredData.filter(item => item['@type'] === 'WebSite');
  expect(websites).toHaveLength(1);
  expect(websites[0].name).toBe('KORETAIL');
  expect(websites[0].alternateName).toContain('코리테일');
  expect(new URL(websites[0].url).origin).toBe(new URL(homeResponse.url()).origin);
  expect(new URL(websites[0].url).pathname).toBe('/');
  const sitemap = await (await request.get('/sitemap.xml')).text();
  if (process.env.RPK_DEPLOYMENT_STAGE === 'staging') {
    // Staging must stay out of search indexes; production coverage is tested separately.
    expect(sitemap).not.toContain('<loc>');
  } else {
    expect(sitemap).toContain('/ko/about');
  }
  expect(sitemap).not.toContain('/ko/airport-glance</loc>');
});

for (const width of [390, 1440]) {
  test(`introduction keeps service identity after hydration at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/ko/about');
    await expect(page.locator('.about-view')).toBeVisible();
    await expect(page).toHaveTitle('코리테일 소개 | 인천공항 중심 데이터 서비스 KORETAIL');
    await expect(page.locator('.about-view .view-intro')).toContainText(aboutIntro);
    await expect(page.locator('.site-footer')).toContainText('코리테일 KORETAIL');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', aboutDescription);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/ko\/about$/);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', shareDescription);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
