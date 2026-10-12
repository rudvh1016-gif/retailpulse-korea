import { test, expect } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import { airportModelScope } from '../lib/airport-model-scope';
import { routeGateFlights } from './gate-model-fixture';
test('desktop overview uses available width while keeping building overlays attached',async({page})=>{
  await page.setViewportSize({width:2048,height:1100});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
  await routeGateFlights(page);
  await page.goto('/ko/airport');
  const figure=page.getByTestId('airport-concept-model');
  const picture=figure.locator('.airport-concept-picture');
  await picture.scrollIntoViewIfNeeded();
  const bounds=(await picture.boundingBox())!;
  expect(bounds.width).toBeGreaterThan(1000);
  expect(bounds.width).toBeLessThanOrEqual(1200);
  const groups=await picture.locator('.airport-concept-building-counts').all();
  expect(groups).toHaveLength(3);
  for(const group of groups){const box=(await group.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(bounds.x);expect(box.x+box.width).toBeLessThanOrEqual(bounds.x+bounds.width+1);expect(box.y+box.height).toBeLessThan(bounds.y+bounds.height);}
  await expect(figure.getByTestId('model-zone-note')).toHaveCSS('font-size','12px');
  expect(await picture.locator('img').evaluate(image=>(image as HTMLImageElement).naturalWidth)).toBeGreaterThanOrEqual(1200);
  await figure.screenshot({path:'test-results/airport-overview-desktop.png'});
  await page.locator('.terminal-selector button').nth(1).click();
  expect((await picture.boundingBox())!.width).toBeLessThanOrEqual(700);
});
for(const lang of ['ko','en','zh','ja'] as const) {
  test(`model title and hourly data follow repeated terminal switches ${lang}`,async({page})=>{
    await page.setViewportSize({width:390,height:844});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
    await routeGateFlights(page);
    await page.goto(`/${lang}/airport`);
    const figure=page.locator('.airport-hero .airport-flow');
    const label=figure.getByTestId('airport-model-scope');
    for(const terminal of ['all','T1','T2','T1','all','T2','all'] as const){
      const index=terminal==='all'?0:terminal==='T1'?1:2;
      await page.locator('.terminal-selector button').nth(index).click();
      await expect(label).toHaveText(airportModelScope(terminal,lang));
      await expect(label).toHaveAttribute('data-terminal',terminal);
      await expect(label).toHaveCSS('color','rgb(0, 0, 0)');
      const timeline=terminal==='all'?SUMMARY_FIXTURE.airport.passengerForecastTimeline:SUMMARY_FIXTURE.airport.passengerForecastTimelineByTerminal[terminal];
      await expect(figure).toHaveAttribute('data-bands',String(timeline.length));
      await expect.poll(()=>figure.locator('.airport-hourly-prisms g[data-value]').evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('data-value'))))).toEqual(timeline.filter(band=>band.expectedPassengers>0).map(band=>band.expectedPassengers));
      await expect(figure.locator('img')).toHaveCount(0);
      const model=page.getByTestId('airport-concept-model');
      await expect(model).toHaveCount(1);
      await expect(model.getByTestId('airport-map-model-scope')).toHaveAttribute('data-terminal',terminal);
      const positions=await page.evaluate(()=>{const chart=document.querySelector('.airport-hero .airport-flow')!;const model=document.querySelector('[data-testid=airport-concept-model]')!;return {chartBottom:chart.getBoundingClientRect().bottom,modelTop:model.getBoundingClientRect().top};});
      expect(positions.modelTop).toBeGreaterThanOrEqual(positions.chartBottom);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
      if(lang==='ko')await figure.screenshot({path:`outputs/model-scope-${terminal}-390.png`});
    }
  });
}
