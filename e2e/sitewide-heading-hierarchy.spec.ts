import {test,expect,type Page,type Locator} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};

// Decorative checks stay visible but do not enter a heading's spoken name.
async function headingName(title:Locator){return title.evaluate(node=>{const text=(node as HTMLElement).innerText.replace(/\s+/g,' ').trim(),check=node.querySelector(':scope > .airport-flow-check[aria-hidden="true"]');return check?.textContent==='✓'&&text.startsWith('✓')?text.slice(1).trim():text;},undefined,{timeout:100});}

// Captured selected-day inputs only. No provider traffic or production writes.
async function fixtures(page:Page){
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));
 for(const [path,json] of [['flights',flights],['airport-months',months],['airport-passenger-stats',passengerStats]] as const)await page.route(`**/api/live/${path}*`,r=>r.fulfill({json}));
 await page.route('**/api/airport/calendar*',r=>r.fulfill({json:{status:'UNAVAILABLE',events:[],sources:[],replacementScopes:[]}}));
 await page.route('**/api/live/passenger-reference*',r=>r.fulfill({json:{status:'UNAVAILABLE',data:null}}));
}

async function verifyHeadings(page:Page,textScale=1){
 const headings=page.locator('[data-heading]:visible');
 await expect(headings.first()).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);
 await expect(async()=>{
 const rows=await headings.evaluateAll(nodes=>nodes.map(node=>{
  const style=getComputedStyle(node),bounds=node.getBoundingClientRect();
  const font={weight:style.fontWeight,size:style.fontSize,family:style.fontFamily};
  const marker=node.querySelector(':scope > .heading-marker');
  const markerStyle=marker?getComputedStyle(marker):null;
  const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT,{acceptNode:child=>child.textContent?.trim()&&!child.parentElement?.closest('[aria-hidden="true"]')?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});
  const textNode=walker.nextNode();
  const range=document.createRange();if(textNode)range.selectNodeContents(textNode);
  const approvedBand=node.matches('.airport-focus-shell .focus-report h3.focus-brief-band,.glance-insights[aria-labelledby="airport-staff-briefing-title"] h3.airport-flow-item-title');
  const icon=node.querySelector(':scope > svg.ui-line-icon');
  return {compactGuide:!!node.closest('.site-usage-guide'),markerGlyph:marker?getComputedStyle(marker,"::before").content:null,connected:node.isConnected,fontDefined:!!font.weight&&!!font.size&&!!font.family,approvedBand,iconCount:node.querySelectorAll(':scope > svg.ui-line-icon').length,iconHidden:icon?.getAttribute('aria-hidden'),paddingEnd:parseFloat(style.paddingInlineEnd),border:style.borderInlineStartWidth,background:style.backgroundColor,figuresTitle:node.classList.contains('focus-figures-title'),blackMiddle:node.matches('.focus-report h3,.airport-top-reference > h3,.airport-month-flights > h3'),flowItem:node.classList.contains('airport-flow-item-title'),question:node.classList.contains('focus-trend-question'),text:node.textContent?.trim(),role:node.getAttribute('data-heading'),size:parseFloat(style.fontSize),
   left:bounds.left,right:bounds.right,overflow:node.scrollWidth-node.clientWidth,paddingStart:parseFloat(style.paddingInlineStart),
   textLeft:textNode?range.getClientRects()[0]?.left:null,whiteSpace:style.whiteSpace,clipped:node.scrollHeight>node.clientHeight+1,
   leftAligned:style.textAlign==='left'||(style.textAlign==='start'&&style.direction==='ltr'),contentLeft:bounds.left+parseFloat(style.borderLeftWidth),
   hidden:marker?.getAttribute('aria-hidden'),markerText:marker?.textContent,
   markerCount:node.querySelectorAll(':scope > .heading-marker').length,
   markerWidth:marker?.getBoundingClientRect().width,markerHeight:marker?.getBoundingClientRect().height,
   markerDisplay:markerStyle?.display,color:style.color,weight:style.fontWeight,opacity:style.opacity,
   staticCjk:!!node.closest('.lang-ja,.lang-zh,[lang="ja"],[lang="zh"]'),fontReady:node.isConnected&&!!font.weight&&!!font.size&&!!font.family&&document.fonts.check(`${font.weight} ${font.size} ${font.family}`,node.textContent||''),
   pseudo:['::before','::after'].map(pseudo=>({content:getComputedStyle(node,pseudo).content,display:getComputedStyle(node,pseudo).display}))};
 }));
 expect(rows.length).toBeGreaterThan(0);
 for(const row of rows){
  expect(row.connected,'heading remains connected during style snapshot').toBe(true);expect(row.fontDefined,'actual heading font is defined').toBe(true);
  expect(row.text).toBeTruthy();
  // The owner requested smaller guide copy; assert its exact hierarchy at both
  // normal size and 200% text enlargement, while retaining every overflow check.
  if(row.compactGuide)expect(row.size,`compact guide ${row.role}: ${row.text}`).toBe((row.role==='section'?18:15)*textScale);
  else expect(row.size,`${row.role}: ${row.text}`).toBeGreaterThanOrEqual(row.approvedBand?16:row.figuresTitle?18:row.question&&page.viewportSize()!.width<=380?17:row.role==='page'?26:row.role==='section'?21:18);
  expect(row.hidden,`decorative marker: ${row.text}`).toBe('true');
  expect(row.markerText).toBe('');
  expect(row.markerCount).toBe(1);
  expect(row.markerDisplay,`no heading-prefix marker: ${row.text}`).toBe('none');expect(row.markerWidth).toBe(0);expect(row.markerHeight).toBe(0);expect(row.markerGlyph).toBe('none');
  if(row.approvedBand){
   expect([row.paddingStart,row.paddingEnd,row.border,row.background]).toEqual([0,0,'0px','rgba(0, 0, 0, 0)']);
   expect(row.iconCount).toBe(0);
  }else expect(row.paddingStart,`no reserved marker inset: ${row.text}`).toBe(0);
  for(const pseudo of row.pseudo){expect(pseudo.content).toBe('none');expect(pseudo.display).toBe('none');}
  // Removing a prefix must not require centered/right-aligned titles to move.
  if(row.role==='page'&&row.leftAligned)expect(row.textLeft,`title aligns with its own content edge: ${row.text}`).toBeCloseTo(row.contentLeft,1);
  expect(row.whiteSpace).toBe('normal');
  expect(row.clipped,`unclipped heading: ${row.text}`).toBe(false);
  const palette={page:['rgb(34, 35, 38)','750'],section:['rgb(34, 35, 38)','700'],subsection:['rgb(34, 35, 38)','600']} as const;
  const [color,weight]=row.flowItem?['rgb(34, 35, 38)','700']:row.approvedBand?['rgb(34, 35, 38)','600']:row.blackMiddle?['rgb(34, 35, 38)','700']:palette[row.role as keyof typeof palette];
  expect([row.color,row.weight]).toEqual([color,row.staticCjk?'600':weight]);
  expect(row.fontReady,`requested shipped font loaded: ${row.text}`).toBe(true);
  expect(row.opacity).toBe('1');
  expect(row.left,`left edge: ${row.text}`).toBeGreaterThanOrEqual(-1);
  expect(row.right,`right edge: ${row.text}`).toBeLessThanOrEqual(page.viewportSize()!.width+1);
  expect(row.overflow,`wrapped heading: ${row.text}`).toBeLessThanOrEqual(1);
 }
 }).toPass({timeout:8000,intervals:[100,250,500]});
 // Lazy map/calendar headings can enter before an existing nth locator. Retry
 // the whole current list, not an old name against its newly shifted neighbour.
 await expect(async()=>{
  for(const title of await headings.all()){
   const text=await headingName(title);
   await expect(title).toHaveAccessibleName(text,{timeout:100});
  }
 }).toPass({timeout:8000,intervals:[100,250,500]});
 await expect(page.locator('button > .heading-marker,summary > .heading-marker,nav .heading-marker')).toHaveCount(0);
 const viewport=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,routeOverflow:[...document.querySelectorAll('.airport-route-passengers *')].flatMap(node=>{const box=node.getBoundingClientRect();return box.width>0&&(box.right>innerWidth+1||box.left< -1)?[{tag:node.tagName,className:node.className,left:box.left,right:box.right,text:node.textContent?.trim().slice(0,48)}]:[];}).slice(0,8)}));
 expect(viewport.scrollWidth<=viewport.width+1,JSON.stringify(viewport)).toBe(true);
}

