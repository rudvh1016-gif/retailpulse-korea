import {test,expect,type Page} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import {AIRPORT_SIDES_VERSION} from '../lib/airport-sides';
import {BUSINESS_KEY} from '../lib/business-preferences';

const day='2026-11-04',now=`${day}T00:35:00+09:00`,retrievedAt=`${day}T00:24:00+09:00`;
const shift={version:1,place:'airport',terminal:'T2',side:'EAST',hours:{open:'06:30',close:'15:30'}};
const times=['06:29:59','06:30:00','07:30:00','15:29:59','15:30:00','23:59:59'];
function history(precise:boolean){return Array.from({length:31},(_,index)=>{
 const date=`2026-10-${String(index+1).padStart(2,'0')}`;
 const part=(terminal:'T1'|'T2')=>{
  const hours=Array(24).fill(0),halfHours=Array(48).fill(0);
  // Independent synthetic counts: only 06:30 and 15:00 bins are inside the
  // selected shift; 06:00 and 15:30 are outside. Do not split an hourly count.
  if(terminal==='T2'){halfHours[12]=1;halfHours[13]=1;halfHours[30]=1;halfHours[31]=1;hours[6]=2;hours[15]=2;}
  return {day:date,complete:true,sidesVersion:AIRPORT_SIDES_VERSION,total:terminal==='T2'?4:0,hours,...(precise?{halfHours}:{}),sides:terminal==='T2'?[0,0,4,0]:[0,0,0,0],groups:{}};
 };
 return {T1:part('T1'),T2:part('T2')};
});}
async function fixtures(page:Page,precise:boolean){
 await page.clock.setFixedTime(new Date(now));await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(({key,value})=>{localStorage.setItem(key,JSON.stringify(value));localStorage.setItem('retailpulse-preferences',JSON.stringify({industry:'fashion'}));},{key:BUSINESS_KEY,value:shift});
 await page.route('**/api/**',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*',route=>route.fulfill({json:{...summary,generatedAt:now,todayKst:day,serviceDateKst:day,dayRelation:'TODAY',airport:{...summary.airport,serviceDateKst:day}}}));
 await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',serviceDateKst:day,retrievedAt,truncated:false,basis:'COLLECTED_FLIGHT_RECORDS',flights:times.map((time,index)=>({physicalFlightId:String(index),flightNumber:String(index),scheduledAt:`${day}T${time}+09:00`,retrievedAt,direction:'departure',terminal:'T2',gate:'250',airportCode:'NRT',status:'scheduled'}))}}));
 await page.route('**/api/live/glance-week-reference*',route=>route.fulfill({json:{status:'READY',month:'2026-11',data:{day,previousDay:'2026-10-28',passengers:{all:null,T1:null,T2:null},flights:null,selectedFlights:{all:6,T1:0,T2:6,CONCOURSE:0},selectedFlightSnapshot:{day,retrievedAt,provisional:true}}}}));
 await page.route('**/api/live/airport-days*',route=>route.fulfill({json:{mode:'airport-days',date:day,history:history(precise),countryDays:[]}}));
}
for(const width of [390,1440]){
 test(`exact half-hour comparisons and actual partial denominator ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:1000});await fixtures(page,true);await page.goto(`/ko?insight=briefing&date=${day}&terminal=T2`);
  const briefing=page.getByTestId('shift-briefing'),main=briefing.locator('.shift-comparisons');
  await expect(page.getByTestId('shift-count').locator('strong')).toHaveText('3');
  await expect(page.getByTestId('shift-scope')).toContainText('06:30–15:30');
  for(const kind of ['week','month']){
   const card=main.getByTestId(`shift-comparison-${kind}`);await expect(card).toHaveAttribute('data-status','READY');await expect(card).toHaveAttribute('data-baseline','2');await expect(card).toHaveAttribute('data-delta','1');await expect(card).not.toContainText('자료 없음');
  }
  await expect(briefing.getByTestId('share-preview')).toContainText('비교 기준 2편');
  const details=page.getByTestId('shift-details');await details.locator(':scope > summary').click();await expect(details).toContainText('31/31일');
  await briefing.getByRole('button',{name:'설정 변경',exact:true}).click();await page.getByTestId('shift-settings').getByRole('combobox',{name:'근무 시작',exact:true}).selectOption('07:00');await page.getByTestId('shift-settings').getByRole('button',{name:'취소',exact:true}).click();await expect(page.getByTestId('shift-scope')).toContainText('06:30–15:30');
  await page.reload();await expect(main.getByTestId('shift-comparison-week')).toHaveAttribute('data-baseline','2');
  // A missing precise date is excluded, not assigned zero or divided by 31.
  const partial=history(true);delete partial[0].T2.halfHours;
  await page.route('**/api/live/airport-days*',route=>route.fulfill({json:{mode:'airport-days',date:day,history:partial,countryDays:[]}}));await page.reload();
  const month=main.getByTestId('shift-comparison-month');await expect(month).toHaveAttribute('data-status','PARTIAL');await expect(month).toHaveAttribute('data-baseline','2');await expect(month).toContainText('전월 확인일 평균');
  await page.getByTestId('shift-details').locator(':scope > summary').click();await expect(page.getByTestId('shift-details')).toContainText('30/31일');
  await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath(`half-hour-partial-${width}.png`),fullPage:true});
 });
 test(`legacy and invalid half-hour reasons remain visible and shareable ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:1000});await fixtures(page,false);await page.goto(`/ko?insight=briefing&date=${day}&terminal=T2`);
  const briefing=page.getByTestId('shift-briefing'),main=briefing.locator('.shift-comparisons');
  await expect(page.getByTestId('shift-count').locator('strong')).toHaveText('3');
  for(const kind of ['week','month']){const card=main.getByTestId(`shift-comparison-${kind}`);await expect(card).toHaveAttribute('data-reason','MINUTE_HISTORY_MISSING');await expect(card.locator('strong')).toHaveText('30분 비교자료 미확인');await expect(card).not.toHaveAttribute('data-baseline',/./);}
  await expect(briefing.getByTestId('share-preview')).toContainText('30분 비교자료 미확인');await expect(page.getByTestId('shift-details')).not.toHaveAttribute('open','');
  await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath(`half-hour-missing-${width}.png`),fullPage:true});
  // The public projection uses null to distinguish invalid from absent bins.
  const invalid=history(false).map(entry=>({...entry,T2:{...entry.T2,halfHours:null}}));
  await page.route('**/api/live/airport-days*',route=>route.fulfill({json:{mode:'airport-days',date:day,history:invalid,countryDays:[]}}));await page.reload();
  await expect(main.getByTestId('shift-comparison-week')).toHaveAttribute('data-reason','BASELINE_INVALID');await expect(main.getByTestId('shift-comparison-week').locator('strong')).toHaveText('과거 자료 검증 필요');await expect(briefing.getByTestId('share-preview')).toContainText('과거 자료 검증 필요');
  // Whole-hour selection remains supported by the original hourly history.
  await briefing.getByRole('button',{name:'설정 변경',exact:true}).click();const settings=page.getByTestId('shift-settings');await settings.getByRole('combobox',{name:'근무 시작',exact:true}).selectOption('06:00');await settings.getByRole('combobox',{name:'근무 종료',exact:true}).selectOption('16:00');await settings.getByRole('button',{name:'저장하고 보기',exact:true}).click();
  await expect(main.getByTestId('shift-comparison-week')).toHaveAttribute('data-status','READY');await expect(main.getByTestId('shift-comparison-week')).toHaveAttribute('data-baseline','4');await expect(page.getByTestId('shift-count').locator('strong')).toHaveText('5');
 });
}
