import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
import type {LiveSummary} from '../app/live-signals';
const pointStatus={congestionLevel:2,congestionLabel:'fixture'};
for(const width of [320,390,430,1280])for(const lang of ['ko','en','zh','ja'] as const)test(`population material keeps true intervals and controls ${lang} ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const data=structuredClone(SUMMARY_FIXTURE) as LiveSummary,area=data.areas.hongdae!;
 area.observedSeries=[{...pointStatus,observedAt:'2026-08-31T12:50:00+09:00',populationMin:100,populationMax:200},{...pointStatus,observedAt:'2026-08-31T13:05:00+09:00',populationMin:150,populationMax:250},{...pointStatus,observedAt:'2026-08-31T14:05:00+09:00',populationMin:300,populationMax:400}];
 area.realtime=null;
 area.realtimeForecast=[{...pointStatus,targetAt:'2026-08-31T15:00:00+09:00',issuedAt:'2026-08-31T14:00:00+09:00',populationMin:300,populationMax:500,congestionLevel:2},{...pointStatus,targetAt:'2026-08-31T16:00:00+09:00',issuedAt:'2026-08-31T14:00:00+09:00',populationMin:400,populationMax:600,congestionLevel:2}];
 await page.route('**/api/live/summary*',r=>r.fulfill({json:data}));
 await page.goto(`/${lang}/hongdae`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page.getByTestId('population-outlook')).toBeVisible();
 await page.locator('.population-history-disclosure>summary').click();
 const flow=page.locator('.population-flow').first();const chart=flow.locator('.population-chart');
 await expect(chart.locator('.population-range-material')).toHaveCount(2);
 await expect(chart.locator('.flow-observed > path.flow-range')).toHaveCount(1);
 await expect(chart.locator('.flow-observed > line.flow-interval')).toHaveCount(1);
 await expect(chart.locator('.flow-forecast > path.flow-bound')).toHaveCount(2);
 for(const bound of await chart.locator('.flow-forecast > path.flow-bound').all())await expect(bound).toHaveCSS('stroke-dasharray','3px, 2px');
 await expect(chart.locator('.flow-observed > path.flow-bound')).toHaveCount(2);
 await expect(chart.locator('.flow-observed > path.flow-bound').first()).toHaveCSS('stroke-width','0.35px');
 await expect(chart.locator('.flow-forecast > path.flow-bound').first()).toHaveCSS('stroke-width','0.5px');
 const geometry=await chart.locator('.population-range-material').evaluateAll(materials=>materials.map(material=>{
  const bounds=[...material.parentElement!.querySelectorAll('path.flow-bound')].map(path=>[...path.getAttribute('d')!.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(match=>[Number(match[1]),Number(match[2])]));
  const strips=[...material.querySelectorAll('polygon')].map(p=>p.getAttribute('points')!.split(' ').map(p=>p.split(',').map(Number)));
  return {bounds,strips};
 }));
 for(const {bounds,strips} of geometry)for(const strip of strips)for(const [x,y] of strip){const index=bounds[0].findIndex(point=>Math.abs(point[0]-x)<.001);expect(index).toBeGreaterThanOrEqual(0);expect(y).toBeGreaterThanOrEqual(bounds[0][index][1]-.001);expect(y).toBeLessThanOrEqual(bounds[1][index][1]+.001);}
 const select=flow.getByRole('combobox');await select.focus();await select.press('End');
 await expect(flow.locator('output')).toHaveAttribute('aria-label',/400.*600/);
 await expect(select).toBeFocused();
 await expect(select).toHaveCSS('outline-style','solid');
 expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 await flow.locator('.flow-view-controls button').last().click();await expect(chart.locator('.flow-observed')).toHaveCount(0);
 await expect(chart.locator('.flow-forecast > path.flow-range')).toHaveCount(1);
 await flow.locator('.flow-view-controls button').first().click();
 await expect(flow.locator('.flow-notes')).toContainText('08-31 14:00');
 await flow.locator('.flow-material-note summary').focus();await page.keyboard.press('Enter');
 await expect(flow.locator('.flow-material-note')).toHaveAttribute('open','');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 if(lang==='ko')await flow.screenshot({path:info.outputPath(`seoul-connected-${width}.png`)});
 // Zero and missing are distinct; neither receives invented material volume.
 area.observedSeries=[{...pointStatus,observedAt:'2026-08-31T13:55:00+09:00',populationMin:0,populationMax:0}];area.realtimeForecast=[];
 await page.reload();await page.locator('.population-history-disclosure>summary').click();await expect(flow.locator('.population-range-material')).toHaveCount(0);
 await expect(flow.locator('output')).toHaveAttribute('aria-label',/0.*0/);
 area.observedSeries=[];await page.reload();await page.locator('.population-history-disclosure>summary').click();await expect(flow.locator('.population-chart')).toHaveCount(0);
 await expect(flow.locator('.demand-empty')).toBeVisible();
});

for(const lang of ['ko','en','zh','ja'] as const)test(`official outlook peak stays in the upcoming window ${lang}`,async({page})=>{
 await page.setViewportSize({width:390,height:900});await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));
 const data=structuredClone(SUMMARY_FIXTURE) as LiveSummary,area=data.areas.myeongdong!;
 area.realtime={...area.realtime!,populationMin:94000,populationMax:96000};
 area.realtimeForecast=[
  {...pointStatus,targetAt:'2026-08-31T13:00:00+09:00',issuedAt:'2026-08-31T12:00:00+09:00',populationMin:190000,populationMax:200000,congestionLevel:4},
  {...pointStatus,targetAt:'2026-08-31T17:00:00+09:00',issuedAt:'2026-08-31T14:00:00+09:00',populationMin:88000,populationMax:90000,congestionLevel:3},
  {...pointStatus,targetAt:'2026-09-01T00:00:00+09:00',issuedAt:'2026-08-31T14:00:00+09:00',populationMin:12000,populationMax:14000,congestionLevel:1},
 ];
 await page.route('**/api/live/summary*',r=>r.fulfill({json:data}));
 await page.route('**/api/live/predictions*',r=>r.fulfill({json:{targetDate:'2026-09-01',run:null,coverage:null,records:[]}}));
 await page.goto(`/${lang}/predictions`);const official=page.locator('.outlook-grid>article').first();
 await expect(official.locator('.outlook-value')).toContainText('17:00');await expect(official.locator('.outlook-value')).toContainText('88,000–90,000');
 const select=official.getByRole('combobox');await select.press('End');await expect(official.locator('output')).toHaveAttribute('aria-label',/09-01 00:00 KST.*12,000.*14,000/);
 await expect(official.locator('.flow-notes')).toContainText('08-31 14:00 KST');
});
