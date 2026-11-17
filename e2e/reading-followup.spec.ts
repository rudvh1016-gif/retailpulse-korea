import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
for(const [lang,width] of [['ko',360],['ko',390],['ko',430],['ko',1280],['en',390],['zh',390],['ja',390]] as const)test(`retired Seoul entry: reading follow-up: 80/121 sampled bins ${lang} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});
 const langCode = lang;
 await page.route('**/api/**', route => route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
 await page.goto(`/${langCode}/consumption?area=hongdae&month=2026-08`);
 await expect(page).toHaveURL(url => url.pathname === `/${langCode}` || url.pathname === `/${langCode}/`);
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
 await expect(page.locator('.area-tabs, .tourism-desk, .commercial-miniature-card, .population-outlook, .seoul-weather-panel')).toHaveCount(0);
 await expect(page.locator('a[href*="/myeongdong"], a[href*="/tourism-desk"], a[href*="/consumption"]')).toHaveCount(0);
});
for(const width of [360,390,430])test(`reading follow-up: two date presets fill mobile width ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 for(const [date,dayRelation] of [['2026-08-30','PAST'],['2026-09-01','FUTURE']] as const){
  const summary={...SUMMARY_FIXTURE,serviceDateKst:date,dayRelation,airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:date}};
  await page.route('**/api/live/summary*',routeSummary(summary));
  await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',basis:dayRelation==='FUTURE'?'OFFICIAL_DEPARTURE_SCHEDULE':'COLLECTED_FLIGHT_RECORDS',flights:[{physicalFlightId:'two-preset-fixture',flightNumber:'TEST1',terminal:'T2',gate:'274',direction:'departure',scheduledAt:date+'T12:10:00+09:00',retrievedAt:SUMMARY_FIXTURE.generatedAt,status:'scheduled',airportCode:'NRT'}],truncated:false,retrievedAt:SUMMARY_FIXTURE.generatedAt}}));
  await page.goto('/ko/airport?terminal=T2&date='+date);
  const control=page.locator('.airport-time-control'),buttons=control.locator('[data-preset]');await expect(buttons).toHaveCount(2);
  await control.scrollIntoViewIfNeeded();const grid=await control.locator('.airport-time-presets').boundingBox(),first=await buttons.nth(0).boundingBox(),last=await buttons.nth(1).boundingBox();
  expect(Math.abs(first!.width-last!.width)).toBeLessThan(1);expect(last!.x+last!.width).toBeGreaterThan(grid!.x+grid!.width-6);
  await buttons.nth(1).focus();await page.keyboard.press('Enter');await expect(page.getByTestId('map-from')).toBeVisible();
  await buttons.nth(0).click();await expect(buttons.nth(0)).toHaveAttribute('aria-pressed','true');
  await control.screenshot({path:info.outputPath(`two-presets-${dayRelation}-${width}.png`)});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 expect(errors).toEqual([]);
});
