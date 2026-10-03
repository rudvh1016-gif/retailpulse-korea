import {test,expect} from '@playwright/test';
import table from '../config/airport-destinations.v1.json' with {type:'json'};
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import {airportSides} from '../lib/airport-sides-summary';
import {tofuCharacters} from './font-glyphs';
const date='2026-08-31';
const destinations=[...new Map(table.destinations.map(entry=>[entry.country,entry])).values()];
const flights=destinations.map((entry,index)=>({physicalFlightId:'glyph'+index,flightNumber:'TEST'+index,terminal:'T1',gate:'1',direction:'departure',status:'scheduled',airportCode:entry.iata,scheduledAt:date+'T10:00:00+09:00',retrievedAt:date+'T01:00:00Z'}));
for(const lang of ['ko','en','zh','ja'] as const)test(`every verified destination country has readable glyphs and tied ranks ${lang}`,async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 const summary={...SUMMARY_FIXTURE,airport:{...SUMMARY_FIXTURE.airport,sides:airportSides(date,'TODAY',[],flights,[],false,false)}};
 await page.route('**/api/live/summary*',routeSummary(summary));await page.route('**/api/live/flights*',r=>r.fulfill({json:{mode:'live-flights',flights,truncated:false,retrievedAt:flights[0].retrievedAt}}));
 await page.goto(`/${lang}/airport?terminal=T1`);await page.getByTestId('airport-departure-overview').scrollIntoViewIfNeeded();const countries=page.getByTestId('map-zone-countries');await expect(countries).toBeVisible();
 await expect(countries.locator('li[data-country]')).toHaveCount(destinations.length);
 expect(await tofuCharacters(countries)).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 const domains=await countries.locator('svg').evaluateAll(nodes=>[...new Set(nodes.map(n=>n.getAttribute('data-domain-max')))]);expect(domains).toEqual(['1']);
});
