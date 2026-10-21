import {test,expect,type Page} from '@playwright/test';
import metrics from '../data/airport-focus-preview/verified-metrics.json' with {type:'json'};
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};

async function openCharts(page:Page){
 await page.clock.setFixedTime(new Date(summary.generatedAt));
 await page.route('**/api/live/summary*',route=>route.fulfill({json:summary}));
 await page.route('**/api/live/flights*',route=>route.fulfill({json:flights}));
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:months}));
 await page.route('**/api/live/airport-passenger-stats*',route=>route.fulfill({json:passengerStats}));
 await page.route(/google-analytics\.com|googletagmanager\.com|analytics\.google\.com/,route=>route.abort());
 await page.goto('/ko/airport-focus-preview',{waitUntil:'domcontentloaded'});
 await page.locator('#focus-country-trends').scrollIntoViewIfNeeded();
 await expect(page.locator('.focus-interactive-line-chart')).toHaveCount(3);
}

test('hover and keyboard show the actual value for every month, including May',async({page},info)=>{
 await page.setViewportSize({width:1440,height:1000});
 await openCharts(page);
 const charts=page.locator('.focus-interactive-line-chart');
 for(const [country,row] of metrics.trends.slice(0,3).entries()){
  const chart=charts.nth(country);await chart.scrollIntoViewIfNeeded();
  for(const point of row.points){
   const button=chart.locator(`button[data-month="${point.month}"]`);
   await button.hover({position:{x:22,y:100}});
   await expect(chart.getByRole('tooltip')).toHaveText(`${Number(point.month.slice(5))}월 · ${point.departures.toLocaleString('ko-KR')}명`);
   // The readout can overlap this point, but must not steal its hit target.
   // Otherwise Escape exposes the button and immediately re-enters/reopens it.
   await expect(chart.getByRole('tooltip')).toHaveCSS('pointer-events','none');
   const box=(await button.boundingBox())!;
   expect(await button.evaluate((node,point)=>node.contains(document.elementFromPoint(point.x,point.y)),{x:box.x+22,y:box.y+100})).toBe(true);
  }
  await page.keyboard.press('Escape');await expect(chart.getByRole('tooltip')).toHaveCount(0);
 }
 const chart=charts.first(),may=chart.locator('button[data-month="2026-05"]');
 await may.focus();await expect(chart.getByRole('tooltip')).toHaveText('5월 · 902,230명');
 await expect(may).toHaveAttribute('aria-describedby',await chart.getByRole('tooltip').getAttribute('id') as string);
 await page.keyboard.press('ArrowRight');await expect(chart.getByRole('tooltip')).toHaveText('6월 · 791,585명');
 await page.keyboard.press('Home');await expect(chart.getByRole('tooltip')).toHaveText('4월 · 823,633명');
 await page.keyboard.press('End');await expect(chart.getByRole('tooltip')).toHaveText('9월 · 911,297명');
 await page.keyboard.press('Escape');await expect(chart.getByRole('tooltip')).toHaveCount(0);
 await may.focus();await page.keyboard.press('Enter');await expect(chart.getByRole('tooltip')).toHaveText('5월 · 902,230명');
 await chart.screenshot({path:info.outputPath('monthly-may-desktop.png')});
 await page.keyboard.press('Tab');await expect(chart.getByRole('tooltip')).toHaveText('6월 · 791,585명');
 await page.keyboard.press('End');await page.keyboard.press('Tab');await expect(chart.getByRole('tooltip')).toHaveCount(0);
});

test.describe('phone and tablet taps',()=>{
 test.use({hasTouch:true,isMobile:true});
 for(const width of [320,390,430,768])test(`point and month taps stay readable with reduced motion at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
  await openCharts(page);
  const chart=page.locator('.focus-interactive-line-chart').first();await chart.scrollIntoViewIfNeeded();
  const boxes=await chart.locator('.focus-month-target').evaluateAll(nodes=>nodes.map(node=>{const box=node.getBoundingClientRect();return {left:box.left,right:box.right,width:box.width,height:box.height};}));
  for(const [index,box] of boxes.entries()){
   expect(box.width).toBeGreaterThanOrEqual(24);expect(box.height).toBeGreaterThanOrEqual(44);
   if(index)expect(boxes[index-1].right).toBeLessThanOrEqual(box.left+0.1);
  }
  // Tap the visible May dot, then a month label, rather than relying on hover.
  const point=(await chart.locator('g[data-month="2026-05"] .focus-month-point').boundingBox())!;
  await page.touchscreen.tap(point.x+point.width/2,point.y+point.height/2);
  await expect(chart.getByRole('tooltip')).toHaveText('5월 · 902,230명');
  await expect(chart.getByRole('tooltip')).toHaveCSS('animation-name','none');
  await expect(chart.locator('g[data-month="2026-05"] .focus-month-halo')).toHaveCSS('transition-duration','0s');
  const tip=(await chart.getByRole('tooltip').boundingBox())!;expect(tip.x).toBeGreaterThanOrEqual(0);expect(tip.x+tip.width).toBeLessThanOrEqual(width);
  await expect(chart.locator('.focus-month-line').first()).toHaveCSS('stroke-width','1.25px');
  await expect(chart.locator('.focus-month-line').first()).toHaveAttribute('vector-effect','non-scaling-stroke');
  await chart.screenshot({path:info.outputPath(`monthly-may-${width}.png`)});
  // Screenshot scrolling can leave the month label behind the fixed bottom navigation.
  await chart.locator('.focus-month-target[data-month="2026-09"]').evaluate(node=>node.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
  const label=(await chart.locator('g[data-month="2026-09"] text').boundingBox())!;
  expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('.focus-month-target')?.getAttribute('data-month'),{x:label.x+label.width/2,y:label.y+label.height/2})).toBe('2026-09');
  await page.touchscreen.tap(label.x+label.width/2,label.y+label.height/2);
  await expect(chart.getByRole('tooltip')).toHaveText('9월 · 911,297명');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await chart.locator('figcaption').tap();await expect(chart.getByRole('tooltip')).toHaveCount(0);
 });
});
