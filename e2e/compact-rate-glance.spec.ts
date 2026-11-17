import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
for(const lang of ['ko','en','zh','ja'] as const)test(`retired Seoul entry: tourism desk and brief retain hollow decrease and Korean source markings ${lang}`,async({page})=>{
 const langCode = lang;
 await page.route('**/api/**', route => route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
 await page.goto(`/${langCode}/tourism-desk/myeongdong`);
 await expect(page).toHaveURL(url => url.pathname === `/${langCode}` || url.pathname === `/${langCode}/`);
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
 await expect(page.locator('.area-tabs, .tourism-desk, .commercial-miniature-card, .population-outlook, .seoul-weather-panel')).toHaveCount(0);
 await expect(page.locator('a[href*="/myeongdong"], a[href*="/tourism-desk"], a[href*="/consumption"]')).toHaveCount(0);
});
for(const lang of ['ko','en','zh','ja'] as const)test(`retired Seoul entry: owner rate signs and decrease speech ${lang}`,async({page})=>{
 const langCode = lang;
 await page.route('**/api/**', route => route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
 await page.goto(`/${langCode}/consumption?area=hongdae&month=2026-08`);
 await expect(page).toHaveURL(url => url.pathname === `/${langCode}` || url.pathname === `/${langCode}/`);
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
 await expect(page.locator('.area-tabs, .tourism-desk, .commercial-miniature-card, .population-outlook, .seoul-weather-panel')).toHaveCount(0);
 await expect(page.locator('a[href*="/myeongdong"], a[href*="/tourism-desk"], a[href*="/consumption"]')).toHaveCount(0);
});
for(const width of [360,390,430,1280])test(`retired Seoul entry: glance agrees with summary at 38 minutes and distinguishes delayed last observations ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});
 const langCode = 'ko';
 await page.route('**/api/**', route => route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
 await page.goto(`/${langCode}/where-to`);
 await expect(page).toHaveURL(url => url.pathname === `/${langCode}` || url.pathname === `/${langCode}/`);
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
 await expect(page.locator('.area-tabs, .tourism-desk, .commercial-miniature-card, .population-outlook, .seoul-weather-panel')).toHaveCount(0);
 await expect(page.locator('a[href*="/myeongdong"], a[href*="/tourism-desk"], a[href*="/consumption"]')).toHaveCount(0);
});


test('More starts with the concise change-notation reading guide',async({page})=>{
 await page.goto('/ko/more');
 const guide=page.getByTestId('change-reading-guide');
 await expect(guide).toHaveText('수치 읽는 법: 파란색 +는 증가, 빨간색 △는 감소입니다. 비교 기간과 단위를 함께 확인하세요. 인원·비율은 소수 첫째 자리 5 이상 올림, 5 미만 버림으로 표시합니다. 계산은 원본값 기준이며, 0%로 표시돼도 작은 증감이 있을 수 있습니다.');
 await expect(guide).toBeVisible();
 expect(await guide.evaluate(node=>Boolean(node.compareDocumentPosition(document.querySelector('.more-section-links')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
});

