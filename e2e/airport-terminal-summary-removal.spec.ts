import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import {buildAirportFlightMonth,type MonthFlightRow} from '../lib/airport-monthly-flights';

const date='2026-10-10';
const summary={...SUMMARY_FIXTURE,todayKst:date,serviceDateKst:date,generatedAt:date+'T01:00:00Z',airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:date}};
const month=(value:string,t1:number,t2:number)=>{
 const day=value+'-01';
 const rows:MonthFlightRow[]=[...Array.from({length:t1},(_,i)=>({physicalFlightId:day+'t1'+i,terminal:'T1',gate:'1',airportCode:'NRT',operatingFlight:'KE703',scheduledAt:day+'T09:00:00+09:00',retrievedAt:day+'T01:00:00Z'})),...Array.from({length:t2},(_,i)=>({physicalFlightId:day+'t2'+i,terminal:'T2',gate:'274',airportCode:'NRT',operatingFlight:'KE705',scheduledAt:day+'T09:00:00+09:00',retrievedAt:day+'T01:00:00Z'}))];
 return buildAirportFlightMonth(value,date,rows,new Set([day]));
};
for(const terminal of ['T1','T2'] as const)for(const width of [390,1440])for(const flightsReady of [false,true])test(`only departure summary removed ${terminal} ${width} flights=${flightsReady}`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 await page.clock.setFixedTime(new Date(summary.generatedAt));
 await page.route('**/api/live/summary*',routeSummary(summary));
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:{status:'READY',month:new URL(route.request().url()).searchParams.get('month'),months:['2026-10','2026-09'],calculatedAt:summary.generatedAt,data:{asOf:date,months:[month('2026-10',2,3),month('2026-09',1,2),month('2026-08',1,1)]}}}));
 await page.route('**/api/live/flights*',route=>route.fulfill(flightsReady?{json:{mode:'live-flights',generatedAt:summary.generatedAt,serviceDateKst:date,retrievedAt:summary.generatedAt,truncated:false,flights:[{physicalFlightId:'today',terminal,gate:terminal==='T1'?'1':'274',airportCode:'NRT',operatingFlight:'KE703',direction:'departure',scheduledAt:date+'T12:00:00+09:00',retrievedAt:summary.generatedAt}]}}:{status:503,json:{status:'UNAVAILABLE'}}));
 await page.goto(`/ko/airport?terminal=${terminal}`);
 const section=page.getByTestId('airport-month-flights'),zones=section.getByTestId('airport-month-zones');
 await zones.scrollIntoViewIfNeeded();
 await expect(section.locator(':scope > h3,:scope > label,:scope > .airport-month-basis,:scope > .airport-month-total')).toHaveCount(0);
 await expect(zones.getByRole('heading',{name:'구역별 항공편 · 전월 비교'})).toBeVisible();
 await expect(zones.locator('caption')).toContainText('2026-10');
 await expect(zones.locator('tbody tr')).toHaveCount(4);
 const total=async()=> (await zones.locator('tbody td:nth-child(3)').allTextContents()).map(Number).reduce((sum,value)=>sum+value,0);
 expect(await total()).toBe(terminal==='T1'?2:3);
 const selection=zones.getByLabel('비교 월');await expect(selection).toHaveValue('2026-10');
 await selection.selectOption('2026-09');await expect(selection).toHaveValue('2026-09');
 await expect(zones.locator('caption')).toContainText('2026-09');
 await expect.poll(total).toBe(terminal==='T1'?1:2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await zones.screenshot({path:info.outputPath(`retained-zones-${terminal}-${width}-${flightsReady}.png`)});
});