async function verifyAirportFlowTitles(page:Page,enlarged=false){
 const flow=page.locator('.glance-insights[aria-labelledby="airport-staff-briefing-title"]');
 const titles=flow.locator('.airport-flow-item-title');
 await expect(titles).toHaveCount(5);await page.evaluate(()=>document.fonts.ready);
 const rows=await titles.evaluateAll(nodes=>nodes.map(node=>{
  const style=getComputedStyle(node),rect=node.getBoundingClientRect(),body=node.nextElementSibling?.getBoundingClientRect(),marker=node.querySelector(':scope > .heading-marker');
  return {markerDisplay:marker?getComputedStyle(marker).display:null,markerWidth:marker?.getBoundingClientRect().width,text:node.textContent?.trim(),tag:node.tagName,size:style.fontSize,weight:style.fontWeight,color:style.color,
   family:style.fontFamily,lineHeight:style.lineHeight,spacing:style.letterSpacing,bottomMargin:style.marginBottom,
   staticCjk:!!node.closest('.lang-ja,.lang-zh,[lang="ja"],[lang="zh"]'),
   x:rect.x,y:rect.y,width:rect.width,height:rect.height,bodyGap:body?body.top-rect.bottom:null,
   overflow:node.scrollWidth-node.clientWidth};
 }));
 for(const row of rows){
  expect(row.tag).toBe('H3');expect(row.text).not.toMatch(/^0[123] /);expect(row.markerDisplay).toBe('none');expect(row.markerWidth).toBe(0);
  expect([row.size,row.weight,row.color,row.bottomMargin]).toEqual([enlarged?'32px':'16px',row.staticCjk?'600':'700','rgb(34, 35, 38)','10px']);
  expect([row.family,row.lineHeight,row.spacing]).toEqual([rows[0].family,rows[0].lineHeight,rows[0].spacing]);
  expect(row.bodyGap).not.toBeNull();expect(row.bodyGap!).toBeGreaterThanOrEqual(9);expect(row.bodyGap!).toBeLessThanOrEqual(11);
  expect(row.overflow).toBeLessThanOrEqual(1);
 }
 for(const title of await titles.all())await expect(title).toHaveAccessibleName(await headingName(title));
 const width=page.viewportSize()!.width;
 if(width>700){
  expect(rows[0].y).toBeCloseTo(rows[1].y,0);expect(rows[1].y).toBeCloseTo(rows[2].y,0);
  expect(rows[3].y).toBeCloseTo(rows[4].y,0);expect(rows[3].x).toBeCloseTo(rows[0].x,0);
  expect(rows[3].width).toBeCloseTo(rows[4].width,0);expect(rows[4].x).toBeGreaterThan(rows[3].x+rows[3].width);
 }else{
  for(let i=1;i<5;i++){expect(rows[i].x).toBeCloseTo(rows[0].x,0);expect(rows[i].y).toBeGreaterThan(rows[i-1].y+rows[i-1].height);}
 }
 await expect(flow.locator(':scope > a > strong')).toHaveCount(3);
 const staffTitles=new URL(page.url()).pathname.startsWith('/zh')?['✓时段与航站楼','航线与假期准备']:['✓시간·터미널','노선·휴일 준비'];
 await expect(flow.locator('.staff-brief-grid > section > h3')).toHaveText(staffTitles);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
}

