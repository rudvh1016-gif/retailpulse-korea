import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import {airportSides} from '../lib/airport-sides-summary';
const date='2026-08-31',stamp='2026-08-31T05:00:00Z';
const rows=[['T1','5'],['T1','29'],['T1','26'],['CONCOURSE','121'],['T2','215'],['T2','291'],['T2','252'],['T2','']].map(([terminal,gate],i)=>({physicalFlightId:`current-${i}`,flightNumber:`TEST${i}`,terminal,gate,direction:'departure',status:'scheduled',airportCode:'NRT',scheduledAt:`${date}T09:00:00+09:00`,retrievedAt:stamp}));
const heading={ko:'터미널별 구역 승객 추정',en:'Passenger estimates by terminal and zone',zh:'各航站楼分区旅客估算',ja:'ターミナル別・区域別の旅客推定'};
for(const width of [360,390,430,1280])for(const lang of ['ko','en','zh','ja'] as const)test(`all selection preserves separate T1/T2 state and its own source ${lang} ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.clock.setFixedTime(new Date(`${date}T05:10:00Z`));await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const airport={...SUMMARY_FIXTURE.airport,sides:airportSides(date,'TODAY',[],rows,[],false,false),passengerForecastTimelineByTerminal:{T1:[{expectedPassengers:4000}],T2:[{expectedPassengers:3000}]}};
 await page.route('**/api/live/summary*',routeSummary({...SUMMARY_FIXTURE,airport}));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:{mode:'live-flights',serviceDateKst:date,basis:'COLLECTED_FLIGHT_RECORDS',retrievedAt:stamp,truncated:false,flights:rows}}));
 await page.goto(`/${lang}/airport`);const ref=page.getByTestId('airport-top-reference');
 await expect(ref).toHaveAttribute('data-scope','all');await expect(ref).toHaveAttribute('data-state','PARTIAL');await expect(ref.getByTestId('top-reference-heading')).toContainText(heading[lang]);await expect(ref.getByTestId('top-reference-heading')).toContainText('T1·T2');
 const t1=ref.getByTestId('top-reference-T1'),t2=ref.getByTestId('top-reference-T2-unavailable');await expect(t1).toBeVisible();await expect(t2).toBeVisible();await expect(t2).toHaveAttribute('data-reason','UNVERIFIED_LOCATION');
 expect(await t2.getAttribute('class')).toEqual(await t1.getAttribute('class'));await expect(ref.getByTestId('airport-reference-pillars')).toHaveCount(1);await expect(t1.locator('[data-zone=CONCOURSE]')).toContainText('1');
 const evidence=page.getByTestId('model-source-evidence');await expect(evidence).toContainText(`${date} KST`);await expect(evidence).toContainText(`${date} 14:00 KST`);
 const model=page.getByTestId('airport-concept-model');await expect(model).toHaveAttribute('data-denominator','8');await expect(model.locator('.airport-concept-counts[data-building=T1]')).toHaveAttribute('data-denominator','3');await expect(model.locator('.airport-concept-counts[data-building=T2]')).toHaveAttribute('data-denominator','4');await expect(model.locator('.airport-concept-counts[data-building=CONCOURSE]')).toHaveAttribute('data-denominator','1');
 await t1.locator('summary').focus();await page.keyboard.press('Enter');await expect(t1.locator('details')).toHaveAttribute('open');await expect(t1).toContainText('4,000');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
 if(lang==='ko'){await t1.locator('summary').press('Space');await ref.screenshot({path:info.outputPath(`terminal-states-${width}.png`)});}
});
test('held schedule remains honest about today collection pending and old source stamp',async({page})=>{
 await page.setViewportSize({width:390,height:900});await page.clock.setFixedTime(new Date(`${date}T05:10:00Z`));
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));await page.route('**/api/live/flights*',r=>r.fulfill({json:{mode:'live-flights',serviceDateKst:date,basis:'OFFICIAL_DEPARTURE_SCHEDULE',retrievedAt:'2026-08-30T00:55:00Z',truncated:false,flights:rows}}));
 await page.goto('/en/airport');await expect(page.getByTestId('model-source-evidence')).toContainText('Today’s flight record collection pending');await expect(page.getByTestId('model-source-evidence')).toContainText('2026-08-30 09:55 KST');await expect(page.getByTestId('airport-concept-model')).toHaveAttribute('data-denominator','8');
});
for(const width of [360,390,430,1280])test(`T1 current wait minutes use explicit custom color criteria ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.clock.setFixedTime(new Date(`${date}T05:10:00Z`));await page.emulateMedia({reducedMotion:'reduce'});
 const samples=[['3E',31,126],['3W',30,116],['2E',14,160],['5W',14,133]].map(([zone,waitTimeMinutes,waitingCount])=>({terminal:'T1',zone:String(zone).replace(/^([2-5])([EW])$/,'DG$1_$2'),waitTimeMinutes:Number(waitTimeMinutes),waitTimeRaw:String(waitTimeMinutes),waitingCount:Number(waitingCount),observedAt:`${date}T14:07:00+09:00`,freshness:'LIVE'}));
 const airport={...SUMMARY_FIXTURE.airport,congestion:samples,currentBusiestDepartureHallByTerminal:{...SUMMARY_FIXTURE.airport.currentBusiestDepartureHallByTerminal,T1:samples[0]}};
 await page.route('**/api/live/summary*',routeSummary({...SUMMARY_FIXTURE,airport}));await page.goto('/ko/airport?terminal=T1');const section=page.locator('.airport-checkpoints');await expect(section.locator('article')).toHaveCount(3);await section.getByRole('button').click();await expect(section.locator('article')).toHaveCount(4);
 for(const [zone,minutes,people,heat] of [['3E',31,126,'normal'],['3W',30,116,'normal'],['2E',14,160,'clear'],['5W',14,133,'clear']] as const){const card=section.locator('article').filter({has:page.getByText(zone,{exact:false})});await expect(card.locator('.airport-queue-scene')).toHaveAttribute('data-heat',heat);await expect(card.locator('.airport-queue-scene')).toHaveAttribute('data-basis','KORETAIL_MINUTES');await expect(card).toContainText(`${minutes}분`);await expect(card).toContainText(`${people}명`);await expect(card).toContainText('14:07');await expect(card).toContainText('코리테일 색상 기준');}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(await section.locator('.airport-queue-heat').evaluateAll(nodes=>nodes.flatMap(n=>n.getAnimations({subtree:true})).length)).toBe(0);
 if(width===390)await section.screenshot({path:info.outputPath('t1-minute-colors-390.png')});
});