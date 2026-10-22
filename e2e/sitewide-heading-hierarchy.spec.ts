import {test,expect,type Page} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};

// Captured selected-day inputs only. No provider traffic or production writes.
async function fixtures(page:Page){
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));
 for(const [path,json] of [['flights',flights],['airport-months',months],['airport-passenger-stats',passengerStats]] as const)await page.route(`**/api/live/${path}*`,r=>r.fulfill({json}));
 await page.route('**/api/airport/calendar*',r=>r.fulfill({json:{status:'UNAVAILABLE',events:[],sources:[],replacementScopes:[]}}));
 await page.route('**/api/live/passenger-reference*',r=>r.fulfill({json:{status:'UNAVAILABLE',data:null}}));
}

async function verifyHeadings(page:Page){
 const headings=page.locator('[data-heading]:visible');
 await expect(headings.first()).toBeVisible();
 const rows=await headings.evaluateAll(nodes=>nodes.map(node=>{
  const style=getComputedStyle(node),bounds=node.getBoundingClientRect();
  const marker=node.querySelector(':scope > .heading-marker');
  const markerStyle=marker?getComputedStyle(marker):null;
  return {text:node.textContent?.trim(),role:node.getAttribute('data-heading'),size:parseFloat(style.fontSize),
   left:bounds.left,right:bounds.right,overflow:node.scrollWidth-node.clientWidth,
   hidden:marker?.getAttribute('aria-hidden'),markerText:marker?.textContent,
   markerWidth:marker?.getBoundingClientRect().width,markerColor:markerStyle?.backgroundColor,color:style.color};
 }));
 for(const row of rows){
  expect(row.text).toBeTruthy();
  expect(row.size,`${row.role}: ${row.text}`).toBeGreaterThanOrEqual(row.role==='page'?26:row.role==='section'?21:18);
  expect(row.hidden,`decorative marker: ${row.text}`).toBe('true');
  expect(row.markerText).toBe('');
  expect(row.markerWidth).toBeGreaterThan(0);
  expect(row.markerColor).toBe(row.color);
  expect(row.left,`left edge: ${row.text}`).toBeGreaterThanOrEqual(-1);
  expect(row.right,`right edge: ${row.text}`).toBeLessThanOrEqual(page.viewportSize()!.width+1);
  expect(row.overflow,`wrapped heading: ${row.text}`).toBeLessThanOrEqual(1);
 }
 await expect(page.locator('button > .heading-marker,summary > .heading-marker,nav .heading-marker')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
}

const routes=['','airport','airport-countries','airport-prepare','more','where-to','consumption','tourism-desk','travel-records','about'];
for(const width of [320,390,1440])for(const route of routes)test(`sitewide heading hierarchy /ko/${route} at ${width}px`,async({page},info)=>{
 test.setTimeout(120000);
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});await fixtures(page);
 await page.goto(`/ko${route?`/${route}`:''}?date=2026-10-19`,{waitUntil:'domcontentloaded'});
 if(route==='travel-records')await expect(page.getByTestId('travel-empty')).toBeVisible();
 else await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await verifyHeadings(page);
 if(!route){
  const staff=page.locator('.staff-brief-grid > section > h3');
  await expect(staff).toHaveText(['01 시간·터미널','02 노선·휴일 준비','03 품목별 확인']);
  await expect(staff.locator(':scope > .heading-marker')).toHaveCount(3);
  const parentSize=await page.locator('#airport-staff-briefing-title').evaluate(e=>parseFloat(getComputedStyle(e).fontSize));
  for(const heading of await staff.all())expect(parentSize).toBeGreaterThan(await heading.evaluate(e=>parseFloat(getComputedStyle(e).fontSize)));
  const bodySize=await page.locator('.staff-brief-grid p').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize));
  for(const heading of await staff.all())expect(await heading.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThan(bodySize+3);
  await expect(page.locator('.staff-brief-grid details').filter({has:page.getByText('패션·명품',{exact:true})})).toHaveAttribute('open','');
  const disclosure=page.locator('.staff-route-details');
  await expect(disclosure).not.toHaveAttribute('open','');
  await disclosure.locator('summary').focus();await page.keyboard.press('Enter');await expect(disclosure).toHaveAttribute('open','');
  await page.keyboard.press('Enter');await expect(disclosure).not.toHaveAttribute('open','');
  if(width<=820){await expect(page.locator('.bottom-nav.glass-nav')).toBeVisible();await expect(page.locator('.bottom-nav.glass-nav a')).toHaveCount(5);}
  await page.locator('.airport-staff-briefing').screenshot({path:info.outputPath(`staff-headings-${width}.png`)});
 }
 await page.screenshot({path:info.outputPath(`heading-${route||'home'}-${width}.png`),fullPage:true});
});

for(const lang of ['en','zh','ja'])test(`localized heading wrapping /${lang} at 320px`,async({page},info)=>{
 test.setTimeout(120000);await page.setViewportSize({width:320,height:1000});await page.emulateMedia({reducedMotion:'reduce'});await fixtures(page);
 await page.goto(`/${lang}?date=2026-10-19`,{waitUntil:'domcontentloaded'});await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await verifyHeadings(page);await page.screenshot({path:info.outputPath(`heading-home-${lang}-320.png`),fullPage:true});
});
