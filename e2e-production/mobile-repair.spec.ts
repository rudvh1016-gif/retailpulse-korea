import { test, expect } from '@playwright/test';
import { PREFERENCE_KEY } from '../lib/personal-briefing';

// Uses public Production responses and local preferences only; sends no feedback.
for (const width of [360, 390]) test(`personalization and chart repair on Production ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/ko');
  await expect(page.getByTestId('personal-onboarding')).toHaveCount(0);
  await expect(page.locator('.demand-home')).toBeVisible();
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
  for(const control of await page.locator('.date-nav-shortcuts button').all()){
    await expect(control).toHaveCSS('border-top-width','1px');
    await expect(control).toHaveCSS('border-left-width','1px');
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  }
  await page.screenshot({path:info.outputPath(`airport-home-${width}.png`)});
  await page.goto('/ko/hongdae');
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
  const header = await page.locator('.topbar').boundingBox(), title = await page.locator('h1').boundingBox();
  expect(title!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`hongdae-${width}.png`) });
  const populationNumber = page.locator('.demand-number strong');
  if (await populationNumber.count()) await expect(populationNumber).toHaveCSS('font-size', '17px');
  const observed = page.locator('.flow-observed');
  if (await observed.count()) await expect(observed.first()).toHaveCSS('stroke', 'rgb(17, 17, 17)');
  await page.locator('.population-chart').scrollIntoViewIfNeeded();
  await page.getByRole('slider').press('End');
  await expect(page.getByRole('slider')).toHaveAttribute('aria-valuetext', /KST/);
  // The handle and the chart's own selection line must share one real screen x
  // on the LIVE site, at every position an operator can actually reach — not
  // only where a fixture happens to place them. Production carries the cadence
  // a fixture cannot: 5-minute observations, hourly overnight forecast rows and
  // real gaps. An index-based thumb tracks index/(length-1) while the line
  // tracks the point's actual time, so the two drift apart exactly there.
  const thumb = page.locator('.flow-slider-thumb'), selection = page.locator('.flow-selection line');
  for (const key of ['Home', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'End', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft']) {
    await page.getByRole('slider').press(key);
    const at = await page.getByRole('slider').getAttribute('aria-valuetext');
    const [handle, line] = [await thumb.boundingBox(), await selection.boundingBox()];
    expect(handle, `handle missing at ${at}`).not.toBeNull();
    expect(line, `selection line missing at ${at}`).not.toBeNull();
    expect(Math.abs((handle!.x + handle!.width / 2) - (line!.x + line!.width / 2)), `handle vs selection at ${at}`).toBeLessThanOrEqual(2);
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
    await page.locator('.date-nav-shortcuts button').nth(index).click();
    await expect(picker).not.toHaveValue(today);
  }
  await page.locator('.date-nav-shortcuts button').nth(1).click();
  await expect(picker).toHaveValue(today);
  await expect(page.locator('script[data-koretail-analytics]')).toHaveCount(0);
});
