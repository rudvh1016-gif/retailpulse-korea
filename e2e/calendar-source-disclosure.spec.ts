import {test,expect} from '@playwright/test';
test.use({hasTouch:true});
for(const width of [320,390,1440])test(`calendar source disclosure keyboard and touch ${width}`,async({page})=>{
 test.setTimeout(90000);
 await page.setViewportSize({width,height:1000});
 await page.route('**/api/live/summary*',route=>route.fulfill({json:{mode:'live-summary',todayKst:'2026-10-21',serviceDateKst:'2026-10-21',generatedAt:'2026-10-21T00:00:00Z',dayRelation:'TODAY',areas:{},airport:{},sources:[]}}));
 await page.route('**/api/airport/calendar*',route=>route.fulfill({json:{status:'UNAVAILABLE',events:[],sources:[],replacementScopes:[]}}));
 await page.goto('/ko/airport-prepare',{waitUntil:'domcontentloaded'});
 const details=page.locator('details.focus-calendar-source-notes'),summary=details.locator('summary'),body=details.locator('.focus-source');
 await expect(summary).toHaveText('자료 출처·업데이트 안내');await expect(summary).toBeVisible();
 await expect(details).not.toHaveAttribute('open','');await expect(body).toBeHidden();
 await summary.focus();await expect(summary).toBeFocused();await page.keyboard.press('Enter');
 await expect(details).toHaveAttribute('open','');await expect(body).toBeVisible();
 await expect(body).toContainText('국가별 모든 휴일·방학을 확인한 목록은 아닙니다.');
 await expect(body).toContainText('일정 기준 2026-10-21');
 await expect(body.getByRole('link',{name:'Singapore Open Data Licence 1.0'})).toHaveAttribute('href','https://data.gov.sg/open-data-licence');
 await page.keyboard.press('Space');await expect(body).toBeHidden();await expect(summary).toBeFocused();
 for(let i=0;i<2;i++){await summary.tap();await expect(body).toBeVisible();await summary.tap();await expect(body).toBeHidden();}
 await summary.tap();await expect(body).toBeVisible();
 const box=await summary.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);
 expect(await details.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await expect(page.locator('.focus-travel-note')).toBeVisible();
});
