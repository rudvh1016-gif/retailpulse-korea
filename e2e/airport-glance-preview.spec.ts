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
 await expect(app.getByTestId('glance-day-comparison')).toContainText('오늘 출발편 300 편');await expect(app.getByTestId('glance-day-comparison')).toContainText('+293 편');await expect(app.getByTestId('glance-day-comparison')).toContainText('+4185.7%');await expect(app.locator('a[href*=airport-departure-preparation]')).toHaveCount(0);
 await expect(app.locator('.glance-map-queue')).toHaveCount(2);await expect(app.locator('.glance-building-CONCOURSE .glance-map-queue')).toHaveCount(0);await expect(app.locator('.glance-location-note')).toHaveCount(0);
 await expect(app.locator('.glance-building').first()).toHaveCSS('width',width<=700?'140px':'225px');await expect(app.locator('.glance-building dl').first()).toHaveCSS('display',width<=700?'grid':'flex');
 if(width<=700){await expect(app.locator('.glance-building').first()).toHaveCSS('background-color','rgba(0, 0, 0, 0)');await expect(app.locator('.glance-building dd').first()).toHaveCSS('font-size','9px');}
 const imageBox=await app.locator('.glance-art-frame>img').boundingBox(),labels=await app.locator('.glance-building').evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom};}));
 for(const box of labels){expect(box.x).toBeGreaterThanOrEqual(imageBox!.x);expect(box.right).toBeLessThanOrEqual(imageBox!.x+imageBox!.width+1);expect(box.y).toBeGreaterThanOrEqual(imageBox!.y);expect(box.bottom).toBeLessThanOrEqual(imageBox!.y+imageBox!.height+1);}expect(labels[0].bottom).toBeLessThan(labels[1].y);expect(labels[1].bottom).toBeLessThan(labels[2].y);
 await expect(app.locator('.glance-bars,.glance-hour-picker,.glance-destinations details')).toHaveCount(0);await expect(app.locator('.glance-included-days')).toHaveText('포함일 · 전월 1 일 / 선택월 1 일');
 await expect(app.getByRole('link',{name:'국가 전체 보기 (1) ↗'})).toHaveAttribute('href',new RegExp('#airport-departure-model-slot$'));
 await app.getByRole('button',{name:'T1',exact:true}).click();await expect(app.getByTestId('glance-key-wait')).toContainText('T1 출국장 2E · 12 분');await expect(app.locator('.glance-map-heading')).toContainText('156 편');
 const disclosure=app.locator('.glance-airport>.glance-context summary');await disclosure.focus();await page.keyboard.press('Enter');await expect(app.locator('.glance-airport>.glance-context p').first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});
test('rapid past-day changes clear present waits and upcoming departures',async({page})=>{
 await routeData(page);await page.goto('/ko/airport-glance-preview');const app=page.getByTestId('airport-glance-preview');await expect(app.getByTestId('glance-key-wait')).toContainText('24 분');
 await app.locator('input[type=date]').fill('2026-10-09');await app.locator('input[type=date]').fill('2026-10-10');await expect(app.locator('.glance-map-heading')).toContainText('0 편');await expect(app.getByTestId('glance-key-wait')).toContainText('확인 가능한 자료 없음');await expect(app.getByTestId('glance-key-upcoming')).toContainText('현재 이후 예정편 없음');await expect(app.locator('.glance-map-queue')).toHaveCount(0);
 await app.getByRole('button',{name:'오늘',exact:true}).click();await expect(app.locator('.glance-map-heading')).toContainText('300 편');
});
test('failed data does not invent any decision or ratio',async({page})=>{
 for(const api of ['summary','flights','airport-months'])await page.route(`**/api/live/${api}*`,route=>route.fulfill({status:503,json:{error:'unavailable'}}));await page.goto('/en/airport-glance-preview');const app=page.getByTestId('airport-glance-preview');await expect(app.locator('.glance-insights strong')).toHaveText(['No verified data','No verified data','No verified data']);await expect(app.locator('.glance-destinations li,.glance-ranking tbody tr,.glance-map-queue')).toHaveCount(0);
});
for(const lang of ['en','zh','ja'] as const)test(`localized decision summary ${lang}`,async({page})=>{await page.setViewportSize({width:360,height:900});await routeData(page);await page.goto(`/${lang}/airport-glance-preview`);const app=page.getByTestId('airport-glance-preview');await expect(app.locator('.glance-insights a')).toHaveCount(3);await expect(app.locator('.glance-ranking tbody tr')).toHaveCount(5);await expect(app.locator('.glance-map-queue')).toHaveCount(2);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);});

