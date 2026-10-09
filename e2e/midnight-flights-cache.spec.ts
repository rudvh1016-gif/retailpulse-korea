import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
test('a fixed tomorrow selection refreshes held flights immediately at KST midnight',async({page})=>{
 await page.clock.install({time:new Date('2026-10-09T14:59:59Z')});let rolled=false;const dayKeys:string[]=[];
 await page.route('**/api/live/summary*',route=>{const data=structuredClone(SUMMARY_FIXTURE);data.todayKst=rolled?'2026-10-10':'2026-10-09';data.serviceDateKst='2026-10-10';data.generatedAt=rolled?'2026-10-09T15:00:01Z':'2026-10-09T14:59:59Z';data.dayRelation=rolled?'TODAY':'FUTURE';data.airport.serviceDateKst=data.serviceDateKst;return route.fulfill({json:data});});
 await page.route('**/api/live/flights*',route=>{dayKeys.push(new URL(route.request().url()).searchParams.get('_day')??'');return route.fulfill({json:{mode:'live-flights',serviceDateKst:'2026-10-10',basis:rolled?'COLLECTED_FLIGHT_RECORDS':'OFFICIAL_DEPARTURE_SCHEDULE',retrievedAt:rolled?'2026-10-09T15:00:01Z':'2026-10-09T13:00:00Z',truncated:false,flights:[{physicalFlightId:'midnight-fixture',flightNumber:rolled?'CURRENT1':'HELD1',terminal:'T2',gate:'250',direction:'departure',status:'scheduled',airportCode:'NRT',scheduledAt:'2026-10-10T09:00:00+09:00'}]}});});
 await page.goto('/ko/airport?date=2026-10-10&terminal=T2');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');await expect.poll(()=>dayKeys.includes('2026-10-09')).toBe(true);
 rolled=true;await page.clock.runFor(2100);await expect.poll(()=>dayKeys.includes('2026-10-10')).toBe(true);await expect(page.getByTestId('departure-map')).toHaveCount(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