async function verifyEnlargedHeadings(page:Page){
 const title=page.locator('[data-heading="page"]:visible').first(),text=await title.innerText();
 const observer=await page.evaluateHandle(()=>{
  const enlarged=new WeakSet<Element>();
  const scale=()=>document.querySelectorAll<HTMLElement>('[data-heading],.airport-flow-item-title').forEach(node=>{
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
  await verifyHeadings(page,2);
  if(await page.locator('.glance-insights[aria-labelledby="airport-staff-briefing-title"]').count())await verifyAirportFlowTitles(page,true);
 }finally{await observer.evaluate(observer=>observer.disconnect());await observer.dispose();}
}

const routes=['','airport','airport-countries','airport-prepare','more','where-to','consumption','tourism-desk','travel-records','about'];
for(const width of [320,390,768,1440])for(const route of routes)test(`sitewide heading hierarchy /ko/${route} at ${width}px`,async({page},info)=>{
 test.setTimeout(120000);
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});await fixtures(page);
 await page.goto(`/ko${route?`/${route}`:''}?date=2026-10-19`,{waitUntil:'domcontentloaded'});
 if(route==='travel-records')await expect(page.getByTestId('travel-empty')).toBeVisible();
 else await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await verifyHeadings(page);if(!route)await verifyAirportFlowTitles(page);
 if(route==='airport'){
  const pageTitle=page.locator('.airport-view .view-intro h1'),middle=page.locator('#airport-forecast-title');
  await expect(pageTitle).toHaveCSS('color','rgb(34, 35, 38)');await expect(pageTitle).toHaveCSS('font-weight','750');
  await expect(middle).toHaveCSS('color','rgb(34, 35, 38)');await expect(middle).toHaveCSS('font-weight','600');
  expect(await pageTitle.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThan(await middle.evaluate(e=>parseFloat(getComputedStyle(e).fontSize)));
 }
 if(!route){
  await expect(page.locator('.focus-report-title h2')).toHaveAttribute('data-heading','section');
  await expect(page.locator('.focus-today-title')).toHaveCount(0);await expect(page.locator('.focus-report-date')).toBeVisible();await expect(page.locator('.focus-report-date')).not.toHaveAttribute('data-heading');
  for(const heading of await page.locator('.focus-selected-country-changes h3,.focus-preparation-brief h3').all())await expect(heading).toHaveAttribute('data-heading','subsection');
  const staff=page.locator('.staff-brief-grid > section > h3');
  await expect(staff).toHaveText(['✓시간·터미널','노선·휴일 준비']);
  await expect(staff.locator(':scope > .heading-marker')).toHaveCount(2);
  const parentSize=await page.locator('#airport-staff-briefing-title').evaluate(e=>parseFloat(getComputedStyle(e).fontSize));
  for(const heading of await staff.all())expect(parentSize).toBeGreaterThan(await heading.evaluate(e=>parseFloat(getComputedStyle(e).fontSize)));
  const body=page.locator('.staff-brief-grid p').first();
  await expect(body).toHaveCSS('font-size','14px');await expect(body).toHaveCSS('font-weight','400');
  // The approved hierarchy distinguishes these peers by size, weight and spacing,
  // rather than enlarging every title above the existing numeric/body values.
  for(const heading of await staff.all()){
   await expect(heading).toHaveCSS('font-size','16px');await expect(heading).toHaveCSS('font-weight','700');
   expect(await heading.evaluate(e=>Number(getComputedStyle(e).fontWeight))).toBeGreaterThan(await body.evaluate(e=>Number(getComputedStyle(e).fontWeight)));
  }
  await expect(page.locator('.staff-brief-grid').getByText('품목별 확인',{exact:true})).toHaveCount(0);
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
 await verifyHeadings(page);if(!route)await verifyAirportFlowTitles(page);await page.screenshot({path:info.outputPath(`heading-${route||'home'}-${lang}-${width}.png`),fullPage:true});
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
  // Read both rows in one browser task so intervening layout shifts cannot mix coordinates.
  const linkBox=node.closest('.focus-trend-heading')!.querySelector('.focus-trend-more')!.getBoundingClientRect();
  return {lines:new Set(rects.map(rect=>Math.round(rect.y))).size,bottom:box.bottom,linkTop:linkBox.top,linkHeight:linkBox.height,left:box.left,size:parseFloat(style.fontSize),overflow:node.scrollWidth-node.clientWidth,clipped:node.scrollHeight>node.clientHeight+1,whiteSpace:style.whiteSpace};
 });
 const normal=await metrics();expect(normal.lines).toBeGreaterThanOrEqual(1);expect(normal.lines).toBeLessThanOrEqual(2);expect(normal.overflow).toBeLessThanOrEqual(1);expect(normal.clipped).toBe(false);expect(normal.whiteSpace).toBe('normal');
 expect(normal.linkTop).toBeGreaterThanOrEqual(normal.bottom);expect(normal.linkHeight).toBeGreaterThanOrEqual(44);
 await section.locator('.focus-trend-heading').screenshot({path:info.outputPath(`trend-title-${width}.png`)});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 {
  // Emulate 200% text-only enlargement; safe wrapping takes priority over one line.
  await title.evaluate((node,size)=>(node as HTMLElement).style.setProperty('font-size',`${size*2}px`,'important'),normal.size);
  const enlarged=await metrics();expect(enlarged.size).toBe(normal.size*2);expect(enlarged.overflow).toBeLessThanOrEqual(1);expect(enlarged.clipped).toBe(false);
  expect(enlarged.linkTop).toBeGreaterThanOrEqual(enlarged.bottom);
  await section.locator('.focus-trend-heading').screenshot({path:info.outputPath(`trend-title-${width}-200-percent.png`)});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
});



