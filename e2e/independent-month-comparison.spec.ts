import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
// Timer scenarios must keep Date.now advancing. routeSummary() freezes it on every response.
const summaryAt=(at:string)=>({...SUMMARY_FIXTURE,generatedAt:at,todayKst:at.slice(0,10),serviceDateKst:at.slice(0,10),airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:at.slice(0,10)}});
const row=(departures:number)=>({label:'Japan',region:null,arrivals:null,departures,total:null,aggregate:false,startHour:null,endHour:null});
const data=(month:string,total:number)=>({operationId:'ROUTE_COUNTRY_PASSENGERS',month,rows:[row(total)],retrievedAt:'2026-10-25T00:00:00Z',completeness:'TOTAL_NOT_PROVIDED'});
for(const lang of ['ko','en','zh','ja'])for(const width of [320,390,1440])test(`exact stored month comparison ${lang} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});
 await page.route('**/api/live/summary*',route=>route.fulfill({json:summaryAt('2026-10-10T05:00:00Z')}));
 await page.route('**/api/live/airport-passenger-stats*',route=>route.fulfill({json:{status:'READY',month:'2026-09',previousMonth:'2026-08',current:{ROUTE_COUNTRY_PASSENGERS:data('2026-09',3300)},previous:{ROUTE_COUNTRY_PASSENGERS:data('2026-08',3100)}}}));
 let missing=false;const requests:string[]=[];
 await page.route('**/api/live/airport-passenger-comparison*',route=>{
  const q=new URL(route.request().url()).searchParams,selectedMonth=q.get('selected')!,baselineMonth=q.get('baseline')!;requests.push(selectedMonth+'|'+baselineMonth);
  const get=(month:string)=>missing&&month==='2026-09'?null:data(month,month==='2026-09'?3300:3101);
  return route.fulfill({json:{status:missing?'PARTIAL':'READY',selectedMonth,baselineMonth,selected:get(selectedMonth),baseline:get(baselineMonth),availableMonths:missing?['2026-03','2026-08']:['2026-03','2026-08','2026-09']}});
 });
 await page.clock.install({time:new Date('2026-10-10T05:00:00Z')});await page.goto(`/${lang}/airport-countries?date=2026-10-10`);
 const block=page.getByTestId('airport-route-passengers');await block.scrollIntoViewIfNeeded();
 const baseline=block.locator('[data-month-selection="baseline"]'),selected=block.locator('[data-month-selection="selected"]');
 await expect(baseline).toBeEnabled();await baseline.focus();await expect(baseline).toBeFocused();await expect(baseline).toHaveCSS('min-height','44px');await expect(selected.locator('option:not(:disabled)')).toHaveText(['2026-03','2026-08','2026-09']);
 await baseline.selectOption('2026-03');await expect(baseline).toHaveValue('2026-03');await expect(selected).toHaveValue('2026-09');
 await expect(block.locator('thead th').last()).toHaveCSS('white-space','normal');
 const bounds=await block.locator('select,thead th,tbody tr:first-child td,.route-month-controls label').evaluateAll(nodes=>nodes.map(node=>{const box=node.getBoundingClientRect();return {left:box.left,right:box.right,overflow:node.scrollWidth-node.clientWidth};}));
 for(const box of bounds){expect(box.left).toBeGreaterThanOrEqual(-1);expect(box.right).toBeLessThanOrEqual(width+1);expect(box.overflow).toBeLessThanOrEqual(1);}
 const first=block.locator('tbody tr').first();await expect(first.locator('.route-month-total')).toHaveText(['3,101','3,300']);await expect(first.locator('td').last()).toContainText('10%');await expect(first.locator('td .route-month-mean')).toHaveText([/100$/,/110$/]);
 await expect(block.locator('thead th').nth(1)).toContainText('31');await expect(block.locator('thead th').nth(2)).toContainText('30');
 await selected.selectOption('2026-03');await expect(first.locator('td').last()).toContainText('0%');
 await selected.selectOption('2026-09');await expect(first.locator('.route-month-total').last()).toHaveText('3,300');
 await page.bringToFront();expect(await page.evaluate(()=>document.visibilityState)).toBe('visible');
 missing=true;const refreshed=page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname==='/api/live/airport-passenger-comparison'&&url.searchParams.get('selected')==='2026-09'&&url.searchParams.get('baseline')==='2026-03';});
 const beforeRefresh=await page.evaluate(()=>Date.now());
 await page.clock.fastForward(300001);expect((await page.evaluate(()=>Date.now()))-beforeRefresh,'the cache clock advances with the polling timer').toBeGreaterThanOrEqual(300001);const refreshedResponse=await refreshed;await refreshedResponse.finished();expect((await refreshedResponse.json()).selected).toBeNull();await expect(first.locator('.route-month-total').last()).toHaveText('?');
 await expect(selected).toHaveValue('2026-09');await expect(selected.locator('option[value="2026-09"]')).toBeDisabled();
 expect(requests).toContain('2026-09|2026-03');
 const basis=block.locator('.concise-explainer');await expect(basis).not.toHaveAttribute('open','');await basis.locator('summary').click();await expect(basis).toHaveAttribute('open','');await expect(basis).toContainText('2026-03');await basis.locator('summary').click();await expect(basis).not.toHaveAttribute('open','');
 await expect(block.locator('a[href="https://www.data.go.kr/data/15095071/openapi.do"]')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
for(const [lang,empty] of [['ko','저장된 2026 자료 없음'],['en','No stored 2026 data'],['zh','没有已存的2026年资料'],['ja','2026年の保存資料なし']])test(`empty stored inventory stays disabled ${lang}`,async({page})=>{
 await page.route('**/api/live/summary*',route=>route.fulfill({json:SUMMARY_FIXTURE}));
 await page.route('**/api/live/airport-passenger-stats*',route=>route.fulfill({json:{status:'MISSING',month:null,previousMonth:null,current:{},previous:{}}}));
 await page.goto(`/${lang}/airport-countries`);const block=page.getByTestId('airport-route-passengers');await block.scrollIntoViewIfNeeded();
 for(const control of await block.locator('select').all()){await expect(control).toBeDisabled();await expect(control).toHaveText(empty);}
 await expect(block.locator('select')).toHaveCount(2);await expect(block.locator('table')).toHaveCount(0);
});
for(const lang of ['ko','en','zh','ja'])for(const width of [320,390,1440])test(`2027 rollover retains 2026 catalog and pair last-good ${lang} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await page.clock.install({time:new Date('2027-02-01T05:00:00Z')});let failed=false;
 await page.route('**/api/live/summary*',route=>route.fulfill({json:summaryAt('2027-02-01T05:00:00Z')}));
 await page.route('**/api/live/airport-passenger-stats*',route=>route.fulfill({json:failed?{status:'UNAVAILABLE',month:null,current:{},previous:{}}:{status:'READY',month:'2027-01',previousMonth:'2026-12',current:{ROUTE_COUNTRY_PASSENGERS:data('2027-01',3400)},previous:{ROUTE_COUNTRY_PASSENGERS:data('2026-12',3200)}}}));
 await page.route('**/api/live/airport-passenger-comparison*',route=>{const q=new URL(route.request().url()).searchParams,selectedMonth=q.get('selected')!,baselineMonth=q.get('baseline')!;return route.fulfill({json:failed?{status:'UNAVAILABLE',selectedMonth,baselineMonth,selected:null,baseline:null,availableMonths:[]}:{status:'READY',selectedMonth,baselineMonth,selected:data(selectedMonth,3300),baseline:data(baselineMonth,3101),availableMonths:['2026-03','2026-09','2026-12']}});});
 await page.goto(`/${lang}/airport-countries`);const block=page.getByTestId('airport-route-passengers');await block.scrollIntoViewIfNeeded();
 const selected=block.locator('[data-month-selection="selected"]'),baseline=block.locator('[data-month-selection="baseline"]');
 await expect(selected).toBeEnabled();await expect(selected).toHaveValue('2027-01');await expect(selected.locator('option:not(:disabled)')).toHaveText(['2026-03','2026-09','2026-12']);
 await baseline.selectOption('2026-03');await expect(baseline).toBeEnabled();await selected.selectOption('2026-09');
 const values=block.locator('tbody tr').first().locator('.route-month-total');await expect(values).toHaveText(['3,101','3,300']);
 await page.bringToFront();expect(await page.evaluate(()=>document.visibilityState)).toBe('visible');
 failed=true;const refreshed=page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname==='/api/live/airport-passenger-comparison'&&url.searchParams.get('selected')==='2026-09'&&url.searchParams.get('baseline')==='2026-03';});
 const beforeRefresh=await page.evaluate(()=>Date.now());
 await page.clock.fastForward(300001);expect((await page.evaluate(()=>Date.now()))-beforeRefresh,'the cache clock advances with the polling timer').toBeGreaterThanOrEqual(300001);const refreshedResponse=await refreshed;await refreshedResponse.finished();expect((await refreshedResponse.json()).status).toBe('UNAVAILABLE');await expect(block.locator('[role="status"]').filter({hasText:({ko:'갱신 실패',en:'Refresh failed',zh:'刷新失败',ja:'更新失敗'} as Record<string,string>)[lang]})).toBeVisible();
 await expect(values).toHaveText(['3,101','3,300']);await expect(selected).toHaveValue('2026-09');await expect(baseline).toHaveValue('2026-03');
 await expect(block.locator('thead th').nth(1)).toContainText('2026-03');await expect(block.locator('thead th').nth(2)).toContainText('2026-09');
});
