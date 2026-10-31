import { test, expect } from '@playwright/test';
import { SUMMARY_FIXTURE } from './summary-fixture';

const row = (label: string, departures: number | null) => ({label,region:null,arrivals:null,departures,total:null,aggregate:false,startHour:null,endHour:null});
const data = (month: string, japan: number) => ({operationId:'ROUTE_COUNTRY_PASSENGERS',month,rows:[row('Japan',japan),row('China',0),row('United States',null)],retrievedAt:'2026-10-25T00:00:00Z',completeness:'TOTAL_NOT_PROVIDED'});

for (const width of [390, 1440]) for (const reduced of [false, true]) {
  test(`route bars preserve values and motion preference ${width} reduced=${reduced}`, async ({page}) => {
    await page.setViewportSize({width,height:900});
    await page.emulateMedia({reducedMotion:reduced ? 'reduce' : 'no-preference'});
    await page.addStyleTag({content: '.route-country-comparison > * { animation-play-state: paused !important; }'}).catch(() => {});
    await page.route('**/api/live/summary*',route=>route.fulfill({json:{...SUMMARY_FIXTURE,todayKst:'2026-10-10',serviceDateKst:'2026-10-10'}}));
    await page.route('**/api/live/airport-passenger-stats*',route=>route.fulfill({json:{status:'READY',month:'2026-09',previousMonth:'2026-08',current:{ROUTE_COUNTRY_PASSENGERS:data('2026-09',900)},previous:{ROUTE_COUNTRY_PASSENGERS:data('2026-08',1000)}}}));
    await page.route('**/api/live/airport-passenger-comparison*',route=>{const q=new URL(route.request().url()).searchParams; const selected=q.get('selected')!,baseline=q.get('baseline')!;return route.fulfill({json:{status:'READY',selectedMonth:selected,baselineMonth:baseline,selected:data(selected,selected==='2026-03'?800:900),baseline:data(baseline,baseline==='2026-03'?1200:1000),availableMonths:['2026-03','2026-08','2026-09']}});});
    await page.goto('/zh/airport-countries?mode=passengers&date=2026-10-10');
    await page.addStyleTag({content: '.route-country-comparison > * { animation-play-state: paused !important; }'});
    const block=page.getByTestId('airport-route-passengers');
    await block.scrollIntoViewIfNeeded();
    const first=block.locator('tbody tr').first();
    await expect(first.locator('.route-month-total')).toHaveText(['1,000','900']);
    await expect(block).toContainText('航线国家');
    const bar=first.locator('.route-country-comparison b');
    const motion=await bar.evaluate(el=>({name:getComputedStyle(el).animationName, width:(el as HTMLElement).style.width, origin:getComputedStyle(el).transformOrigin}));
    expect(motion.width).toBe('90%');
    expect(motion.name).toBe(reduced?'none':'chart-fill-horizontal');
    if(!reduced) {
      const motionAtHalf=await bar.evaluate(el=>{(el as HTMLElement).style.animationName='none'; getComputedStyle(el).animationName; (el as HTMLElement).style.removeProperty('animation-name'); getComputedStyle(el).animationName; const animations=el.getAnimations(); const a=animations.find(a=>'animationName' in a)??animations[0]; animations.filter(other=>other!==a).forEach(other=>other.cancel()); a.pause(); a.currentTime=600; const half=el.getBoundingClientRect(); const scale=new DOMMatrix(getComputedStyle(el).transform).a; a.currentTime=1200; const final=el.getBoundingClientRect(); return {scale,left:half.left,finalLeft:final.left};});
      expect(motionAtHalf.scale).toBeGreaterThan(0); expect(motionAtHalf.scale).toBeLessThan(1); expect(motionAtHalf.left).toBeCloseTo(motionAtHalf.finalLeft,1);
      await expect(first.locator('.route-month-total')).toHaveText(['1,000','900']);
    }
    await block.locator('[data-month-selection="baseline"]').selectOption('2026-03');
    await expect(first.locator('.route-month-total')).toHaveText(['1,200','900']);
    await expect(first.locator('.route-country-comparison i')).toHaveAttribute('style',/100%/);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    if(reduced) await block.screenshot({path:`test-results/chart-fill-route-${width}.png`});
  });
}

