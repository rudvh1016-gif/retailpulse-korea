import { test, expect } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import { airportSides } from '../lib/airport-sides-summary';
import { chooseDate, expectDateSelection } from './date-selection';
import { tofuCharacters } from './font-glyphs';

const date='2026-08-31', stamp='2026-08-31T05:00:00Z';
const flights=(gates:Array<string|null>,day=date)=>gates.map((gate,index)=>({physicalFlightId:`MID${index}`,flightNumber:`KE${index+1}`,
 terminal:'T2',gate,airportCode:'NRT',airlineCode:'KE',direction:'departure',status:'scheduled',scheduledAt:`${day}T09:00:00+09:00`,retrievedAt:stamp}));
const source=(rows:ReturnType<typeof flights>,day=date)=>({mode:'live-flights',serviceDateKst:day,basis:'COLLECTED_FLIGHT_RECORDS',retrievedAt:stamp,flights:rows,truncated:false});
const summary=(rows:ReturnType<typeof flights>,day=date)=>({...SUMMARY_FIXTURE,serviceDateKst:day,airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:day,
 sides:airportSides(day,'TODAY',[],rows,[],false,false)}});
const pending={ko:'게이트 위치 확인 전',en:'Gate locations not yet confirmed',zh:'登机口位置尚未确认',ja:'搭乗口の位置は未確認'};

for(const lang of ['ko','en','zh','ja'] as const)for(const width of [360,390,430,1280])test(`missing gates preserve flights and official forecast, copy removed, airport weather follows halls ${lang} ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const rows=flights([null,null,null]);
 await page.route('**/api/live/summary*',routeSummary(summary(rows)));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:source(rows)}));
 await page.goto(`/${lang}/airport?terminal=T2`);
 const model=page.getByTestId('airport-concept-model');await expect(model).toHaveAttribute('data-denominator','3');
 await expect(model.getByTestId('model-gates-pending')).toContainText(pending[lang]);
 await expect(model.getByTestId('model-gates-pending')).toContainText('3');
 await expect(model.locator('.airport-concept-counts [data-side]')).toHaveCount(0);
 await expect(page.getByTestId('map-zone-countries').locator('.airport-zone-country-grid [data-side]')).toHaveCount(0);
 await expect(page.getByTestId('top-reference-T2-unavailable')).toHaveAttribute('data-reason','GATES_PENDING');
 await expect(page.locator('.airport-forecast')).toContainText('2,900');
 await expect(page.locator('.airport-view .view-intro p:not(.eyebrow)')).toHaveCount(0);
 await expect(page.locator('body')).not.toContainText(/오늘\(.*\) 인천공항 출국 예상 승객이 가장 많은 시간|Incheon Airport's busiest departure hour|仁川机场官方预告出境人数最多的时段|公式予告で出国者が最も多い時間/);
 const weather=page.getByTestId('airport-weather');await expect(weather).toHaveAttribute('data-state','UNAVAILABLE');
 expect(await weather.evaluate(node=>node.previousElementSibling?.classList.contains('airport-checkpoints'))).toBe(true);
 await expect(weather).not.toContainText(/°C|서울|Seoul|首尔|ソウル/);
 await expect(weather).toContainText({ko:'인천공항',en:'Incheon Airport',zh:'仁川机场',ja:'仁川空港'}[lang]);
 const details=page.getByTestId('country-unverified-details');await details.locator('summary').press('Enter');await expect(details).toHaveAttribute('open');
 await details.locator('summary').press('Space');await expect(details).not.toHaveAttribute('open');
 expect(await tofuCharacters(model)).toEqual([]);expect(await tofuCharacters(weather)).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
 if(lang==='ko'&&[390,1280].includes(width)){await model.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`midnight-model-${width}.png`)});await weather.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`airport-weather-${width}.png`)});}
});

test('mounted views refresh after TTL and focus, deduplicate and skip background polling',async({page})=>{
 await page.clock.install({time:new Date(SUMMARY_FIXTURE.generatedAt)});
 let gates:Array<string|null>=[null,null,null], reads=0;
 await page.route('**/api/live/summary*',r=>r.fulfill({json:summary(flights(gates))}));
 await page.route('**/api/live/flights*',r=>{reads++;return r.fulfill({json:source(flights(gates))});});
 await page.goto('/en/airport?terminal=T2');
 const model=page.getByTestId('airport-concept-model');await expect(model.getByTestId('model-gates-pending')).toBeVisible();expect(reads).toBe(1);
 gates=['215','252','291'];await page.clock.runFor(120_001);
 await expect(model.locator('.airport-concept-counts [data-side=WEST] strong')).toContainText('1');await expect(model.getByTestId('model-gates-pending')).toHaveCount(0);expect(reads).toBe(2);
 gates=['215','215','291'];await page.clock.runFor(6000);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(model.locator('.airport-concept-counts [data-side=WEST] strong')).toContainText('2');expect(reads).toBe(3);
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
 await page.clock.runFor(240_001);expect(reads).toBe(3);
 gates=['291','291','291'];await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));});
 await expect(model.locator('.airport-concept-counts [data-side=EAST] strong')).toContainText('3');expect(reads).toBe(4);
});

test('a slow old-date response cannot overwrite a newer selection',async({page})=>{
 await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));
 const old='2026-08-30';let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);
 let oldStarted=false;
 await page.route('**/api/live/summary*',r=>{const day=new URL(r.request().url()).searchParams.get('date')??date;return r.fulfill({json:summary(flights(['291'],day),day)});});
 await page.route('**/api/live/flights*',async r=>{const day=new URL(r.request().url()).searchParams.get('date')??date;if(day===old){oldStarted=true;await held;}await r.fulfill({json:source(flights(day===old?['215','215']:['291'],day),day)});});
 await page.goto('/en/airport?terminal=T2');await expect(page.getByTestId('airport-concept-model')).toHaveAttribute('data-denominator','1');
 await chooseDate(page,old);await expect.poll(()=>oldStarted).toBe(true);
 await chooseDate(page,date);await expectDateSelection(page,date);release();
 await expect(page.getByTestId('airport-concept-model')).toHaveAttribute('data-denominator','1');
 await expect(page.getByTestId('airport-concept-model').locator('[data-side=EAST] strong').first()).toContainText('1');
});

for(const lang of ['ko','en','zh','ja'] as const)for(const cause of ['SOURCE_MISMATCH','NO_SIDE_COMPARISON'])test(`reference cause is accurate with an available official forecast ${cause} ${lang}`,async({page})=>{
 await page.setViewportSize({width:390,height:900});
 const rows=flights(cause==='SOURCE_MISMATCH'?['215','252','291']:['252','252','252']);
 await page.route('**/api/live/summary*',routeSummary(summary(cause==='SOURCE_MISMATCH'?flights([null,null,null]):rows)));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:source(rows)}));
 await page.goto(`/${lang}/airport?terminal=T2`);
 const reference=page.getByTestId('top-reference-T2-unavailable');await expect(reference).toHaveAttribute('data-reason',cause);
 await expect(reference).not.toContainText(/공식 예상 승객 자료를 확인할 수 없어|official passenger forecast.*unavailable|最新的官方旅客预测|最新公式旅客予想/);
 await expect(page.locator('.airport-forecast')).toContainText('2,900');
 expect(await tofuCharacters(reference)).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
