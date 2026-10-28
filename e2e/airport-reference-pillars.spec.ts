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
for(const lang of ['ko','en','zh','ja'] as const)for(const width of[360,390,430,1280])test(`removed passenger estimate stays absent while real terminal gate counts survive ${lang} ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page,lang);
 const reference=page.getByTestId('airport-top-reference');await expect(reference).toHaveCount(0);await expect(page.getByTestId('airport-reference-pillars')).toHaveCount(0);
 const model=page.getByTestId('airport-concept-model');await expect(model).toBeVisible();await expect(model).toHaveAttribute('data-denominator','10');
 for(const [building,count] of [['T1','5'],['T2','3'],['CONCOURSE','2']])await expect(model.locator(`.airport-concept-counts[data-building="${building}"]`)).toHaveAttribute('data-denominator',count);
 for(const side of ['EAST','WEST'])await expect(model.locator(`.airport-concept-counts[data-building=T1] [data-side=${side}] strong`).first()).toContainText('2');
 if(lang==='ko')await expect(page.getByRole('link',{name:'국가별 출발 구역 보기 ↗'})).toBeVisible();else await expect(page.getByTestId('map-zone-countries')).toBeVisible();await expect(page.locator('.airport-forecast')).toBeVisible();
 expect(await tofuCharacters(model)).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
 if(lang==='ko')await model.screenshot({path:info.outputPath(`real-gates-no-estimate-${width}.png`)});
});

test('unverified locations keep real source limits and original forecasts without passenger estimates',async({page})=>{
 await open(page,'en',[...flights,{...flights[7],physicalFlightId:'UNCONFIRMED',gate:''}]);await expect(page.getByTestId('airport-top-reference')).toHaveCount(0);
 await expect(page.locator('.airport-forecast')).toBeVisible();await expect(page.getByTestId('airport-concept-model')).toHaveAttribute('data-denominator','11');
 await page.unroute('**/api/live/summary*');await page.unroute('**/api/live/flights*');await open(page,'en',[...flights,{...flights[7],physicalFlightId:'UNKNOWN',terminal:'',gate:''}]);
 await expect(page.getByTestId('airport-reference-pillars')).toHaveCount(0);await expect(page.getByTestId('airport-concept-model')).toHaveAttribute('data-denominator','11');
});
test('real zero forecasts never restore the removed estimate or alter physical flight counts',async({page})=>{
 await open(page,'en',flights,true);await expect(page.getByTestId('airport-top-reference')).toHaveCount(0);await expect(page.locator('.reference-pillar')).toHaveCount(0);await expect(page.getByTestId('airport-concept-model')).toHaveAttribute('data-denominator','10');
});
