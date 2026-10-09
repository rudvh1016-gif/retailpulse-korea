import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
for(const lang of ['ko','en','zh','ja'])test(`all departure choices are single, responsive Blender controls ${lang}`,async({browser})=>{
 const context=await browser.newContext({viewport:{width:360,height:900},deviceScaleFactor:3,reducedMotion:'reduce'}),page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',flights:[],truncated:false}}));await page.goto(`/${lang}/airport`);
 const prep=page.getByTestId('departure-preparation');await prep.getByTestId('departure-guide-entry').click();
 await expect(prep.locator('select')).toHaveCount(0);await expect(prep.locator('fieldset[data-testid^="prep-"]')).toHaveCount(4);
 for(const key of ['route','checkedBaggage','taxRefund','dutyFreePickup']){
  const field=prep.getByTestId('prep-'+key);await expect(field.locator('button[aria-pressed=true]')).toHaveCount(1);await expect(field.locator('button img')).toHaveCount(key==='route'?4:3);
  const image=field.locator('img').first();await image.scrollIntoViewIfNeeded();await expect.poll(()=>image.evaluate(async el=>{const source=new Image();source.src=(el as HTMLImageElement).currentSrc;await source.decode();return source.naturalWidth;})).toBe(256);
  for(const button of await field.locator('button').all()){const box=await button.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);}
  const href=await field.locator('a').getAttribute('href');expect(new URL(href!).pathname).not.toBe('/');
 }
 await prep.getByTestId('prep-route-T2').focus();await page.keyboard.press('Enter');await prep.getByTestId('prep-baggage-YES').click();await expect(prep.locator('[data-step=BAG_DROP]')).toHaveCount(1);await prep.getByTestId('prep-baggage-NO').click();await expect(prep.locator('[data-step=BAG_DROP]')).toHaveCount(0);
 await prep.getByTestId('prep-taxRefund-YES').click();await expect(prep.locator('[data-step=REFUND]')).toHaveCount(1);await prep.getByTestId('prep-dutyFreePickup-YES').click();await expect(prep.locator('[data-step=PICKUP]')).toHaveCount(1);
 const refund=prep.getByTestId('tax-refund-guide');await refund.locator(':scope >summary').click();await expect(refund.getByTestId('tax-terminal')).toHaveCount(0);await expect(refund.getByTestId('tax-goods-bag').locator('img')).toHaveCount(2);await expect(refund.getByTestId('tax-phase').locator('img')).toHaveCount(2);
 const entry=prep.getByTestId('departure-guide-entry'),trip=page.getByTestId('travel-records-entry');await entry.scrollIntoViewIfNeeded();const a=await entry.boundingBox(),b=await trip.boundingBox();expect(a!.height).toBe(b!.height);expect(Math.abs(a!.width-b!.width)).toBeLessThan(1);expect(Math.abs(a!.y-b!.y)).toBeLessThan(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);await context.close();
});
