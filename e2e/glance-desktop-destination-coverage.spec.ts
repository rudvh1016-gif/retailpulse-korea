import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';

const destinations=[['JP','NRT'],['CN','PVG'],['US','SFO'],['VN','HAN'],['TH','BKK'],['SG','SIN'],['TW','TPE'],['MY','KUL'],['ID','CGK'],['PH','MNL'],['HK','HKG'],['AU','SYD'],['NZ','AKL'],['DE','FRA'],['FR','CDG'],['GB','LHR'],['CA','YYZ'],['AE','DXB']] as const;
for(const lang of ['ko','en','zh','ja'])for(const width of [390,999,1000,1440])test(`destination coverage uses desktop space without changing compact lists ${lang} ${width}`,async({page},info)=>{
 const summary=structuredClone(SUMMARY_FIXTURE),day=summary.serviceDateKst,at=summary.generatedAt;
 const counts=destinations.map((_,index)=>index===6?13:18-index);
 const rows=destinations.flatMap(([,airportCode],index)=>Array.from({length:counts[index]},(_,n)=>({physicalFlightId:`coverage-${index}-${n}`,operatingFlight:`KE${index*100+n}`,flightNumber:`KE${index*100+n}`,airlineCode:'KE',terminal:'T2',gate:'230',airportCode:String(airportCode),status:'scheduled',direction:'departure',scheduledAt:`${day}T12:00:00+09:00`,retrievedAt:at})));
 rows.push({...rows[0],physicalFlightId:'unknown',operatingFlight:'KE9999',flightNumber:'KE9999',airportCode:'ZZZ'});
 await page.clock.setFixedTime(new Date(at));await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 let flightReads=0;await page.route('**/api/**',r=>r.fulfill({status:503,json:{}}));await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));
 await page.route('**/api/live/flights*',r=>{flightReads++;return r.fulfill({json:{mode:'live-flights',serviceDateKst:day,generatedAt:at,basis:'COLLECTED_FLIGHT_RECORDS',retrievedAt:at,truncated:false,flights:rows}});});
 await page.goto(`/${lang}?date=${day}`);
 const panel=page.locator('.glance-destinations');await panel.scrollIntoViewIfNeeded();
 const visible=panel.locator('li:visible'),expected=[...(width>=1000?destinations:destinations.slice(0,7)).map(([country])=>country),'UNKNOWN'];
 await expect(visible).toHaveCount(expected.length);expect(await visible.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-country')))).toEqual(expected);
 for(const [index,[country]] of destinations.entries()){
  const row=panel.locator(`li[data-country=${country}]`);
  await expect(row.locator(':scope>span').nth(1)).toContainText(String(counts[index]));
  await expect(row.locator(':scope>strong')).toHaveText(new Intl.NumberFormat(lang,{maximumFractionDigits:0}).format(counts[index]/rows.length*100)+'%');
 }
 for(const row of await visible.all()){
  const bounds=await row.boundingBox();expect(bounds!.width).toBeGreaterThan(0);
  for(const child of await row.locator(':scope>span,:scope>strong').all()){const box=await child.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(bounds!.x-1);expect(box!.x+box!.width).toBeLessThanOrEqual(bounds!.x+bounds!.width+1);}
 }
 await expect(panel.locator('.glance-detail-link')).toContainText('(18)');expect(flightReads).toBeLessThanOrEqual(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 if(lang==='ko'&&(width===390||width===1440))await panel.screenshot({path:info.outputPath('destination-coverage.png')});
});
