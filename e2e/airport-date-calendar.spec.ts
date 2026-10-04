import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
import {tofuCharacters} from './font-glyphs';
import {chooseDate,expectDateSelection} from './date-selection';
for(const lang of ['ko','en','zh','ja'])for(const width of [360,390,430,1280])test(`calendar modal and dates ${lang} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.setFixedTime(new Date('2030-01-01T00:00:00Z'));
 await page.route('**/api/live/summary*',r=>{const url=new URL(r.request().url()),date=url.searchParams.get('date')??'2026-08-31',month=url.searchParams.get('month')??date.slice(0,7);return r.fulfill({json:{...SUMMARY_FIXTURE,serviceDateKst:date,dateAvailability:{...SUMMARY_FIXTURE.dateAvailability,month,airportFlights:['2026-08-31','2026-09-02'].filter(day=>day.startsWith(month)),airportPassengerForecast:[],airportDepartureSchedule:[]},airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:date}}});});
 await page.goto(`/${lang}/airport`);const trigger=page.getByTestId('date-calendar-trigger');await expectDateSelection(page,'2026-08-31');
 expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(44);await trigger.focus();await page.keyboard.press('Enter');const dialog=page.getByTestId('date-calendar-dialog');await expect(dialog).toBeVisible();await expect(dialog.locator('button[data-date="2026-08-31"]')).toBeFocused();
 await expect(dialog.locator('button[data-date="2026-08-31"] [data-held]')).toHaveAttribute('data-held','true');
 for(const button of await dialog.locator('.date-calendar-days button').all()){const b=(await button.boundingBox())!;expect(b.height).toBeGreaterThanOrEqual(44);expect(b.width).toBeGreaterThanOrEqual(44);}
 const adjacent=await dialog.locator('.date-calendar-days button').evaluateAll(nodes=>nodes.filter(node=>['12','13'].includes(node.textContent?.trim()??'')).map(node=>{const range=document.createRange();range.selectNode(node.firstChild!);const rect=range.getBoundingClientRect();return {left:rect.left,right:rect.right};}));expect(adjacent[1].left-adjacent[0].right).toBeGreaterThan(8);
 expect(await tofuCharacters(page.locator('.date-nav'))).toEqual([]);expect(await tofuCharacters(dialog)).toEqual([]);
 if(width<600){const box=(await dialog.boundingBox())!;expect(Math.abs(box.y+box.height-900)).toBeLessThan(2);expect(box.width).toBe(width);}else expect((await dialog.boundingBox())!.width).toBeLessThan(401);
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
 await trigger.click();await page.goBack();await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();await expectDateSelection(page,'2026-08-31');
 await chooseDate(page,'2026-09-02');await expect(page).toHaveURL(/date=2026-09-02/);await expect(trigger).toBeFocused();await trigger.click();await dialog.locator('button[data-date="2026-09-02"]').press('ArrowLeft');await expect(dialog.locator('button[data-date="2026-09-01"]')).toBeFocused();await page.keyboard.press('Escape');
 await expect(trigger).toBeFocused();const selectedUrl=page.url();
 // Cancel month browsing without changing the committed date or stepping into
 // the previous page. Keep the existing repeated-close failure test unchanged.
 await trigger.click();await dialog.locator('input[type=month]').fill('2026-10');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();await expectDateSelection(page,'2026-09-02');await expect(page).toHaveURL(selectedUrl);
 // Forward returns to the owned modal entry; Back cancels it once.
 await page.goForward();await expect(dialog).toBeVisible();await expect(dialog.locator('input[type=month]')).toHaveValue('2026-09');await expect(dialog.locator('button[data-date="2026-09-02"]')).toBeFocused();await expect(page).toHaveURL(selectedUrl);
 await page.goBack();await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();await expectDateSelection(page,'2026-09-02');
 // Confirmed date navigation remains ordinary browser history.
 await page.goBack();await expectDateSelection(page,'2026-08-31');await expect(dialog).toHaveCount(0);
 await page.goForward();await expectDateSelection(page,'2026-09-02');await expect(dialog).toHaveCount(0);await expect(page).toHaveURL(selectedUrl);
 await trigger.click();await expect(dialog).toBeVisible();await dialog.evaluate(node=>{node.dispatchEvent(new Event('cancel',{cancelable:true}));node.dispatchEvent(new Event('cancel',{cancelable:true}));});await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();await expectDateSelection(page,'2026-09-02');await expect(page).toHaveURL(selectedUrl);
 expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
