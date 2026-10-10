import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import {buildAirportFlightMonth,type MonthFlightRow} from '../lib/airport-monthly-flights';
import {AIRPORT_SIDES_VERSION} from '../lib/airport-sides';
import {DESTINATIONS_VERSION} from '../lib/airport-destinations';
const row=(day:string,id:string,terminal:string,gate:string):MonthFlightRow=>({physicalFlightId:id,terminal,gate,operatingFlight:'KE703',airportCode:'NRT',status:'scheduled',scheduledAt:day+'T09:00:00+09:00',retrievedAt:day+'T01:00:00Z'});
const summary={...SUMMARY_FIXTURE,todayKst:'2026-10-10',serviceDateKst:'2026-10-10',generatedAt:'2026-10-10T01:00:00Z',airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:'2026-10-10'}};
const reply=(month='2026-10')=>({status:'READY',month,months:['2026-10','2026-09'],calculatedAt:'2026-10-10T01:00:00Z',data:{version:1,asOf:'2026-10-10',sidesVersion:AIRPORT_SIDES_VERSION,destinationsVersion:DESTINATIONS_VERSION,months:[
 buildAirportFlightMonth('2026-10','2026-10-10',[row('2026-10-01','a','T2','274'),row('2026-10-01','b','T2','274'),row('2026-10-01','c','CONCOURSE','110')],new Set(['2026-10-01'])),
 buildAirportFlightMonth('2026-09','2026-10-10',[row('2026-09-01','d','T2','231'),row('2026-09-02','e','T2','274')],new Set(['2026-09-01','2026-09-02']))]}});
for(const lang of ['ko','en','zh','ja'] as const)for(const width of [360,390,430,1280])test(`daily-mean scope, complete lists and keyboard ${lang} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/live/summary*',routeSummary(summary));await page.route('**/api/live/airport-months*',route=>route.fulfill({json:reply()}));
 await page.goto(`/${lang}/airport`);const section=page.getByTestId('airport-month-flights');await section.scrollIntoViewIfNeeded();
 await expect(section).toContainText('2026-09-01–2026-09-30');await expect(section).toContainText('2/30');await expect(section).toContainText('1/9');
 await expect(section).toContainText('+200.0%');
 await section.locator('details').nth(1).locator('summary').focus();await page.keyboard.press('Enter');await expect(section.locator('details').nth(1)).toHaveAttribute('open','');
 await expect(section.locator('details').nth(1).locator('tbody tr')).toHaveCount(1);
 await page.getByRole('button',{name:'T2',exact:true}).first().click();await expect(section).toContainText('+100.0%');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});
test('a slower old month cannot replace a new selection; failures and zero baselines are explicit',async({page})=>{
 await page.route('**/api/live/summary*',routeSummary(summary));
 await page.route('**/api/live/airport-months*',async route=>{const month=new URL(route.request().url()).searchParams.get('month');if(month==='2026-09')await new Promise(resolve=>setTimeout(resolve,300));await route.fulfill({json:reply(month??undefined)});});
 await page.goto('/ko/airport');const section=page.getByTestId('airport-month-flights');await section.scrollIntoViewIfNeeded();await expect(section).toContainText('+200.0%');
 await section.locator('select').selectOption('2026-09');await section.locator('select').selectOption('2026-10');await expect(section.locator('select')).toHaveValue('2026-10');await expect(section).toContainText('+200.0%');
 await page.route('**/api/live/airport-months*',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE',data:null}}));await section.locator('select').selectOption('2026-09');await expect(section).toContainText('집계');await expect(section).not.toContainText('+200.0%');
});
