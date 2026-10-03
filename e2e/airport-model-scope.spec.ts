import { test, expect } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import { airportModelScope } from '../lib/airport-model-scope';
for(const lang of ['ko','en','zh','ja'] as const) {
  test(`model title and hourly data follow repeated terminal switches ${lang}`,async({page})=>{
    await page.setViewportSize({width:390,height:844});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
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
      const boxes=await figure.evaluate(n=>{const label=n.querySelector('[data-testid="airport-model-scope"]')!.getBoundingClientRect();const image=n.querySelector('img')!.getBoundingClientRect();const clip=n.querySelector('.airport-hourly-concept')!;return{labelBottom:label.bottom,imageTop:getComputedStyle(clip).overflow==='hidden'?Math.max(image.top,clip.getBoundingClientRect().top):image.top};});
      expect(boxes.labelBottom).toBeLessThanOrEqual(boxes.imageTop);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
      if(lang==='ko')await figure.screenshot({path:`outputs/model-scope-${terminal}-390.png`});
    }
  });
}
