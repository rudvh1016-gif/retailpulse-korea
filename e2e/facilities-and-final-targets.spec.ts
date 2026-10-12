import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import {mapCopy} from '../lib/airport-departure-map-copy';

const date='2026-08-31';
const flights=[['WEST239','T2','239'],['CENTER250','T2','250'],['EAST274','T2','274'],['UNKNOWN','T2',null],['CONCOURSE110','CONCOURSE','110']].map(([id,terminal,gate])=>({physicalFlightId:id,flightNumber:id,terminal,gate,airportCode:'NRT',airlineCode:'KE',direction:'departure',checkinCounter:'A B C D',status:'SCHEDULED',scheduledAt:`${date}T14:30:00+09:00`,retrievedAt:SUMMARY_FIXTURE.generatedAt}));

for(const lang of ['ko','en','zh','ja'] as const) for(const width of [360,390,430,1280]) {
 test(`facility and flight area ${lang} ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
  await page.route('**/api/live/flights*',routeSummary({mode:'live-flights',serviceDateKst:date,flights,truncated:false,retrievedAt:SUMMARY_FIXTURE.generatedAt}));
  await page.route('**/api/airport/facilities*',routeSummary({mode:'airport-facilities',facilities:[],hasMore:false}));
  await page.goto(`/${lang}/airport`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  await page.locator('.airport-context-nav button').nth(2).click();
  const zones=page.getByTestId('flight-zone-controls'),rows=page.locator('.flight-rows li');
  await expect(rows).toHaveCount(5);await expect(rows.filter({hasText:'WEST239'})).toContainText(mapCopy.side.WEST[lang]);
  const zoneBox=(await zones.boundingBox())!,controlBox=(await page.locator('.flight-board-controls').boundingBox())!;expect(zoneBox.y+zoneBox.height).toBeLessThanOrEqual(controlBox.y+1);const briefBox=(await page.locator('.flight-summary-area').boundingBox())!;expect(zoneBox.y+zoneBox.height).toBeLessThanOrEqual(briefBox.y+briefBox.height);expect(await page.locator('.flight-summary-area').evaluate(el=>getComputedStyle(el).borderBottomColor)).toBe('rgb(17, 17, 17)');
  await page.locator('#airport-data-flow button').nth(2).click();await expect(rows).toHaveCount(4);
  for(const [side,id] of [['WEST','WEST239'],['CENTER','CENTER250'],['EAST','EAST274']] as const) {
   await zones.getByRole('button',{name:mapCopy.side[side][lang],exact:true}).click();await expect(rows).toHaveCount(1);await expect(rows).toContainText(id);
  }
  await zones.getByRole('button',{name:mapCopy.side.UNVERIFIED[lang],exact:true}).click();await expect(rows).toContainText('UNKNOWN');
  await zones.locator('button').first().focus();await page.keyboard.press('Enter');await expect(rows).toHaveCount(4);await page.locator('#airport-data-flow button').first().click();await expect(rows).toHaveCount(5);
  await page.locator('.flight-search-field input').fill('CENTER250');await expect(rows).toHaveCount(1);
  await page.locator('.flight-search-field input').fill('NO-MATCH');await expect(rows).toHaveCount(0);await page.locator('.flight-search-field input').fill('');
  await page.locator('#airport-data-flow button').nth(2).click();await expect(rows).toHaveCount(4);await page.locator('#airport-data-flow button').first().click();await expect(rows).toHaveCount(5);
  await page.locator('.flight-direction button').nth(1).click();await expect(rows).toHaveCount(0);await page.locator('.flight-direction button').first().click();await expect(rows).toHaveCount(5);
  if(lang==='ko'&&width===390)await page.locator('.flight-board').screenshot({path:info.outputPath('flight-zones-390.png')});
  await page.locator('.airport-context-nav button').nth(3).click();await expect(page.getByTestId('airport-parking-guide')).toHaveCount(0);await expect(page.locator('a[href="https://www.airport.kr/ap_ko/955/subview.do"]')).toHaveCount(0);
  await page.goto(`/${lang}/myeongdong`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  await expect(page.getByTestId('seoul-facility-guide')).toHaveCount(0);
  await expect(page.locator('#live-signals-title')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect(errors).toEqual([]);
 });
}

test('Seoul facility removal preserves demand signals without requesting facility data',async({page})=>{
 let calls=0;await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));await page.route('**/data/seoul-toilets/*',route=>{calls++;return route.fulfill({status:503,json:{}});});
 for(const area of ['myeongdong','hongdae','seongsu','itaewon']){
  await page.goto(`/ko/${area}`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  await expect(page.getByTestId('seoul-facility-guide')).toHaveCount(0);await expect(page.getByTestId('seoul-toilets')).toHaveCount(0);await expect(page.getByTestId('seoul-lockers')).toHaveCount(0);
  await expect(page.locator('#live-signals-title')).toHaveText('오늘 수요를 움직이는 신호');
 }
 expect(calls).toBe(0);
});

test('business retains operational preparation and removes the NEXT promotion',async({page})=>{
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));await page.goto('/ko/business');await expect(page.getByTestId('business-prep')).toBeVisible();await expect(page.locator('.business-pro')).toHaveCount(0);await expect(page.locator('#pro-title')).toHaveCount(0);
});
