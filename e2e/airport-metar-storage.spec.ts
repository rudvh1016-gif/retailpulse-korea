import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import {tofuCharacters} from './font-glyphs';
import {airportMetarProjection,verifiedStoredMetarAttempt} from '../lib/airport-metar-observation';
const clock='2026-10-09T02:48:00Z';
const proof=JSON.parse(readFileSync(new URL('../docs/reviews/metar-connection-20261009/connection-proof.json',import.meta.url),'utf8'));
const good=verifiedStoredMetarAttempt({status:'OK',retrievedAt:'2026-10-09T02:47:54Z',observation:{...proof.actualObservation,sourceId:'KMA_RKSI_METAR',reportType:'METAR',measurementScope:'GROUND_OBSERVATION',turbulenceRisk:'NOT_INFERRED'}})!;
const snapshot={mode:'airport-metar',storage:'READY',generatedAt:clock,...airportMetarProjection(good,good,clock)};
const flights={mode:'live-flights',serviceDateKst:SUMMARY_FIXTURE.serviceDateKst,flights:[],truncated:false};
const weatherSummary={...SUMMARY_FIXTURE,generatedAt:clock};
for(const lang of ['ko','en','zh','ja'] as const)for(const width of [360,390,430,1280])test(`cancelled airport weather stays absent and halls work ${lang}/${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.clock.setFixedTime(new Date(clock));await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/api/live/summary*',routeSummary(weatherSummary));await page.route('**/api/live/flights*',r=>r.fulfill({json:flights}));
 let reads=0;await page.route('**/api/airport/weather',r=>{reads++;return r.fulfill({json:snapshot});});
 await page.goto(`/${lang}/airport?terminal=T2`);
 const halls=page.locator('.airport-checkpoints');await expect(halls).toBeVisible();
 await expect(page.getByTestId('airport-weather')).toHaveCount(0);
 await expect(page.locator('.airport-forecast')).toContainText('2,900');
 await expect(halls).toContainText('T2');
 const toggle=halls.getByRole('button');await expect(toggle).toHaveAttribute('aria-expanded','false');
 await toggle.press('Enter');await expect(toggle).toHaveAttribute('aria-expanded','true');
 expect(await toggle.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
 await toggle.press('Space');await expect(toggle).toHaveAttribute('aria-expanded','false');
 expect(await tofuCharacters(halls)).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(reads).toBe(0);expect(errors).toEqual([]);
});
for(const state of ['missing','failed','malformed','stale','zero','unknown'] as const)test(`cancelled weather ${state} is not requested or rendered`,async({page})=>{
 await page.setViewportSize({width:390,height:900});await page.clock.setFixedTime(new Date(clock));
 await page.route('**/api/live/summary*',routeSummary(weatherSummary));await page.route('**/api/live/flights*',r=>r.fulfill({json:flights}));
 let body:Record<string,unknown>=structuredClone(snapshot);
 if(state==='missing')body={...body,observation:null,status:'MISSING'};
 if(state==='malformed')body={...body,observation:{unexpected:true}};
 if(state==='stale')body.status='STALE';
 const observed=body.observation as NonNullable<typeof good.observation>;
 if(state==='zero')observed.measurements.meanWindSpeed!.value=0;
 if(state==='unknown')delete observed.measurements.meanWindSpeed;
 let reads=0;await page.route('**/api/airport/weather',r=>{reads++;return state==='failed'?r.abort('failed'):r.fulfill({json:body});});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/en/airport');
 await expect(page.locator('.airport-checkpoints')).toBeVisible();
 await expect(page.getByTestId('airport-weather')).toHaveCount(0);expect(reads).toBe(0);
 expect(errors).toEqual([]);
});
test('cancelled airport weather is not mounted or polled as time passes',async({page})=>{
 await page.clock.install({time:new Date(clock)});await page.route('**/api/live/summary*',r=>r.fulfill({json:weatherSummary}));await page.route('**/api/live/flights*',r=>r.fulfill({json:flights}));
 let reads=0;await page.route('**/api/airport/weather',r=>{reads++;return r.fulfill({json:snapshot});});await page.goto('/en/airport');
 await expect(page.locator('.airport-checkpoints')).toBeVisible();await expect(page.getByTestId('airport-weather')).toHaveCount(0);
 await page.clock.fastForward(73*60000);await expect(page.getByTestId('airport-weather')).toHaveCount(0);expect(reads).toBe(0);
});
test('wrong device time does not restore cancelled airport weather',async({page})=>{
 await page.clock.install({time:new Date(clock)});await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));await page.route('**/api/live/flights*',r=>r.fulfill({json:flights}));
 let reads=0;await page.route('**/api/airport/weather',r=>{reads++;return r.fulfill({json:snapshot});});await page.goto('/en/airport');
 await expect(page.locator('.airport-checkpoints')).toBeVisible();await expect(page.getByTestId('airport-weather')).toHaveCount(0);
 await page.clock.fastForward(73*60000);await expect(page.getByTestId('airport-weather')).toHaveCount(0);expect(reads).toBe(0);
});
for(const [area,lang,width]of [['myeongdong','ko',390],['hongdae','en',360],['seongsu','zh',430],['itaewon','ja',1280]] as const)test(`approved Seoul model mount ${area}/${lang}/${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));await page.goto(`/${lang}/${area}`);
 const models=page.getByTestId('seoul-flow-models');await expect(models).toHaveAttribute('data-area',area);await expect(models.locator('img')).toHaveCount(3);
 for(const image of await models.locator('img').all()){await image.scrollIntoViewIfNeeded();await image.evaluate(el=>(el as HTMLImageElement).decode());await expect(image).toHaveAttribute('loading','lazy');await expect(image).toHaveAttribute('alt','');}
 expect(await tofuCharacters(models)).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
