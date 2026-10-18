import {test,expect,type Page} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
const day='2026-08-31';
async function setup(page:Page,airport:Partial<typeof SUMMARY_FIXTURE.airport>&{transferForecast?:{serviceDate:string;terminal:string;expectedTransferPassengers:number;retrievedAt:string}[]}={}){
 await page.clock.setFixedTime(new Date(`${day}T14:15:00+09:00`));
 await page.route('**/api/live/summary*',route=>{const selected=new URL(route.request().url()).searchParams.get('date')??day;return routeSummary({...SUMMARY_FIXTURE,serviceDateKst:selected,dayRelation:selected===day?'TODAY':'PAST',airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:selected,...airport}})(route);});
 await page.route('**/api/live/flights*',route=>route.fulfill({json:{mode:'live-flights',serviceDateKst:new URL(route.request().url()).searchParams.get('date'),flights:[],retrievedAt:`${day}T00:00:00Z`,truncated:false}}));
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:{status:'UNAVAILABLE',data:null,calculatedAt:null}}));
}
for(const width of [360,390,430,1440])test(`official daily passenger row scopes and date ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);await page.goto('/ko/airport-glance');
 const app=page.getByTestId('airport-glance-preview'),row=app.getByTestId('glance-key-passengers');
 await expect(row).toContainText('오늘 예상 출국객');await expect(row.locator('strong')).toHaveText('47,320명');await expect(row).toContainText('T1 + T2');await expect(row).toContainText('09:05');
 const passengerBox=await row.boundingBox(),waitBox=await app.getByTestId('glance-key-wait').boundingBox();expect(passengerBox!.y+passengerBox!.height).toBeLessThanOrEqual(waitBox!.y+1);
 for(const [scope,total,label,time] of [['T2','17,220명','T2','09:05'],['T1','30,100명','T1 공통(탑승동 포함)','09:00'],['탑승동','30,100명','T1 공통(탑승동 포함)','09:00'],['전체','47,320명','T1 + T2','09:05']]){await app.getByRole('button',{name:scope,exact:true}).click();await expect(row.locator('strong')).toHaveText(total);await expect(row.locator('small')).toContainText(label);await expect(row.locator('small')).toContainText(time);}
 await app.getByRole('button',{name:'탑승동',exact:true}).click();await expect(row).toHaveAttribute('href',/terminal=T1.*#airport-forecast-title$/);
 await app.locator('input[type=date]').fill('2026-08-29');await app.locator('input[type=date]').fill('2026-08-30');await expect(row).toContainText('선택일 예상 출국객');await expect(row.locator('small')).toContainText('2026-08-30');await expect(row).toHaveAttribute('href',/date=2026-08-30/);
 await row.focus();await expect(row).toBeFocused();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
 if(width===390||width===1440){await app.getByRole('button',{name:'오늘',exact:true}).click();await app.getByRole('button',{name:'T2',exact:true}).click();await expect(row.locator('strong')).toHaveText('17,220명');await page.screenshot({path:`outputs/glance-passenger-${width}.png`});}
});
for(const [lang,label] of [['en','Today’s expected departures'],['zh','今日预计出境旅客'],['ja','今日の予想出国者数']])test(`localized passenger row ${lang}`,async({page})=>{await page.setViewportSize({width:360,height:1000});await setup(page);await page.goto(`/${lang}/airport-glance`);const row=page.getByTestId('glance-key-passengers');await expect(row).toContainText(label);await expect(row.locator('strong')).toContainText('47,320');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);});
test('partial full-day coverage never displays a partial sum or hourly peak',async({page})=>{await setup(page,{todayExpectedPassengersTotal:999,forecastCoverage:{all:'PARTIAL',byTerminal:{T1:'COMPLETE',T2:'PARTIAL'}}});await page.goto('/ko/airport-glance');const row=page.getByTestId('glance-key-passengers');await expect(row.locator('strong')).toHaveText('일 합계 자료 불완전');await page.getByRole('button',{name:'T1',exact:true}).click();await expect(row.locator('strong')).toHaveText('30,100명');await page.getByRole('button',{name:'T2',exact:true}).click();await expect(row.locator('strong')).toHaveText('일 합계 자료 불완전');});
test('mismatched dates and failed data stay unavailable, while an explicit complete zero remains zero',async({page})=>{await setup(page,{serviceDateKst:'2026-08-30'});await page.goto('/ko/airport-glance');await expect(page.getByTestId('glance-key-passengers').locator('strong')).toHaveText('확인 가능한 자료 없음');await page.route('**/api/live/summary*',route=>route.fulfill({status:503,json:{error:'unavailable'}}));await page.reload();await expect(page.getByTestId('glance-key-passengers').locator('strong')).toHaveText('확인 가능한 자료 없음');await setup(page,{todayExpectedPassengersTotal:0});await page.reload();await expect(page.getByTestId('glance-key-passengers').locator('strong')).toHaveText('0명');});
test('pending selected-day summary clears the previous day passenger count',async({page})=>{await setup(page);await page.goto('/ko/airport-glance');const row=page.getByTestId('glance-key-passengers');await expect(row.locator('strong')).toHaveText('47,320명');let release!:()=>void;const pending=new Promise<void>(r=>{release=r;});await page.route('**/api/live/summary*',async route=>{await pending;return routeSummary({...SUMMARY_FIXTURE,serviceDateKst:'2026-08-30',dayRelation:'PAST',airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:'2026-08-30',todayExpectedPassengersTotal:50000}})(route);});await page.locator('.glance-controls input').fill('2026-08-30');await expect(row.locator('strong')).toHaveText('자료 확인 중…');release();await expect(row.locator('strong')).toHaveText('50,000명');});

for(const width of [360,390,430,1440])test(`transfer forecast stays separate, aligned and scoped ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});
 const rows=[{serviceDate:day,terminal:'T1',expectedTransferPassengers:178,retrievedAt:`${day}T00:00:00Z`},{serviceDate:day,terminal:'T2',expectedTransferPassengers:8528,retrievedAt:`${day}T00:00:00Z`}];
 await setup(page,{transferForecast:rows});await page.goto('/ko/airport-glance');
 const app=page.getByTestId('airport-glance-preview'),hall=app.getByTestId('glance-key-passengers'),transfer=app.getByTestId('glance-key-transfers');
 await expect(transfer.locator('strong')).toHaveText('8,706명');await expect(hall.locator('strong')).toHaveText('47,320명');await expect(transfer).toContainText('환승 보안검색 기준 · 도착일');await expect(transfer).toContainText(day);
 await expect(app.getByTestId('glance-key-sum').locator('strong')).toHaveText('56,026명');await expect(app.getByTestId('glance-key-sum')).toContainText('중복 여부 미확인');
 const a=await hall.boundingBox(),b=await transfer.boundingBox();expect(Math.abs(a!.y-b!.y)).toBeLessThan(2);expect(b!.x).toBeGreaterThan(a!.x+a!.width);await expect(app.getByTestId('airport-sum-total')).toHaveCount(0);
 for(const [scope,total] of [['T2','8,528명'],['T1','178명'],['탑승동','178명'],['전체','8,706명']]){await app.getByRole('button',{name:scope,exact:true}).click();await expect(transfer.locator('strong')).toHaveText(total);if(scope==='탑승동')await expect(transfer).toContainText('T1 공통(탑승동 포함)');}
 await transfer.focus();await expect(transfer).toBeFocused();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await app.locator('input[type=date]').fill('2026-08-30');await expect(transfer.locator('strong')).toHaveText('확인 가능한 자료 없음');await expect(transfer).toContainText('2026-08-30');await expect(app.getByTestId('glance-key-sum').locator('strong')).toHaveText('—');
});
// Owner, 2026-10-14 (PC screenshot): the tiles were not aligned on PC. From 701px the passenger pair uses the
// three columns of the row under it; phones keep the pair as two halves over the stacked rows.
for(const width of [701,1024,1440])test(`PC key tiles share one column grid ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await setup(page);await page.goto('/ko/airport-glance');
 const app=page.getByTestId('airport-glance-preview'),x=async(id:string)=>(await app.getByTestId(id).boundingBox())!.x;
 await expect(app.getByTestId('glance-key-transfers').locator('strong')).toHaveText('확인 가능한 자료 없음');
 expect(Math.abs(await x('glance-key-transfers')-await x('glance-key-upcoming'))).toBeLessThan(1);
 expect(Math.abs(await x('glance-key-passengers')-await x('glance-key-wait'))).toBeLessThan(1);
 expect(await x('glance-key-growth')).toBeGreaterThan(await x('glance-key-upcoming'));
});
for(const width of [390,700])test(`phones keep three passenger figures aligned ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await setup(page);await page.goto('/ko/airport-glance');
 const pair=page.locator('.glance-passenger-pair');await expect(pair).toBeVisible();
 expect(await pair.evaluate(element=>{const style=getComputedStyle(element);return [style.gridTemplateColumns.split(' ').length,style.columnGap,style.borderBottomWidth];})).toEqual([3,'12px','1px']);
});
test('transfer missing and duplicate records remain unavailable while complete zero is preserved',async({page})=>{
 await setup(page,{transferForecast:[{serviceDate:day,terminal:'T1',expectedTransferPassengers:0,retrievedAt:`${day}T00:00:00Z`}]});await page.goto('/ko/airport-glance');const row=page.getByTestId('glance-key-transfers');await expect(row.locator('strong')).toHaveText('확인 가능한 자료 없음');await page.getByRole('button',{name:'T1',exact:true}).click();await expect(row.locator('strong')).toHaveText('0명');await page.getByRole('button',{name:'T2',exact:true}).click();await expect(row.locator('strong')).toHaveText('확인 가능한 자료 없음');
});
for(const [lang,label] of [['en','Expected transfers'],['zh','预计中转旅客'],['ja','予想乗継客']])test(`localized transfer scope ${lang}`,async({page})=>{await page.setViewportSize({width:360,height:1000});await setup(page);await page.goto(`/${lang}/airport-glance`);await expect(page.getByTestId('glance-key-transfers')).toContainText(label);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);});
