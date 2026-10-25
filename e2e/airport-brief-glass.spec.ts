import {test,expect} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};

for(const width of [390,1440])test(`number-first today/week report stays unfilled and bounded on white ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));
 for(const [path,json] of [['flights',flights],['airport-months',months],['airport-passenger-stats',passengerStats]] as const)await page.route(`**/api/live/${path}*`,r=>r.fulfill({json}));
 await page.route('**/api/live/passenger-reference*',r=>r.fulfill({json:{status:'UNAVAILABLE',data:null}}));
 await page.goto('/ko?date=2026-10-19',{waitUntil:'domcontentloaded'});
 const report=page.locator('.airport-focus-shell .focus-report');
 await expect(report).toHaveCount(1);await expect(report).toContainText('단순합계 112,403명');
 await expect(report).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await expect(report).toHaveCSS('background-image','none');await expect(report).toHaveCSS('backdrop-filter','none');
 await expect(report).toHaveCSS('box-shadow','none');
 await expect(report).toHaveCSS('border-radius','22px');
 await expect(report.locator('.focus-people-metric > .focus-metric-label')).toHaveText('예상 인원 · 단순합계');
 await expect(report.locator('.focus-passenger-total')).toHaveText('112,403명');
 for(const selector of ['body','.airport-focus-shell'])await expect(page.locator(selector).first()).toHaveCSS('background-color','rgb(255, 255, 255)');
 const appPaint=await page.locator('.app').first().evaluate(node=>{const css=getComputedStyle(node);return {background:css.backgroundColor,image:css.backgroundImage,blur:css.backdropFilter};});
 expect(['rgb(255, 255, 255)','rgba(0, 0, 0, 0)']).toContain(appPaint.background);expect(appPaint.image).toBe('none');expect(appPaint.blur).toBe('none');
 const bounds=await report.boundingBox();expect(bounds).not.toBeNull();
 for(const child of [report.locator('.focus-report-lines'),report.locator('.focus-preparation-brief>div').nth(0)]){
  const box=await child.boundingBox();expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(bounds!.x);expect(box!.y).toBeGreaterThanOrEqual(bounds!.y);
  expect(box!.x+box!.width).toBeLessThanOrEqual(bounds!.x+bounds!.width+1);expect(box!.y+box!.height).toBeLessThanOrEqual(bounds!.y+bounds!.height+1);
 }
 await expect(report.locator('.focus-event-country img')).toHaveCount(2);
 for(const flag of await report.locator('.focus-event-country img').all()){
  await expect(flag).toHaveAttribute('width','24');await expect(flag).toHaveAttribute('height','24');await expect(flag).toHaveAttribute('alt','');
 }
 const nextWeek=report.locator('.focus-preparation-brief>div');await expect(nextWeek).toHaveCount(1);
 await expect(nextWeek.locator('h3')).toContainText('다음 주');await expect(nextWeek.locator('time').first()).toBeVisible();
 await expect(report.locator('[data-line-icon="month"],.focus-country-month-trend')).toHaveCount(0);
 for(const evidence of await nextWeek.locator('.focus-event-details').all()){
  await expect(evidence).not.toHaveAttribute('open','');await evidence.locator('summary').click();
  await expect(evidence.locator('a').last()).toHaveAttribute('href',new RegExp('^https://'));await evidence.locator('summary').click();await expect(evidence).not.toHaveAttribute('open','');
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

