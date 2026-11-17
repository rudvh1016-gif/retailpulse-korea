import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import {airportOnlyFixture,expectAirportOnly} from './airport-only-fixture';
for(const lang of ['ko','en','zh','ja'])for(const width of [360,390,430,1280])test(`retired district and consumption comparisons ${lang} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});const trace=await airportOnlyFixture(page);
 for(const slug of ['where-to','consumption']) {await page.goto(`/${lang}/${slug}?area=hongdae&month=2026-07`);await expectAirportOnly(page,lang);}
 expect(trace.retiredReads).toEqual([]);expect(trace.errors).toEqual([]);
});
test('old URL redirects; shared header install stays before exchange with its full guide',async({page})=>{
 await page.setViewportSize({width:390,height:900});await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.goto('/ko/predictions');await expect(page).toHaveURL(/\/ko\/?$/);
 await page.goto('/ko/airport');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');const install=page.locator('.header-meta .install-app-button');await expect(install).toBeVisible();await expect(page.locator('.date-nav-tools .install-app-button')).toHaveCount(0);
 const button=await install.boundingBox(),exchange=await page.getByTestId('airport-duty-free-exchange').boundingBox();expect(button!.height).toBeGreaterThanOrEqual(44);
 expect(button!.x+button!.width).toBeLessThanOrEqual(exchange!.x+1);
 await install.click();await expect(page.locator('.install-modal')).toBeVisible();await page.keyboard.press('Escape');await expect(install).toBeFocused();
});
