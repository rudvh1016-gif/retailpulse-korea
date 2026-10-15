import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
for(const width of [390,1280])test(`official history September and readable Seoul sources ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.goto('/ko/airport?terminal=T2');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');await page.getByRole('button',{name:'과거',exact:true}).click();
 const history=page.locator('.airport-history');await expect(history).toContainText('2026-09');await expect(history).toContainText('1,605,895');
 await expect(history).toContainText('2026-04');await expect(history).toContainText('2026-08');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.goto('/ko/myeongdong');const flow=page.locator('[data-flow="tourism"]');await expect(flow).toBeVisible();
 await expect(flow).not.toContainText('310.3');await expect(flow.locator('dd')).toHaveText('310회 · 추정(이동 수)');await expect(flow).toContainText('서울 열린데이터광장');await expect(flow).not.toContainText('OA-22378');
 await expect(page.locator('[data-flow="living"]')).not.toContainText('OA-23018');
});
