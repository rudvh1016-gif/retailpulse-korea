import {test,expect} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};
for(const width of [320,390,700,701,768,1440])test(`approved briefing metric layout and evidence ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));
 for(const [path,json] of [['flights',flights],['airport-months',months],['airport-passenger-stats',passengerStats]] as const)await page.route(`**/api/live/${path}*`,r=>r.fulfill({json}));
 await page.goto('/ko?date=2026-10-19');
 const report=page.locator('.focus-report[data-brief-cards=approved]');
 await expect(report.locator('.focus-passenger-total')).toHaveText('112,403명');
 await expect(report).not.toContainText('공항 리테일 분석');
 await expect(report.locator('.focus-brief-parts')).toHaveText('출국 103,124명 + 환승 9,279명');
 const people=(await report.locator('.focus-people-metric').boundingBox())!,flightsBox=(await report.locator('.focus-flight-metric').boundingBox())!;
 if(width<=700){expect(flightsBox.y).toBeGreaterThanOrEqual(people.y+people.height+18);expect(flightsBox.x).toBeCloseTo(people.x,0);}
 else{expect(flightsBox.x).toBeGreaterThanOrEqual(people.x+people.width+27);expect(flightsBox.y).toBeLessThan(people.y);}
 const parts=(await report.locator('.focus-brief-parts').boundingBox())!,weekly=(await report.locator('.focus-week-comparison').first().boundingBox())!;
 expect(parts.y+parts.height).toBeLessThanOrEqual(weekly.y);
 await expect(report.locator('.focus-week-comparison')).toHaveCount(2);
 const context=report.locator('.focus-selected-country-stack'),topics=context.locator(':scope>.focus-selected-country-changes');
 if(await topics.count()===1)expect((await topics.first().boundingBox())!.width).toBeCloseTo((await context.boundingBox())!.width,1);
 const evidence=report.locator('.focus-report-basis'),toggle=evidence.locator('summary');
 await toggle.focus();await page.keyboard.press('Enter');await expect(evidence).toHaveAttribute('open','');
 await expect(evidence).toContainText('중복을 제거한 공식 총출국객 수가 아닙니다.');
 await expect(evidence).toContainText('항공편 수는 승객 수가 아닙니다.');
 await page.keyboard.press('Space');await expect(evidence).not.toHaveAttribute('open','');
 const metricOverflow=await report.locator('.focus-core-metric').evaluateAll(nodes=>nodes.flatMap(metric=>{const box=metric.getBoundingClientRect(),walker=document.createTreeWalker(metric,NodeFilter.SHOW_TEXT),issues:string[]=[];for(let text=walker.nextNode();text;text=walker.nextNode()){if(!text.textContent?.trim()||text.parentElement?.closest('.sr-only'))continue;const range=document.createRange();range.selectNodeContents(text);for(const rect of range.getClientRects())if(rect.width>0&&(rect.left<box.left-1||rect.right>box.right+1))issues.push(text.textContent);}return issues;}));
 expect(metricOverflow,'all metric text remains inside its own column').toEqual([]);
 expect(await report.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await report.screenshot({path:info.outputPath(`approved-brief-${width}.png`),style:".topbar,.bottom-nav{visibility:hidden!important}"});
});

// Synthetic comparison baselines exercise presentation states only. The selected
// source counts remain the captured fixture, and no production records change.
for(const [direction,delta,color] of [['up',1000,'rgb(36, 89, 166)'],['down',-1000,'rgb(161, 45, 63)'],['neutral',0,'rgb(89, 99, 110)']] as const)test(`approved briefing preserves ${direction} symbols and text color for both metrics`,async({page})=>{
 const {glanceFlights}=await import('../lib/airport-glance');
 const day='2026-10-19',selectedFlights=Object.fromEntries((['all','T1','CONCOURSE','T2'] as const).map(scope=>[scope,glanceFlights(day,flights.flights,scope).total]));
 await page.setViewportSize({width:390,height:1000});
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));
 for(const [path,json] of [['flights',flights],['airport-months',months],['airport-passenger-stats',passengerStats]] as const)await page.route(`**/api/live/${path}*`,r=>r.fulfill({json}));
 const reference={day,previousDay:'2026-10-12',selectedFlights,passengers:{all:112403-delta,T1:60000,T2:50000},flights:{all:selectedFlights.all-delta/1000,T1:selectedFlights.T1,CONCOURSE:selectedFlights.CONCOURSE,T2:selectedFlights.T2}};
 await page.route('**/api/live/glance-week-reference*',r=>r.fulfill({json:{status:'READY',month:'2026-10',data:reference}}));
 await page.goto(`/ko?date=${day}`);
 const report=page.locator('.focus-report[data-brief-cards=approved]');await expect(report).not.toContainText('공항 리테일 분석');
 for(const kind of ['people','flights']){
  const comparison=report.locator(`.focus-week-comparison[data-kind=${kind}]`),count=comparison.locator('.glance-count-change');
  await expect(count).toHaveAttribute('data-direction',direction);await expect(count).toHaveCSS('color',color);
  for(const rate of await comparison.locator('.change-rate').all())await expect(rate).toHaveCSS('color',color);
  if(direction==='down')await expect(count.locator('[aria-hidden=true]')).toContainText('△');
  if(direction==='up')await expect(count.locator('[aria-hidden=true]')).toContainText('+');
  if(direction==='neutral')await expect(comparison).toContainText('차이 없음');
 }
});
