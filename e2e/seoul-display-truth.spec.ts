import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
for(const width of [390,1440])for(const state of ['stored-maintenance','normalized-maintenance','mixed','valid-zero'] as const)test(`air status and unverified tourism ${state} ${width}`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:1000});
 const weather={observedAt:'2026-10-13T19:20:00+09:00',temperature:18,humidity:50,wind:2,pm10:state==='normalized-maintenance'?null:state==='stored-maintenance'?35:0,pm25:state==='normalized-maintenance'?null:0,pm10Grade:state==='valid-zero'?'좋음':'점검중',pm25Grade:state==='mixed'||state==='valid-zero'?'좋음':'미제공'};
 const areas=Object.fromEntries(Object.entries(SUMMARY_FIXTURE.areas).map(([key,area])=>[key,{...area,context:{commercialAt:null,categories:[],weather},foreignPurposeMobility:{tourism:360.5,shopping:null,referenceDate:'2026-09-30'}}]));
 await page.route('**/api/live/summary*',routeSummary({...SUMMARY_FIXTURE,areas}));await page.goto('/ko/myeongdong');
 const air=page.getByRole('region',{name:'서울시 대기질 제공 상태'});await expect(air).toBeVisible();await expect(air).toContainText('서울시 제공 상태 · 업데이트');await expect(air).not.toContainText('관측');
 if(state==='valid-zero'){await expect(air).toContainText('미세먼지 좋음 0μg/m³');await expect(air).toContainText('초미세먼지 좋음 0μg/m³');}
 else {await expect(air).toContainText('미세먼지 점검 중 · 농도 미제공');await expect(air).not.toContainText('35μg/m³');if(state==='mixed')await expect(air).toContainText('초미세먼지 좋음 0μg/m³');else await expect(air).not.toContainText('μg/m³');}
 const tourism=page.locator('[data-flow="tourism"]');await expect(tourism).toContainText('수치는 표시하지 않습니다');await expect(tourism).not.toContainText('360.5');await expect(tourism.locator('dd')).toHaveCount(0);await expect(tourism).toContainText('2026. 09. 30.');await expect(tourism).toContainText('서울 열린데이터광장');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);await expect(page.locator('body')).not.toContainText('360.5');
});

for(const lang of ['ko','en','zh','ja'])test(`legacy tourism detail hides unverified raw figures ${lang}`,async({page})=>{
 const areas=Object.fromEntries(Object.entries(SUMMARY_FIXTURE.areas).map(([key,area])=>[key,{...area,foreignPurposeMobility:{shopping:71.3,tourism:360.5,referenceDate:'2026-09-30',datasetId:'OA-22378'}}]));
 await page.route('**/api/live/summary*',routeSummary({...SUMMARY_FIXTURE,areas}));await page.goto(`/${lang}/tourism-desk/myeongdong`);
 const cards=page.locator('.tourism-background-item').filter({has:page.locator('.tourism-background-values')});await expect(cards).toHaveCount(1);await expect(cards).not.toContainText('360.5');await expect(cards).not.toContainText('71.3');await expect(cards).toContainText('2026-09-30');await expect(cards.locator('dd')).toHaveCount(2);
});
