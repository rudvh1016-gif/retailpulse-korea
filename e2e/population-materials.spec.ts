import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
import type {LiveSummary} from '../app/live-signals';
const pointStatus={congestionLevel:2,congestionLabel:'fixture'};
for(const width of [360,390,430,1280])for(const lang of ['ko','en','zh','ja'] as const)test(`population material keeps true intervals and controls ${lang} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const data=structuredClone(SUMMARY_FIXTURE) as LiveSummary,area=data.areas.hongdae!;
 area.observedSeries=[{...pointStatus,observedAt:'2026-08-31T13:50:00+09:00',populationMin:100,populationMax:200},{...pointStatus,observedAt:'2026-08-31T13:55:00+09:00',populationMin:150,populationMax:250},{...pointStatus,observedAt:'2026-08-31T14:05:00+09:00',populationMin:300,populationMax:400}];
 area.realtime=null;
 area.realtimeForecast=[{...pointStatus,targetAt:'2026-08-31T15:00:00+09:00',issuedAt:'2026-08-31T14:00:00+09:00',populationMin:300,populationMax:500,congestionLevel:2},{...pointStatus,targetAt:'2026-08-31T16:00:00+09:00',issuedAt:'2026-08-31T14:00:00+09:00',populationMin:400,populationMax:600,congestionLevel:2}];
 await page.route('**/api/live/summary*',r=>r.fulfill({json:data}));
 await page.goto(`/${lang}/hongdae`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const flow=page.locator('.population-flow').first();const chart=flow.locator('.population-chart');
 await expect(chart.locator('.population-range-material')).toHaveCount(3);
 await expect(chart.locator('.flow-observed > path.flow-range')).toHaveCount(1);
 await expect(chart.locator('.flow-observed > line.flow-interval')).toHaveCount(1);
 await expect(chart.locator('.flow-forecast > path.flow-bound')).toHaveCSS('stroke-dasharray','4px, 5px');
 const depth=await chart.locator('.population-material-end').last().getAttribute('points');const points=depth!.split(' ').map(p=>p.split(',').map(Number));
 expect(points[1][0]-points[0][0]).toBeCloseTo(4);expect(points[1][1]-points[0][1]).toBeCloseTo(-4);
 const front=await chart.locator('.flow-forecast > path.flow-range').getAttribute('d');
 expect(front).toContain(`${points[0][0]},${points[0][1]}`);expect(front).toContain(`${points[3][0]},${points[3][1]}`);
 const slider=flow.getByRole('slider');await slider.focus();await slider.press('End');
 await expect(slider).toHaveAttribute('aria-valuetext',/400.*600/);
 await expect(flow.locator('.flow-notes')).toContainText('08-31 14:00');
 await flow.locator('.flow-material-note summary').focus();await page.keyboard.press('Enter');
 await expect(flow.locator('.flow-material-note')).toHaveAttribute('open','');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 // Zero and missing are distinct; neither receives invented material volume.
 area.observedSeries=[{...pointStatus,observedAt:'2026-08-31T13:55:00+09:00',populationMin:0,populationMax:0}];area.realtimeForecast=[];
 await page.reload();await expect(flow.locator('.population-range-material')).toHaveCount(0);
 await expect(flow.getByRole('slider')).toHaveAttribute('aria-valuetext',/0.*0/);
 area.observedSeries=[];await page.reload();await expect(flow.locator('.population-chart')).toHaveCount(0);
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
 const slider=official.getByRole('slider');await slider.press('End');await expect(slider).toHaveAttribute('aria-valuetext',/09-01 00:00 KST.*12,000.*14,000/);
 await expect(official.locator('.flow-notes')).toContainText('08-31 14:00 KST');
});
