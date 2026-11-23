import { test, expect } from '@playwright/test';
import { airportDateGapPx } from '../scripts/airport-control-spacing.mjs';
import { PREFERENCE_KEY } from '../lib/personal-briefing';

// Uses public Production responses and local preferences only; sends no feedback.
for (const width of [360, 390]) test(`airport preferences and date controls on Production ${width}`, async ({ page }, info) => {
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
    // The approved day rail keeps a generous 56px touch target.
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(56);
    await expect(control).toHaveAccessibleDescription(await control.locator('time').innerText());
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
  // The same header remains below the real browser-provided inset while scrolling.
  await expect(page.locator('.site-header')).toHaveCSS('position', 'sticky');
  const inset = await page.locator('.site-header').evaluate(el => parseFloat(getComputedStyle(el).paddingTop));
  expect((await page.locator('.brand').boundingBox())!.y).toBeGreaterThanOrEqual(inset);
  const dateNav = page.locator('.airport-date-reserved .date-nav');
  const today = await dateButtons.nth(1).locator('time').getAttribute('datetime');
  expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await expect(dateNav).toHaveAttribute('data-selected-date', today!);
  for (const index of [0, 2]) {
    const button = dateButtons.nth(index);
    const date = await button.locator('time').getAttribute('datetime');
    expect(date, 'each shortcut identifies its service date').toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(date).not.toBe(today);
    await button.click();
    await expect(dateNav).toHaveAttribute('data-selected-date', date!);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }
  await dateButtons.nth(1).click();
  await expect(dateNav).toHaveAttribute('data-selected-date', today!);
  await expect(dateButtons.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('script[data-koretail-analytics]')).toHaveCount(0);
});

// Keep the terminal rail and information menu readable at each layout width.
for (const width of [320, 360, 390, 430, 600, 1440]) test(`production airport menu spacing contract ${width}`, async ({page}, info) => {
  await page.setViewportSize({width, height:900});
  await page.goto('/ko/airport');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  await expect(page.locator('.airport-view > .airport-menu-label')).toHaveCount(2);
  const phone = width <= 600,desktop = width >= 1000;
  const rail = page.getByRole('tablist', { name:'터미널', exact:true });
  await expect(rail).toHaveCSS('display','grid');
  await expect(rail).toHaveCSS('gap','5px');
  const tabs = rail.getByRole('tab');
  await expect(tabs).toHaveCount(4);
  await expect(rail.getByRole('tab',{selected:true})).toHaveCount(1);
  const boxes = await tabs.evaluateAll(nodes => nodes.map(node => {
    const {left,right,width,height}=node.getBoundingClientRect();
    return {left,right,width,height,clipped:node.scrollWidth>node.clientWidth};
  }));
  for (const [index, box] of boxes.entries()) {
    expect(box.height).toBeGreaterThanOrEqual(52);
    expect(box.width).toBeCloseTo(boxes[0].width,0);
    expect(box.clipped).toBe(false);
    if(index>0)expect(box.left-boxes[index-1].right).toBeCloseTo(5,0);
  }
  const railBounds = (await rail.boundingBox())!;
  expect(boxes[0].left-railBounds.x).toBeCloseTo(5,0);
  expect(railBounds.x+railBounds.width-boxes[3].right).toBeCloseTo(5,0);
  if(!phone)expect(railBounds.width).toBeLessThanOrEqual(480);

  const row = page.locator('.airport-context-nav');
  await expect(row).toHaveCSS('display',phone?'grid':'flex');
  await expect(row).toHaveCSS('gap',desktop?'0px 20px':'0px');
  const buttons=row.locator(':scope > button');
  await expect(buttons).toHaveCount(5);
  const geometry=await buttons.evaluateAll(nodes=>nodes.map(node=>{
    const box=node.getBoundingClientRect();
    return {left:box.left,right:box.right,width:box.width,height:box.height,clipped:node.scrollWidth>node.clientWidth};
  }));
  for(const box of geometry){
    expect(box.width).toBeCloseTo(desktop?96:geometry[0].width,1);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.clipped).toBe(false);
  }
  for(let i=1;i<geometry.length;i++)expect(geometry[i].left-geometry[i-1].right).toBeCloseTo(desktop?20:0,1);
  for(const button of await buttons.all())await expect(button).toHaveCSS('text-align',phone?'left':'center');
  const box=(await row.boundingBox())!;
  expect(geometry[0].left).toBeCloseTo(box.x,1);
  expect(geometry.at(-1)!.right).toBeCloseTo(box.x+box.width,1);
  await expect(page.locator('.airport-date-reserved .date-nav-shortcuts')).toHaveCSS('gap',airportDateGapPx(width));
  const dateRow=page.locator('.airport-date-reserved .date-nav-shortcuts');
  await expect(dateRow).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await expect(dateRow).toHaveCSS('display','grid');
  await expect(dateRow).toHaveCSS('border-bottom-width','1px');
  const dayButtons=dateRow.locator(':scope > button');
  await expect(dayButtons).toHaveCount(3);
  const dayGeometry=await dayButtons.evaluateAll(nodes=>nodes.map(node=>{const box=node.getBoundingClientRect();return {left:box.left,right:box.right,width:box.width,height:box.height,clipped:node.scrollWidth>node.clientWidth};}));
  for(const box of dayGeometry){expect(box.width).toBeCloseTo(dayGeometry[0].width,1);expect(box.height).toBeGreaterThanOrEqual(56);expect(box.clipped).toBe(false);}
  for(let i=1;i<dayGeometry.length;i++)expect(dayGeometry[i].left-dayGeometry[i-1].right).toBeCloseTo(0,1);
  for(const button of await dayButtons.all()){await expect(button).toHaveCSS('text-align','center');await expect(button).toHaveAccessibleDescription(await button.locator('time').innerText());}
  const selected=dateRow.locator('button[aria-pressed=true]');
  expect(await selected.evaluate(node=>getComputedStyle(node,'::after').display)).toBe('block');
  expect(await selected.evaluate(node=>getComputedStyle(node,'::after').height)).toBe('2px');
  const dayBounds=(await dateRow.boundingBox())!;
  expect(dayGeometry[0].left).toBeCloseTo(dayBounds.x,1);expect(dayGeometry[2].right).toBeCloseTo(dayBounds.x+dayBounds.width,1);
  if(!phone)expect(dayBounds.width).toBeLessThanOrEqual(420);
  if(phone){
    const edge=await dateRow.evaluate(el=>({left:el.getBoundingClientRect().left,parent:el.parentElement!.getBoundingClientRect().left}));
    expect(edge.left).toBeCloseTo(edge.parent,1);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath(`production-menu-spacing-${width}.png`)});
});

