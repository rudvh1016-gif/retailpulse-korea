import {test,expect} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};
const reference={month:'2026-09',start:'2026-09-01',end:'2026-09-30',expectedDays:30,completeDays:30,status:'COMPLETE',mean:60000,missingDates:[]};
for(const lang of ['ko','en','zh','ja'])for(const width of [320,390,430,768,1440])test(`compact metric roles ${lang} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));
 for(const [path,json] of [['flights',flights],['airport-months',months],['airport-passenger-stats',passengerStats]] as const)await page.route(`**/api/live/${path}*`,r=>r.fulfill({json}));
 const selectedReference={...reference,mean:width===320?120000:width===390?112403:60000};let referenceAvailable=true;
 await page.route('**/api/live/passenger-reference*',r=>r.fulfill({json:referenceAvailable?{status:'READY',month:'2026-09',data:{all:selectedReference,T1:selectedReference,T2:selectedReference}}:{status:'UNAVAILABLE',month:'2026-09',data:null}}));
 await page.goto(`/${lang}?date=2026-10-19`);const report=page.locator('.focus-report');
 await expect(report.locator('.focus-today-title')).toHaveCount(0);
 await expect(report.locator('.focus-report-date')).toContainText('2026-10-19');
 await expect(report.locator('.focus-report-date .heading-marker')).toHaveCount(0);
 const left=report.locator('.focus-figures-title'),right=report.locator('.focus-flight-metric > .focus-metric-label');
 await expect(left).toBeVisible();await expect(right).toBeVisible();
 if(width<=700){
  const box=(await report.boundingBox())!;expect(box.x).toBeCloseTo(8,0);expect(box.x+box.width).toBeCloseTo(width-8,0);
  await expect(report.locator('.focus-report-lines')).toHaveCSS('column-gap','28px');
 }
 const commentary=report.locator('.focus-country-change-copy');await expect(commentary.first()).toBeVisible();
 for(const row of await commentary.all()){await expect(row).toHaveCSS('font-size','12px');await expect(row.locator('b')).toHaveCSS('font-size','12px');}
 await expect(report.locator('.focus-selected-country-changes:not(.focus-return-context)>small').first()).toHaveCSS('font-size','11px');
 const flow=page.locator('.glance-insights[aria-labelledby="airport-staff-briefing-title"]');
 await expect(flow.locator('.airport-flow-check')).toHaveCount(5);
 for(const check of await flow.locator('.airport-flow-check').all()){await expect(check).toHaveAttribute('aria-hidden','true');await expect(check).toHaveText('✓');await expect(check).toHaveCSS('font-size','11px');await expect(check).toHaveCSS('color','rgb(17, 17, 17)');}
 await expect(page.locator('h1 .airport-flow-check,h2 .airport-flow-check')).toHaveCount(0);
 if(width<=700){const a=(await flow.getByTestId('glance-key-growth').locator('small').boundingBox())!,b=(await flow.locator('.staff-brief-heading small').boundingBox())!;expect(b.y-a.y-a.height).toBeGreaterThanOrEqual(0);expect(b.y-a.y-a.height).toBeLessThanOrEqual(8);}
 if(lang==='ko'&&width<=700){
  const tabs=page.locator('.airport-insight-tabs:not(.country-tabs)'),buttons=tabs.getByRole('tab');await expect(buttons).toHaveCount(5);
  const boxes=await buttons.evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {y:b.y,height:b.height,size:getComputedStyle(n).fontSize};}));
  for(const box of boxes){expect(box.y).toBe(boxes[0].y);expect(box.height).toBeGreaterThanOrEqual(48);expect(box.size).toBe('13px');}
  await buttons.first().focus();await page.keyboard.press('End');await expect(buttons.last()).toBeFocused();await expect(buttons.last()).toHaveAttribute('aria-selected','true');
  const selected=(await buttons.last().boundingBox())!,strip=(await tabs.boundingBox())!;expect(selected.x).toBeGreaterThanOrEqual(strip.x-1);expect(selected.x+selected.width).toBeLessThanOrEqual(strip.x+strip.width+1);
  await page.keyboard.press('Home');await expect(buttons.first()).toHaveAttribute('aria-selected','true');await expect(report).toBeVisible();
 }
 if(width<1000){const a=(await left.boundingBox())!,b=(await right.boundingBox())!;expect(a.x+a.width).toBeLessThanOrEqual(b.x);expect(Math.abs(a.y-b.y)).toBeLessThanOrEqual(1);}
 const calculation=report.locator('.focus-passenger-calculation'),toggle=calculation.locator('summary');
 await expect(toggle).toBeVisible();await expect(toggle).toHaveCSS('font-size',width<=600?'11px':'12px');expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 const parts=toggle.locator('.focus-passenger-parts');await expect(parts).toContainText('103,124');await expect(parts).toContainText('9,279');await expect(parts).toHaveCSS('font-size',width<=600?'10px':'11px');await expect(parts).toHaveCSS('font-weight','400');
 for(const basis of await report.locator('.focus-comparison-basis,.daily-comparison-basis').all()){await expect(basis).toHaveCSS('font-size',width<=600?'10px':'11px');await expect(basis).toHaveCSS('font-weight','400');}
 const change=report.locator('.focus-comparison-change'),signed=change.locator(':scope > .glance-count-change');
 await expect(signed).toHaveAttribute('data-direction',width===320?'down':width===390?'neutral':'up');
 if(width===320){await expect(change).toHaveCSS('color','rgb(161, 45, 63)');await expect(signed).toContainText('△');await expect(change.locator('.focus-passenger-rate .change-rate')).toHaveCSS('color','rgb(161, 45, 63)');}
 else {await expect(change).not.toHaveCSS('color','rgb(161, 45, 63)');await expect(signed).toHaveCSS('color',width===390?'rgb(89, 99, 110)':'rgb(36, 89, 166)');}
 if(width<=700){
  const overflow=await report.locator('.focus-core-metric').evaluateAll(nodes=>nodes.flatMap(metric=>{
   const box=metric.getBoundingClientRect(),walker=document.createTreeWalker(metric,NodeFilter.SHOW_TEXT),issues=[];
   for(let text=walker.nextNode();text;text=walker.nextNode()){
    if(!text.textContent?.trim()||text.parentElement?.closest('.sr-only'))continue;
    const range=document.createRange();range.selectNodeContents(text);
    for(const rect of range.getClientRects())if(rect.width>0&&(rect.left<box.left-1||rect.right>box.right+1))issues.push({text:text.textContent,left:rect.left,right:rect.right,columnLeft:box.left,columnRight:box.right});
   }return issues;
  }));expect(overflow,'visible metric text stays inside its own column and preserves the center gap').toEqual([]);
 }
 const label=(await toggle.locator(':scope > span').first().boundingBox())!,partBox=(await parts.boundingBox())!;expect(partBox.y-label.y-label.height).toBeGreaterThanOrEqual(0);expect(partBox.y-label.y-label.height).toBeLessThanOrEqual(3);
 await toggle.focus();await page.keyboard.press('Enter');await expect(calculation).toHaveAttribute('open','');await page.keyboard.press('Space');await expect(calculation).not.toHaveAttribute('open','');
 // Stress narrow columns without altering fixture/source calculations.
 await report.locator('.focus-metric-total').first().evaluate(node=>{node.textContent='1,234,567,890 people';});
 expect(await report.locator('.focus-metric-total').first().evaluate(node=>{const box=node.closest('.focus-core-metric')!.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(node);return [...range.getClientRects()].every(rect=>rect.left>=box.left-1&&rect.right<=box.right+1);}),'long headline figures wrap inside their own column').toBe(true);
 expect(await report.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 if(lang==='ko'&&width===320){referenceAvailable=false;await page.reload();await expect(report.locator('.focus-passenger-parts')).toContainText('103,124');await expect(report.locator('.focus-comparison-change')).toHaveCount(0);const missing=report.locator('.focus-passenger-comparison-core');await expect(missing).toContainText('같은 기준의 비교자료 확인 중');await expect(missing).toHaveCSS('font-size','11px');await expect(missing).not.toHaveCSS('color','rgb(161, 45, 63)');}
});
