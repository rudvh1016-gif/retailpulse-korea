import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import {buildAirportFlightMonth,AIRPORT_MONTH_VERSION,type MonthFlightRow} from '../lib/airport-monthly-flights';
import {AIRPORT_SIDES_VERSION} from '../lib/airport-sides';
import {DESTINATIONS_VERSION} from '../lib/airport-destinations';
const date='2026-10-11';
const flight=(day:string,id:string,hour:number,airportCode='NRT',terminal='T1',gate='45'):MonthFlightRow=>({physicalFlightId:id,terminal,gate,operatingFlight:'TEST'+id,airportCode,scheduledAt:`${day}T${String(hour).padStart(2,'0')}:00:00+09:00`,retrievedAt:`${day}T00:00:00Z`,status:'scheduled'});
const flights=Array.from({length:24},(_,hour)=>Array.from({length:hour+1},(_,i)=>({...flight(date,`${hour}-${i}`,hour,'NRT',i%2?'T2':'T1',i%2?'274':'45'),direction:'departure'}))).flat();
const history=(day:string,current:boolean)=>['NRT','PEK','LAX','FRA','CDG','BKK','TPE'].flatMap((code,index)=>Array.from({length:current?index+2:1},(_,n)=>flight(day,code+n,10,code)));
const monthly={status:'READY',month:'2026-10',calculatedAt:'2026-10-11T01:00:00Z',data:{version:AIRPORT_MONTH_VERSION,asOf:date,sidesVersion:AIRPORT_SIDES_VERSION,destinationsVersion:DESTINATIONS_VERSION,months:[buildAirportFlightMonth('2026-10',date,history('2026-10-01',true),new Set(['2026-10-01'])),buildAirportFlightMonth('2026-09',date,history('2026-09-01',false),new Set(['2026-09-01']))]}};