test('vertical bars grow from their own baseline while gaps and labels remain unchanged', async ({page}) => {
  await page.setViewportSize({width:390,height:900});
  await page.route('**/api/live/summary*',route=>route.fulfill({json:SUMMARY_FIXTURE}));
  await page.goto('/ko/airport');
  const chart=page.getByTestId('airport-mtd').locator('.airport-month-chart');
  const bar=chart.locator('svg > g').first();
  await expect(bar).toBeAttached();
  const state=await bar.evaluate(el=>{(el as SVGElement).style.animationName='none'; getComputedStyle(el).animationName; (el as SVGElement).style.removeProperty('animation-name'); getComputedStyle(el).animationName; const a=el.getAnimations()[0]; if(!a) return null; a.pause(); a.currentTime=600; const box=(el as SVGGraphicsElement).getBBox(); const matrix=new DOMMatrix(getComputedStyle(el).transform); const half=el.getBoundingClientRect(); a.currentTime=1200; const final=el.getBoundingClientRect(); return {scale:matrix.d, boxHeight:box.height, bottom:half.bottom, finalBottom:final.bottom, value:el.querySelector('.airport-month-bar')?.getAttribute('data-value')};});
  expect(state).not.toBeNull(); expect(state!.scale).toBeGreaterThan(0); expect(state!.scale).toBeLessThan(1); expect(state!.boxHeight).toBeGreaterThan(0); expect(state!.bottom).toBeCloseTo(state!.finalBottom,1); expect(state!.value).not.toBeNull();
});

for (const reduced of [false, true]) test(`history filter updates existing bars with motion preference reduced=${reduced}`, async ({page}) => {
  await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
  await page.route('**/api/live/summary*',route=>route.fulfill({json:SUMMARY_FIXTURE}));
  await page.goto('/en/airport');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  await page.locator('.airport-context-nav').getByRole('button',{name:'HISTORY'}).click();
  const history=page.locator('.airport-history');
  const bars=history.locator('.history-bars i');
  await expect(bars).toHaveCount(6);
  await bars.evaluateAll(async nodes=>{await Promise.all(nodes.flatMap(node=>node.getAnimations().map(animation=>animation.finished.catch(()=>{}))));});
  const widths=await bars.evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).style.width));
  await page.evaluate(()=>{const original=Element.prototype.animate; (window as unknown as {fillCalls:number}).fillCalls=0; Element.prototype.animate=function(...args) { if(this.matches('.history-bars i')) (window as unknown as {fillCalls:number}).fillCalls++; return original.apply(this,args); };});
  await history.getByRole('button',{name:'ARRIVALS'}).click();
  await expect.poll(async()=>await bars.evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).style.width))).not.toEqual(widths);
  // Refreshes outside the viewport stay pending until the fixed row is visible.
  // Clicking ARRIVALS can leave its bars below the fold.
  await bars.first().locator('..').scrollIntoViewIfNeeded();
  await expect(bars.first().locator('..')).toBeInViewport();
  if (reduced) await expect.poll(()=>page.evaluate(()=>(window as unknown as {fillCalls:number}).fillCalls)).toBe(0);
  else await expect.poll(()=>page.evaluate(()=>(window as unknown as {fillCalls:number}).fillCalls)).toBeGreaterThan(0);
  await expect(history.locator('.history-bars b').first()).not.toBeEmpty();
});

