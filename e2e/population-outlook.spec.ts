import {test,expect} from '@playwright/test';
import {airportOnlyFixture,expectAirportOnly} from './airport-only-fixture';
for(const locale of ['ko','en','zh','ja'])test(`retired forecast records preserve storage without exposing Seoul reads ${locale}`,async({page})=>{
 const trace=await airportOnlyFixture(page);await page.goto(`/${locale}/forecast?area=hongdae`);await expectAirportOnly(page,locale);
 expect(trace.retiredReads).toEqual([]);expect(trace.errors).toEqual([]);
});
