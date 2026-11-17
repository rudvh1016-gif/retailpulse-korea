import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
for(const width of [390,1280])test(`official history September and retired Seoul source entry ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.goto('/ko/airport?terminal=T2');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');await page.getByRole('button',{name:'과거',exact:true}).click();
 const history=page.locator('.airport-history');await expect(history).toContainText('2026-09');await expect(history).toContainText('1,605,895');
 await expect(history).toContainText('2026-04');await expect(history).toContainText('2026-08');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.goto('/ko/myeongdong');await expect(page).toHaveURL(/\/ko$/);
 await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
 await expect(page.locator('[data-flow="tourism"], [data-flow="living"]')).toHaveCount(0);
});
