import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
for(const lang of ['ko','en','zh','ja'])for(const width of [360,390,430,1280])test(`compact departure choices retain guide behavior ${lang} ${width}`,async({browser})=>{
 const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:3,reducedMotion:'reduce'}),page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',flights:[],truncated:false}}));await page.goto(`/${lang}/airport`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const prep=page.getByTestId('departure-preparation');await prep.getByTestId('departure-guide-entry').click();
 await expect(prep.locator('select')).toHaveCount(0);await expect(prep.locator('fieldset[data-testid^="prep-"]')).toHaveCount(4);
 const panel=prep.getByTestId('prep-route').locator('..');await expect(panel.locator('img')).toHaveCount(0);
 expect(await panel.evaluate(el=>Boolean(el.compareDocumentPosition(el.parentElement!.querySelector('[data-testid="passenger-basic-steps"]')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
 expect((await panel.boundingBox())!.height).toBeLessThan(900);
 for(const key of ['route','checkedBaggage','taxRefund','dutyFreePickup']){
  const field=prep.getByTestId('prep-'+key);await expect(field.locator('button')).toHaveCount(key==='route'?4:3);await expect(field.locator('button[aria-pressed=true]')).toHaveCount(1);await expect(field.locator('img')).toHaveCount(0);await expect(field.locator('[role=status]')).toBeVisible();
  for(const button of await field.locator('button').all()){const box=await button.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.width).toBeGreaterThanOrEqual(44);}
  const source=field.locator('a'),href=await source.getAttribute('href');expect(new URL(href!).pathname).not.toBe('/');expect((await source.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 }
 await prep.getByTestId('prep-route-T2').focus();await page.keyboard.press('Enter');await expect(prep.getByTestId('prep-route-T2')).toHaveAttribute('aria-pressed','true');
 await prep.getByTestId('prep-baggage-YES').focus();await page.keyboard.press('Space');await expect(prep.locator('[data-step=BAG_DROP]')).toHaveCount(1);await prep.getByTestId('prep-baggage-NO').click();await expect(prep.locator('[data-step=BAG_DROP]')).toHaveCount(0);await prep.getByTestId('prep-baggage-UNKNOWN').click();await expect(prep.getByTestId('prep-unknown-choices')).toBeVisible();await expect(prep.getByTestId('prep-baggage-UNKNOWN')).not.toHaveText(await prep.getByTestId('prep-baggage-NO').innerText());
 await prep.getByTestId('prep-taxRefund-YES').click();await expect(prep.locator('[data-step=REFUND]')).toHaveCount(1);await prep.getByTestId('prep-dutyFreePickup-YES').click();await expect(prep.locator('[data-step=PICKUP]')).toHaveCount(1);
 const refund=prep.getByTestId('tax-refund-guide');await refund.locator(':scope >summary').click();await expect(refund.getByTestId('tax-terminal')).toHaveCount(0);await expect(refund.getByTestId('tax-goods-bag').locator('img')).toHaveCount(0);await expect(refund.getByTestId('tax-phase').locator('img')).toHaveCount(0);
 for(const key of ['tax-goods-bag','tax-phase']){const field=refund.getByTestId(key);await expect(field.locator('button')).toHaveCount(2);await expect(field.locator('button[aria-pressed=true]')).toHaveCount(1);for(const button of await field.locator('button').all())expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);}
 await refund.getByTestId('tax-goods-bag-CARRY').focus();await page.keyboard.press('Space');await expect(refund.getByTestId('tax-goods-bag')).toHaveAttribute('data-value','CARRY');await refund.getByTestId('tax-phase-AFTER_SECURITY').click();await expect(refund.getByTestId('tax-locations')).toHaveAttribute('data-phase','AFTER_SECURITY');
 const entry=prep.getByTestId('departure-guide-entry'),trip=page.getByTestId('airport-customs-news-entry');await entry.scrollIntoViewIfNeeded();const a=await entry.boundingBox(),b=await trip.boundingBox();expect(a!.height).toBe(b!.height);expect(Math.abs(a!.width-b!.width)).toBeLessThan(1);expect(Math.abs(a!.y-b!.y)).toBeLessThan(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);await context.close();
});
