import trafficFixture from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};
import {test,expect,type Page} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import {flightBaseline} from '../tests/helpers/event-flight-fixture';
const day='2026-10-22';
const event=(country:string,date=day)=>({id:`fixture-${country}-${date}`,country,scope:'national',name:`${country} fixture holiday`,kind:'public_holiday',start:date,end:date,status:'verified',sourceURL:`https://example.test/${country}`,verifiedAt:'2026-10-21'});
async function fixture(page:Page,{partial=false,baseline='full',multiple=false,typography=false}:{typography?:boolean;partial?:boolean;baseline?:'full'|'partial'|'missing'|'zero';multiple?:boolean}={}){
 await page.clock.setFixedTime(new Date(`${day}T10:00:00+09:00`));
 await page.addInitScript(()=>localStorage.setItem('koretail-airport-scope','all'));
 // All fixture reads are local interceptions; no provider or production requests.
 await page.route('**/api/**',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*',routeSummary({...SUMMARY_FIXTURE,todayKst:day,serviceDateKst:day,dayRelation:'TODAY',generatedAt:`${day}T10:00:00+09:00`,airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:day}}));
 const flights=[['BKK',16],['TPE',90],['NRT',20],...(typography?([['MNL',5]] as [string,number][]):[])].flatMap(([code,count])=>Array.from({length:Number(count)},(_,i)=>({physicalFlightId:`${code}-${i}`,flightNumber:`TG${code}${i}`,operatingFlight:`TG${i}`,airportCode:code,terminal:'T2',gate:'274',scheduledAt:`${day}T12:00:00+09:00`,retrievedAt:`${day}T01:00:00Z`,status:'scheduled',direction:'departure'})));
 await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',serviceDateKst:day,retrievedAt:`${day}T01:00:00Z`,flights:[...flights,flights[0]],truncated:partial}}));
 const month=flightBaseline(baseline==='zero'?{TW:30,JP:600}:baseline==='partial'?{TH:10,TW:2,JP:40}:{TH:554,TW:30,JP:600,...(typography?{PH:141}:{})},baseline==='partial'?2:30);
 month.scopes.T2={...month.scopes.ALL};
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:{status:baseline==='missing'?'MISSING':'READY',month:'2026-10',calculatedAt:`${day}T01:00:00Z`,data:baseline==='missing'?null:{version:2,asOf:day,sidesVersion:'fixture',destinationsVersion:'fixture',months:[month]}}}));
 await page.route('**/api/airport/calendar',route=>route.fulfill({json:{status:'READY',events:multiple?[event('TH'),event(typography?'PH':'JP')]:[event('TH','2026-10-23')],sources:[],calendarReplacementScopes:[{country:'TH',year:2026,scope:'national'}],checkedAt:'2026-10-21'}}));
}
for(const lang of ['ko','en','zh','ja'])test(`event country beats largest unrelated delta and localizes changes ${lang}`,async({page},info)=>{
 await page.setViewportSize({width:390,height:1000});await fixture(page);await page.goto(`/${lang}?date=${day}`);
 const event=page.locator('.staff-holiday-event');await expect(event).toContainText('TH fixture holiday');
 const metric=event.locator('.event-country-flights');await expect(metric).toHaveAttribute('data-country','TH');await expect(metric).toHaveAttribute('data-flight-day',day);
 await expect(metric).toContainText('16');await expect(metric).toContainText('△ 2.5');await expect(metric).toContainText('△ 13%');await expect(metric).toContainText('2026-09');await expect(metric).not.toContainText('90');
 expect(await event.locator('h4').evaluate(node=>{
  const dates=node.nextElementSibling;
  return dates?.tagName==='P'&&dates.querySelector('time')?.getAttribute('datetime')==='2026-10-23'&&dates.nextElementSibling?.classList.contains('event-country-flights');
 })).toBe(true);
 await expect(event.locator('time')).toHaveAttribute('datetime','2026-10-23');
 await expect(metric.locator('.event-flight-baseline')).toBeVisible();await expect(metric.locator('.event-flight-baseline')).toContainText('18.5');
 const details=page.locator('.staff-route-details');await expect(details).not.toHaveAttribute('open','');await details.locator('summary').focus();await page.keyboard.press('Enter');await expect(details).toHaveAttribute('open','');
 await expect(details.locator('.event-flight-basis')).toContainText('2026-09-01 ~ 2026-09-30');await expect(details.locator('.staff-route-sample')).toContainText('30');await expect(details).not.toContainText('18.5');
 await page.locator('.airport-staff-briefing').screenshot({path:info.outputPath(`concise-event-${lang}.png`)});
 await page.keyboard.press('Enter');await expect(details).not.toHaveAttribute('open','');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('multiple Today event countries each receive their own flight comparison and preserve neutral zero',async({page})=>{
 await page.setViewportSize({width:1280,height:1000});await fixture(page,{multiple:true});await page.goto(`/ko?date=${day}`);
 const today=page.locator('[aria-label="오늘 귀국 준비"]');
 const thai=today.locator('.focus-preparation-event[data-country="TH"] .event-country-flights'),japan=today.locator('.focus-preparation-event[data-country="JP"] .event-country-flights');
 await expect(thai).toContainText('16편');await expect(thai).toContainText('△ 13%');await expect(japan).toContainText('20편');await expect(japan).toContainText('0%');await expect(japan.locator('[data-direction="neutral"]')).not.toHaveCount(0);await expect(japan.locator('.glance-count-change')).toHaveCSS('color','rgb(89, 99, 110)');
 await expect(today.locator('.focus-preparation-event')).toHaveCount(2);
 const previous=await page.locator('.focus-selected-country-stack > .focus-selected-country-changes').first().boundingBox(),current=await today.boundingBox();expect(previous&&current).toBeTruthy();expect(current!.x).toBeGreaterThanOrEqual(previous!.x+previous!.width);expect(current!.y).toBeLessThan(previous!.y);
});
for(const state of ['missing','partial','zero','partial-flights'] as const)test(`event flight truth: ${state}`,async({page})=>{
 await fixture(page,state==='partial-flights'?{partial:true}:{baseline:state});await page.goto(`/ko?date=${day}`);
 const metric=page.locator('.staff-holiday-event .event-country-flights');await expect(metric).toHaveAttribute('data-country','TH');
 if(state==='missing'){await expect(metric).toContainText('16편');await expect(metric).toContainText('비교자료 없음');await expect(metric).not.toContainText('0%');}
 if(state==='partial'){await expect(metric.locator('.event-flight-baseline')).toHaveText('2026-09월 수집분 일평균 (2/30일) 5편 대비');await expect(metric).not.toContainText('전체 수집분');await expect(metric).toContainText('+11편');await expect(metric).toContainText('+220%');}
 if(state==='zero'){await expect(metric).toContainText('+16편');await expect(metric).toContainText('증감률 계산 불가');await expect(metric).not.toContainText('0%');}
 if(state==='partial-flights'){await expect(metric).toContainText('일부 자료');await expect(metric).toContainText('비교 보류');await expect(metric).not.toContainText('16편');}
});

for(const [lang,width] of [['ko',320],['ko',390],['ko',430],['ko',600],['ko',601],['ko',1280],['en',390],['ja',390]] as const)test(`return planning numeric hierarchy ${lang} ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});await fixture(page,{multiple:true,typography:true});await page.goto(`/${lang}?date=${day}`);
 const returned=page.locator('.focus-return-context'),ph=returned.locator('.focus-preparation-event[data-country="PH"]'),metric=ph.locator('.event-country-flights');await expect(metric).toContainText('5');await expect(metric.locator('.glance-count-change')).toContainText('+0.3');await expect(metric.locator('.staff-route-rate')).toContainText('+6%');await expect(metric.locator('.event-flight-baseline')).toContainText('4.7');
 const value=metric.locator('.staff-route-metric b'),change=metric.locator('.event-flight-change'),basis=metric.locator('.event-flight-baseline');await expect(value).toHaveCSS('font-size',width<=600?'20px':'24px');await expect(value).toHaveCSS('font-weight','700');await expect(change).toHaveCSS('font-size',width<=600?'12px':'16px');await expect(basis).toHaveCSS('font-size',width<=600?'10px':width>=1000?'11px':'12px');
 await expect(metric.locator('.glance-count-change')).toHaveCSS('color','rgb(36, 89, 166)');await expect(returned.locator('[data-country="TH"] .glance-count-change')).toHaveCSS('color','rgb(161, 45, 63)');
 if(width<=600){await expect(value).toHaveCSS('font-size',await page.locator('.focus-flight-metric .focus-metric-total').evaluate(el=>getComputedStyle(el).fontSize));await expect(change).toHaveCSS('font-weight','700');await expect(ph.locator('.focus-event-dates')).toHaveCSS('font-size','10px');}
 const titles=page.locator('.glance-insights[aria-labelledby="airport-staff-briefing-title"] .airport-flow-item-title');await expect(titles).toHaveCount(5);for(const title of await titles.all())await expect(title).toHaveCSS('font-size',width<=600?'14px':'16px');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await returned.screenshot({path:info.outputPath('return-planning.png')});
});

for(const width of [390,768,999,1000,1280,1600])test(`PC return and next-week position exchange ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:1100});await fixture(page,{multiple:true,typography:true});await page.route('**/api/airport/calendar',r=>r.fulfill({json:{status:'READY',events:[event('TH'),event('JP'),event('PH','2026-10-26'),event('JP','2026-10-27')],sources:[],calendarReplacementScopes:[{country:'TH',year:2026,scope:'national'},{country:'PH',year:2026,scope:'national'},{country:'JP',year:2026,scope:'national'}],checkedAt:'2026-10-21'}}));const traffic=structuredClone(trafficFixture);traffic.current.ROUTE_COUNTRY_PASSENGERS.rows=traffic.current.ROUTE_COUNTRY_PASSENGERS.rows.map(row=>({...row,departures:row.label==='필리핀'?1000000:row.label==='일본'?999999:0}));await page.route('**/api/live/airport-passenger-stats*',r=>r.fulfill({json:traffic}));await page.goto(`/ko?date=${day}`);
 const returned=page.locator('.focus-return-context'),next=page.locator('.focus-preparation-brief'),core=page.locator('.focus-report-lines'),report=page.locator('.focus-report');await expect(returned).toContainText('TH fixture holiday');await expect(next).toContainText('PH fixture holiday');const a=(await returned.boundingBox())!,b=(await next.boundingBox())!,c=(await core.boundingBox())!,r=(await report.boundingBox())!;
 if(width>=1000){expect(a.x).toBeGreaterThan(c.x+c.width);expect(a.y).toBeLessThan(b.y);expect(b.width).toBeGreaterThan(r.width*.9);expect(b.x).toBeCloseTo(c.x,0);}else{expect(a.y+a.height).toBeLessThanOrEqual(b.y+1);expect(a.x).toBeCloseTo(c.x,0);}
 const ph=next.locator('.focus-preparation-event[data-country="PH"]');await ph.locator('.focus-event-details>summary').click();await expect(ph.locator('.event-country-flights .staff-route-metric')).toContainText('5편');await expect(ph.locator('.glance-count-change')).toContainText('+0.3');await expect(ph.locator('.staff-route-rate')).toContainText('+6%');await expect(ph.locator('.event-flight-period').last()).toHaveText('2026-09-01 ~ 2026-09-30');await expect(ph.locator('.focus-event-details')).not.toContainText('증감 원인 미확인');await expect(ph.locator('.focus-event-details a')).toHaveAttribute('href','https://example.test/PH');await expect(ph.locator('.focus-holiday-gloss')).not.toHaveText('');
 if(width>=1000){await expect(ph.locator('.glance-count-change')).toHaveCSS('font-weight','700');for(const period of await ph.locator('.event-flight-period').all())await expect(period).toHaveCSS('font-weight','700');}else if(width<=600)await expect(ph.locator('.event-flight-period').first()).toHaveCSS('font-weight','400');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await report.screenshot({path:info.outputPath('pc-return-swap.png')});
});