for(const width of [320,360,390,430,600,700,1440]) test(`production glance compact terminal row ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:900});await page.goto('/ko');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  await page.evaluate(()=>document.fonts.ready);
  const controls=page.locator('.airport-focus-operating .glance-controls'),row=controls.locator(':scope > div[role=group]'),buttons=row.locator('button');
  await expect(buttons).toHaveCount(4);const phone=width<=700;
  await expect(row).toHaveCSS('gap',phone?'8px':'6px');
  await expect(controls).toHaveCSS('margin-top',phone?'0px':'8px');
  await expect(controls).toHaveCSS('padding-bottom',phone?'0px':'8px');
  const geometry=await buttons.evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect();return {left:b.left,right:b.right,height:b.height,width:b.width,clipped:node.scrollWidth>node.clientWidth};}));
  const bounds=(await row.boundingBox())!;
  expect(geometry[0].left).toBeCloseTo(bounds.x,1);
  for(const box of geometry){expect(box.height).toBeGreaterThanOrEqual(44);expect(box.width).toBeGreaterThanOrEqual(44);expect(box.clipped).toBe(false);}
  // Approved phone layout moves only T1 left by 8px; later buttons stay put.
  for(let i=1;i<geometry.length;i++)expect(geometry[i].left-geometry[i-1].right).toBeCloseTo(phone?(i===1?0:i===2?16:8):6,1);
  expect(geometry[3].right).toBeLessThanOrEqual(bounds.x+bounds.width+1);
  if(phone)await expect(buttons.first()).toHaveCSS('padding-left','0px');
  for(const index of [3,0]){
    await buttons.nth(index).click();await expect(buttons.nth(index)).toHaveAttribute('aria-pressed','true');
    const rule=buttons.nth(index).locator('.glance-selection-rule');await expect(rule).toBeVisible();
    await expect(rule).toHaveCSS('height','2px');
    await expect(rule).toHaveCSS('left',phone?(index===0?'0px':'6px'):'9px');
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath(`production-glance-compact-${width}.png`)});
});
