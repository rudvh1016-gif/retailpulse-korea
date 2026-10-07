import { test, expect } from '@playwright/test';
import { PREFERENCE_KEY } from '../lib/personal-briefing';
import type {LiveSummary} from '../app/live-signals';

// Uses public Production responses and local preferences only; sends no feedback.
for (const width of [360, 390]) test(`personalization and chart repair on Production ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/ko');
  await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
  await expect(page.locator('.airport-today')).toBeVisible();
  await expect(page.getByTestId('area-demand-card')).toHaveCount(0);
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
  const dateButtons = page.locator('.date-nav-shortcuts button');
  await expect(dateButtons).toHaveCount(3);
  await expect(dateButtons.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.date-nav-shortcuts')).toHaveCSS('border-top-width', '1px');
  for(const control of await dateButtons.all()){
    await expect(control).toHaveCSS('border-top-width','0px');
    await expect(control).toHaveAccessibleName(/.+/);
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  }
  await dateButtons.last().focus();
  expect(await dateButtons.last().evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await dateButtons.last().press('Enter');
  await expect(dateButtons.last()).toHaveAttribute('aria-pressed', 'true');
  await dateButtons.nth(1).press('Space');
  await expect(dateButtons.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({path:info.outputPath(`airport-home-${width}.png`)});
  const summaryResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/live/summary'&&response.status()===200);
  await page.goto('/ko/hongdae');
  const publicSummary=await (await summaryResponse).json() as LiveSummary;
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
