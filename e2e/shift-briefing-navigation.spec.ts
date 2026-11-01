import {test,expect,type Page} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import {AIRPORT_SIDES_VERSION} from '../lib/airport-sides';
import {BUSINESS_KEY} from '../lib/business-preferences';

const day='2026-11-01',now=`${day}T13:00:00+09:00`;
const checkKey='koretail-shift-check-v1';
const tabOrder=['overview','briefing','rhythm','weekday','terminal','holiday'];
const tabLabels=['공항한눈에','내 근무 브리핑','언제 몰렸나요?','항공편 주말이 더 많나요?','어느 터미널이 달라졌나요?','연휴에는 늘었나요?'];
const shift={version:1,place:'airport',terminal:'T2',side:'WEST',hours:{open:'07:00',close:'15:00'}};
const shiftHours=Array.from({length:24},(_,hour)=>hour===7?1:hour===8?2:hour===10?1:0);
const historicalDay=(date:string,terminal:'T1'|'T2')=>({day:date,complete:true,sidesVersion:AIRPORT_SIDES_VERSION,total:terminal==='T2'?4:1,hours:terminal==='T2'?shiftHours:Array.from({length:24},(_,hour)=>hour===9?1:0),sides:terminal==='T2'?[2,1,1,0]:[1,0,0,0],groups:{}});
const history=Array.from({length:31},(_,index)=>{const date=`2026-10-${String(index+1).padStart(2,'0')}`;return {T1:historicalDay(date,'T1'),T2:historicalDay(date,'T2')};});
function flightData(date:string){
 const retrievedAt=`${date}T06:00:00+09:00`;
 const row=(physicalFlightId:string,hour:string,gate:string,airportCode:string,terminal='T2')=>({physicalFlightId,flightNumber:physicalFlightId,scheduledAt:`${date}T${hour}:00+09:00`,retrievedAt,direction:'departure',terminal,gate,airportCode,status:'scheduled'});
 return {mode:'live-flights',serviceDateKst:date,generatedAt:now,retrievedAt,truncated:false,basis:'COLLECTED_FLIGHT_RECORDS',flights:[
  row('WEST-JP','07:00','225','NRT'),row('EAST-CN-1','08:00','268','PVG'),row('EAST-CN-2','08:30','270','PEK'),row('CENTRE-US','10:00','250','LAX'),
  row('AFTER-SHIFT','16:00','268','NRT'),row('OTHER-TERMINAL','09:00','26','NRT','T1'),
 ]};
}
async function fixtures(page:Page){
 await page.clock.setFixedTime(new Date(now));await page.emulateMedia({reducedMotion:'reduce'});
 // Every response here is synthetic and limited to the selected date. No live
 // airport service or third-party data is needed to verify the navigation.
 await page.route('**/api/**',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*',route=>{
  const date=new URL(route.request().url()).searchParams.get('date')??day;
  return route.fulfill({json:{...summary,generatedAt:now,todayKst:day,serviceDateKst:date,dayRelation:date===day?'TODAY':date<day?'PAST':'FUTURE',airport:{...summary.airport,serviceDateKst:date}}});
 });
 await page.route('**/api/live/flights*',route=>route.fulfill({json:flightData(new URL(route.request().url()).searchParams.get('date')??day)}));
 await page.route('**/api/live/airport-days*',route=>{
  const date=new URL(route.request().url()).searchParams.get('date')??day;
  return route.fulfill({json:{mode:'airport-days',date,history:history.filter(row=>row.T1.day<date),countryDays:[]}});
 });
 await page.route('**/api/live/glance-week-reference*',route=>{
  const date=new URL(route.request().url()).searchParams.get('date')??day;
  const previousDay=new Date(Date.parse(`${date}T00:00:00Z`)-7*86_400_000).toISOString().slice(0,10);
  return route.fulfill({json:{status:'READY',month:date.slice(0,7),data:{day:date,previousDay,passengers:{all:null,T1:null,T2:null},flights:null,selectedFlights:{all:6,T1:1,T2:5,CONCOURSE:0},...(date===day?{selectedFlightSnapshot:{day:date,retrievedAt:`${date}T06:00:00+09:00`,provisional:true}}:{})}}});
 });
}
async function saveShift(page:Page){
 const settings=page.getByTestId('shift-settings');await expect(settings).toBeVisible();
 await settings.getByLabel('터미널',{exact:true}).selectOption('T2');
 await settings.getByLabel('매장 위치 (선택)',{exact:true}).selectOption('WEST');
 await settings.getByLabel('업종',{exact:true}).selectOption('fashion');
 await settings.getByLabel('근무 시작',{exact:true}).selectOption('07:00');
 await settings.getByLabel('근무 종료',{exact:true}).selectOption('15:00');
 await settings.getByRole('button',{name:'저장하고 보기',exact:true}).click();
 await expect(page.getByTestId('shift-briefing')).toHaveAttribute('data-configured','true');
 await expect(page.getByTestId('shift-count').locator('strong')).toHaveText('4');
}