test('missing summary clock cannot turn available flight records into a no-upcoming claim',async({page})=>{
 await page.route('**/api/live/summary*',route=>route.fulfill({status:503,json:{error:'unavailable'}}));await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',serviceDateKst:date,flights,retrievedAt:`${date}T00:00:00Z`,truncated:false}}));await page.route('**/api/live/airport-months*',route=>route.fulfill({json:monthly}));await page.goto('/ko/airport-glance-preview');const app=page.getByTestId('airport-glance-preview');await expect(app.locator('.glance-status')).toHaveText('확인 가능한 자료가 없습니다.');await app.locator('input[type=date]').fill(date);await expect(app.locator('.glance-map-heading')).toContainText('300 편');await expect(app.getByTestId('glance-key-upcoming')).toContainText('확인 가능한 자료 없음');await expect(app.getByTestId('glance-key-upcoming')).not.toContainText('현재 이후 예정편 없음');
});

// Flights may finish before the selected-day summary; absence of a clock is not zero upcoming flights.
test('pending past-day summary stays unavailable until its matching response arrives',async({page})=>{
 await routeData(page);await page.goto('/ko/airport-glance-preview');const app=page.getByTestId('airport-glance-preview');await expect(app.getByTestId('glance-key-wait')).toContainText('24 분');
 let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/live/summary*',async route=>{await pending;return routeSummary({...SUMMARY_FIXTURE,dayRelation:'PAST',todayKst:date,serviceDateKst:'2026-10-10',airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:'2026-10-10',congestion:[]},generatedAt:`${date}T10:15:00+09:00`})(route);});
 await app.locator('input[type=date]').fill('2026-10-10');await expect(app.locator('.glance-map-heading')).toContainText('0 편');await expect(app.getByTestId('glance-key-upcoming')).toContainText('확인 가능한 자료 없음');await expect(app.locator('.glance-map-queue')).toHaveCount(0);
 release();await expect(app.getByTestId('glance-key-upcoming')).toContainText('현재 이후 예정편 없음');
});

test('future cards share hours and terminal scope without changing whole-day comparison',async({page})=>{
 await routeData(page);await page.setViewportSize({width:390,height:1000});await page.goto('/ko/airport-glance-preview');const app=page.getByTestId('airport-glance-preview'),future=app.getByTestId('glance-future');await expect(future.getByRole('heading',{name:'앞으로 가장 몰릴 구역',exact:true})).toBeVisible();await expect(future.getByRole('heading',{name:'곧 몰리는 목적지',exact:true})).toBeVisible();
 await expect(future.locator(':scope>p')).toContainText('10:15–11:15 KST · 전체 · 12 편');await expect(app.getByTestId('glance-future-countries')).toContainText('12 편');await expect(app.getByTestId('glance-future-countries')).toContainText('100%');
 await future.getByRole('button',{name:'향후 3 시간',exact:true}).click();await expect(future.locator(':scope>p')).toContainText('10:15–13:15 KST · 전체 · 39 편');await expect(app.getByTestId('glance-future-countries')).toContainText('39 편');await app.getByTestId('glance-future-zones').getByText('구역별 보기',{exact:true}).click();await expect(app.getByTestId('glance-future-zones')).toContainText('20 편');await expect(app.getByTestId('glance-day-comparison')).toContainText('300 편');
 await future.getByRole('button',{name:'향후 6 시간',exact:true}).click();await expect(future.locator(':scope>p')).toContainText('87 편');
 await app.getByRole('button',{name:'T2',exact:true}).click();await expect(app.getByTestId('glance-day-comparison')).toContainText('오늘 출발편 144 편');await expect(app.getByTestId('glance-day-comparison')).toContainText('비교 불가');await expect(future.locator(':scope>p')).toContainText('T2 · 42 편');
 await app.locator('input[type=date]').fill('2026-10-10');await expect(app.getByTestId('glance-future-zones')).toContainText('확인 가능한 자료 없음');await expect(app.getByTestId('glance-future-countries')).toContainText('확인 가능한 자료 없음');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
