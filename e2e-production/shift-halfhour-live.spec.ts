import {test,expect} from '@playwright/test';
import {BUSINESS_KEY} from '../lib/business-preferences';
import {airportHistoryPayload} from '../app/airport-history-client';
import {verifiedHalfHours} from '../lib/airport-flight-hours';
import {buildShiftBriefing} from '../lib/shift-briefing';
import {kstDayOf} from '../lib/kst';
import {AIRPORT_SIDES_VERSION} from '../lib/airport-sides';
import {formatCountChange} from '../lib/change-rate';
import type {FlightsPayload} from '../app/flights-client';
import type {GlanceWeekReference} from '../lib/glance-week-comparison';

/** Existing deployment-triggered read-only workflow. Observe the page's own
 * bounded reads, never call a provider or change production storage. A correct
 * unavailable state is evidence of withheld coverage, not completed backfill. */
for(const width of [390,1440])test(`exact half-hour shift live evidence ${width}`,async({page},info)=>{
 const day=kstDayOf(new Date().toISOString()),hours={open:'06:30',close:'15:30'};
 const errors:string[]=[],reads:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(/\/api\/live\/(airport-days|flights|glance-week-reference)(\?|$)/.test(new URL(request.url()).pathname))reads.push(request.url());});
 await page.setViewportSize({width,height:1000});
 await page.addInitScript(({key,hours})=>{
  localStorage.setItem(key,JSON.stringify({version:1,place:'airport',terminal:'T2',side:'EAST',hours}));
  const prefs=JSON.parse(localStorage.getItem('retailpulse-preferences')??'{}');
  localStorage.setItem('retailpulse-preferences',JSON.stringify({...prefs,industry:'fashion'}));
 },{key:BUSINESS_KEY,hours});
 const response=(path:string)=>page.waitForResponse(reply=>{
  const url=new URL(reply.url());return url.pathname===path&&url.searchParams.get('date')===day;
 },{timeout:30_000});
 const historyReply=response('/api/live/airport-days'),flightsReply=response('/api/live/flights'),weekReply=response('/api/live/glance-week-reference');
 await page.goto(`/ko?insight=briefing&date=${day}&terminal=T2`);
 const [historyResponse,flightResponse,weekResponse]=await Promise.all([historyReply,flightsReply,weekReply]);
 for(const reply of [historyResponse,flightResponse,weekResponse])expect(reply.ok(),`${reply.url()} HTTP ${reply.status()}`).toBe(true);
 const rawHistory:unknown=await historyResponse.json(),history=airportHistoryPayload(rawHistory,day);
 expect(history,'exact-date history contract must be readable').not.toBeNull();
 const flights=await flightResponse.json() as FlightsPayload,week=await weekResponse.json() as {status:string;data:GlanceWeekReference|null};
 expect(flights.mode).toBe('live-flights');expect(flights.serviceDateKst).toBe(day);expect(flights.truncated).toBe(false);
 expect(week.status).toBe('READY');expect(week.data?.day).toBe(day);
 const expected=buildShiftBriefing({day,nowIso:new Date().toISOString(),terminal:'T2',side:null,hours,flights,history:history!.history,weekReference:week.data});
 const coverage=history!.history.map(row=>({day:row.T2.day,complete:row.T2.complete,precision:verifiedHalfHours(row.T2)?'READY':row.T2.halfHours===undefined?'MISSING':'INVALID'}));
 const evidence={observedAt:new Date().toISOString(),day,width,scope:'T2 whole terminal',hours,coverage,
  discardedRows:history!.discardedRows??0,flightSource:{basis:flights.basis,retrievedAt:flights.retrievedAt,rows:flights.flights.length,truncated:flights.truncated},
  reference:week.data,current:{status:expected.current.status,reason:expected.current.reason,total:expected.current.total},comparisons:expected.comparisons};
 await info.attach(`shift-halfhour-source-${width}.json`,{body:Buffer.from(JSON.stringify({evidence,airportDays:rawHistory},null,2)),contentType:'application/json'});
 console.log(`SHIFT_HALFHOUR_EVIDENCE ${JSON.stringify(evidence)}`);
 const briefing=page.getByTestId('shift-briefing'),main=briefing.locator('.shift-comparisons');
 await expect(briefing).toHaveAttribute('data-configured','true');await expect(page.getByTestId('shift-scope')).toContainText('06:30–15:30');
 await expect(page.getByTestId('shift-scope')).toContainText('동편 근무');await expect(page.getByTestId('shift-scope')).toContainText('패션·잡화');
 for(const kind of ['week','month'] as const){
  const value=expected.comparisons[kind],card=main.getByTestId(`shift-comparison-${kind}`);
  // Independently sum the exact [06:30,15:30) bins. This does not call the
  // application's comparison selector or reuse its included-date list.
  const dates=new Map<string,NonNullable<typeof history>['history']>();
  for(const entry of history!.history){if(entry.T2.day<value.start||entry.T2.day>value.end)continue;const matches=dates.get(entry.T2.day)??[];matches.push(entry);dates.set(entry.T2.day,matches);}
  const independentlyIncluded=[...dates].flatMap(([date,rows])=>{
   if(rows.length!==1||rows[0].T2.complete!==true||rows[0].T2.sidesVersion!==AIRPORT_SIDES_VERSION)return [];
   const bins=verifiedHalfHours(rows[0].T2);if(!bins)return [];
   let total=0;for(let bin=13;bin<31;bin++)total+=bins[bin];return [{date,total}];
  });
  if(expected.current.comparisonEligible){
   const baseline=independentlyIncluded.length?independentlyIncluded.reduce((sum,item)=>sum+item.total,0)/independentlyIncluded.length:null;
   expect(value.baseline,'independent exact half-hour bin sum').toBe(baseline);
   expect([...value.includedDates].sort()).toEqual(independentlyIncluded.map(item=>item.date).sort());
  }
  expect(value.status,'network responses must settle, not remain loading').not.toBe('LOADING');
  await expect(card).toHaveAttribute('data-status',value.status);
  if(value.baseline!==null&&value.delta!==null){
   await expect(card).toHaveAttribute('data-baseline',String(value.baseline));await expect(card).toHaveAttribute('data-delta',String(value.delta));
   expect(value.includedDates.length).toBeGreaterThan(0);await expect(card).not.toContainText('미확인');await expect(card).not.toContainText('자료 없음');
   if(value.status==='PARTIAL')await expect(card).toContainText('전월 확인일 평균');
   if(value.delta===0)await expect(card.locator('strong')).toHaveText(value.status==='PARTIAL'?'확인일 기준 차이 0편':'변화 없음');
   else await expect(card.locator('.glance-count-change > [aria-hidden="true"]')).toHaveText(formatCountChange(value.delta,new Intl.NumberFormat('ko',{maximumFractionDigits:1}).format)+'편');
  }else{
   await expect(card).not.toHaveAttribute('data-baseline',/./);await expect(card).not.toHaveAttribute('data-delta',/./);
   await expect(card).toHaveAttribute('data-reason',value.reason!);await expect(card).not.toContainText('비교자료 없음');
   const reason=value.reason==='MINUTE_HISTORY_MISSING'?'30분 비교자료 미확인':value.reason==='BASELINE_MISSING'?'해당 날짜 자료 없음':value.reason==='BASELINE_INVALID'?'과거 자료 검증 필요':'선택일 전체 자료 확인 전';
   await expect(card.locator('strong')).toHaveText(reason);
  }
 }
 await page.getByTestId('shift-details').locator(':scope > summary').click();
 for(const kind of ['week','month'] as const){
  const baseline=expected.comparisons[kind].baseline;
  if(baseline!==null)await expect(page.getByTestId('shift-details').getByTestId(`shift-comparison-${kind}`).locator('small')).toContainText(`비교 기준 ${new Intl.NumberFormat('ko',{maximumFractionDigits:1}).format(baseline)}편`);
 }
 if(expected.comparisons.month.baseline!==null)await expect(page.getByTestId('shift-details')).toContainText(`${expected.comparisons.month.includedDates.length}/${expected.comparisons.month.expectedDays}일`);
 await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await info.attach(`shift-halfhour-live-${width}.png`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 for(const path of ['/api/live/airport-days','/api/live/glance-week-reference'])expect(reads.filter(url=>new URL(url).pathname===path).length).toBe(1);
 expect(reads.filter(url=>new URL(url).pathname==='/api/live/flights').length).toBeLessThanOrEqual(2);
 expect(errors).toEqual([]);
});
