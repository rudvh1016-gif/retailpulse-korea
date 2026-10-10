import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';

test('one moved model follows time filters and exposes exact gate evidence without filling gaps',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 const flights=['291','252','215','999'].map((gate,i)=>({physicalFlightId:`placement-${i}`,flightNumber:`TEST${i}`,terminal:'T2',gate,direction:'departure',scheduledAt:'2026-08-31T09:10:00+09:00',retrievedAt:'2026-08-31T03:00:00Z',status:'scheduled',airportCode:'NRT'}));
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));let reads=0;
 await page.route('**/api/live/flights*',r=>{reads++;return r.fulfill({json:{mode:'live-flights',basis:'COLLECTED_FLIGHT_RECORDS',flights,truncated:false,retrievedAt:'2026-08-31T03:00:00Z'}});});
 await page.goto('/ko/airport?terminal=T2');
 const model=page.getByTestId('airport-concept-model');await expect(model).toHaveCount(1);
 await expect(page.locator('.airport-flow img')).toHaveCount(0);
 await expect(page.getByTestId('airport-departure-overview').getByTestId('airport-concept-model')).toHaveCount(0);
 const order=await page.evaluate(()=>{const chart=document.querySelector('.airport-hero .airport-flow')!;const model=document.querySelector('[data-testid=airport-concept-model]')!;const countries=document.querySelector('[data-testid=map-zone-countries]')!;return {chartBottom:chart.getBoundingClientRect().bottom,modelTop:model.getBoundingClientRect().top,modelBottom:model.getBoundingClientRect().bottom,countriesTop:countries.getBoundingClientRect().top};});
 expect(order.modelTop).toBeGreaterThanOrEqual(order.chartBottom);expect(order.countriesTop).toBeGreaterThanOrEqual(order.modelBottom);
 await expect(model.getByTestId('model-unverified-gate-numbers')).toContainText('T2 999');
 const register=model.getByTestId('gate-region-register');
 await expect(register.locator('.gate-region-columns [data-side=EAST]')).toContainText('253–270, 273–291');
 await register.locator('summary').focus();await page.keyboard.press('Enter');
 const gate=register.locator('li[data-gate="291"]');await expect(gate).toHaveAttribute('data-side','EAST');await expect(gate).toHaveAttribute('data-basis','OFFICIAL_MAP_MIDPOINT');
 await expect(register.locator('li[data-gate="271"]')).toHaveCount(0);
 await expect(register.locator('li[data-gate="272"]')).toHaveCount(0);
 await register.locator('summary').focus();await page.keyboard.press('Enter');
 await expect(page.getByTestId('departure-map-section')).toHaveCount(0);
 const map=page.getByTestId('departure-map');await map.locator('[data-preset=CUSTOM]').click();await map.getByTestId('map-from').selectOption('10');await map.getByTestId('map-to').selectOption('11');
 await expect(model.locator('.airport-concept-counts [data-side=EAST]')).toContainText('0편');
 await expect(model.getByTestId('model-unverified-gate-numbers')).toHaveCount(0);
 await expect(register.locator('.gate-region-columns [data-side=EAST]')).toContainText('291');
 expect(reads).toBe(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
