import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
for(const lang of ['ko','en','zh','ja'])test(`T2 schedule survives an independently missing current record ${lang}`,async({page})=>{
 await page.setViewportSize({width:390,height:900});await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 const flight=(id:string,terminal:string,gate:string)=>({physicalFlightId:id,flightNumber:id,terminal,gate,direction:'departure',status:'scheduled',airportCode:'NRT',scheduledAt:'2026-08-31T09:00:00+09:00'});
 await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',serviceDateKst:'2026-08-31',basis:'COLLECTED_FLIGHT_RECORDS',retrievedAt:'2026-08-31T05:00:00Z',flights:[flight('T1GOOD','T1','9')],terminalFallbacks:{T2:{basis:'OFFICIAL_DEPARTURE_SCHEDULE',retrievedAt:'2026-08-30T13:00:00Z',truncated:false,flights:[flight('T2HELD','T2','250')]}}}}));
 await page.goto(`/${lang}/airport?terminal=T2`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await page.locator('.airport-context-nav').getByRole('button',{name:({ko:'항공편',en:'FLIGHTS',zh:'航班',ja:'フライト'} as Record<string,string>)[lang],exact:true}).click();await expect(page.getByTestId('planned-flight-basis')).toBeVisible();await expect(page.locator('.flight-rows')).toContainText('T2HELD');await expect(page.locator('.flight-rows')).not.toContainText('T1GOOD');await expect(page.locator('.flight-summary')).toHaveCount(0);expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
