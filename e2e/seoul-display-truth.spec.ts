import {test,expect} from '@playwright/test';
import {airportOnlyFixture,expectAirportOnly} from './airport-only-fixture';
import {SUMMARY_FIXTURE,MYEONGDONG_CONTEXT} from './summary-fixture';

// Keep the CI critical selector valid-zero 390: zero-valued historic data must
// never resurrect removed Seoul screens. Shared source fields remain intact.
for(const width of [390,1440])for(const state of ['stored-maintenance','normalized-maintenance','mixed','valid-zero'] as const)test(`airport-only historic air payload ${state} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});
 const weather={...MYEONGDONG_CONTEXT.weather,
  pm10:state==='normalized-maintenance'?null:state==='stored-maintenance'?35:0,
  pm25:state==='normalized-maintenance'?null:0,
  pm10Grade:state==='valid-zero'?'좋음':'점검중',
  pm25Grade:state==='mixed'||state==='valid-zero'?'좋음':'미제공'};
 const payload={...SUMMARY_FIXTURE,areas:{...SUMMARY_FIXTURE.areas,myeongdong:{...SUMMARY_FIXTURE.areas.myeongdong,context:{...MYEONGDONG_CONTEXT,weather}}}};
 const trace=await airportOnlyFixture(page,false,payload);
 const summaryRead=page.waitForResponse(response=>response.url().includes('/api/live/summary')&&response.status()===200);
 await page.goto('/ko/myeongdong?area=hongdae');await expectAirportOnly(page,'ko');
 const summary=await (await summaryRead).json();
 expect(summary.areas.myeongdong.context.weather).toEqual(weather);
 expect(summary.areas.myeongdong.weather).toEqual(payload.areas.myeongdong.weather);
 expect(summary.areas.myeongdong.subwayRidership).toEqual(payload.areas.myeongdong.subwayRidership);
 await expect(page.getByRole('region',{name:'서울시 대기질 제공 상태'})).toHaveCount(0);
 await expect(page.locator('[data-flow="tourism"]')).toHaveCount(0);
 expect(trace.retiredReads).toEqual([]);expect(trace.errors).toEqual([]);
});
for(const lang of ['ko','en','zh','ja'])test(`legacy tourism detail resolves to airport with no Seoul figures ${lang}`,async({page})=>{
 const trace=await airportOnlyFixture(page);await page.goto(`/${lang}/tourism-desk/myeongdong`);await expectAirportOnly(page,lang);
 await expect(page.locator('.tourism-background-item')).toHaveCount(0);expect(trace.retiredReads).toEqual([]);expect(trace.errors).toEqual([]);
});
