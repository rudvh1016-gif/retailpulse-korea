import {test,expect} from '@playwright/test';
import {routeSummary,SUMMARY_FIXTURE} from './summary-fixture';

for(const lang of ['ko','en','zh','ja'] as const)for(const terminal of ['all','T1','T2','CONCOURSE'])test(`departure guide removed ${lang} ${terminal}; news and airport sections remain`,async({page})=>{
 await page.setViewportSize({width:390,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',flights:[],truncated:false,retrievedAt:SUMMARY_FIXTURE.generatedAt}}));
 await page.goto(`/${lang}/airport?${terminal==='CONCOURSE'?'terminal=T1&building=CONCOURSE':`terminal=${terminal}`}#airport-departure-preparation`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const removed=page.locator('[data-testid="departure-preparation"],[data-testid="departure-guide-entry"],[data-testid="passenger-basic-steps"],[data-testid="prep-live-summary"],#airport-departure-preparation,a[href*="#airport-departure-preparation"]');
 await expect(removed).toHaveCount(0);
 const news=page.getByTestId('airport-customs-news-entry');await expect(news).toBeVisible();await expect(news).toHaveAttribute('href',`/${lang}/airport-news`);
 // The surviving action starts at its container's left edge: no empty guide column remains.
 const box=(await news.boundingBox())!,container=(await news.locator('..').boundingBox())!;expect(Math.abs(box.x-container.x)).toBeLessThanOrEqual(1);
 await expect(page.locator('#airport-data-flow')).toBeVisible();
 if(terminal!=='CONCOURSE'){
  const sections=page.locator('.airport-context-nav button');
  for(const section of await sections.all()){await section.click();await expect(removed).toHaveCount(0);}
  await sections.first().click();await expect(news).toBeVisible();
 }
 await page.reload();await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');await expect(removed).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});