for(const width of [320,430,701,1440])test(`shift briefing is the second reachable tab and mounts only when opened ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});await fixtures(page);await page.goto(`/ko?date=${day}&terminal=T2`);
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const tabs=page.locator('#airport-glance-tabs [role=tab]');await expect(tabs).toHaveText(tabLabels);
 expect(await tabs.evaluateAll(nodes=>nodes.map(node=>node.id))).toEqual(tabOrder.map(view=>'airport-insight-tab-'+view));
 await expect(page.getByTestId('shift-briefing')).toHaveCount(0);await expect(page.locator('#airport-insight-overview')).toBeVisible();
 expect(await page.evaluate(key=>localStorage.getItem(key),checkKey)).toBeNull();
 const tab=page.locator('#airport-insight-tab-briefing');await tab.click();await expect(tab).toHaveAttribute('aria-selected','true');await expect(tab).toHaveAttribute('aria-controls','airport-insight-briefing');
 expect(new URL(page.url()).searchParams.get('insight')).toBe('briefing');
 const panel=page.locator('#airport-insight-briefing');await expect(panel).toHaveAttribute('role','tabpanel');await expect(panel).toHaveAttribute('aria-labelledby','airport-insight-tab-briefing');await expect(panel).toBeVisible();
 await expect(panel.getByTestId('shift-briefing')).toHaveCount(1);await expect(page.locator('#airport-insight-overview')).toBeHidden();await expect(page.locator('.airport-period-frame')).toHaveCount(0);
 const settings=panel.getByTestId('shift-settings');await expect(settings.getByLabel('터미널',{exact:true})).toHaveValue('T2');await expect(settings.getByLabel('업종',{exact:true})).toHaveValue('');await expect(panel).not.toContainText('명동');
 for(const control of await settings.locator('select,button').all())expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath(`shift-tab-setup-${width}.png`),fullPage:true});
 await page.locator('#airport-insight-tab-overview').click();await expect(page.getByTestId('shift-briefing')).toHaveCount(0);await expect(page.locator('#airport-insight-overview')).toBeVisible();
 expect(await page.evaluate(key=>localStorage.getItem(key),checkKey)).toBeNull();
});

for(const width of [390,1440])test(`saved shift survives refresh and both store sides retain terminal-wide flights ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});await fixtures(page);await page.goto(`/ko?insight=briefing&date=${day}&terminal=T2`);await saveShift(page);
 const scope=page.getByTestId('shift-scope'),destinations=page.getByTestId('shift-destinations');
 await expect(scope).toContainText('T2');await expect(scope).toContainText('서편 근무');await expect(scope).toContainText('07:00–15:00');await expect(scope).toContainText('패션·잡화');
 await expect(destinations).toContainText('중국');await expect(destinations).toContainText('일본');await expect(destinations).toContainText('미국');await expect(destinations).toContainText('승객 국적과 다름');
 await expect(page.getByTestId('shift-briefing')).toContainText('동·서편 모두 포함');
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)??'null'),BUSINESS_KEY)).toEqual(shift);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('retailpulse-preferences')??'{}').industry)).toBe('fashion');
 await page.reload();await expect(page.locator('#airport-insight-tab-briefing')).toHaveAttribute('aria-selected','true');await expect(page.getByTestId('shift-settings')).toHaveCount(0);await expect(page.getByTestId('shift-count').locator('strong')).toHaveText('4');await expect(scope).toContainText('서편 근무');
 await expect(page.getByTestId('shift-briefing')).toContainText('지난 확인 이후 주요 변화가 없습니다.');
 const details=page.getByTestId('shift-details');await details.locator(':scope > summary').click();await expect(details.locator('.shift-details-content > section').first()).toContainText('서편·중앙 포함');await expect(details.locator('.shift-details-content > section').first()).toContainText('2편');
 await page.getByTestId('shift-briefing').getByRole('button',{name:'설정 변경',exact:true}).click();await page.getByTestId('shift-settings').getByLabel('매장 위치 (선택)',{exact:true}).selectOption('EAST');await page.getByTestId('shift-settings').getByRole('button',{name:'저장하고 보기',exact:true}).click();
 await expect(scope).toContainText('동편 근무');await expect(page.getByTestId('shift-count').locator('strong')).toHaveText('4');await expect(destinations).toContainText('일본');await expect(destinations).toContainText('중국');
 await expect(details.locator('.shift-details-content > section').first()).toContainText('동편·중앙 포함');await expect(details.locator('.shift-details-content > section').first()).toContainText('3편');
 const href=new URL((await page.locator('.shift-detail-link').getAttribute('href'))!,page.url());expect(href.searchParams.get('place')).toBe('airport');expect(href.searchParams.get('terminal')).toBe('T2');expect(href.searchParams.get('side')).toBe('EAST');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath(`shift-tab-saved-${width}.png`),fullPage:true});
 // A different visiting terminal must not overwrite this device's saved store.
 await page.goto(`/ko?insight=briefing&date=${day}&terminal=T1`);await expect(scope).toContainText('T2');await expect(scope).toContainText('동편 근무');await expect(scope).toContainText('패션·잡화');await expect(page.getByTestId('shift-count').locator('strong')).toHaveText('4');
});

