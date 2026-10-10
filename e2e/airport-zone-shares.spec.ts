import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import {tofuCharacters} from './font-glyphs';

for(const lang of ['ko','en','zh','ja']) for(const width of [360,390,430,1280]) {
 test(`zone total and country zone denominator ${lang} ${width}`,async({page})=>{
  await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const flights=['215','215','252','291','999'].map((gate,i)=>({physicalFlightId:`share-${i}`,flightNumber:`TEST${i}`,terminal:'T2',gate,direction:'departure',scheduledAt:'2026-08-31T09:10:00+09:00',retrievedAt:'2026-08-31T03:00:00Z',status:'scheduled',airportCode:i===1?'HKG':'NRT'}));
  for(const [terminal,gates] of [['T1',['45','45','27','3','']],['CONCOURSE',['103','128','114']],['UNKNOWN',['']]] as const) for(const gate of gates){const i=flights.length;flights.push({...flights[0],physicalFlightId:`share-${i}`,flightNumber:`TEST${i}`,terminal,gate});}
  await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));let reads=0;
  await page.route('**/api/live/flights*',r=>{reads++;return r.fulfill({json:{mode:'live-flights',basis:'COLLECTED_FLIGHT_RECORDS',flights,truncated:false,retrievedAt:'2026-08-31T03:00:00Z'}});});
  await page.goto(`/${lang}/airport?terminal=T2`);
  const model=page.getByTestId('airport-concept-model');await expect(model).toHaveAttribute('data-denominator','5');
  await expect(model.getByTestId('zone-range-EAST')).toHaveText('(253–270, 273–291)');
  await expect(model.locator('.airport-concept-counts [data-side=WEST] small')).toHaveText('40.0%');
  for(const side of ['CENTER','EAST']) await expect(model.locator(`.airport-concept-counts [data-side=${side}] small`)).toHaveText('20.0%');
  await expect(model.getByTestId('model-unverified-share')).toContainText('20.0%');
  const west=page.getByTestId('map-zone-countries').locator('.airport-zone-country-grid > [data-side=WEST]');
  await expect(west.locator('li[data-country=JP]')).toHaveAttribute('data-share','50.0');
  await expect(west.locator('li[data-country=HK]')).toHaveAttribute('data-share','50.0');
  expect(await tofuCharacters(model)).toEqual([]);
  for(const [index,total,westShare,centerShare] of [[0,14,'35.7%','21.4%'],[1,5,'40.0%','20.0%'],[3,3,'33.3%','33.3%'],[2,5,'40.0%','20.0%'],[0,14,'35.7%','21.4%'],[2,5,'40.0%','20.0%']] as const){
   await page.locator('.terminal-selector button').nth(index).click();
   await expect(model).toHaveAttribute('data-denominator',String(total));
   if(index===0){
    await expect(model.locator('.airport-concept-counts')).toHaveCount(3);
    for(const [building,n,w,c]of[['T1',5,'40.0%','20.0%'],['T2',5,'40.0%','20.0%'],['CONCOURSE',3,'33.3%','33.3%']] as const){const row=model.locator(`.airport-concept-counts[data-building=${building}]`);await expect(row).toHaveAttribute('data-denominator',String(n));await expect(row.locator('[data-side=WEST] small')).toHaveText(w);await expect(row.locator('[data-side=CENTER] small')).toHaveText(c);}
   }else{
    if(westShare)await expect(model.locator('.airport-concept-counts [data-side=WEST] small')).toHaveText(westShare);
    if(centerShare)await expect(model.locator('.airport-concept-counts [data-side=CENTER] small')).toHaveText(centerShare);
   }
   if(!total)await expect(model.locator('.airport-concept-counts small').first()).not.toContainText('%');
  }
  const map=page.getByTestId('departure-map');await map.locator('[data-preset=CUSTOM]').click();await map.getByTestId('map-from').selectOption('10');await map.getByTestId('map-to').selectOption('11');
  await expect(model).toHaveAttribute('data-denominator','0');
  await expect(model.locator('.airport-concept-counts small').first()).not.toContainText('%');
  expect(reads).toBe(1);expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 });
}

test('missing retrieval is unavailable, not a confirmed zero',async({page})=>{
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:{mode:'live-flights',basis:'COLLECTED_FLIGHT_RECORDS',flights:[],truncated:false,retrievedAt:null}}));
 await page.goto('/en/airport?terminal=T2');
 await expect(page.getByTestId('map-unavailable')).toContainText('not a confirmed zero');
 await expect(page.getByTestId('airport-concept-model')).toHaveCount(0);
});
