import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
for(const width of [390,1440])test(`historical change retains primary metric typography ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.goto('/ko/airport');
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await page.locator('.airport-context-nav button').last().click();
 const metrics=page.locator('.airport-history .history-kpis');
 await expect(metrics.locator(':scope > div > span')).toHaveText(['선택 기간 합계','일평균','월 총합 · 첫 달 대비','일평균 최고 월']);
 const rate=metrics.locator('strong > [role="img"]');
 await expect(rate).toBeVisible();
 const typography=await rate.evaluate(el=>({size:getComputedStyle(el).fontSize,parent:getComputedStyle(el.parentElement!).fontSize,weight:getComputedStyle(el).fontWeight}));
 expect(parseFloat(typography.size)).toBeGreaterThanOrEqual(20);expect(parseFloat(typography.size)).toBeLessThanOrEqual(28);expect(parseFloat(typography.size)).toBeLessThan(parseFloat(typography.parent));expect(Number(typography.weight)).toBeGreaterThanOrEqual(600);
 await expect(metrics.locator(':scope > div').nth(2).locator('small')).toContainText('→');
 await metrics.screenshot({path:`test-results/history-rate-${width}.png`,style:'header,.bottom-nav {visibility:hidden !important;}'});
});
