import {test,expect} from '@playwright/test';
import {airportOnlyFixture,expectAirportOnly} from './airport-only-fixture';
for(const locale of ['ko','en','zh','ja']) {
 test(`retired tourism ignores saved personal area on hydration and reload ${locale}`,async({page})=>{
  const trace=await airportOnlyFixture(page);await page.addInitScript(()=>localStorage.setItem('retailpulse-preferences',JSON.stringify({area:'hongdae'})));
  for(const area of ['myeongdong','hongdae','seongsu','itaewon']) {await page.goto(`/${locale}/tourism-desk/${area}`);await expectAirportOnly(page,locale);await page.reload();await expectAirportOnly(page,locale);}
  expect(trace.retiredReads).toEqual([]);expect(trace.errors).toEqual([]);
 });
 test(`retired tourism redirects even when summary fails ${locale}`,async({page})=>{
  const trace=await airportOnlyFixture(page,true);await page.goto(`/${locale}/tourism-desk/myeongdong`);await expectAirportOnly(page,locale);
  expect(trace.retiredReads).toEqual([]);expect(trace.errors).toEqual([]);
 });
}
