import {expectMobileTerminalTextSpacing} from '../e2e-support/glance-terminal-contract';
import { test, expect } from '@playwright/test';
import { airportDateGapPx } from '../scripts/airport-control-spacing.mjs';
import { PREFERENCE_KEY } from '../lib/personal-briefing';
import type {LiveSummary} from '../app/live-signals';

// Uses public Production responses and local preferences only; sends no feedback.
for (const width of [360, 390]) test(`personalization and chart repair on Production ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/ko');
  await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
  // Detail/date/chart contracts belong to the explicit airport route.
  await page.goto('/ko/airport');
  await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
  await expect(page.locator('.airport-today')).toBeVisible();
  await expect(page.getByTestId('area-demand-card')).toHaveCount(0);
  // This check visits with usage analytics switched off (playwright.production.config.ts),
  // so the Google tag staying out is the live 더보기 switch holding.
  await expect(page.locator('script[data-koretail-analytics]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath(`public-${width}.png`) });
  await expect(page.getByRole('button',{name:'내 브리핑 설정',exact:true})).toHaveCount(0);
  await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
  const stored=JSON.stringify({version:1,role:'manager',location:'airport',terminal:'T2',interests:['passengers','crowding'],day:'today',analytics:false});
  await page.evaluate(({key,stored})=>localStorage.setItem(key,stored),{key:PREFERENCE_KEY,stored});
  await page.reload();
  await expect(page.locator('.airport-current-brief')).toBeVisible();
  expect(await page.evaluate(key=>localStorage.getItem(key),PREFERENCE_KEY)).toBe(stored);
  await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
  // The lazy departure map also has date-nav-shortcuts. Scope the home date
  // controls so mounting its time presets cannot retarget .last() mid-check.
  const dateButtons = page.locator('.airport-date-reserved .date-nav-shortcuts button');
  await expect(dateButtons).toHaveCount(3);
  await expect(dateButtons.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.airport-date-reserved .date-nav-shortcuts')).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('.airport-date-reserved .date-nav-shortcuts')).toHaveCSS('gap', airportDateGapPx(width));
  for(const control of await dateButtons.all()){
    await expect(control).toHaveCSS('border-top-width','0px');
    await expect(control).toHaveAccessibleName(/.+/);
    // Compact airport day controls keep 46px, above the 44px touch minimum.
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(46);
  }
  await dateButtons.last().focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(dateButtons.last()).toBeFocused();
  expect(await dateButtons.last().evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await dateButtons.last().press('Enter');
  await expect(dateButtons.last()).toHaveAttribute('aria-pressed', 'true');
  await dateButtons.nth(1).press('Space');
  await expect(dateButtons.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({path:info.outputPath(`airport-home-${width}.png`)});
  // Read the matched response body immediately, while its CDP resource still
  // belongs to this navigation. A prior document's pending refresh can finish
  // as goto commits and its body becomes unavailable after the awaited goto.
  const publicSummaryPromise=page.waitForResponse(response=>{
    const referer=response.request().headers()['referer'];
    return new URL(response.url()).pathname==='/api/live/summary'&&response.status()===200&&!!referer&&new URL(referer).pathname==='/ko/hongdae';
  }).then(response=>response.json() as Promise<LiveSummary>);
  await page.goto('/ko/hongdae');
  const publicSummary=await publicSummaryPromise;
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  const history = page.locator('.population-history-disclosure');
  await expect(history).not.toHaveAttribute('open');
  await expect(page.locator('.population-chart')).toBeHidden();
  await history.locator(':scope > summary').press('Enter');
  await expect(history).toHaveAttribute('open');
  await expect(page.locator('.population-chart')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const labels = await page.locator('.flow-tick').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right }; }));
  expect(labels.length).toBeGreaterThan(0);
  // After 00:00 KST the chart adds a date label at midnight, so a phone can
  // legitimately show five times (populationTicks keeps them >= 72px apart;
  // tests/demand-presentation.test.ts holds that rule). Overlap and overflow
  // are what a reader would notice, and the lines below still forbid both.
  expect(labels.length).toBeLessThanOrEqual(5);
  labels.forEach((r, i) => { expect(r.left).toBeGreaterThanOrEqual(0); expect(r.right).toBeLessThanOrEqual(width); if (i) expect(r.left).toBeGreaterThan(labels[i - 1].right); });
  // Opening a below-fold disclosure may scroll the focused summary into view.
  // Compare the title and sticky header at the top, in the same layout frame.
  const headingGeometry = await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    return {
      scrollY,
      headerBottom: document.querySelector('.topbar')!.getBoundingClientRect().bottom,
      titleTop: document.querySelector('h1')!.getBoundingClientRect().top,
    };
  });
  expect(headingGeometry.scrollY).toBe(0);
  expect(headingGeometry.titleTop).toBeGreaterThanOrEqual(headingGeometry.headerBottom);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`hongdae-${width}.png`) });
  const populationNumber = page.locator('.demand-number strong');
  if (await populationNumber.count()) await expect(populationNumber).toHaveCSS('font-size', '29px');
  const flow=page.locator('.population-flow-connected'),chart=flow.locator('.population-chart');
  await expect(flow).toBeVisible();
  const bounds=chart.locator('.flow-bound');
  expect(await bounds.count()).toBeGreaterThan(0);
  for(const bound of await bounds.all())await expect(bound).toHaveCSS('stroke','rgb(100, 148, 179)');
  for(const bound of await chart.locator('.flow-observed .flow-bound').all())await expect(bound).toHaveCSS('stroke-dasharray','none');
  for(const bound of await chart.locator('.flow-forecast .flow-bound').all())await expect(bound).toHaveCSS('stroke-dasharray','3px, 2px');
  await expect(chart.locator('.flow-marker circle')).toHaveCSS('fill','rgb(255, 255, 255)');
  await expect(chart.locator('.flow-marker circle')).toHaveCSS('stroke','rgb(100, 148, 179)');
  await page.locator('.population-chart').scrollIntoViewIfNeeded();
  const area=publicSummary.areas.hongdae!;
  const original=new Map<string,{populationMin:number|null;populationMax:number|null}>();
  for(const row of area.observedSeries??[])original.set(`observed:${Date.parse(row.observedAt)}`,row);
  if(area.realtime)original.set(`observed:${Date.parse(area.realtime.observedAt)}`,area.realtime);
  for(const row of area.realtimeForecast??[])original.set(`forecast:${Date.parse(row.targetAt)}`,row);
  // PR281 uses a native time selector. Keep checking real timestamp geometry
  // and both original bounds, including connections and gaps in public data.
  const ranges=await chart.locator('[data-range-times]').evaluateAll(groups=>groups.map(group=>({
    kind:group.classList.contains('flow-forecast')?'forecast':'observed',
    times:group.getAttribute('data-range-times')!.split(',').map(Number),
    paths:[...group.querySelectorAll('path.flow-bound')].map(path=>path.getAttribute('d')!),
  })));
  for(const range of ranges){
    for(const time of range.times)expect(original.has(`${range.kind}:${time}`),'each plotted time comes from the displayed public response').toBe(true);
    if(range.times.length>1){
      expect(range.paths).toHaveLength(2);
      for(const path of range.paths)expect((path.match(/L/g)??[]).length).toBe(range.times.length-1);
      for(let i=1;i<range.times.length;i++)expect(range.times[i]-range.times[i-1]).toBeLessThanOrEqual(range.kind==='observed'?30*60_000:60*60_000);
    }
  }
  const selector=flow.getByLabel('차트 시간 선택');
  const options=await selector.locator('option').count();
  expect(options).toBeGreaterThan(0);
  for(const index of [...new Set([0,1,2,3,options-1,options-2,options-3,options-4].filter(index=>index>=0&&index<options))]){
    await selector.selectOption({index});
    const value=await selector.inputValue(),separator=value.indexOf(':'),time=Date.parse(value.slice(separator+1));
    const point=original.get(`${value.slice(0,separator)}:${time}`);
    expect(point,'selected range must exist in the original response').toBeDefined();
    expect(point!.populationMin).not.toBeNull();expect(point!.populationMax).not.toBeNull();
    await expect(flow.locator('.flow-readout strong')).toHaveText(`${point!.populationMin!.toLocaleString('ko-KR')}–${point!.populationMax!.toLocaleString('ko-KR')}명`);
    const geometry=await chart.evaluate((svg,at)=>{
      const grid=svg.querySelector('.flow-grid')!,left=Number(grid.getAttribute('x1')),right=Number(grid.getAttribute('x2'));
      const start=Number(svg.getAttribute('data-domain-start')),end=Number(svg.getAttribute('data-domain-end'));
      return {expected:left+(at-start)/(end-start)*(right-left),selection:Number(svg.querySelector('.flow-selection line')!.getAttribute('x1')),marker:Number(svg.querySelector('.flow-marker circle')!.getAttribute('cx'))};
    },time);
    expect(geometry.selection).toBeCloseTo(geometry.expected,5);
    expect(geometry.marker).toBeCloseTo(geometry.expected,5);
  }
  await page.screenshot({ path: info.outputPath(`chart-${width}.png`) });
  await page.locator('.population-flow').screenshot({ path: info.outputPath(`chart-panel-${width}.png`) });
  // The same header remains below the real browser-provided inset while scrolling.
  await expect(page.locator('.site-header')).toHaveCSS('position', 'sticky');
  const inset = await page.locator('.site-header').evaluate(el => parseFloat(getComputedStyle(el).paddingTop));
  expect((await page.locator('.brand').boundingBox())!.y).toBeGreaterThanOrEqual(inset);
  const picker = page.locator('.date-nav-picker input');
  const today = await picker.inputValue();
  for (const index of [0, 2]) {
    const button = page.locator('.date-nav-shortcuts button').nth(index);
    const date = await button.locator('time').getAttribute('datetime');
    expect(date, 'each shortcut identifies its service date').not.toBeNull();
    await button.click();
    await expect(picker).not.toHaveValue(today);
    await expect(picker).toHaveValue(date!);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }
  await page.locator('.date-nav-shortcuts button').nth(1).click();
  await expect(picker).toHaveValue(today);
  await expect(page.locator('.date-nav-shortcuts button').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('script[data-koretail-analytics]')).toHaveCount(0);
});

// The approved #514 phone layout uses equal slots, not centered content-width rows.
// Keep a desktop witness so this cannot silently become a sitewide change.
for (const width of [320, 360, 390, 430, 600, 1440]) test(`production airport menu spacing contract ${width}`, async ({page}, info) => {
  await page.setViewportSize({width, height:900});
  await page.goto('/ko/airport');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  await expect(page.locator('.airport-view > .airport-menu-label')).toHaveCount(2);
  const phone = width <= 600;
  for (const [selector, count] of [['#airport-data-flow',4],['.airport-context-nav',5]] as const) {
    const row = page.locator(selector);
    await expect(row).toHaveCSS('display',phone?'grid':'flex');
    await expect(row).toHaveCSS('gap','0px');
    const buttons=row.locator(':scope > button');
    await expect(buttons).toHaveCount(count);
    const geometry=await buttons.evaluateAll(nodes=>nodes.map(node=>{
      const box=node.getBoundingClientRect();
      return {left:box.left,right:box.right,width:box.width,height:box.height,clipped:node.scrollWidth>node.clientWidth};
    }));
    for(const box of geometry){
      expect(box.width).toBeCloseTo(geometry[0].width,1);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.clipped).toBe(false);
    }
    for(let i=1;i<geometry.length;i++)expect(geometry[i].left-geometry[i-1].right).toBeCloseTo(0,1);
    for(const button of await buttons.all())await expect(button).toHaveCSS('text-align',phone?'left':'center');
    const box=(await row.boundingBox())!;
    expect(geometry[0].left).toBeCloseTo(box.x,1);
    expect(geometry.at(-1)!.right).toBeCloseTo(box.x+box.width,1);
  }
  await expect(page.locator('.airport-date-reserved .date-nav-shortcuts')).toHaveCSS('gap',airportDateGapPx(width));
  const dateRow=page.locator('.airport-date-reserved .date-nav-shortcuts');
  await expect(dateRow).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  if(phone)for(const button of await dateRow.locator('button').all()){
    const selected=await button.getAttribute('aria-pressed')==='true';
    await expect(button).toHaveCSS('background-color',selected?'rgb(52, 91, 123)':'rgb(96, 117, 139)');
    await expect(button).toHaveCSS('color','rgb(255, 255, 255)');await expect(button.locator('time')).toHaveCSS('color','rgb(255, 255, 255)');
    if(selected){await expect(button).toHaveCSS('border-bottom-color','rgb(255, 255, 255)');await expect(button.locator('span')).toHaveCSS('text-decoration-line','underline');}
  }
  if(phone){
    const edge=await dateRow.evaluate(el=>({left:el.getBoundingClientRect().left,parent:el.parentElement!.getBoundingClientRect().left}));
    expect(edge.left).toBeCloseTo(edge.parent,1);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath(`production-menu-spacing-${width}.png`)});
});

for(const width of [320,360,390,393,430,600,700,1440]) test(`production glance compact terminal row ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:900});await page.goto('/ko');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  const controls=page.locator('.airport-focus-operating .glance-controls'),row=controls.locator(':scope > div[role=group]'),buttons=row.locator('button');
  await expect(buttons).toHaveCount(4);const phone=width<=700;
  await expect(row).toHaveCSS('gap',phone?'0px':'6px');
  await expect(controls).toHaveCSS('margin-top',phone?'0px':'12px');
  await expect(controls).toHaveCSS('padding-bottom',phone?'0px':'8px');
  const geometry=await buttons.evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect();return {left:b.left,right:b.right,height:b.height,width:b.width,clipped:node.scrollWidth>node.clientWidth};}));
  const bounds=(await row.boundingBox())!;
  expect(geometry[0].left).toBeCloseTo(bounds.x,1);
  for(const box of geometry){expect(box.height).toBeGreaterThanOrEqual(44);if(phone)expect(box.width).toBeGreaterThanOrEqual(44);expect(box.clipped).toBe(false);}
  if(!phone)for(const button of await buttons.all()){await expect(button).toHaveCSS('padding-left','13px');await expect(button).toHaveCSS('padding-right','13px');}
  for(let i=1;i<geometry.length;i++)expect(geometry[i].left-geometry[i-1].right).toBeCloseTo(phone?0:6,1);
  expect(geometry[3].right).toBeLessThanOrEqual(bounds.x+bounds.width+1);
  if(phone)await expect(buttons.first()).toHaveCSS('padding-left','0px');
  for(const index of [3,0]){
    await buttons.nth(index).click();await expect(buttons.nth(index)).toHaveAttribute('aria-pressed','true');
    const rule=buttons.nth(index).locator('.glance-selection-rule');await expect(rule).toBeVisible();
    await expect(rule).toHaveCSS('height','2px');
    await expect(rule).toHaveCSS('left',phone?'0px':'9px');
  }
  if(phone){const geometry=await expectMobileTerminalTextSpacing(page);await info.attach('visible-text-geometry',{body:JSON.stringify(geometry,null,2),contentType:'application/json'});}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath(`production-glance-compact-${width}.png`)});
});