for (const width of [390, 1440]) test(`below-fold charts reveal when first viewed, not before scrolling ${width}`, async ({page}) => {
  await page.setViewportSize({width,height:500});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.addInitScript(() => {
    const original=Element.prototype.animate;
    (window as unknown as {visibleFillCalls:number}).visibleFillCalls=0;
    Element.prototype.animate=function(...args) {
      if(this===document.querySelector('.route-country-comparison > b')) (window as unknown as {visibleFillCalls:number}).visibleFillCalls++;
      return original.apply(this,args);
    };
  });
  await page.route('**/api/live/summary*',route=>route.fulfill({json:SUMMARY_FIXTURE}));
  await page.route('**/api/live/airport-passenger-stats*',route=>route.fulfill({json:{status:'READY',month:'2026-09',previousMonth:'2026-08',current:{ROUTE_COUNTRY_PASSENGERS:data('2026-09',900)},previous:{ROUTE_COUNTRY_PASSENGERS:data('2026-08',1000)}}}));
  await page.route('**/api/live/airport-passenger-comparison*',route=>route.fulfill({json:{status:'READY',selectedMonth:'2026-09',baselineMonth:'2026-08',selected:data('2026-09',900),baseline:data('2026-08',1000),availableMonths:['2026-08','2026-09']}}));
  await page.goto('/ko/airport-countries?mode=passengers');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  const bar=page.locator('.route-country-comparison > b').first();
  await expect(bar).toBeAttached();
  expect((await bar.boundingBox())!.y).toBeGreaterThan(500);
  // Let the original mount animation finish offscreen: this was the missing visible effect.
  await bar.evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})));});
  expect(await page.evaluate(()=>(window as unknown as {visibleFillCalls:number}).visibleFillCalls)).toBe(0);
  await bar.scrollIntoViewIfNeeded();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {visibleFillCalls:number}).visibleFillCalls)).toBeGreaterThan(0);
  const count=await page.evaluate(()=>(window as unknown as {visibleFillCalls:number}).visibleFillCalls);
  await expect(page.locator('.route-month-total').first()).toHaveText('1,000');
  await bar.evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})));});
  await page.getByRole('heading',{name:'국가별 흐름',exact:true}).scrollIntoViewIfNeeded();
  await bar.scrollIntoViewIfNeeded();
  expect(await page.evaluate(()=>(window as unknown as {visibleFillCalls:number}).visibleFillCalls)).toBe(count);
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await bar.evaluate(el=>getComputedStyle(el).transform)).toBe('none');
  expect(await bar.getAttribute('style')).toMatch(/90%/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('partially visible vertical bars observe the fixed plot, not their own changing scale', async ({page}) => {
  await page.setViewportSize({width:390,height:500});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.addInitScript(() => {
    const original=Element.prototype.animate;
    Element.prototype.animate=function(...args) {
      const animation=original.apply(this,args);
      if(this.matches('.airport-month-chart svg > g')) { animation.pause(); animation.currentTime=225; }
      return animation;
    };
  });
  await page.route('**/api/live/summary*',route=>route.fulfill({json:SUMMARY_FIXTURE}));
  await page.goto('/ko/airport');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  const bar=page.getByTestId('airport-mtd').locator('.airport-month-chart svg > g').first();
  await expect(bar).toBeAttached();
  await bar.evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})));});
  const top=(await bar.boundingBox())!.y;
  await page.evaluate(y=>window.scrollTo(0,y),top-460);
  await expect.poll(()=>bar.evaluate(el=>el.getAnimations().filter(a=>!('animationName' in a)&&a.playState==='paused').length)).toBe(1);
  // Two frames let IntersectionObserver react to the half-sized mark. It must not cancel itself.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const state=await bar.evaluate(el=>{
    const animation=el.getAnimations().find(a=>!('animationName' in a)&&a.playState==='paused');
    if(!animation)return null;
    const half=el.getBoundingClientRect(),scale=new DOMMatrix(getComputedStyle(el).transform).d;
    animation.currentTime=450;
    const final=el.getBoundingClientRect();
    animation.play();
    return {scale,bottom:half.bottom,finalBottom:final.bottom};
  });
  expect(state).not.toBeNull();
  expect(state!.scale).toBeGreaterThan(0);expect(state!.scale).toBeLessThan(1);
  expect(state!.bottom).toBeCloseTo(state!.finalBottom,1);
});
