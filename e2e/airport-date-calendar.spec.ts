import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
import {tofuCharacters} from './font-glyphs';
import {chooseDate,expectDateSelection} from './date-selection';

for(const action of ['read','choose'] as const)test(`compact date helper waits for the navigator before ${action}`,async({page})=>{
 let release!:()=>void,requested=false;
 const pending=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/live/summary*',async route=>{
  requested=true;await pending;
  const date=new URL(route.request().url()).searchParams.get('date')??SUMMARY_FIXTURE.todayKst;
  await route.fulfill({json:{...SUMMARY_FIXTURE,serviceDateKst:date,airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:date}}});
 });
 await page.goto('/ko/airport');
 await expect.poll(()=>requested).toBe(true);
 const nav=page.locator('.airport-view .date-nav');
 await expect(nav).toHaveCount(0);
 const date=action==='read'?SUMMARY_FIXTURE.todayKst:'2026-08-30';
 const operation=action==='read'?expectDateSelection(page,date):chooseDate(page,date);
 try{
  await expect(nav).toHaveCount(0);
 }finally{release();}
 await operation;
 await expectDateSelection(page,date);
 const stored=nav.locator('.stored-date-picker');
 if(action==='read')await expect(stored).not.toHaveAttribute('open');
 else{
  await expect(stored).toHaveAttribute('open');
  await expect(stored.locator('input[type=date]')).toHaveValue(date);
  await expect(page).toHaveURL(/date=2026-08-30/);
 }
});

for(const lang of ['ko','en','zh','ja'])for(const width of [360,390,430,1280])test(`compact airport dates ${lang} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.setFixedTime(new Date('2030-01-01T00:00:00Z'));
 await page.route('**/api/live/summary*',r=>{const url=new URL(r.request().url()),date=url.searchParams.get('date')??'2026-08-31',month=url.searchParams.get('month')??date.slice(0,7);return r.fulfill({json:{...SUMMARY_FIXTURE,serviceDateKst:date,dateAvailability:{...SUMMARY_FIXTURE.dateAvailability,month,airportFlights:['2026-08-31','2026-09-02'].filter(day=>day.startsWith(month)),airportPassengerForecast:[],airportDepartureSchedule:[]},airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:date}}});});
 await page.goto(`/${lang}/airport`);await expectDateSelection(page,'2026-08-31');
 await expect(page.getByTestId('date-calendar-trigger')).toHaveCount(0);await expect(page.getByTestId('date-calendar-dialog')).toHaveCount(0);
 const stored=page.locator('.stored-date-picker'),toggle=stored.locator(':scope > summary'),shortcuts=page.locator('.date-nav-shortcuts button');
 await expect(stored).not.toHaveAttribute('open');await expect(shortcuts).toHaveCount(3);
 for(const button of await shortcuts.all())expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 await toggle.focus();await page.keyboard.press('Enter');await expect(stored).toHaveAttribute('open');
 const input=stored.locator('input[type=date]');await expect(input).toHaveValue('2026-08-31');await expect(input).not.toHaveAttribute('min');await expect(input).not.toHaveAttribute('max');
 expect(await tofuCharacters(page.locator('.date-nav'))).toEqual([]);
 await chooseDate(page,'2026-09-02');await expect(page).toHaveURL(/date=2026-09-02/);await expectDateSelection(page,'2026-09-02');
 const selectedUrl=page.url();await toggle.click();await expect(stored).not.toHaveAttribute('open');await expect(page).toHaveURL(selectedUrl);
 await toggle.focus();await page.keyboard.press('Space');await expect(input).toHaveValue('2026-09-02');await toggle.click();
 await page.goBack();await expectDateSelection(page,'2026-08-31');await page.goForward();await expectDateSelection(page,'2026-09-02');
 await shortcuts.nth(1).click();await expectDateSelection(page,'2026-08-31');
 await page.locator('#airport-data-flow button').last().click();await chooseDate(page,'2026-07-01');await expectDateSelection(page,'2026-07-01');
 expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
