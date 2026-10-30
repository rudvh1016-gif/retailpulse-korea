import {test,expect,type Page} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};
import {glanceFlights,type GlanceScope} from '../lib/airport-glance';
const day='2026-10-19';
const selectedFlights=Object.fromEntries((['all','T1','CONCOURSE','T2'] as GlanceScope[]).map(scope=>[scope,glanceFlights(day,flights.flights,scope).total]));
// Synthetic comparison values; source fixtures do not prove historical completion.
const reference={day,previousDay:'2026-10-12',passengers:{all:110000,T1:60000,T2:50000},selectedFlights,flights:{all:selectedFlights.all+10,T1:selectedFlights.T1+2,CONCOURSE:selectedFlights.CONCOURSE+1,T2:selectedFlights.T2+7}};
async function fixtures(page:Page){
 await page.route('**/api/live/summary*',route=>route.fulfill({json:summary}));
 for(const [path,json] of [['flights',flights],['airport-months',months],['airport-passenger-stats',passengerStats]] as const)await page.route(`**/api/live/${path}*`,route=>route.fulfill({json}));
 await page.route('**/api/live/glance-week-reference*',route=>route.fulfill({json:{status:'READY',month:'2026-10',data:reference}}));
 await page.route('**/api/live/passenger-reference*',route=>route.fulfill({json:{status:'READY',month:'2026-09',data:null}}));
 await page.route('**/api/airport/calendar*',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/airport-days*',route=>route.fulfill({json:{mode:'airport-days',date:day,history:[],countryDays:[]}}));
}
for(const width of [320,390,1440])test(`two comparison baselines stay separate and readable at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1000});await fixtures(page);
 await page.goto(`/ko?date=${day}`,{waitUntil:'domcontentloaded'});
 const report=page.locator('.focus-report'),people=report.locator('.focus-week-comparison[data-kind=people]'),flight=report.locator('.focus-week-comparison[data-kind=flights]');
 await expect(people).toContainText('+2,403명');await expect(people).toContainText('2026-10-12 · 지난주 같은 요일');
 await expect(flight).toContainText('△ 10편');await expect(flight.locator('.focus-week-change')).toHaveCSS('color','rgb(161, 45, 63)');
 await expect(flight).not.toContainText('편/일');await expect(people).not.toContainText('명/일');
 await expect(report.locator('.focus-passenger-comparison')).toContainText('②');await expect(report.locator('.focus-flight-comparison')).toContainText('②');
 await expect(flight.locator('.focus-week-basis')).toHaveCSS('font-size',width<=600?'10px':'11px');
 const boxes=await report.locator('.focus-core-metric').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right};}));
 expect(boxes[0].right).toBeLessThanOrEqual(boxes[1].left+1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/glance-week-${width}-all.png`,fullPage:false});
 await page.getByRole('button',{name:'T1',exact:true}).first().click();
 await expect(flight).toContainText('△ 2편');await expect(flight).toContainText('T1 본관');await expect(people).toContainText('T1 공통(탑승동 포함)');
 await page.screenshot({path:`test-results/glance-week-${width}-T1.png`,fullPage:false});
});
test('incomplete/mismatched day is unavailable rather than a fabricated zero',async({page})=>{
 await fixtures(page);await page.route('**/api/live/glance-week-reference*',route=>route.fulfill({json:{status:'READY',month:'2026-10',data:{...reference,passengers:{all:null,T1:null,T2:null},selectedFlights:null}}}));
 await page.goto(`/ko?date=${day}`,{waitUntil:'domcontentloaded'});
 await expect(page.locator('.focus-week-comparison')).toHaveCount(2);
 for(const row of await page.locator('.focus-week-comparison').all()){await expect(row).toContainText('① 비교 불가');await expect(row.locator('.change-rate')).toHaveCount(0);await expect(row).toContainText('2026-10-12');}
});

