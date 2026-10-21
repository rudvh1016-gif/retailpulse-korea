import {test,expect,type Locator,type Page} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};

// Exercise the reported production country-detail route, not the home preview.
// Only data responses are fixtures; interactions and hit testing remain native.
async function openCountryRoute(page:Page,entry:'direct'|'navigation',mobile:boolean){
 await page.clock.setFixedTime(new Date(summary.generatedAt));
 await page.emulateMedia({reducedMotion:'no-preference'});
 // Unrelated APIs fail closed locally; this diagnostic never asks a provider.
 await page.route('**/api/**',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*',route=>route.fulfill({json:summary}));
 await page.route('**/api/live/flights*',route=>route.fulfill({json:flights}));
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:months}));
 await page.route('**/api/live/airport-passenger-stats*',route=>route.fulfill({json:passengerStats}));
 await page.route(/google-analytics\.com|googletagmanager\.com|analytics\.google\.com/,route=>route.abort());
 await page.goto(entry==='direct'?'/ko/airport-countries?date=2026-10-19':'/ko?date=2026-10-19',{waitUntil:'domcontentloaded'});
 await expect(page.locator('.app[data-hydrated="true"]')).toBeVisible();
 if(entry==='navigation'){
  await page.locator(mobile?'.bottom-nav':'.top-nav').getByRole('link',{name:'국가별 흐름',exact:true}).click();
  await expect(page).toHaveURL(/\/ko\/airport-countries(?:\?|$)/);
 }
 await expect(page.getByRole('heading',{name:'국가별 흐름',exact:true})).toBeVisible();
 const country=page.locator('#focus-country-trends article').filter({has:page.getByRole('heading',{name:'중국',exact:true})});
 // The table distinguishes the full country route from home/preview cards.
 await expect(country.locator('.focus-month-values')).toHaveCount(1);
 const chart=country.locator('.focus-interactive-line-chart');
 await expect(chart.locator('.focus-month-target')).toHaveCount(6);
 await chart.evaluate(node=>node.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
 return chart;
}

async function hitMonth(page:Page,point:{x:number;y:number},month:string){
 expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('.focus-month-target')?.getAttribute('data-month'),point)).toBe(month);
}
async function glassReadout(page:Page,chart:Locator,text:string){
 const tip=chart.getByRole('tooltip');
 await expect(tip).toBeVisible();await expect(tip).toHaveText(text);
 await expect(tip).toHaveCSS('opacity','1');
 await expect(tip).toHaveCSS('background-color','rgba(255, 255, 255, 0.6)');
 await expect(tip).toHaveCSS('backdrop-filter','blur(24px) saturate(1.1)');
 await expect(tip).toHaveCSS('border-radius','33px');
 await expect(tip).toHaveCSS('pointer-events','none');
 await expect(tip).toHaveCSS('font-size','13px');
 expect(await tip.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
 const box=(await tip.boundingBox())!,viewport=page.viewportSize()!;
 expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);
 expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(viewport.height);
 await expect(chart).toHaveCSS('background-color','rgb(255, 255, 255)');
}

for(const entry of ['direct','navigation'] as const){
 test(`country detail ${entry}: desktop visible month label, point and connecting line show liquid counts`,async({page},info)=>{
  await page.setViewportSize({width:1440,height:1000});
  const chart=await openCountryRoute(page,entry,false);
  const label=(await chart.locator('g[data-month="2026-09"] text').boundingBox())!;
  const labelPoint={x:label.x+label.width/2,y:label.y+label.height/2};
  await hitMonth(page,labelPoint,'2026-09');await page.mouse.move(labelPoint.x,labelPoint.y);
  await glassReadout(page,chart,'9월 · 601,273명');
  const a=(await chart.locator('g[data-month="2026-08"] .focus-month-point').boundingBox())!;
  const b=(await chart.locator('g[data-month="2026-09"] .focus-month-point').boundingBox())!;
  const dot={x:a.x+a.width/2,y:a.y+a.height/2};
  await hitMonth(page,dot,'2026-08');await page.mouse.move(dot.x,dot.y);
  await glassReadout(page,chart,'8월 · 761,678명');
  const line={x:dot.x+(b.x-a.x)*.55,y:dot.y+(b.y-a.y)*.55};
  await hitMonth(page,line,'2026-09');await page.mouse.move(line.x,line.y);
  await glassReadout(page,chart,'9월 · 601,273명');
  await page.screenshot({path:info.outputPath(`country-${entry}-desktop-liquid.png`)});
  await page.keyboard.press('Escape');await expect(chart.getByRole('tooltip')).toHaveCount(0);
 });
}

test.describe('country detail native mobile label taps',()=>{
 test.use({hasTouch:true,isMobile:true});
 for(const entry of ['direct','navigation'] as const)test(`${entry}: month labels select exact counts with normal motion`,async({page},info)=>{
  await page.setViewportSize({width:390,height:900});
  const chart=await openCountryRoute(page,entry,true);
  for(const [month,text] of [['2026-08','8월 · 761,678명'],['2026-09','9월 · 601,273명'],['2026-08','8월 · 761,678명']]){
   const label=(await chart.locator(`g[data-month="${month}"] text`).boundingBox())!;
   const point={x:label.x+label.width/2,y:label.y+label.height/2};
   await hitMonth(page,point,month);await page.touchscreen.tap(point.x,point.y);
   await glassReadout(page,chart,text);
   await expect(chart.locator(`button[data-month="${month}"]`)).toHaveAttribute('aria-pressed','true');
  }
  await page.screenshot({path:info.outputPath(`country-${entry}-mobile-label-liquid.png`)});
  await chart.locator('figcaption').tap();await expect(chart.getByRole('tooltip')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 });
});
