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
for(const lang of ['ko','en','zh','ja'] as const)for(const width of [360,390,430,1280])test(`stored RKSI weather below halls ${lang}/${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.clock.setFixedTime(new Date(clock));await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/api/live/summary*',routeSummary(weatherSummary));await page.route('**/api/live/flights*',r=>r.fulfill({json:flights}));
 let reads=0;await page.route('**/api/airport/weather',r=>{reads++;return r.fulfill({json:snapshot});});
 await page.goto(`/${lang}/airport?terminal=T2`);
 const weather=page.getByTestId('airport-weather');await expect(weather).toHaveAttribute('data-state','CURRENT');
 expect(await weather.evaluate(node=>node.previousElementSibling?.classList.contains('airport-checkpoints'))).toBe(true);
 await expect(weather).toContainText('6 kt');await expect(weather).toContainText('22 °C');await expect(weather).toContainText('11:30');await expect(weather).toContainText('KST');
 await weather.scrollIntoViewIfNeeded();const details=weather.locator('details');await details.locator('summary').focus();await page.keyboard.press('Enter');await expect(details).toHaveAttribute('open');
 await expect(details).toContainText('290°');await expect(details).toContainText('1,024 hPa');await expect(details).toContainText('15 °C');
 await expect(details.locator('a')).toHaveAttribute('href','https://www.data.go.kr/data/15059455/openapi.do');
 expect(await details.locator('summary').evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
 await page.keyboard.press('Space');await expect(details).not.toHaveAttribute('open');
 expect(await tofuCharacters(weather)).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(reads).toBe(1);expect(errors).toEqual([]);
});
for(const state of ['missing','failed','malformed','stale','zero','unknown'] as const)test(`stored weather ${state} preserves truth boundaries`,async({page})=>{
 await page.setViewportSize({width:390,height:900});await page.clock.setFixedTime(new Date(clock));
 await page.route('**/api/live/summary*',routeSummary(weatherSummary));await page.route('**/api/live/flights*',r=>r.fulfill({json:flights}));
 let body:Record<string,unknown>=structuredClone(snapshot);
 if(state==='missing')body={...body,observation:null,status:'MISSING'};
 if(state==='malformed')body={...body,observation:{unexpected:true}};
 if(state==='stale')body.status='STALE';
 const observed=body.observation as NonNullable<typeof good.observation>;
 if(state==='zero')observed.measurements.meanWindSpeed!.value=0;
 if(state==='unknown')delete observed.measurements.meanWindSpeed;
 await page.route('**/api/airport/weather',r=>state==='failed'?r.abort('failed'):r.fulfill({json:body}));
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/en/airport');const weather=page.getByTestId('airport-weather');
 await expect(weather).toHaveAttribute('data-state',['missing','failed','malformed'].includes(state)?'UNAVAILABLE':state==='stale'?'STALE':'CURRENT');
 if(['missing','failed','malformed'].includes(state)){await expect(weather).toContainText('Incheon Airport is unavailable');await expect(weather).not.toContainText('22 °C');}
 if(state==='stale')await expect(weather).toContainText('Older observation');
 if(state==='zero')await expect(weather).toContainText('0 kt');
 if(state==='unknown')await expect(weather.locator('dl').first().locator('dd').first()).toHaveText('—');
 expect(errors).toEqual([]);
});
test('browser freshness expires without inventing a new observation or requesting upstream',async({page})=>{
 await page.clock.install({time:new Date(clock)});await page.route('**/api/live/summary*',r=>r.fulfill({json:weatherSummary}));await page.route('**/api/live/flights*',r=>r.fulfill({json:flights}));
 let reads=0;await page.route('**/api/airport/weather',r=>{reads++;return r.fulfill({json:snapshot});});await page.goto('/en/airport');
 const weather=page.getByTestId('airport-weather');await expect(weather).toHaveAttribute('data-state','CURRENT');
 await page.clock.fastForward(73*60000);await expect(weather).toHaveAttribute('data-state','STALE');await expect(weather).toContainText('11:30');expect(reads).toBe(1);
});
test('server observation freshness stays correct with a fixed wrong device clock',async({page})=>{
 await page.clock.install({time:new Date(clock)});await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));await page.route('**/api/live/flights*',r=>r.fulfill({json:flights}));
 let reads=0;await page.route('**/api/airport/weather',r=>{reads++;return r.fulfill({json:snapshot});});await page.goto('/en/airport');
 const weather=page.getByTestId('airport-weather');await expect(weather).toHaveAttribute('data-state','CURRENT');
 await page.clock.fastForward(73*60000);await expect(weather).toHaveAttribute('data-state','STALE');await expect(weather).toContainText('11:30');expect(reads).toBe(1);
});
for(const [area,lang,width]of [['myeongdong','ko',390],['hongdae','en',360],['seongsu','zh',430],['itaewon','ja',1280]] as const)test(`approved Seoul model mount ${area}/${lang}/${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));await page.goto(`/${lang}/${area}`);
 const models=page.getByTestId('seoul-flow-models');await expect(models).toHaveAttribute('data-area',area);await expect(models.locator('img')).toHaveCount(3);
 for(const image of await models.locator('img').all()){await image.scrollIntoViewIfNeeded();await image.evaluate(el=>(el as HTMLImageElement).decode());await expect(image).toHaveAttribute('loading','lazy');await expect(image).toHaveAttribute('alt','');}
 expect(await tofuCharacters(models)).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