const queues=[{terminal:'T1',zone:'DG2_E',waitTimeMinutes:12,waitTimeRaw:'12',observedAt:date+'T10:10:00+09:00',freshness:'LIVE'},{terminal:'T2',zone:'DG1_A',waitTimeMinutes:24,waitTimeRaw:'24',observedAt:date+'T10:11:00+09:00',freshness:'LIVE'},{terminal:'T2',zone:'DG1_B',waitTimeMinutes:24,waitTimeRaw:'24',observedAt:date+'T10:11:00+09:00',freshness:'LIVE'}];
async function routeData(page:import('@playwright/test').Page){
 await page.clock.setFixedTime(new Date(`${date}T10:15:00+09:00`));
 await page.route('**/api/live/summary*',route=>{const day=new URL(route.request().url()).searchParams.get('date')??date;return routeSummary({...SUMMARY_FIXTURE,dayRelation:day===date?'TODAY':'PAST',todayKst:date,serviceDateKst:day,airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:day,congestion:day===date?queues:[]},generatedAt:`${date}T10:15:00+09:00`})(route);});
 await page.route('**/api/live/flights*',route=>{const day=new URL(route.request().url()).searchParams.get('date')!;return route.fulfill({json:{mode:'live-flights',serviceDateKst:day,flights:day===date?flights:[],retrievedAt:`${day}T00:00:00Z`,truncated:false}});});
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:monthly}));
}
for(const width of [360,390,430,1440])test(`decision summary with image overlays and detail links ${width}`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});await routeData(page);await page.goto('/ko/airport-glance-preview');const app=page.getByTestId('airport-glance-preview');
 await expect(app.locator('.glance-map-heading')).toContainText('300 편');await expect(app.getByTestId('glance-key-wait')).toContainText('T2 출국장 1A · 24 분');await expect(app.getByTestId('glance-key-wait')).toContainText('동률');
 await expect(app.getByTestId('glance-key-upcoming')).toContainText('23:00–24:00 · 24 편');await expect(app.getByTestId('glance-key-growth')).toContainText('대만');
 await expect(app.locator('.glance-destinations li[data-country=JP]')).toContainText('100%');await expect(app.locator('.glance-destinations li[data-country=JP] img')).toHaveAttribute('src','/images/airport-flags/JP.webp');await expect(app.getByTestId('glance-key-growth').locator('img')).toHaveAttribute('src','/images/airport-flags/fallback/tw.svg');await expect(app.locator('.glance-ranking [data-country=TW] img')).toHaveAttribute('src','/images/airport-flags/fallback/tw.svg');await expect(app.locator('.glance-ranking tbody tr')).toHaveCount(5);
 await expect(app.getByTestId('glance-day-comparison')).toContainText('오늘 출발편 300 편');await expect(app.getByTestId('glance-day-comparison')).toContainText('+293 편');await expect(app.getByTestId('glance-day-comparison')).toContainText('+4186%');await expect(app.locator('a[href*=airport-departure-preparation],a[href*=airport-news]')).toHaveCount(0);
 await expect(app.locator('.glance-map-queue')).toHaveCount(2);for(const label of await app.locator('.glance-building :is(h2,span,dt,dd,small)').all())await expect(label).toHaveCSS('color','rgb(0, 0, 0)');await expect(app.locator('.glance-building-CONCOURSE .glance-map-queue')).toHaveCount(0);await expect(app.locator('.glance-location-note')).toHaveCount(0);
 if(width>700)await expect(app.locator('.glance-building').first()).toHaveCSS('width','225px');await expect(app.locator('.glance-building dl').first()).toHaveCSS('display',width<=700?'grid':'flex');
 if(width<=700){await expect(app.locator('.glance-building').first()).toHaveCSS('position','absolute');await expect(app.locator('.glance-building dd').first()).toHaveCSS('font-size','9px');await expect(app.locator('.glance-building dt').first()).toHaveCSS('font-size','8px');}
 const imageBox=await app.locator('.glance-art-frame>img').boundingBox(),labels=await app.locator('.glance-building').evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom};}));
 for(const box of labels){expect(box.x).toBeGreaterThanOrEqual(imageBox!.x);expect(box.right).toBeLessThanOrEqual(imageBox!.x+imageBox!.width+1);expect(box.y).toBeGreaterThanOrEqual(imageBox!.y);expect(box.bottom).toBeLessThanOrEqual(imageBox!.y+imageBox!.height+1);}expect(labels[0].bottom).toBeLessThan(labels[1].y);expect(labels[1].bottom).toBeLessThan(labels[2].y);
 await expect(app.locator('.glance-bars,.glance-hour-picker,.glance-destinations details')).toHaveCount(0);await expect(app.locator('.glance-included-days')).toHaveText('포함일 · 전월 1 일 / 선택월 1 일');
 await expect(app.getByRole('link',{name:'국가 전체 보기 (1) ↗'})).toHaveAttribute('href',new RegExp('/ko/airport-countries\\?mode=zones&building=all&date=2026-10-11#airport-zone-countries$'));
 // Owner, 2026-10-14: Top 5 by the change in daily-mean flights, shown as a count, not a rate;
 // every detail link names the section that holds the same information.
 const increase=app.getByTestId('glance-ranking-increase');await expect(app.locator('.glance-ranking>.glance-section-head h2')).toHaveText('전월비 일평균 증가 Top 5');await expect(increase.locator('th').nth(3)).toHaveText('증감');
 const ranked=await increase.locator('tbody tr').evaluateAll(rows=>rows.map(row=>{const [previous,current,change]=[...row.querySelectorAll('td')].map(cell=>cell.textContent??'');return {country:row.getAttribute('data-country'),previous:Number(previous),current:Number(current),change};}));
 expect(ranked.map(row=>row.country)).toEqual(['TW','TH','FR','DE','US']);
 for(const [index,row] of ranked.entries()){expect(row.change).toContain(`+${row.current-row.previous}`);expect(row.change).not.toContain('%');if(index)expect(row.current-row.previous).toBeLessThanOrEqual(ranked[index-1].current-ranked[index-1].previous);}
 await expect(app.getByTestId('glance-key-growth')).toContainText('+7편/일');
 await expect(app.getByTestId('glance-key-growth')).toHaveAttribute('href',/\/ko\/airport\?terminal=all&date=2026-10-11#airport-month-destinations$/);
 await expect(app.locator('.glance-ranking .glance-detail-link')).toHaveCount(1);await expect(app.locator('.glance-ranking .glance-detail-link')).toHaveAttribute('href',/#airport-month-destinations$/);
 // The decrease list sits right under the increase table: nothing between the two lists.
 expect(await app.locator('.glance-ranking').evaluate(section=>{const up=section.querySelector('[data-testid=glance-ranking-increase]')!,down=section.querySelector('[data-testid=glance-ranking-decrease]')!;return up.nextElementSibling===down&&down.getBoundingClientRect().top-up.getBoundingClientRect().bottom<=24;})).toBe(true);
 // Every destination in the fixture grew, so the decrease list says so instead of inventing rows.
 await expect(app.getByTestId('glance-ranking-decrease').locator('h2')).toHaveText('전월비 일평균 감소 Top 5');await expect(app.getByTestId('glance-ranking-decrease').locator('tbody tr')).toHaveCount(0);await expect(app.getByTestId('glance-ranking-decrease')).toContainText('비교 가능한 감소 없음');
 await expect(app.getByTestId('glance-key-wait')).toHaveAttribute('href',/#airport-checkpoints-title$/);
 await expect(app.getByTestId('glance-key-upcoming')).toHaveAttribute('href',/#airport-departure-model-slot$/);
 await expect(app.getByTestId('glance-key-passengers')).toHaveAttribute('href',/\/ko\/airport\?terminal=all&date=2026-10-11#airport-forecast-title$/);
 await app.getByRole('button',{name:'T1',exact:true}).click();await expect(app.getByTestId('glance-key-wait')).toContainText('T1 출국장 2E · 12 분');await expect(app.locator('.glance-map-heading')).toContainText('156 편');
 await expect(app.locator('.glance-building-T2')).toHaveCSS('opacity','1');await expect(app.locator('.glance-building-T2 small')).toHaveCSS('color','rgb(0, 0, 0)');
 const disclosure=app.locator('.glance-airport>.glance-context summary');await disclosure.focus();await page.keyboard.press('Enter');await expect(app.locator('.glance-airport>.glance-context p').first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});
test('rapid past-day changes clear present waits and upcoming departures',async({page})=>{
 await routeData(page);await page.goto('/ko/airport-glance-preview');const app=page.getByTestId('airport-glance-preview');await expect(app.getByTestId('glance-key-wait')).toContainText('24 분');
 await app.locator('input[type=date]').fill('2026-10-09');await app.locator('input[type=date]').fill('2026-10-10');await expect(app.locator('.glance-map-heading')).toContainText('0 편');await expect(app.getByTestId('glance-key-wait')).toContainText('확인 가능한 자료 없음');await expect(app.getByTestId('glance-key-upcoming')).toContainText('현재 이후 예정편 없음');await expect(app.locator('.glance-map-queue')).toHaveCount(0);
 await app.getByRole('button',{name:'오늘',exact:true}).click();await expect(app.locator('.glance-map-heading')).toContainText('300 편');
});
const transferLocales = {
 ko: {label:'예상 환승객',basis:'환승 보안검색 기준 · 도착일',missing:'확인 가능한 자료 없음'},
 en: {label:'Expected transfers',basis:'Transfer security · arrival date',missing:'No verified data'},
 zh: {label:'预计中转旅客',basis:'中转安检口径 · 到达日',missing:'暂无可核实资料'},
 ja: {label:'予想乗継客',basis:'乗継保安検査基準・到着日',missing:'確認できる資料なし'},
} as const;
for(const lang of ['ko','en','zh','ja'] as const){
 const copy=transferLocales[lang];
 test(`failed data does not invent any decision or ratio ${lang}`,async({page})=>{
  for(const api of ['summary','flights','airport-months'])await page.route(`**/api/live/${api}*`,route=>route.fulfill({status:503,json:{error:'unavailable'}}));
  await page.goto(`/${lang}/airport-glance-preview`);const app=page.getByTestId('airport-glance-preview');
  await expect(app.locator('.glance-insights strong')).toHaveText([copy.missing,copy.missing,'—',copy.missing,copy.missing,copy.missing]);
  await expect(app.getByTestId('glance-key-sum').locator('strong')).toHaveText('—');
  const transfer=app.getByTestId('glance-key-transfers');
  await expect(transfer.locator('span')).toHaveText(copy.label);
  await expect(transfer.locator('strong')).toHaveText(copy.missing);
  await expect(transfer.locator('small')).toContainText(copy.basis);
  await expect(app.locator('.glance-destinations li,.glance-ranking tbody tr,.glance-map-queue')).toHaveCount(0);
 });
 test(`localized decision summary ${lang}`,async({page})=>{
  await page.setViewportSize({width:360,height:900});await routeData(page);await page.goto(`/${lang}/airport-glance-preview`);const app=page.getByTestId('airport-glance-preview');
  await expect(app.locator('.glance-insights a')).toHaveCount(5);
  const transfer=app.getByTestId('glance-key-transfers');
  await expect(transfer.locator('span')).toHaveText(copy.label);
  // Flight and queue fixtures do not contain a transfer forecast, so no zero or total may be invented
  await expect(transfer.locator('strong')).toHaveText(copy.missing);
  await expect(transfer.locator('small')).toContainText(copy.basis);
  await expect(transfer.locator('small')).toContainText(date);
  await expect(transfer).toHaveAttribute('href',new RegExp('date='+date+'#airport-forecast-title$'));
  await expect(app.locator('.glance-ranking tbody tr')).toHaveCount(5);await expect(app.locator('.glance-map-queue')).toHaveCount(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 });
}

test('missing summary clock cannot turn available flight records into a no-upcoming claim',async({page})=>{
 await page.route('**/api/live/summary*',route=>route.fulfill({status:503,json:{error:'unavailable'}}));await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',serviceDateKst:date,flights,retrievedAt:`${date}T00:00:00Z`,truncated:false}}));await page.route('**/api/live/airport-months*',route=>route.fulfill({json:monthly}));await page.goto('/ko/airport-glance-preview');const app=page.getByTestId('airport-glance-preview');await expect(app.locator('.glance-status')).toHaveText('확인 가능한 자료가 없습니다.');await app.locator('input[type=date]').fill(date);await expect(app.locator('.glance-map-heading')).toContainText('300 편');await expect(app.getByTestId('glance-key-upcoming')).toContainText('확인 가능한 자료 없음');await expect(app.getByTestId('glance-key-upcoming')).not.toContainText('현재 이후 예정편 없음');
});

// Flights may finish before the selected-day summary; absence of a clock is not zero upcoming flights.
test('pending past-day summary stays unavailable until its matching response arrives',async({page})=>{
 await routeData(page);await page.goto('/ko/airport-glance-preview');const app=page.getByTestId('airport-glance-preview');await expect(app.getByTestId('glance-key-wait')).toContainText('24 분');
 let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/live/summary*',async route=>{await pending;return routeSummary({...SUMMARY_FIXTURE,dayRelation:'PAST',todayKst:date,serviceDateKst:'2026-10-10',airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:'2026-10-10',congestion:[]},generatedAt:`${date}T10:15:00+09:00`})(route);});
 await app.locator('input[type=date]').fill('2026-10-10');await expect(app.locator('.glance-map-heading')).toContainText('0 편');await expect(app.getByTestId('glance-key-upcoming')).toContainText('자료 확인 중');await expect(app.getByTestId('glance-key-upcoming')).not.toContainText('현재 이후 예정편 없음');await expect(app.locator('.glance-map-queue')).toHaveCount(0);
 release();await expect(app.getByTestId('glance-key-upcoming')).toContainText('현재 이후 예정편 없음');
});

for(const width of [360,390,430,1440])test(`future cards show aggregation boundaries below headings ${width}`,async({page})=>{
 await routeData(page);await page.setViewportSize({width,height:1000});await page.goto('/ko/airport-glance-preview');const app=page.getByTestId('airport-glance-preview'),future=app.getByTestId('glance-future'),country=app.getByTestId('glance-future-countries'),zone=app.getByTestId('glance-future-zones');
 await expect(future.getByRole('heading',{name:'앞으로 출발편이 가장 많은 구역',exact:true})).toBeVisible();await expect(country.getByRole('heading',{name:'다음 시간대에 늘어나는 목적지',exact:true})).toBeVisible();
 await expect(app.getByRole('heading',{level:1})).toHaveText('인천공항 한눈에');
 await expect(zone.getByTestId('glance-zone-period')).toHaveText('집계 시간 10:15–11:15 (KST)');await expect(country).toContainText('12 → 13 편');await expect(country).toContainText('+1 편');await expect(country.getByTestId('glance-comparison-periods')).toContainText('비교 10:15–11:15 → 다음 11:15–12:15 (KST)');
 for(const card of [zone,country]){
  const heading=await card.locator('h2').boundingBox(),period=await card.locator('.glance-window-time').boundingBox();
  expect(heading).not.toBeNull();expect(period).not.toBeNull();expect(period!.y).toBeGreaterThanOrEqual(heading!.y+heading!.height);expect(period!.y-heading!.y-heading!.height).toBeLessThanOrEqual(8);
  const style=await card.locator('.glance-window-time').evaluate(el=>({size:getComputedStyle(el).fontSize,color:getComputedStyle(el).color}));expect(style).toEqual({size:'12px',color:'rgb(17, 17, 17)'});
 }
 await future.getByRole('button',{name:'향후 3 시간',exact:true}).click();await expect(zone.getByTestId('glance-zone-period')).toHaveText('집계 시간 10:15–13:15 (KST)');await expect(country.getByTestId('glance-comparison-periods')).toHaveText('비교 10:15–13:15 → 다음 13:15–16:15 (KST)');await expect(country).toContainText('39 → 48 편');await expect(country).toContainText('+9 편');await expect(app.getByTestId('glance-day-comparison')).toContainText('300 편');
 await future.getByRole('button',{name:'향후 6 시간',exact:true}).click();await expect(zone.getByTestId('glance-zone-period')).toHaveText('집계 시간 10:15–16:15 (KST)');await expect(country.getByTestId('glance-comparison-periods')).toHaveText('비교 10:15–16:15 → 다음 16:15–22:15 (KST)');await expect(country).toContainText('87 → 123 편');await expect(country).toContainText('+36 편');
 await app.getByRole('button',{name:'T2',exact:true}).click();await expect(app.getByTestId('glance-day-comparison')).toContainText('144 편');await expect(country).toContainText('42 → 60 편');await expect(country).toContainText('+18 편');
 await app.locator('input[type=date]').fill('2026-10-10');await expect(zone).toContainText('확인 가능한 자료 없음');await expect(country).toContainText('비교 자료 없음');await expect(app.locator('.glance-window-time')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
for(const condition of ['midnight','truncated'] as const)test(`destination increase safely withholds ${condition} comparisons`,async({page})=>{
 await routeData(page);
 if(condition==='midnight'){await page.clock.setFixedTime(new Date(`${date}T23:00:00+09:00`));await page.route('**/api/live/summary*',routeSummary({...SUMMARY_FIXTURE,dayRelation:'TODAY',todayKst:date,serviceDateKst:date,airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:date,congestion:[]},generatedAt:`${date}T23:00:00+09:00`}));}
 else await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',serviceDateKst:date,flights,retrievedAt:`${date}T00:00:00Z`,truncated:true}}));
 await page.goto('/ko/airport-glance-preview');const country=page.getByTestId('glance-future-countries');await expect(country).toContainText(condition==='midnight'?'자정 이후 비교 자료 없음':'일부 자료만 확인 · 비교 불가');await expect(country.locator('.glance-destination-growth')).toHaveCount(0);
});

for(const width of [390,1440])test(`zone explanation preserves tied areas, local destinations and selected denominator ${width}`,async({page})=>{
 await routeData(page);await page.setViewportSize({width,height:1000});await page.goto('/ko/airport-glance-preview');const app=page.getByTestId('airport-glance-preview'),zone=app.getByTestId('glance-future-zones');await expect(zone.getByRole('heading',{name:'앞으로 출발편이 가장 많은 구역',exact:true})).toBeVisible();
 await expect(zone.locator('.glance-zone-leader')).toHaveCount(2);for(const row of await zone.locator('.glance-zone-leader').all()){await expect(row.locator('.glance-zone-main')).toContainText('6 편 · 50%');await expect(row.locator('.glance-zone-destinations')).toContainText('일본 6 편');await expect(row.locator('.glance-zone-destinations img')).toHaveAttribute('src','/images/airport-flags/JP.webp');}await expect(zone.locator('.glance-window-note')).toContainText('전체 · 선택 시간대 총 12편 중 6편');
 await app.getByRole('button',{name:'T2',exact:true}).click();await expect(zone.locator('.glance-zone-leader')).toHaveCount(1);await expect(zone.locator('.glance-zone-main')).toContainText('6 편 · 100%');await expect(zone.locator('.glance-window-note')).toContainText('T2 · 선택 시간대 총 6편 중 6편');await expect(zone.locator('.glance-zone-peers')).toContainText('같은 T2');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

for(const width of [360,390,1440])test(`physical building scopes align flights destinations and months ${width}`,async({page})=>{
 await routeData(page);await page.setViewportSize({width,height:1000});
 const dayRows=[...Array.from({length:5},(_,i)=>({...flight(date,'main'+i,i<2?11:12,'NRT','T1','45'),direction:'departure'})),...Array.from({length:7},(_,i)=>({...flight(date,'con'+i,i<3?11:12,'PEK','CONCOURSE','110'),direction:'departure'})),...Array.from({length:9},(_,i)=>({...flight(date,'t2'+i,i<4?11:12,'LAX','T2','274'),direction:'departure'}))];
 const monthRows=(m:string,current:boolean)=>[...Array.from({length:current?3:1},(_,i)=>flight(m+'-01','m'+i,11,'NRT','T1','45')),...Array.from({length:current?4:2},(_,i)=>flight(m+'-01','c'+i,11,'PEK','CONCOURSE','110')),...Array.from({length:current?6:3},(_,i)=>flight(m+'-01','t'+i,11,'LAX','T2','274'))];
 await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',serviceDateKst:date,flights:dayRows,retrievedAt:`${date}T00:00:00Z`,truncated:false}}));await page.route('**/api/live/airport-months*',route=>route.fulfill({json:{...monthly,data:{...monthly.data,months:[buildAirportFlightMonth('2026-10',date,monthRows('2026-10',true),new Set(['2026-10-01'])),buildAirportFlightMonth('2026-09',date,monthRows('2026-09',false),new Set(['2026-09-01']))]}}}));
 await page.goto('/ko/airport-glance-preview');const app=page.getByTestId('airport-glance-preview');await expect(app.locator('.glance-map-heading')).toContainText('21 편');await expect(app.getByTestId('glance-shared-processing')).toContainText('탑승동도 T1에서 출국수속');
 for(const [button,building,total,country,delta,mean,window] of [['T1','T1',5,'JP',4,1,2],['탑승동','CONCOURSE',7,'CN',5,2,3],['T2','T2',9,'US',6,3,4]] as const){await app.getByRole('button',{name:button,exact:true}).click();await expect(app.locator('.glance-map-heading')).toContainText(`${total} 편`);await expect(app.locator(`.glance-building-${building} h2`)).toContainText(`${total} 편`);await expect(app.locator('.glance-building[data-selected=true]')).toHaveCount(1);await expect(app.locator('.glance-destinations li')).toHaveCount(1);await expect(app.locator(`.glance-destinations li[data-country=${country}]`)).toContainText('100%');await expect(app.getByTestId('glance-day-comparison')).toContainText(`+${delta} 편`);await expect(app.getByTestId('glance-day-comparison')).toContainText(`전월 일평균 ${mean} 편`);{const [previous,current,change]=await app.getByTestId('glance-ranking-increase').locator(`[data-country=${country}] td`).allTextContents();expect(change).toContain(`+${Number(current)-Number(previous)}`);expect(change).not.toContain('%');}await expect(app.getByTestId('glance-future-zones').locator('.glance-window-note')).toContainText(`총 ${window}편`);if(building!=='T2')await expect(app.getByTestId('glance-key-wait')).toContainText('T1 출국장 2E · 12 분');}
 await expect(app.locator('.glance-building-CONCOURSE .glance-map-queue')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

for(const hour of [22,23])test(`midnight boundaries retain dates and existing comparison policy at ${hour}`,async({page})=>{
 await routeData(page);await page.setViewportSize({width:360,height:1000});await page.clock.setFixedTime(new Date(`${date}T${hour}:00:00+09:00`));
 await page.route('**/api/live/summary*',routeSummary({...SUMMARY_FIXTURE,dayRelation:'TODAY',todayKst:date,serviceDateKst:date,airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:date,congestion:[]},generatedAt:`${date}T${hour}:00:00+09:00`}));
 await page.goto('/ko/airport-glance-preview');const app=page.getByTestId('airport-glance-preview');
 if(hour===22)await expect(app.getByTestId('glance-comparison-periods')).toHaveText('비교 22:00–23:00 → 다음 2026-10-11 23:00–2026-10-12 00:00 (KST)');
 else {await expect(app.getByTestId('glance-zone-period')).toHaveText('집계 시간 2026-10-11 23:00–2026-10-12 00:00 (KST)');await expect(app.getByTestId('glance-future-countries')).toContainText('자정 이후 비교 자료 없음');await expect(app.getByTestId('glance-comparison-periods')).toHaveCount(0);}
 await app.getByRole('button',{name:'향후 6 시간',exact:true}).click();await expect(app.getByTestId('glance-zone-period')).toHaveText(`집계 시간 2026-10-11 ${hour}:00–2026-10-12 00:00 (KST)`);await expect(app.getByTestId('glance-future-countries')).toContainText('자정 이후 비교 자료 없음');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

for(const width of [360,390,430,1440])test(`compact date retains native editing today and keyboard ${width}`,async({page})=>{
 await routeData(page);await page.setViewportSize({width,height:1000});await page.goto('/ko/airport-glance-preview');const app=page.getByTestId('airport-glance-preview'),input=app.getByLabel('날짜',{exact:true}),today=app.getByRole('button',{name:'오늘',exact:true});
 await expect(input).toHaveValue(date);await expect(input).toHaveAttribute('type','date');await expect(input).toHaveCSS('border-radius','14px');expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 for(const day of ['2026-10-10','2026-10-09','2026-10-10'])await input.fill(day);await expect(input).toHaveValue('2026-10-10');await expect(today).toHaveAttribute('data-current','false');await today.focus();await page.keyboard.press('Enter');await expect(input).toHaveValue(date);await expect(today).toHaveAttribute('data-current','true');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 if(width===390||width===1440){await app.locator('.glance-controls').screenshot({path:`docs/screenshots/date-destination-20261013/date-${width}.png`});await app.getByTestId('glance-future').screenshot({path:`docs/screenshots/date-destination-20261013/destination-${width}.png`});}
});
for(const state of ['failed','missing','partial','zero'] as const)test(`destination availability distinguishes ${state}`,async({page})=>{
 await routeData(page);await page.route('**/api/live/flights*',route=>state==='failed'?route.fulfill({status:503,json:{error:'unavailable'}}):route.fulfill({json:{mode:'live-flights',serviceDateKst:date,flights:[],retrievedAt:state==='missing'?null:`${date}T00:00:00Z`,truncated:state==='partial'}}));
 await page.goto('/ko/airport-glance-preview');const card=page.getByTestId('glance-future-countries');await expect(card).toContainText({failed:'항공편 조회 실패',missing:'해당 시간대 정보 없음',partial:'일부 자료만 확인 · 비교 불가',zero:'비교 구간 출발편 0편'}[state]);
 if(state!=='zero')await expect(card).not.toContainText('0편');await card.screenshot({path:"docs/screenshots/date-destination-20261013/state-"+state+".png"});
});

// Owner, 2026-10-14: "공항상세누르면 해당정보에 적합한 페이지로 이동시켜줘 지금은 그냥 공항페이지 젤상단으로만이동돼".
// These sections mount after the client data, past the browser's own fragment scroll: the airport page
// must still land on each one, below the sticky header and airport menu, and open a closed list.
for(const [hash,check] of [['airport-month-destinations','details'],['airport-zone-countries','section'],['airport-checkpoints-title','heading'],['airport-forecast-title','heading']] as const)
test(`airport detail link lands on #${hash} below the sticky bars`,async({page})=>{
 await page.setViewportSize({width:390,height:844});await routeData(page);
 await page.goto(`/ko/airport?terminal=all&date=${date}#${hash}`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const target=page.locator(`#${hash}`);await expect(target).toHaveCount(1);
 if(check==='details')await expect(target).toHaveJSProperty('open',true);
 await expect.poll(()=>target.evaluate(node=>{const bars=[...document.querySelectorAll<HTMLElement>('.site-header, .airport-context-nav')].filter(bar=>['sticky','fixed'].includes(getComputedStyle(bar).position)).map(bar=>bar.getBoundingClientRect().bottom),covered=Math.max(0,...bars),top=node.getBoundingClientRect().top;return scrollY>0&&top>=covered-1&&top<=covered+24;}),{timeout:10_000}).toBe(true);
});
test('glance Top 5 detail link opens the full destination list on the airport page',async({page})=>{
 await page.setViewportSize({width:390,height:844});await routeData(page);await page.goto('/ko/airport-glance-preview');
 const app=page.getByTestId('airport-glance-preview');await expect(app.getByTestId('glance-ranking-increase').locator('tbody tr')).toHaveCount(5);
 await app.locator('.glance-ranking .glance-detail-link').click();await expect(page).toHaveURL(/\/ko\/airport\?terminal=all&date=2026-10-11#airport-month-destinations$/);
 const list=page.locator('details#airport-month-destinations');await expect(list).toHaveJSProperty('open',true);await expect(list).toBeInViewport();
 await expect(list).toContainText('대만');
});
test('decrease Top 5 lists the largest falls in daily-mean flights with filled △, distinct from the increase list',async({page})=>{
 await page.setViewportSize({width:390,height:844});await routeData(page);
 // A month where five destinations fell and one grew; the 2026-10 month keeps its included day.
 const codes=['NRT','PEK','LAX','FRA','CDG','BKK','TPE'],fell=(day:string,current:boolean)=>codes.flatMap((code,index)=>Array.from({length:current?(code==='TPE'?9:1):index+2},(_,n)=>flight(day,code+n,10,code)));
 const months={...monthly,data:{...monthly.data,months:[buildAirportFlightMonth('2026-10',date,fell('2026-10-01',true),new Set(['2026-10-01'])),buildAirportFlightMonth('2026-09',date,fell('2026-09-01',false),new Set(['2026-09-01']))]}};
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:months}));
 await page.goto('/ko/airport-glance-preview');const app=page.getByTestId('airport-glance-preview'),decrease=app.getByTestId('glance-ranking-decrease');
 await expect(decrease.locator('tbody tr')).toHaveCount(5);
 const rows=await decrease.locator('tbody tr').evaluateAll(list=>list.map(row=>{const [previous,current,change]=[...row.querySelectorAll('td')].map(cell=>cell.textContent??'');return {country:row.getAttribute('data-country'),previous:Number(previous),current:Number(current),change};}));
 expect(rows.map(row=>row.country)).toEqual(['TH','FR','DE','US','CN']);
 for(const [index,row] of rows.entries()){expect(row.change).toContain(`△ ${row.previous-row.current}`);expect(row.change).toContain('감소');expect(row.change).not.toContain('%');if(index)expect(row.previous-row.current).toBeLessThanOrEqual(rows[index-1].previous-rows[index-1].current);}
 await expect(app.getByTestId('glance-ranking-increase').locator('tbody tr')).toHaveCount(1);await expect(app.getByTestId('glance-ranking-increase').locator('[data-country=TW]')).toContainText('+1');
 await expect(app.locator('.glance-ranking .glance-detail-link')).toHaveAttribute('href',/#airport-month-destinations$/);
});