test('briefing keyboard history date changes and same-page logo return keep URL and panel aligned',async({page})=>{
 await fixtures(page);await page.goto(`/ko?date=${day}`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const overview=page.locator('#airport-insight-tab-overview'),briefing=page.locator('#airport-insight-tab-briefing'),rhythm=page.locator('#airport-insight-tab-rhythm');
 await overview.focus();await page.keyboard.press('ArrowRight');await expect(briefing).toBeFocused();await expect(briefing).toHaveAttribute('aria-selected','true');await expect(page.getByTestId('shift-settings')).toBeVisible();
 await page.keyboard.press('ArrowRight');await expect(rhythm).toBeFocused();await expect(rhythm).toHaveAttribute('aria-selected','true');await expect(page.getByTestId('shift-briefing')).toHaveCount(0);await expect(page.locator('.airport-period-frame')).toHaveCount(1);
 await page.goBack();await expect(briefing).toHaveAttribute('aria-selected','true');await expect(page.locator('.airport-period-frame')).toHaveCount(0);
 await page.goForward();await expect(rhythm).toHaveAttribute('aria-selected','true');await page.goBack();await expect(briefing).toHaveAttribute('aria-selected','true');
 const date=page.locator('#airport-insight-briefing input[type=date]');await expect(date).toHaveValue(day);await date.fill('2026-10-31');
 await expect.poll(()=>new URL(page.url()).searchParams.get('date')).toBe('2026-10-31');expect(new URL(page.url()).searchParams.get('insight')).toBe('briefing');await expect(briefing).toHaveAttribute('aria-selected','true');
 await page.getByRole('button',{name:'KORETAIL home',exact:true}).click();await expect(overview).toHaveAttribute('aria-selected','true');await expect(page.locator('#airport-insight-overview')).toBeVisible();await expect(page.getByTestId('shift-briefing')).toHaveCount(0);expect(new URL(page.url()).searchParams.has('insight')).toBe(false);
});

test('Japanese exposes only overview and briefing while locale changes preserve the briefing deep link',async({page})=>{
 await page.setViewportSize({width:390,height:1000});await fixtures(page);await page.goto(`/ja?insight=briefing&date=${day}`);
 const tabs=page.locator('#airport-glance-tabs [role=tab]');await expect(tabs).toHaveCount(2);expect(await tabs.evaluateAll(nodes=>nodes.map(node=>node.id))).toEqual(['airport-insight-tab-overview','airport-insight-tab-briefing']);
 await expect(page.locator('#airport-insight-tab-briefing')).toHaveAttribute('aria-selected','true');await expect(page.locator('#airport-insight-briefing').getByTestId('shift-settings')).toBeVisible();await expect(page.locator('#airport-insight-briefing')).not.toContainText(/[가-힣]/);await expect(page.locator('.airport-period-frame')).toHaveCount(0);
 const language=page.locator('select').filter({has:page.locator('option[value="zh"]')}).first();
 for(const lang of ['en','zh','ko']){
  await language.selectOption(lang);await expect.poll(()=>new URL(page.url()).pathname).toBe('/'+lang);await expect(tabs).toHaveCount(6);await expect(page.locator('#airport-insight-tab-briefing')).toHaveAttribute('aria-selected','true');await expect(page.locator('#airport-insight-briefing').getByTestId('shift-settings')).toBeVisible();expect(new URL(page.url()).searchParams.get('date')).toBe(day);expect(new URL(page.url()).searchParams.get('insight')).toBe('briefing');if(lang!=='ko')await expect(page.locator('#airport-insight-briefing')).not.toContainText(/[가-힣]/);
 }
 await page.goto(`/ja?insight=rhythm&date=${day}`);await expect(page.locator('#airport-insight-tab-overview')).toHaveAttribute('aria-selected','true');await expect(page.locator('.airport-period-frame')).toHaveCount(0);
});
