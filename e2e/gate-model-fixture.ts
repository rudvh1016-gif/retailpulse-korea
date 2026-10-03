import type { Page } from '@playwright/test';

export async function routeGateFlights(page: Page) {
  // Full flight API fixture, deliberately independent of the top-five summary.
  const flights = [['T1','27',18],['T1','29',12],['T2','252',14]].flatMap(([terminal,gate,count]) => Array.from({length:Number(count)},(_,i) => ({physicalFlightId:`${terminal}-${gate}-${i}`,flightNumber:`TEST${gate}${i}`,terminal,gate,direction:'departure',scheduledAt:'2026-08-31T09:00:00+09:00',retrievedAt:'2026-08-31T03:00:00Z',status:'scheduled'})));
  await page.route('**/api/live/flights*', route => route.fulfill({contentType:'application/json',body:JSON.stringify({mode:'live-flights',basis:'COLLECTED_FLIGHT_RECORDS',flights,truncated:false,retrievedAt:'2026-08-31T03:00:00Z'})}));
}
