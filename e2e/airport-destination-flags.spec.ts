import {test,expect} from '@playwright/test';
import table from '../config/airport-destinations.v1.json' with {type:'json'};
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';

const date='2026-08-31';
const counts={JP:4,CN:3,US:2,KR:1,VN:1} as const;
const flights=Object.entries(counts).flatMap(([country,count])=>{
 const code=table.destinations.find(entry=>entry.country===country)!.iata;
 return Array.from({length:count},(_,index)=>({physicalFlightId:`${country}-${index}`,flightNumber:`TEST${country}${index}`,terminal:'T1',gate:'45',direction:'departure',scheduledAt:`${date}T09:10:00+09:00`,retrievedAt:`${date}T01:00:00Z`,status:'scheduled',airportCode:code}));
});
flights.push({...flights[0],physicalFlightId:'unknown',flightNumber:'TESTUNKNOWN',airportCode:'not-evidenced'});

for(const width of [320,390,430])test(`destination flags and all-country disclosure ${width}`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',basis:'COLLECTED_FLIGHT_RECORDS',flights,truncated:false,retrievedAt:flights[0].retrievedAt}}));
 await page.goto('/ko/airport?audience=staff&terminal=T1');
 const zone=page.getByTestId('map-zone-countries').locator('[data-side=WEST]');
 await expect(zone).toHaveAttribute('data-total','12');
 await expect(zone.locator('li[data-country=JP]')).toHaveAttribute('data-share','33.3');
 await expect(zone.locator('li[data-country=UNKNOWN]')).toHaveAttribute('data-share','8.3');
 await expect(zone.locator('li[data-country=CN]')).toContainText('중국행');
 await expect(zone.locator('li[data-country=UNKNOWN]')).toContainText('목적지 국가 미정');
 await expect(zone.locator('.airport-country-prism')).toHaveCount(0);
 for(const country of ['JP','CN','US'] as const){
  const image=zone.locator(`li[data-country=${country}] img`);
  await expect(image).toHaveAttribute('src',`/images/airport-flags/${country}.webp`);
  await expect.poll(()=>image.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBe(64);
 }
 const disclosure=zone.locator('details').last();
 await expect(disclosure).not.toHaveAttribute('open','');
 await expect(disclosure.locator('li')).toHaveCount(2);
 await disclosure.locator('summary').focus();await page.keyboard.press('Enter');
 await expect(disclosure).toHaveAttribute('open','');
 await expect(disclosure.locator('li[data-country=KR]')).toBeVisible();
 await expect(disclosure.locator('li[data-country=VN] img')).toHaveAttribute('src','/images/airport-flags/VN.webp');
 const koreanFlag=disclosure.locator('li[data-country=KR] img');
 await expect(koreanFlag).toHaveAttribute('src','/images/airport-flags/fallback/kr.svg');
 await expect.poll(()=>koreanFlag.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
 expect(await disclosure.locator('li').evaluateAll(rows=>rows.map(row=>row.getAttribute('data-country')))).toEqual(['KR','VN']);
 await zone.screenshot({path:`outputs/destination-countries-${width}.png`});
 await page.keyboard.press('Enter');await expect(disclosure).not.toHaveAttribute('open','');
 await page.keyboard.press('Enter');await expect(disclosure).toHaveAttribute('open','');
 const map=page.getByTestId('departure-map');
 await map.locator('.terminal-selector button').nth(2).click();await expect(zone).toHaveAttribute('data-total','0');
 await map.locator('.terminal-selector button').nth(1).click();await expect(zone).toHaveAttribute('data-total','12');
 await map.locator('[data-preset=CUSTOM]').click();await map.getByTestId('map-from').selectOption('11');await map.getByTestId('map-to').selectOption('12');
 await expect(zone).toHaveAttribute('data-total','0');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(errors).toEqual([]);
});
