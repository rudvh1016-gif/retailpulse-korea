import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import {airportSides} from '../lib/airport-sides-summary';
import {tofuCharacters} from './font-glyphs';

const date='2026-08-31',stamp='2026-08-31T05:00:00Z';
const flights=[['T1','5'],['T1','5'],['T1','29'],['T1','29'],['T1','26'],['','121'],['','121'],['T2','215'],['T2','291'],['T2','252']].map(([terminal,gate],i)=>({physicalFlightId:`P${i}`,flightNumber:`TEST${i}`,terminal,gate,direction:'departure',status:'scheduled',airportCode:'NRT',scheduledAt:`${date}T09:00:00+09:00`,retrievedAt:stamp}));
async function open(page:import('@playwright/test').Page,lang='ko',rows=flights,zero=false){
 const airport={...SUMMARY_FIXTURE.airport,sides:airportSides(date,'TODAY',[],rows,[],false,false),passengerForecastTimelineByTerminal:{T1:[{expectedPassengers:zero?0:35500}],T2:[{expectedPassengers:zero?0:17750}]}};
 await page.route('**/api/live/summary*',routeSummary({...SUMMARY_FIXTURE,airport}));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:{mode:'live-flights',serviceDateKst:date,basis:'COLLECTED_FLIGHT_RECORDS',retrievedAt:stamp,truncated:false,flights:rows}}));
 await page.goto(`/${lang}/airport`);
}
for(const lang of ['ko','en','zh','ja'] as const)for(const width of[360,390,430,1280])test(`Blender pillars use current estimates, separate denominators and equal heights for ties ${lang} ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page,lang);
 const reference=page.getByTestId('airport-top-reference');await expect(reference).toHaveAttribute('data-state','READY');await expect(reference.getByTestId('airport-reference-pillars')).toHaveCount(2);
 const t1=reference.getByTestId('top-reference-T1');const t2=reference.getByTestId('top-reference-T2');
 await expect(t1.locator('[data-zone=CONCOURSE]')).toContainText('2');
 const e=t1.locator('[data-zone=EAST]'),w=t1.locator('[data-zone=WEST]');expect(await e.getAttribute('data-raw-value')).toEqual(await w.getAttribute('data-raw-value'));expect(await e.getAttribute('data-height')).toEqual(await w.getAttribute('data-height'));
 const cells=await reference.locator('.reference-pillar-list>li').all();for(const cell of cells){const height=Number(await cell.getAttribute('data-height'));const bar=await cell.locator('.reference-pillar').boundingBox();expect(Math.abs(bar!.height-height)).toBeLessThan(1);}
 expect(await t1.getByTestId('airport-reference-pillars').getAttribute('data-scale-max')).toEqual(await t2.getByTestId('airport-reference-pillars').getAttribute('data-scale-max'));
 await t1.locator('summary').focus();await page.keyboard.press('Enter');await expect(t1.locator('details')).toHaveAttribute('open');await expect(t1).toContainText('35,500');
 expect(await tofuCharacters(reference)).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
 if(lang==='ko'){await t1.locator('summary').press('Space');await expect(t1.locator('details')).not.toHaveAttribute('open');await reference.screenshot({path:info.outputPath(`reference-pillars-${width}.png`)});}
});
test('an unverified gate or unknown building withholds estimates, while original forecasts survive',async({page})=>{
 await open(page,'en',[...flights,{...flights[7],physicalFlightId:'UNCONFIRMED',gate:''}]);const ref=page.getByTestId('airport-top-reference');
 await expect(ref.getByTestId('top-reference-T2-unavailable')).toHaveAttribute('data-reason','UNVERIFIED_LOCATION');await expect(ref.getByTestId('top-reference-T1')).toBeVisible();await expect(ref.getByTestId('top-reference-T2')).toHaveCount(0);await expect(page.locator('.airport-forecast')).toBeVisible();
 await page.unroute('**/api/live/summary*');await page.unroute('**/api/live/flights*');await open(page,'en',[...flights,{...flights[7],physicalFlightId:'UNKNOWN',terminal:'',gate:''}]);
 await expect(ref.getByTestId('airport-reference-pillars')).toHaveCount(0);await expect(ref).toHaveAttribute('data-state','UNAVAILABLE');
});
test('a real zero forecast renders zero labels with no fabricated minimum-height pillars',async({page})=>{
 await open(page,'en',flights,true);const ref=page.getByTestId('airport-top-reference');await expect(ref).toHaveAttribute('data-state','READY');await expect(ref.locator('.reference-pillar')).toHaveCount(0);await expect(ref.locator('.reference-pillar-value')).toHaveText(Array(7).fill('0 people'));
});
