import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';

for(const [lang,width] of [['zh',390],['ko',390],['en',390],['ja',390],['zh',1440]] as const){
 test(`Chinese phone supporting date is smaller without changing other languages or desktop ${lang} ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:900});
  await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
  await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',serviceDateKst:SUMMARY_FIXTURE.serviceDateKst,flights:[],truncated:false}}));
  await page.goto(`/${lang}?date=${SUMMARY_FIXTURE.serviceDateKst}`);
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  const report=page.locator('.focus-report');await expect(report).toBeVisible();
  await expect(report.locator('.focus-report-date')).toHaveCSS('font-size',lang==='zh'&&width<=600?'10px':'12px');
  const title=report.locator('.focus-report-title h2');
  expect(parseFloat(await title.evaluate(el=>getComputedStyle(el).fontSize))).toBeGreaterThan(10);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  if(lang==='zh')await report.screenshot({path:info.outputPath(`zh-notes-${width}.png`)});
 });
}
test('Chinese phone route-country supporting copy is compact',async({page})=>{
 await page.setViewportSize({width:390,height:900});await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.goto('/zh/airport-countries?mode=passengers&date=2026-10-19');
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const scope=page.locator('.focus-detail .monthly-airport-scope > small');
 await expect(scope).toBeVisible();await expect(scope).toHaveCSS('font-size','10px');
 await expect(page.locator('.focus-detail > .focus-lead')).toHaveCSS('font-size','10px');
});
