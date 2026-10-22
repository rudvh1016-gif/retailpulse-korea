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
 await page.evaluate(()=>document.fonts.ready);
 const rows=await headings.evaluateAll(nodes=>nodes.map(node=>{
  const style=getComputedStyle(node),bounds=node.getBoundingClientRect();
  const marker=node.querySelector(':scope > .heading-marker');
  const markerStyle=marker?getComputedStyle(marker):null;
  const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT,{acceptNode:child=>child.textContent?.trim()&&!child.parentElement?.closest('[aria-hidden="true"]')?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});
  const textNode=walker.nextNode();
  const range=document.createRange();if(textNode)range.selectNodeContents(textNode);
  return {question:node.classList.contains('focus-trend-question'),text:node.textContent?.trim(),role:node.getAttribute('data-heading'),size:parseFloat(style.fontSize),
   left:bounds.left,right:bounds.right,overflow:node.scrollWidth-node.clientWidth,paddingStart:parseFloat(style.paddingInlineStart),
   textLeft:textNode?range.getClientRects()[0]?.left:null,whiteSpace:style.whiteSpace,clipped:node.scrollHeight>node.clientHeight+1,
   leftAligned:style.textAlign==='left'||(style.textAlign==='start'&&style.direction==='ltr'),contentLeft:bounds.left+parseFloat(style.borderLeftWidth),
   hidden:marker?.getAttribute('aria-hidden'),markerText:marker?.textContent,
   markerCount:node.querySelectorAll(':scope > .heading-marker').length,
   markerWidth:marker?.getBoundingClientRect().width,markerHeight:marker?.getBoundingClientRect().height,
   markerDisplay:markerStyle?.display,color:style.color,weight:style.fontWeight,opacity:style.opacity,
   staticCjk:!!node.closest('.lang-ja,.lang-zh,[lang="ja"],[lang="zh"]'),fontReady:document.fonts.check(`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,node.textContent||''),
   pseudo:['::before','::after'].map(pseudo=>({content:getComputedStyle(node,pseudo).content,display:getComputedStyle(node,pseudo).display}))};
 }));
 for(const row of rows){
  expect(row.text).toBeTruthy();
  expect(row.size,`${row.role}: ${row.text}`).toBeGreaterThanOrEqual(row.question&&page.viewportSize()!.width<=380?17:row.role==='page'?26:row.role==='section'?21:18);
  expect(row.hidden,`decorative marker: ${row.text}`).toBe('true');
  expect(row.markerText).toBe('');
  expect(row.markerCount).toBe(1);
  expect(row.markerDisplay,`no heading-prefix marker: ${row.text}`).toBe('none');
  expect(row.markerWidth).toBe(0);expect(row.markerHeight).toBe(0);
  expect(row.paddingStart,`no reserved marker inset: ${row.text}`).toBe(0);
  for(const pseudo of row.pseudo){expect(pseudo.content).toBe('none');expect(pseudo.display).toBe('none');}
  // Removing a prefix must not require centered/right-aligned titles to move.
  if(row.role==='page'&&row.leftAligned)expect(row.textLeft,`title aligns with its own content edge: ${row.text}`).toBeCloseTo(row.contentLeft,1);
  expect(row.whiteSpace).toBe('normal');
  expect(row.clipped,`unclipped heading: ${row.text}`).toBe(false);
  const palette={page:['rgb(104, 45, 58)','650'],section:['rgb(41, 39, 42)','600'],subsection:['rgb(81, 77, 80)','500']} as const;
  const [color,weight]=palette[row.role as keyof typeof palette];
  expect([row.color,row.weight]).toEqual([color,row.staticCjk?'600':weight]);
  expect(row.fontReady,`requested shipped font loaded: ${row.text}`).toBe(true);
  expect(row.opacity).toBe('1');
  expect(row.left,`left edge: ${row.text}`).toBeGreaterThanOrEqual(-1);
  expect(row.right,`right edge: ${row.text}`).toBeLessThanOrEqual(page.viewportSize()!.width+1);
  expect(row.overflow,`wrapped heading: ${row.text}`).toBeLessThanOrEqual(1);
 }
 // Lazy map/calendar headings can enter before an existing nth locator. Retry
 // the whole current list, not an old name against its newly shifted neighbour.
 await expect(async()=>{
  for(const title of await headings.all()){
   const text=(await title.innerText()).replace(/\s+/g,' ').trim();
   await expect(title).toHaveAccessibleName(text,{timeout:100});
  }
 }).toPass({timeout:8000,intervals:[100,250,500]});
 await expect(page.locator('button > .heading-marker,summary > .heading-marker,nav .heading-marker')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
}

async function verifyEnlargedHeadings(page:Page){
 const title=page.locator('[data-heading="page"]:visible').first(),text=await title.innerText();
 const observer=await page.evaluateHandle(()=>{
  const enlarged=new WeakSet<Element>();
  const scale=()=>document.querySelectorAll<HTMLElement>('[data-heading]').forEach(node=>{
   if(enlarged.has(node))return;
   const size=parseFloat(getComputedStyle(node).fontSize);
   node.style.setProperty('font-size',`${size*2}px`,'important');enlarged.add(node);
  });
  scale();
  // Lazy calendar/map headings can replace placeholders. Enlarge each new node
  // once, rather than freezing a heading count or doubling an existing title again.
  const observer=new MutationObserver(scale);observer.observe(document.body,{childList:true,subtree:true});return observer;
 });
 try{
  await expect(title).toHaveText(text);
  // Short localized titles may still fit at 200%; normal wrapping must be allowed,
  // not forced. The full title, accessibility, zero prefix and overflow checks apply.
  await verifyHeadings(page);
 }finally{await observer.evaluate(observer=>observer.disconnect());await observer.dispose();}
}

const routes=['','airport','airport-countries','airport-prepare','more','where-to','consumption','tourism-desk','travel-records','about'];
for(const width of [320,390,768,1440])for(const route of routes)test(`sitewide heading hierarchy /ko/${route} at ${width}px`,async({page},info)=>{
 test.setTimeout(120000);
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});await fixtures(page);
 await page.goto(`/ko${route?`/${route}`:''}?date=2026-10-19`,{waitUntil:'domcontentloaded'});
 if(route==='travel-records')await expect(page.getByTestId('travel-empty')).toBeVisible();
 else await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await verifyHeadings(page);
 if(route==='airport'){
  const pageTitle=page.locator('.airport-view .view-intro h1'),middle=page.locator('#airport-forecast-title');
  await expect(pageTitle).toHaveCSS('color','rgb(104, 45, 58)');await expect(pageTitle).toHaveCSS('font-weight','650');
  await expect(middle).toHaveCSS('color','rgb(81, 77, 80)');await expect(middle).toHaveCSS('font-weight','500');
  expect(await pageTitle.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThan(await middle.evaluate(e=>parseFloat(getComputedStyle(e).fontSize)));
 }
 if(!route){
  await expect(page.locator('.focus-report-title h2')).toHaveAttribute('data-heading','section');
  await expect(page.locator('.focus-today-title')).toHaveAttribute('data-heading','subsection');
  for(const heading of await page.locator('.focus-selected-country-changes h3,.focus-preparation-brief h3').all())await expect(heading).toHaveAttribute('data-heading','subsection');
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
 await verifyEnlargedHeadings(page);
});

for(const lang of ['en','zh','ja'])for(const width of [320,390,768,1440])for(const route of ['','airport','airport-countries','airport-prepare','more'])test(`localized heading wrapping /${lang}/${route} at ${width}px`,async({page},info)=>{
 test.setTimeout(120000);await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});await fixtures(page);
 await page.goto(`/${lang}${route?`/${route}`:''}?date=2026-10-19`,{waitUntil:'domcontentloaded'});await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await verifyHeadings(page);await page.screenshot({path:info.outputPath(`heading-${route||'home'}-${lang}-${width}.png`),fullPage:true});
 await verifyEnlargedHeadings(page);
});


for(const width of [320,390,430,768,1440])test(`complete Korean trend title and its own link row at ${width}px`,async({page},info)=>{
 test.setTimeout(120000);await page.setViewportSize({width,height:1000});await fixtures(page);
 await page.goto('/ko?date=2026-10-19',{waitUntil:'domcontentloaded'});
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 // Activate the existing viewport-lazy component before waiting for its loaded link.
 await page.locator('#focus-country-trends').scrollIntoViewIfNeeded();
 const section=page.locator('.focus-trends:not([aria-busy])'),title=section.locator('.focus-trend-question'),link=section.locator('.focus-trend-more');
 await expect(link).toBeVisible();await page.evaluate(()=>document.fonts.ready);
 await expect(title).toHaveText('한 달의 변화일까, 이어지는 흐름일까');
 await expect(link).toHaveText('국가별 흐름 보기 ↗');
 const metrics=()=>title.evaluate(node=>{
  const text=Array.from(node.childNodes).find(child=>child.nodeType===Node.TEXT_NODE)!;
  const range=document.createRange();range.selectNodeContents(text);
  const rects=Array.from(range.getClientRects());const box=node.getBoundingClientRect(),style=getComputedStyle(node);
  return {lines:new Set(rects.map(rect=>Math.round(rect.y))).size,bottom:box.bottom,left:box.left,size:parseFloat(style.fontSize),overflow:node.scrollWidth-node.clientWidth,clipped:node.scrollHeight>node.clientHeight+1,whiteSpace:style.whiteSpace};
 });
 const normal=await metrics();expect(normal.lines).toBe(1);expect(normal.overflow).toBeLessThanOrEqual(1);expect(normal.clipped).toBe(false);expect(normal.whiteSpace).toBe('normal');
 const linkBox=(await link.boundingBox())!;expect(linkBox.y).toBeGreaterThanOrEqual(normal.bottom);expect(linkBox.height).toBeGreaterThanOrEqual(44);
 await section.locator('.focus-trend-heading').screenshot({path:info.outputPath(`trend-title-${width}.png`)});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 {
  // Emulate 200% text-only enlargement; safe wrapping takes priority over one line.
  await title.evaluate((node,size)=>(node as HTMLElement).style.setProperty('font-size',`${size*2}px`,'important'),normal.size);
  const enlarged=await metrics();expect(enlarged.size).toBe(normal.size*2);expect(enlarged.overflow).toBeLessThanOrEqual(1);expect(enlarged.clipped).toBe(false);
  expect((await link.boundingBox())!.y).toBeGreaterThanOrEqual(enlarged.bottom);
  await section.locator('.focus-trend-heading').screenshot({path:info.outputPath(`trend-title-${width}-200-percent.png`)});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
});
