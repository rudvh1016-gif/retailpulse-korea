import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import {buildCommercialMonth,compareCommercialMonths,publicCommercialMonth,type CommercialContextRow} from '../lib/commercial-monthly';

// Synthetic layout fixture: six discontinuous dates, 80/121 date-hour bins,
// two sampled ten-minute readings per bin and independently missing amounts.
const dates=[1,3,5,7,9,11];
const categories=[{name:'스포츠/문화/레저',hours:[13,13,13,13,14,14]},{name:'기타요식',hours:[20,20,20,20,20,21]}];
function sampledRows(month:string,multiplier:number):CommercialContextRow[] {
 const rows:CommercialContextRow[]=[];
 for(const [index,day] of dates.entries())for(let hour=0;hour<21;hour++)for(const minute of [10,40]){
  const included=categories.filter(category=>hour<category.hours[index]);if(!included.length)continue;
  const at=`${month}-${String(day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:${minute}:00+09:00`;
  rows.push({observed_at:at,payload:JSON.stringify({commercialAt:at,categories:included.map(category=>({category:category.name,group:'explicit-layout-fixture',payments:(20+day+hour)*multiplier+(minute===40?2:0),amountMin:hour%4?1000*multiplier:null,amountMax:hour%4?2000*multiplier:null}))})});
 }
 return rows;
}
const comparison=compareCommercialMonths(buildCommercialMonth(sampledRows('2026-08',2),'2026-08','2026-08-30'),buildCommercialMonth(sampledRows('2026-07',1),'2026-07','2026-07-31'));
for(const [lang,width] of [['ko',360],['ko',390],['ko',430],['ko',1280],['en',390],['zh',390],['ja',390]] as const)test(`reading follow-up: 80/121 sampled bins ${lang} ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/commercial-months*',route=>{const url=new URL(route.request().url());return route.fulfill({json:{status:'READY',area:url.searchParams.get('area'),month:'2026-08',months:['2026-08','2026-07'],calculatedAt:SUMMARY_FIXTURE.generatedAt,data:publicCommercialMonth(comparison)}});});
 await page.goto(`/${lang}/consumption?month=2026-08`);await expect(page.locator('.consumption-category')).toHaveCount(2);
 await expect(page.locator('.comparison-basis').first()).toContainText({ko:'내국인',en:'domestic',zh:'本国',ja:'韓国人'}[lang]);
 await expect(page.locator('.consumption-scope')).toBeVisible();
 for(const [name,count] of [['스포츠/문화/레저',80],['기타요식',121]] as const){
  const expected=comparison.categories.find(row=>row.category===name)!.comparison;
  expect(expected.matchedDays).toBe(6);expect(expected.matchedHours).toBe(count);expect(expected.coverage!.currentWindows).toBe(count*2);
  expect(expected.coverage!.amount!.hours.length).toBeLessThan(count);
  const card=page.locator(`[data-category="${name}"]`),coverage=card.getByTestId('consumption-coverage'),details=coverage.locator('details');
  await expect(card.locator('.consumption-category-content > small')).toContainText(String(count));
  await expect(coverage).toContainText('2026-07: 01, 03, 05, 07, 09, 11');
  await expect(coverage).toContainText('2026-08: 01, 03, 05, 07, 09, 11');
  await expect(coverage.locator('.consumption-hours-preview li')).toHaveCount(3);
  await expect(card.locator('details')).toHaveCount(1);await expect(details).not.toHaveAttribute('open','');
  await card.scrollIntoViewIfNeeded();
  if(lang==='ko'&&width!==1280)await card.screenshot({path:info.outputPath(`fixture-${count}-bins-${width}-closed.png`)});
  await details.locator('summary').focus();await page.keyboard.press('Enter');await expect(details).toHaveAttribute('open','');
  await expect(details.locator(':scope > ul').first().locator('li')).toHaveCount(6);
  await expect(details).toContainText('2026-07-11 / 2026-08-11');
  await expect(details).toContainText(String(count*2));
  expect(await details.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  if(lang==='ko'&&width===390)await card.screenshot({path:info.outputPath(`fixture-${count}-bins-${width}-expanded.png`)});
  await details.locator('summary').focus();await page.keyboard.press('Enter');await expect(details).not.toHaveAttribute('open','');
 }
 await expect(page.locator('.site-footer')).toContainText('KORETAIL');
 await expect(page.locator('.site-footer')).not.toContainText({ko:'모든 값은 공식',en:'Every value shown is published',zh:'所显示的数值均由官方机构发布',ja:'表示される値はすべて公式機関が発表'}[lang]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
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
