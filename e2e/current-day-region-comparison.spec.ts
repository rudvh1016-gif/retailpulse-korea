import {test,expect,type Page} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
import {buildAirportFlightMonth,AIRPORT_MONTH_VERSION} from '../lib/airport-monthly-flights';
import {AIRPORT_SIDES_VERSION} from '../lib/airport-sides';
import {DESTINATIONS_VERSION} from '../lib/airport-destinations';
const day='2026-11-01',at=day+'T00:00:00Z',now=day+'T01:00:00Z';
const row=(date:string,id:string,terminal:string,gate:string,airportCode:string)=>({physicalFlightId:id,operatingFlight:'KE100',flightNumber:'KE100',airlineCode:'KE',terminal,gate,airportCode,status:'scheduled',direction:'departure',scheduledAt:date+'T12:00:00+09:00',retrievedAt:at});
const dates=Array.from({length:31},(_,i)=>`2026-10-${String(i+1).padStart(2,'0')}`);
const previous=buildAirportFlightMonth('2026-10',day,dates.flatMap(d=>[row(d,d+'a','T1','10','NRT'),row(d,d+'b','CONCOURSE','110','PVG'),row(d,d+'c','T2','230','SFO')]),new Set(dates));
const flights=[row(day,'a','T1','10','NRT'),row(day,'b','T1','20','PEK'),row(day,'c','CONCOURSE','110','TPE'),row(day,'d','T2','230','NRT'),row(day,'e','T2','231','NRT'),row(day,'f','T2','274','PVG'),row(day,'g','T2','','ZZZ')];
async function prepare(page:Page,mismatch=false){
 await page.clock.setFixedTime(new Date(now));await page.emulateMedia({reducedMotion:'reduce'});
 const summary=structuredClone(SUMMARY_FIXTURE);Object.assign(summary,{generatedAt:now,todayKst:day,serviceDateKst:day,dayRelation:'TODAY'});summary.airport.serviceDateKst=day;
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{}}));await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:{mode:'live-flights',serviceDateKst:day,generatedAt:now,basis:'COLLECTED_FLIGHT_RECORDS',retrievedAt:at,truncated:false,flights}}));
 await page.route('**/api/live/airport-months*',r=>r.fulfill({json:{status:'READY',month:'2026-11',months:['2026-11','2026-10'],calculatedAt:at,data:{version:AIRPORT_MONTH_VERSION,asOf:day,sidesVersion:AIRPORT_SIDES_VERSION,destinationsVersion:DESTINATIONS_VERSION,months:[buildAirportFlightMonth('2026-11',day,[],new Set()),previous]}}}));
 await page.route('**/api/live/glance-week-reference*',r=>r.fulfill({json:{status:'READY',month:'2026-11',data:{day,previousDay:'2026-10-25',passengers:{all:null,T1:null,T2:null},flights:null,selectedFlights:{all:7,T1:2,T2:4,CONCOURSE:1},selectedFlightSnapshot:{day,retrievedAt:mismatch?day+'T00:01:00Z':at,provisional:true}}}}));
}
for(const lang of ['ko','en'])for(const width of [390,1440])test(`Nov 1 zones and shares use a provisional day vs 31 days ${lang} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await prepare(page);await page.goto(`/${lang}/airport-countries?mode=zones&date=${day}&building=T2`);
 const section=page.getByTestId('airport-month-flights');await section.scrollIntoViewIfNeeded();await expect(section.locator('.airport-month-total')).toContainText('1 → 4');
 await expect(section.getByTestId('airport-month-basis')).toContainText('31');await expect(section.getByTestId('current-period-collected')).toContainText('KST');
 const zones=section.getByTestId('airport-month-zones');await expect(zones.locator('thead')).toContainText(day);
 if(width===390){await expect(section.locator('.airport-month-zone-title')).toHaveCSS('font-size','15px');for(const summary of await section.locator(':scope > details > summary').all())await expect(summary).toHaveCSS('font-size','14px');await expect(zones.locator('tbody tr').first().locator('td').nth(1)).toHaveCSS('font-size','13px');}else await expect(section.locator('.airport-month-zone-title')).toHaveCSS('font-size','18px');
 const counts=await zones.locator('tbody tr td:nth-child(3)').allTextContents();expect(counts.map(Number).reduce((a,b)=>a+b,0)).toBe(4);
 const shares=section.locator('details').filter({has:page.locator('summary',{hasText:lang==='ko'?'동편·서편·중앙 항공편 비율':'East, west and centre flight shares'})});
 await shares.locator(':scope > summary').click();await expect(shares.locator('tbody tr').last().locator('td').nth(1)).toHaveText('25%');await expect(shares).toContainText('(3)');
 await expect(section).toContainText(lang==='ko'?'운항 확정 실적이 아닙니다':'not certified actual operations');
 for(const kind of ['destinationCountries','airlines','registrationCountries']){
  const detail=section.getByTestId(`month-list-${kind}`);await detail.locator(':scope > summary').click();await expect(detail).toHaveAttribute('open','');await expect(detail.locator('thead')).toContainText(day);
  if(kind==='destinationCountries'){const missing=detail.locator('tr[data-category=US]');await expect(missing.locator('td').nth(0)).toHaveText('1');await expect(missing.locator('td').nth(1)).toHaveText('—');}
  else{const dataRow=detail.locator('tbody tr').first();await expect(dataRow.locator('td').nth(0)).toHaveText('1');await expect(dataRow.locator('td').nth(1)).toHaveText('4');}
  await detail.locator(':scope > summary').click();
 }
 const dates=section.locator('details').filter({has:page.locator('.airport-month-period')});await dates.locator(':scope > summary').click();await expect(dates).toContainText('31/31');await expect(dates).toContainText('1/1');await expect(dates).toContainText('2026-11-01 ~ 2026-11-01');
 await expect(shares.getByTestId('current-share-denominators')).toContainText('31');await expect(shares.getByTestId('current-share-denominators')).toContainText('4');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await section.screenshot({path:`test-results/current-day-zones-${lang}-${width}.png`});
});
for(const lang of ['ko','zh'])for(const width of [390,1440])test(`country detail uses the same witnessed day and withholds unknown absences ${lang} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await prepare(page);await page.goto(`/${lang}/airport-countries?mode=flights&period=monthly&date=${day}`);
 const panel=page.locator('.cfp-panel');await panel.scrollIntoViewIfNeeded();await expect(panel.locator('.cfp-total strong')).toHaveText('3 → 7');await expect(panel.locator('.cfp-coverage-note')).toContainText(day);
 const jp=panel.locator('li[data-country=JP]');await expect(jp.locator('[data-period=current] strong')).toHaveText('3');await expect(jp.locator('[data-period=previous] strong')).toHaveText('1');
 await expect(panel.locator('li[data-country=US] [data-period=current] strong')).toHaveText('—');await expect(panel.locator('li[data-country=US] [data-period=previous] strong')).toHaveText('1');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await panel.screenshot({path:`test-results/current-day-countries-${lang}-${width}.png`});
});
test('a different snapshot never becomes zero flights in the zone comparison',async({page})=>{
 await prepare(page,true);await page.goto(`/ko/airport-countries?mode=zones&date=${day}&building=T2`);const section=page.getByTestId('airport-month-flights');await section.scrollIntoViewIfNeeded();await expect(section).toContainText('미확인 자료는 0으로 계산하지 않습니다');await expect(section.locator('.airport-month-total')).toHaveCount(0);
});

test('the default airport view uses the witnessed day without a date query',async({page})=>{await prepare(page);await page.goto('/ko/airport');const section=page.getByTestId('airport-month-flights');await section.scrollIntoViewIfNeeded();await expect(section.locator('.airport-month-total')).toContainText('3 → 7');await expect(section.getByTestId('airport-month-basis')).toContainText(day);});
