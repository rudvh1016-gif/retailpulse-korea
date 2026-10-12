import {expect,type Locator} from '@playwright/test';
import {passengerCopy} from '../lib/passenger-copy';

export async function expectHeadline(brief:Locator,selected=false){
 const headline=brief.locator('.airport-brief-total');
 await expect(headline).toBeVisible();
 const formula=brief.locator('[data-testid="airport-sum-formula"]');
 const arithmetic=await formula.count()>0;
 await expect(brief).toContainText(passengerCopy[arithmetic?'arithmeticNote':'limitation'].ko);
 if(arithmetic){
  await expect(headline).toHaveAttribute('data-basis','ARITHMETIC_ONLY');
  await expect(headline).toContainText(passengerCopy[selected?'summedSelected':'summedToday'].ko);
  await expect(formula).toContainText(passengerCopy.hallComponent.ko);
  await expect(formula).toContainText(passengerCopy.transferComponent.ko);
 }else await expect(headline).toContainText(passengerCopy[selected?'selected':'today'].ko);
}

interface SelectedForecast {
 dayRelation:string;
 serviceDateKst:string;
 airport?:{
  todayExpectedPassengersByTerminal?:{T2?:number|null};
  transferForecast?:{terminal:string;serviceDate:string;expectedTransferPassengers:number}[];
  forecastCoverage?:{byTerminal:{T2?:string}};
 };
}
/** The current production contract: absent forecasts cannot acquire a number,
 * arithmetic formula or a figure's caveat merely to satisfy the live test. */
export async function expectSelectedForecast(brief:Locator,selected:SelectedForecast){
 expect(selected.dayRelation).toBe('FUTURE');
 const hall=selected.airport?.todayExpectedPassengersByTerminal?.T2;
 if(typeof hall==='number'){
  await expectHeadline(brief,true);
  const transfers=(selected.airport?.transferForecast??[]).filter(row=>row.terminal==='T2'&&row.serviceDate===selected.serviceDateKst);
  const total=transfers.length===1&&selected.airport?.forecastCoverage?.byTerminal.T2==='COMPLETE'?hall+transfers[0].expectedTransferPassengers:hall;
  const formula=brief.locator('[data-testid="airport-sum-formula"]');
  if(await formula.count()>0){
   await expect(brief.locator('.airport-brief-total')).toContainText(`${Math.round(total).toLocaleString('ko-KR')}명`);
   await expect(formula).toContainText(`${Math.round(hall).toLocaleString('ko-KR')}명`);
  }else await expect(brief.locator('.airport-brief-total')).toContainText(`${Math.round(hall).toLocaleString('ko-KR')}명`);
  await expect(brief.locator('.passenger-transfer-limitation')).toBeVisible();
 }else{
  await expect(brief.locator('.airport-data-missing')).toHaveText('확인 불가');
  await expect(brief.locator('.airport-forecast-state.unavailable')).toContainText('이 날짜의 공식 예상 시간대가 없습니다. 실제 출발 운항과 현재 출국장 정보는 계속 확인할 수 있습니다.');
  await expect(brief.locator('.airport-brief-total')).toHaveCount(0);
  await expect(brief.locator('[data-testid="airport-sum-formula"]')).toHaveCount(0);
  await expect(brief.locator('.passenger-transfer-limitation')).toHaveCount(0);
 }
 await expect(brief).not.toContainText('전체 공식 예상 출국객');
}
