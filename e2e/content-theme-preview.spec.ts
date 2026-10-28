import {test,expect,type Page} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import calendar from '../data/airport-focus-preview/calendar-context.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};

const themes=['beautiful-jekyll','casper','story'] as const;
const views=[['airport-glance','한눈에'],['airport','공항현황'],['airport-countries','국가별 흐름'],['airport-prepare','미리 준비'],['more','더보기']] as const;
const clockReply={mode:'live-summary',todayKst:summary.todayKst,serviceDateKst:summary.todayKst,generatedAt:summary.generatedAt,dayRelation:'TODAY',areas:{},airport:{},sources:[]};

// Text nodes include CLOSED native disclosures. Visible text, links, controls,
// SVG/chart labels, image alternatives and change-rate colors are checked too.
async function inventory(page:Page){return page.locator('.app').evaluate(root=>{
 const clean=(s:string|null)=>s?.replace(/\s+/g,' ').trim()??'';
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 const text:string[]=[];let node:Node|null;
 while((node=walker.nextNode()))if(node.parentElement&&!['SCRIPT','STYLE'].includes(node.parentElement.tagName)&&clean(node.textContent))text.push(clean(node.textContent));
 const elements=Array.from(root.querySelectorAll('a,button,input,select,summary,[role="button"],img,svg'));
 return {text,visibleText:clean((root as HTMLElement).innerText),elements:elements.map(el=>({tag:el.tagName,text:clean(el.textContent),href:el.getAttribute('href'),label:el.getAttribute('aria-label'),alt:el.getAttribute('alt'),type:el.getAttribute('type'),role:el.getAttribute('role'),disabled:el.hasAttribute('disabled'),visible:!!el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'})),rates:Array.from(root.querySelectorAll('.change-rate')).map(el=>({text:clean(el.textContent),color:getComputedStyle(el).color,label:el.getAttribute('aria-label')}))};
 });}

for(const theme of themes)for(const width of [390,1440])test(`content-preserving ${theme} ${width}`,async({page},info)=>{
 test.skip(process.env.RPK_CONTENT_THEME_PREVIEW!=='1','Preview branch only; never alters normal production regression expectations.');
 test.setTimeout(180000);
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 await page.clock.setFixedTime(new Date(summary.generatedAt));
 await page.route('**/api/live/summary*',route=>route.fulfill({json:new URL(route.request().url()).searchParams.get('date')?summary:clockReply}));
 for(const [path,json] of [['flights',flights],['airport-months',months],['airport-passenger-stats',passengerStats]] as const)await page.route(`**/api/live/${path}*`,route=>route.fulfill({json}));
 await page.route('**/api/airport/calendar',route=>route.fulfill({json:{status:'PARTIAL',events:calendar.events,calendarReplacementScopes:[],sources:[],checkedAt:null}}));
 await page.route('**/api/live/passenger-reference*',route=>route.fulfill({json:{status:'UNAVAILABLE',data:null}}));
 await page.route(/google-analytics\.com|googletagmanager\.com|analytics\.google\.com/,route=>route.abort());
 await page.route('**/__preview/story-photo.jpg',route=>route.fulfill({contentType:'image/jpeg',body:readFileSync('design/content-theme-preview/story-photo.jpg')}));
 const css=readFileSync(`design/content-theme-preview/${theme}.css`,'utf8');
 for(const [route,label] of views){
  await page.goto(`/ko/${route}?date=2026-10-19`,{waitUntil:'domcontentloaded'});
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  await page.evaluate(()=>document.fonts.ready);
  // Capture both baselines with all virtualized holiday content rendered; no text is removed.
  await page.addStyleTag({content:'.focus-holiday-list li{content-visibility:visible}'});
  const nav=page.locator(width<1000?'.bottom-nav':'.top-nav');
  await expect(nav).toBeVisible();await expect(nav.locator('a')).toHaveCount(5);
  await expect(nav.getByRole('link',{name:label,exact:true})).toHaveAttribute('aria-current','page');
  // Country flow keeps network activity alive; assert actual content readiness instead.
  if(route==='airport-glance')await expect(page.locator('.focus-report-lines')).toContainText('112,403');
  if(route==='airport-countries')await expect(page.locator('#focus-country-trends .focus-trend-grid > article .focus-month-values')).toHaveCount(12);
  if(route==='airport-prepare')await expect(page.locator('#arrival-allowances')).toBeVisible();
  if(route==='more')await expect(page.locator('.more-section-links a')).toHaveCount(7);
  let previous='',stable=0;
  await expect.poll(async()=>{const current=JSON.stringify(await inventory(page));stable=current===previous?stable+1:0;previous=current;return stable;},{timeout:15000,intervals:[200,300,500]}).toBeGreaterThanOrEqual(3);
  const before=await inventory(page);
  const disclosure=page.locator('main details').filter({visible:true}).first();
  const hasDisclosure=await disclosure.count()>0;
  let beforeExpanded:Awaited<ReturnType<typeof inventory>>|null=null;
  if(hasDisclosure){await disclosure.locator(':scope > summary').click();beforeExpanded=await inventory(page);await disclosure.locator(':scope > summary').click();}
  await page.screenshot({path:info.outputPath(`${route}-baseline.png`),fullPage:true});
  await page.evaluate(theme=>document.documentElement.dataset.contentTheme=theme,theme);
  await page.addStyleTag({content:css});
  if(theme==='story')await page.evaluate(async()=>{const image=new Image();image.src='/__preview/story-photo.jpg';await image.decode();});
  const after=await inventory(page);
  writeFileSync(info.outputPath(`${route}-inventory.json`),JSON.stringify({theme,width,route,label,fixtureDate:'2026-10-19',before,after},null,2));
  expect(after).toEqual(before);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath(`${theme}-${route}-${width}-first-screen.png`)});
  await page.screenshot({path:info.outputPath(`${theme}-${route}-${width}-full.png`),fullPage:true});
  if(hasDisclosure){await disclosure.locator(':scope > summary').click();expect(await inventory(page)).toEqual(beforeExpanded);await disclosure.locator(':scope > summary').click();}
  if(route==='airport-glance'){
   await page.getByRole('button',{name:'탑승동',exact:true}).click();
   await expect(page.locator('.glance-detail-link').first()).toHaveAttribute('href',/building=CONCOURSE/);
  }
  // Real client-side navigation remains clickable after styling (no fake links).
  const next=views[(views.findIndex(v=>v[0]===route)+1)%views.length];
  await nav.getByRole('link',{name:next[1],exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/ko/${next[0]}(?:[?#]|$)`));
 }
});
