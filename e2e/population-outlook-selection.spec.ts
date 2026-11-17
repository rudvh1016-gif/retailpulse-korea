import {test,expect} from '@playwright/test';
import {airportOnlyFixture,expectAirportOnly} from './airport-only-fixture';
for(const width of [320,1280])test(`saved Seoul selections cannot restore retired outlook ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});const trace=await airportOnlyFixture(page);
 await page.addInitScript(()=>localStorage.setItem('retailpulse-preferences',JSON.stringify({lang:'ko',area:'hongdae',terminal:'T2'})));
 await page.goto('/ko/myeongdong');await expectAirportOnly(page,'ko');await page.reload();await expectAirportOnly(page,'ko');
 expect(trace.retiredReads).toEqual([]);expect(trace.errors).toEqual([]);
});
test('history navigation cannot remount a retired Seoul outlook',async({page})=>{
 const trace=await airportOnlyFixture(page);await page.goto('/ko');await expectAirportOnly(page,'ko');
 await page.evaluate(()=>{history.pushState({},'', '/ko/myeongdong');dispatchEvent(new PopStateEvent('popstate'));});
 await expectAirportOnly(page,'ko');expect(trace.retiredReads).toEqual([]);expect(trace.errors).toEqual([]);
});
