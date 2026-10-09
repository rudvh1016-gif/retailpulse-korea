import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import {mapCopy} from '../lib/airport-departure-map-copy';
import {tofuCharacters} from './font-glyphs';

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
  await page.locator('.airport-context-nav button').nth(3).click();const parking=page.getByTestId('airport-parking-guide');await parking.locator('summary').click();await expect(parking.getByRole('link')).toHaveAttribute('href','https://www.airport.kr/ap_ko/955/subview.do');
  await page.goto(`/${lang}/myeongdong`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  const guide=page.getByTestId('seoul-facility-guide'),toilets=guide.getByTestId('seoul-toilets');
  await expect(toilets).not.toHaveAttribute('open');await toilets.locator(':scope > summary').focus();await page.keyboard.press('Enter');await expect(toilets.locator('.facility-toilet-rows>li')).toHaveCount(10);
  await expect(toilets).toContainText('2026-10-09');await toilets.locator('.facility-search input').fill('중구문화원');await expect(toilets.locator('.facility-toilet-rows>li')).toHaveCount(1);
  await toilets.locator('.facility-toilet-rows summary').click();await expect(toilets).toContainText('37.56752138, 126.98652685');
  await toilets.locator('.facility-search input').fill('NO-MATCH');await expect(toilets.locator('.facility-toilet-rows>li')).toHaveCount(0);
  await toilets.locator('.facility-search input').fill('');await toilets.getByRole('button').click();await expect(toilets.locator('.facility-toilet-rows>li')).toHaveCount(30);
  const locker=guide.getByTestId('seoul-lockers');await locker.locator(':scope > summary').click();await expect(locker.getByRole('link')).toHaveAttribute('href',/OA-22731/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  if(lang==='ko'&&width===390){expect(await tofuCharacters(guide)).toEqual([]);await guide.screenshot({path:info.outputPath('seoul-facilities-390.png')});}
  expect(errors).toEqual([]);
 });
}

test('toilet failure is explicit and the list request stays lazy',async({page})=>{
 let calls=0;await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));await page.route('**/data/seoul-toilets/*',route=>{calls++;return route.fulfill({status:503,json:{}});});
 await page.goto('/ko/myeongdong');const guide=page.getByTestId('seoul-toilets');await expect(guide).toBeVisible();expect(calls).toBe(0);await guide.locator(':scope>summary').click();await expect(guide).toContainText('목록을 불러오지 못했습니다');expect(calls).toBe(1);await expect(guide.locator('.facility-toilet-rows')).toHaveCount(0);await expect(guide.getByRole('link')).toBeVisible();
});

test('business retains operational preparation and removes the NEXT promotion',async({page})=>{
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));await page.goto('/ko/business');await expect(page.getByTestId('business-prep')).toBeVisible();await expect(page.locator('.business-pro')).toHaveCount(0);await expect(page.locator('#pro-title')).toHaveCount(0);
});
