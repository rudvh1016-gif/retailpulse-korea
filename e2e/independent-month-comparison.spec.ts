import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
const row=(departures:number)=>({label:'Japan',region:null,arrivals:null,departures,total:null,aggregate:false,startHour:null,endHour:null});
const data=(month:string,total:number)=>({operationId:'ROUTE_COUNTRY_PASSENGERS',month,rows:[row(total)],retrievedAt:'2026-10-25T00:00:00Z',completeness:'TOTAL_NOT_PROVIDED'});
for(const lang of ['ko','en','zh','ja'])for(const width of [320,1440])test(`exact stored month comparison ${lang} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});
 await page.route('**/api/live/summary*',routeSummary({...SUMMARY_FIXTURE,todayKst:'2026-10-10',serviceDateKst:'2026-10-10'}));
 await page.route('**/api/live/airport-passenger-stats*',route=>route.fulfill({json:{status:'READY',month:'2026-09',previousMonth:'2026-08',current:{ROUTE_COUNTRY_PASSENGERS:data('2026-09',3300)},previous:{ROUTE_COUNTRY_PASSENGERS:data('2026-08',3100)}}}));
 let missing=false;const requests:string[]=[];
 await page.route('**/api/live/airport-passenger-comparison*',route=>{
  const q=new URL(route.request().url()).searchParams,selectedMonth=q.get('selected')!,baselineMonth=q.get('baseline')!;requests.push(selectedMonth+'|'+baselineMonth);
  const get=(month:string)=>missing&&month==='2026-09'?null:data(month,month==='2026-09'?3300:3100);
  return route.fulfill({json:{status:missing?'PARTIAL':'READY',selectedMonth,baselineMonth,selected:get(selectedMonth),baseline:get(baselineMonth),availableMonths:missing?['2026-03','2026-08']:['2026-03','2026-08','2026-09']}});
 });
 await page.clock.install();await page.goto(`/${lang}/airport-countries?date=2026-10-10`);
 const block=page.getByTestId('airport-route-passengers');await block.scrollIntoViewIfNeeded();
 const baseline=block.locator('[data-month-selection="baseline"]'),selected=block.locator('[data-month-selection="selected"]');
 await expect(baseline).toBeEnabled();await baseline.focus();await expect(baseline).toBeFocused();await expect(baseline).toHaveCSS('min-height','44px');await expect(selected.locator('option:not(:disabled)')).toHaveText(['2026-03','2026-08','2026-09']);
 await baseline.selectOption('2026-03');await expect(baseline).toHaveValue('2026-03');await expect(selected).toHaveValue('2026-09');
 const first=block.locator('tbody tr').first();await expect(first.locator('.route-month-total')).toHaveText(['3,100','3,300']);await expect(first.locator('td').last()).toContainText('10%');
 await expect(block.locator('thead th').nth(1)).toContainText('31');await expect(block.locator('thead th').nth(2)).toContainText('30');
 await selected.selectOption('2026-03');await expect(first.locator('td').last()).toContainText('0%');
 await selected.selectOption('2026-09');await expect(first.locator('.route-month-total').last()).toHaveText('3,300');
 missing=true;await page.clock.fastForward(300001);await expect(first.locator('.route-month-total').last()).toHaveText('?');
 await expect(selected).toHaveValue('2026-09');await expect(selected.locator('option[value="2026-09"]')).toBeDisabled();
 expect(requests).toContain('2026-09|2026-03');
 const basis=block.locator('.concise-explainer');await expect(basis).not.toHaveAttribute('open','');await basis.locator('summary').click();await expect(basis).toHaveAttribute('open','');await expect(basis).toContainText('2026-03');await basis.locator('summary').click();await expect(basis).not.toHaveAttribute('open','');
 await expect(block.locator('a[href="https://www.data.go.kr/data/15095071/openapi.do"]')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
for(const [lang,empty] of [['ko','저장된 2026 자료 없음'],['en','No stored 2026 data'],['zh','没有已存的2026年资料'],['ja','2026年の保存資料なし']])test(`empty stored inventory stays disabled ${lang}`,async({page})=>{
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/airport-passenger-stats*',route=>route.fulfill({json:{status:'MISSING',month:null,previousMonth:null,current:{},previous:{}}}));
 await page.goto(`/${lang}/airport-countries`);const block=page.getByTestId('airport-route-passengers');await block.scrollIntoViewIfNeeded();
 for(const control of await block.locator('select').all()){await expect(control).toBeDisabled();await expect(control).toHaveText(empty);}
 await expect(block.locator('select')).toHaveCount(2);await expect(block.locator('table')).toHaveCount(0);
});
