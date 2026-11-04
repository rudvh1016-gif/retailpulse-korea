import {test,expect,type Page,type TestInfo} from '@playwright/test';
import {dutyFreeDatedPresentation,validDutyFreeSnapshot} from '../lib/duty-free-exchange';
import {validDutyFreeRecent,type DutyFreeRecent} from '../lib/duty-free-recent';

// Real public reads only: no fixtures, mocked responses, clock changes or provider requests.
async function openPanel(page:Page){
 const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/live/duty-free-exchange');
 await page.goto('/ko/airport');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const received=await response,snapshot=await received.json().catch(()=>null);
 const panel=page.getByTestId('airport-duty-free-exchange');await panel.locator('.duty-free-rate-sources>summary').click();
 await expect(panel.locator('[data-rate-day="today"]')).toBeVisible();
 await expect(panel.locator('[data-rate-day="previous"],[data-rate-day="next"]')).toHaveCount(0);
 await expect(panel.locator('.duty-free-recent-source')).toHaveCount(0);
 await expect(panel).not.toContainText('공항 현장 매장의 동일 적용 여부');
 return {panel,snapshot,httpStatus:received.status()};
}
async function openHistory(page:Page,info:TestInfo){
 const {panel}=await openPanel(page);
 const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/live/duty-free-exchange/recent');
 await panel.locator('.duty-free-monthly-toggle').click();const response=await pending,data=await response.json().catch(()=>null);
 if(!response.ok()||!validDutyFreeRecent(data)){
  await expect(panel.locator('.duty-free-monthly [role="status"]')).toHaveText('최근 환율 조회 실패');
  await panel.locator('.duty-free-rate-detail').screenshot({path:info.outputPath('live-exchange-history-unavailable.png')});
  test.skip(true,`Live stored history unavailable (HTTP ${response.status()}); interaction is not verified.`);
 }
 const history=data as DutyFreeRecent;
 await expect(panel.locator('figcaption')).toContainText(`${history.start} ~ ${history.end} KST`);
 const observed=history.days.flatMap((day,index)=>day.krwPerUsd===null?[]:[index]);
 if(!observed.length){
  await expect(panel.locator('.duty-free-monthly [role="status"]')).toHaveText('자료 없음');
  await panel.locator('.duty-free-rate-detail').screenshot({path:info.outputPath('live-exchange-no-observations.png')});
  test.skip(true,'Live history has no verified observations; value interaction is not verified.');
 }
 console.log('LIVE_FX_HISTORY',JSON.stringify({asOfDateKst:history.asOfDateKst,start:history.start,end:history.end,observedDays:history.observedDays,days:history.days}));
 return {panel,history,observed};
}
const exact=(data:DutyFreeRecent,i:number)=>`${data.days[i].date} · ${new Intl.NumberFormat('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(data.days[i].krwPerUsd!)} KRW / USD`;

test('live exchange summary shows only genuine today evidence',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});const {panel,snapshot,httpStatus}=await openPanel(page);
 const today=panel.locator('[data-rate-day="today"]');
 if(httpStatus===200&&validDutyFreeSnapshot(snapshot)){
  const current=dutyFreeDatedPresentation(snapshot,Date.now()).find(row=>row.current);
  if(current){
   await expect(today).toHaveAttribute('data-rate-date',current.serviceDateKst);await expect(today).toHaveAttribute('data-state','VERIFIED');
   await expect(today).toContainText(new Intl.NumberFormat('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(current.krwPerUnit));
   await expect(today.locator(`time[datetime="${current.verifiedAt}"]`)).toBeVisible();
  }else{await expect(today).not.toHaveAttribute('data-state','VERIFIED');await expect(today).not.toContainText('1 USD =');}
 }else{await expect(today).not.toHaveAttribute('data-state','VERIFIED');}
 console.log('LIVE_FX_TODAY',JSON.stringify({httpStatus,text:await today.innerText(),state:await today.getAttribute('data-state')}));
 await panel.locator('.duty-free-rate-detail').screenshot({path:info.outputPath('live-exchange-today-390.png')});
});

test('live exchange ordinary desktop hover reads exact stored dates without click',async({page},info)=>{
 await page.setViewportSize({width:1280,height:900});const {panel,history,observed}=await openHistory(page,info);
 const slider=panel.getByRole('slider');await slider.scrollIntoViewIfNeeded();const bounds=(await slider.boundingBox())!;
 for(const i of [observed[0],observed.at(-1)!]){
  await page.mouse.move(bounds.x+bounds.width*(48+i*256/6)/332,bounds.y+bounds.height-16);
  await expect(panel.locator('.duty-free-month-readout')).toHaveText(exact(history,i));await expect(slider.getByRole('tooltip')).toContainText(history.days[i].date);
  const tip=(await slider.getByRole('tooltip').boundingBox())!;expect(tip.x).toBeGreaterThanOrEqual(bounds.x-1);expect(tip.x+tip.width).toBeLessThanOrEqual(bounds.x+bounds.width+1);
 }
 await panel.locator('.duty-free-rate-detail').screenshot({path:info.outputPath('live-exchange-hover-1280.png')});
 await page.mouse.move(0,0);await expect(slider.getByRole('tooltip')).toHaveCount(0);
});

test.describe('live exchange native mobile touch',()=>{
 test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 test('close responds to a native tap before chart interaction',async({page},info)=>{
  const {panel}=await openPanel(page);await panel.locator('.duty-free-close').tap();
  await expect(panel.locator('.duty-free-rate-sources')).not.toHaveAttribute('open','');
  await panel.locator('.duty-free-rate-sources>summary').tap();await expect(panel.locator('.duty-free-rate-detail')).toBeVisible();
  await panel.locator('.duty-free-close').tap();await expect(panel.locator('.duty-free-rate-sources')).not.toHaveAttribute('open','');
  await page.screenshot({path:info.outputPath('live-exchange-close-repeated-390.png')});
 });
 test('tap and drag retain exact stored date and amount',async({page,context},info)=>{
  const {panel,history,observed}=await openHistory(page,info);const slider=panel.getByRole('slider');await slider.scrollIntoViewIfNeeded();const bounds=(await slider.boundingBox())!,y=bounds.y+bounds.height/2,x=(i:number)=>bounds.x+bounds.width*(48+i*256/6)/332;
  await page.touchscreen.tap(x(observed[0]),y);await expect(panel.locator('.duty-free-month-readout')).toHaveText(exact(history,observed[0]));
  const end=observed.at(-1)!,cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x(observed[0]),y}]});
  // Pace a real swipe. Chromium suppresses the following click after an instantaneous
  // CDP drag even on minimal HTML; this is input timing, not a close retry or fallback.
  for(let i=observed[0]+1;i<=end;i++){await page.waitForTimeout(100);await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x(i),y}]});}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(panel.locator('.duty-free-month-readout')).toHaveText(exact(history,end));
  await panel.locator('.duty-free-rate-detail').screenshot({path:info.outputPath('live-exchange-touch-390.png')});

  await panel.locator('.duty-free-close').tap();await expect(panel.locator('.duty-free-rate-sources')).not.toHaveAttribute('open','');
 });
});