for(const width of [320,390,1440])test(`witnessed today schedule and honest passenger heading at ${width}px`,async({page})=>{
 await page.clock.setFixedTime(new Date('2026-10-19T01:00:00Z'));await page.setViewportSize({width,height:1000});await fixtures(page);
 await page.route('**/api/live/glance-week-reference*',route=>route.fulfill({json:{status:'READY',month:'2026-10',data:{...reference,selectedFlightSnapshot:{day,retrievedAt:'2026-10-19T04:42:00+09:00',provisional:true}}}}));
 await page.goto(`/ko?date=${day}`,{waitUntil:'domcontentloaded'});
 const report=page.locator('.focus-report'),flight=report.locator('.focus-week-comparison[data-kind=flights]');
 await expect(report.locator('.focus-figures-title')).toHaveText('출국객 수 (환승객 포함)');await expect(report.locator('.focus-passenger-total')).toContainText('112,403');
 await expect(flight).toContainText('△ 10편');await expect(flight.locator('.focus-week-snapshot')).toHaveText('오늘 04:42 KST 수집 예정편 · 변경 가능 · 운항실적 아님');
 await expect(flight).not.toContainText('편/일');await expect(flight.locator('.focus-week-change')).toHaveCSS('color','rgb(161, 45, 63)');
 const parts=report.locator('.focus-passenger-parts');await expect(parts).toContainText('출국 103,124명 + 환승 9,279명');await expect(parts).toHaveCSS('font-size',width<=600?'9px':'11px');
 const bounds=await parts.evaluate(node=>{const b=node.getBoundingClientRect();return {height:b.height,overflow:node.scrollWidth>node.clientWidth,pieces:[...node.children].map(n=>{const r=n.getBoundingClientRect();return r.left>=b.left-1&&r.right<=b.right+1;})};});
 expect(bounds.overflow).toBe(false);expect(bounds.pieces.every(Boolean)).toBe(true);if(width===390)expect(bounds.height).toBeLessThanOrEqual(14);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/glance-today-${width}.png`,fullPage:false});
});
test('an already-open glance rechecks its week witness after the shared flights read recovers',async({page})=>{
 await page.clock.install({time:new Date('2026-10-19T01:00:00Z')});await fixtures(page);let recovered=false,weekReads=0;
 await page.route('**/api/live/glance-week-reference*',route=>{weekReads++;return route.fulfill({json:{status:'READY',month:'2026-10',data:{...reference,selectedFlights:recovered?reference.selectedFlights:null,...(recovered?{selectedFlightSnapshot:{day,retrievedAt:'2026-10-19T04:42:00+09:00',provisional:true}}:{})}}});});
 await page.route('**/api/live/flights*',route=>route.fulfill({json:{...flights,generatedAt:recovered?'2026-10-19T01:02:00Z':'2026-10-19T01:00:00Z'}}));
 await page.goto(`/ko?date=${day}`,{waitUntil:'domcontentloaded'});const flight=page.locator('.focus-week-comparison[data-kind=flights]');
 await expect(flight).toContainText('① 비교 불가');const before=weekReads;recovered=true;await page.clock.fastForward(121_000);
 await expect(flight).toContainText('△ 10편');await expect(flight.locator('.focus-week-snapshot')).toBeVisible();expect(weekReads).toBeGreaterThan(before);
});
test('a held schedule cannot borrow a current collected-scan witness even when its count coincides',async({page})=>{
 await page.clock.setFixedTime(new Date('2026-10-19T01:00:00Z'));await fixtures(page);
 await page.route('**/api/live/flights*',route=>route.fulfill({json:{...flights,basis:'OFFICIAL_DEPARTURE_SCHEDULE'}}));
 await page.route('**/api/live/glance-week-reference*',route=>route.fulfill({json:{status:'READY',month:'2026-10',data:{...reference,selectedFlightSnapshot:{day,retrievedAt:'2026-10-19T04:42:00+09:00',provisional:true}}}}));
 await page.goto(`/ko?date=${day}`,{waitUntil:'domcontentloaded'});const row=page.locator('.focus-week-comparison[data-kind=flights]');
 await expect(row).toContainText('① 비교 불가');await expect(row.locator('.focus-week-snapshot')).toHaveCount(0);await expect(row.locator('.change-rate')).toHaveCount(0);
});
