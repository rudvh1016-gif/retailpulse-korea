import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
import {NOTICE_WEEK_MS,UPDATE_NOTICE_SESSION_KEY,UPDATE_NOTICE_UNTIL_KEY} from '../lib/update-notice-preference';
test.use({storageState:{cookies:[],origins:[]}});
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('koretail-analytics-consent-v1','false');});
 await page.route(/google-analytics\.com|googletagmanager\.com|analytics\.google\.com/,r=>r.abort());
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{error:'test unavailable'}}));
 await page.route('**/api/live/summary*',r=>r.fulfill({json:SUMMARY_FIXTURE}));
 const base={operationId:'',month:'2026-07',retrievedAt:SUMMARY_FIXTURE.generatedAt};
 await page.route('**/api/live/airport-passenger-stats*',r=>r.fulfill({json:{status:'READY',month:'2026-07',previousMonth:null,current:{ROUTE_COUNTRY_PASSENGERS:{...base,operationId:'ROUTE_COUNTRY_PASSENGERS',rows:[{label:'일본',region:'일본',departures:31000,arrivals:0,total:null,aggregate:false,startHour:null,endHour:null}]},TIME_BAND_PASSENGERS:{...base,operationId:'TIME_BAND_PASSENGERS',rows:Array.from({length:24},(_,h)=>({label:String(h),region:null,departures:31000,arrivals:0,total:null,aggregate:false,startHour:h,endHour:h+1}))}},previous:{}}}));
});
test('the briefing notice opens despite prior-release dismissal and preserves those preferences',async({page})=>{
 await page.addInitScript(()=>{
  sessionStorage.setItem('koretail-notice:airport-period-20261028-v1:closed','1');
  localStorage.setItem('koretail-notice:airport-period-20261028-v1:until',String(Date.UTC(2099,0,1)));
 });
 await page.goto('/ko');
 const dialog=page.getByRole('dialog');
 await expect(dialog).toBeVisible();
 await expect(dialog.locator('time')).toHaveAttribute('datetime','2026-11-02');
 await expect(dialog.locator('[data-notice-item="shift-briefing"]')).toContainText('내 근무 브리핑');
 await expect(dialog.locator('[data-notice-item="shift-briefing"]')).toContainText('터미널 전체 출발편·주요 출발 목적지');
 expect(await dialog.locator('.update-notice-items>section').evaluateAll(items=>items.map(item=>item.getAttribute('data-notice-item')))).toEqual(['shift-briefing','shopping-report']);
 await expect(dialog).toContainText('외국인은 뭘 살까?');
 await expect(dialog).toContainText('판판면세점 6개 매장');
 expect(await page.evaluate(()=>sessionStorage.getItem('koretail-notice:airport-period-20261028-v1:closed'))).toBe('1');
 expect(await page.evaluate(()=>localStorage.getItem('koretail-notice:airport-period-20261028-v1:until'))).toBe(String(Date.UTC(2099,0,1)));
});
test('More explicitly reopens a hidden notice without clearing the snooze or unrelated preferences',async({page})=>{
 const until=String(Date.UTC(2099,0,1));
 await page.addInitScript(({key,until})=>{
  localStorage.setItem(key,until);
  localStorage.setItem('koretail-airport-scope','T2');
 },{key:UPDATE_NOTICE_UNTIL_KEY,until});
 await page.goto('/ko/more');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const dialog=page.getByRole('dialog'),reopen=page.locator('.more-section-links').getByRole('button',{name:'공지사항 보기 ›',exact:true});
 await expect(dialog).not.toBeVisible();
 await reopen.click();
 await expect(dialog).toBeVisible();
 await expect(dialog.locator('#update-notice-title')).toBeFocused();
 expect(await page.evaluate(key=>localStorage.getItem(key),UPDATE_NOTICE_UNTIL_KEY)).toBe(until);
 expect(await page.evaluate(()=>localStorage.getItem('koretail-airport-scope'))).toBe('T2');
 expect(await page.evaluate(()=>localStorage.getItem('koretail-analytics-consent-v1'))).toBe('false');
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(dialog).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(dialog).not.toBeVisible();
 await expect(reopen).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.style.overflow)).not.toBe('hidden');
 await reopen.click();
 await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'닫기',exact:true}).click();
 await page.reload();
 await expect(dialog).not.toBeVisible();
 expect(await page.evaluate(key=>localStorage.getItem(key),UPDATE_NOTICE_UNTIL_KEY)).toBe(until);
});
for(const [width,height]of [[1440,1000],[320,568],[360,568],[390,844],[430,700],[390,500]])test(`first entry is immediate, compact and keyboard safe ${width}x${height}`,async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height});await page.goto('/ko');
 const dialog=page.getByRole('dialog',{name:'new update!'});await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('button',{name:'닫기',exact:true})).toBeInViewport({ratio:1});
 await expect(dialog.locator('#update-notice-title')).toBeFocused();await expect(dialog.locator('.update-notice-x')).toHaveCount(0);await expect(dialog.locator('.update-notice-items>section')).toHaveCount(2);
 await expect(dialog.locator('img,svg,canvas')).toHaveCount(0);await expect(dialog.getByRole('link')).toHaveCount(2);
 await expect(dialog).toContainText('내 근무 브리핑');
 await expect(dialog).toContainText('매장 준비사항과 직원 공유 문구');
 await expect(dialog).toContainText('외국인은 뭘 살까?');
 await expect(dialog).toContainText('구매 품목·쇼핑 장소');
 await expect(dialog).toContainText('판매 구성');
 await expect(dialog.getByRole('button',{name:'닫기',exact:true})).toHaveCSS('background-color','rgb(36, 39, 44)');
 expect(await page.evaluate(()=>getComputedStyle(document.documentElement).overflow)).toBe('hidden');
 const box=await dialog.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.width).toBeLessThanOrEqual(width);expect(box!.height).toBeLessThanOrEqual(height);
 expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('notice-no-top-close.png')});
 await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:'닫기',exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(dialog.getByRole('link',{name:'브리핑 보기'})).toBeFocused();
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();expect(await page.evaluate(()=>document.documentElement.style.overflow)).not.toBe('hidden');
 await page.reload();await expect(dialog).not.toBeVisible();expect(await page.evaluate(key=>sessionStorage.getItem(key),UPDATE_NOTICE_SESSION_KEY)).toBe('1');expect(errors).toEqual([]);
});
test('week hiding lasts exactly seven days across reload and another tab',async({page,context})=>{
 const now=new Date('2026-10-19T03:04:05.123+09:00');await page.clock.install({time:now});await page.clock.pauseAt(new Date(now.getTime()+1000));await page.goto('/ko');
 const clicked=await page.evaluate(()=>Date.now());
 await page.getByRole('button',{name:'일주일 동안 안 보기'}).click();
 const until=await page.evaluate(key=>localStorage.getItem(key),UPDATE_NOTICE_UNTIL_KEY);expect(Number(until)).toBe(clicked+NOTICE_WEEK_MS);
 expect(await page.evaluate(key=>sessionStorage.getItem(key),UPDATE_NOTICE_SESSION_KEY)).toBeNull();await page.reload();await expect(page.getByRole('dialog')).not.toBeVisible();
 const other=await context.newPage();await other.goto('/ko');await expect(other.getByRole('dialog')).not.toBeVisible();await other.close();
 await page.clock.fastForward(NOTICE_WEEK_MS-1);await expect(page.getByRole('dialog')).not.toBeVisible();await page.clock.fastForward(1);await expect(page.getByRole('dialog')).toBeVisible();
});
for(const lang of ['ko','en','zh','ja'])test(`report shortcut remains after the briefing and opens the complete report ${lang}`,async({page})=>{
 await page.goto(`/${lang}`);const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 await expect(dialog.locator('.update-notice-items>section')).toHaveCount(2);
 await expect(dialog.locator('time')).toHaveAttribute('datetime','2026-11-02');
 const shortcut=dialog.locator('[data-notice-item="shopping-report"]>a');await expect(shortcut).toHaveAttribute('href','/shopping-report/index.html');
 if(lang==='en')expect(await dialog.innerText()).not.toMatch(/[가-힣]/);
 await shortcut.click();await expect(page).toHaveURL(/\/shopping-report\/(?:index\.html)?$/);
 await expect(page.locator('.store-overview')).toHaveCount(6);await expect(page.getByRole('dialog')).not.toBeVisible();
});

for(const [lang,title] of [['ko','내 근무 브리핑'],['en','My shift briefing'],['zh','我的当班简报'],['ja','勤務ブリーフィング']])test(`the localized briefing shortcut opens the selected tab ${lang}`,async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(`/${lang}`);const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 const briefing=dialog.locator('[data-notice-item="shift-briefing"]');
 await expect(briefing.getByRole('heading')).toHaveText(title);
 const shortcut=briefing.getByRole('link');await expect(shortcut).toHaveAttribute('href',`/${lang}?insight=briefing`);
 expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
 await expect(dialog.locator('.update-notice-close')).toBeInViewport({ratio:1});
 await shortcut.click();await expect(page).toHaveURL(new RegExp(`/${lang}\\?insight=briefing$`));
 await expect(dialog).not.toBeVisible();
 await expect(page.locator('#airport-insight-tab-briefing')).toHaveAttribute('aria-selected','true');
 await expect(page.locator('[role="tabpanel"][aria-labelledby="airport-insight-tab-briefing"]')).toBeVisible();
});

test('the preview notice keeps the report and links to the production briefing entry',async({page})=>{
 await page.goto('/ko/airport-focus-preview');const dialog=page.getByRole('dialog');await expect(dialog.locator('.update-notice-items>section')).toHaveCount(2);
 await expect(dialog.locator('[data-notice-item="shift-briefing"]>a')).toHaveAttribute('href','/ko?insight=briefing');
 await expect(dialog.locator('[data-notice-item="shopping-report"]>a')).toHaveAttribute('href','/shopping-report/index.html');
});

test('blocked storage still permits close without errors or new permissions',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{get(){throw new DOMException('blocked','SecurityError');}});});
 await page.goto('/ko');await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'닫기',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();expect(await page.evaluate(()=>document.documentElement.style.overflow)).not.toBe('hidden');expect(errors).toEqual([]);
});

for(const width of [390,1440])for(const start of ['/ko','/ko/airport?terminal=T1','/ko/airport?terminal=T2','/ko/airport?building=CONCOURSE'])test(`hourly deep link lands below sticky bars after delayed data from ${start} at ${width}`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});
 await page.addInitScript(()=>{localStorage.setItem('koretail-airport-scope','T2');});
 await page.route('**/api/live/summary*',async r=>{await new Promise(resolve=>setTimeout(resolve,1600));await r.fulfill({json:SUMMARY_FIXTURE});});
 await page.goto(start);
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:'닫기',exact:true}).click();
 await page.goto('/ko/airport?terminal=all#airport-hourly-comparison');
 await expect(page).toHaveURL(/\/ko\/airport\?terminal=all#airport-hourly-comparison$/);
 await expect(page.locator('.terminal-selector [role="tab"][aria-selected="true"]')).toContainText('전체');
 const target=page.locator('svg#airport-hourly-comparison');
 await expect(target).toBeVisible();
 const reference=target.locator('.airport-flow-reference path');
 await expect(reference).toHaveAttribute('d',/M.+L/);
 expect(await reference.evaluate(e=>getComputedStyle(e).stroke)).not.toBe('none');
 await expect.poll(()=>target.evaluate(e=>{
  let bottom=0;
  for(const bar of document.querySelectorAll<HTMLElement>('.site-header,.airport-context-nav')){
   const style=getComputedStyle(bar);
   if(style.position==='sticky'||style.position==='fixed')bottom=Math.max(bottom,(parseFloat(style.top)||0)+bar.offsetHeight);
  }
  const top=e.getBoundingClientRect().top;
  return top>=bottom&&top<bottom+24&&e.getBoundingClientRect().bottom<innerHeight-80;
 })).toBe(true);
 expect(await page.evaluate(()=>localStorage.getItem('koretail-airport-scope'))).toBe('T2');
 const note=page.locator('.airport-flow-reference-note');
 await expect(note).not.toBeVisible();
 await page.locator('.airport-flow-reference-details > summary').click();
 await expect(note).toHaveCSS('font-size','12px');await expect(note.locator('a')).toHaveCSS('font-size','12px');await expect(note).toBeVisible();await expect(note).toHaveCSS('line-height','19.2px');
 await page.screenshot({path:testInfo.outputPath('hourly-comparison-landing.png')});
 await page.goBack();await expect(page).toHaveURL(new RegExp(start.replace(/[?]/g,'\\?')+'$'));
});
test('same fragment click realigns and user scrolling cancels subsequent alignment',async({page})=>{
 await page.goto('/ko/airport?terminal=all#airport-hourly-comparison');
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:'닫기',exact:true}).click();
 await page.evaluate(()=>{const link=document.createElement('a');link.href='#airport-hourly-comparison';document.body.append(link);link.click();link.remove();});
 const target=page.locator('#airport-hourly-comparison');await expect(target).toBeInViewport();
 await page.mouse.wheel(0,500);await page.waitForTimeout(250);
 await page.evaluate(()=>{
  const state=window as unknown as Window & {comparisonScrollCalls:number};state.comparisonScrollCalls=0;
  window.scrollTo=new Proxy(window.scrollTo,{apply(target,thisArg,args){state.comparisonScrollCalls++;return Reflect.apply(target,thisArg,args);}});
 });
 await page.evaluate(()=>{const node=document.createElement('div');node.textContent='test mutation';document.body.append(node);node.remove();});
 await page.waitForTimeout(100);expect(await page.evaluate(()=>(window as unknown as Window & {comparisonScrollCalls:number}).comparisonScrollCalls)).toBe(0);
});

for(const locale of ['ko','en','zh','ja'])test(`shared lowercase notice heading and accessible dialog in ${locale}`,async({page})=>{
 await page.goto(`/${locale}`);
 const dialog=page.getByRole('dialog',{name:'new update!',exact:true});
 await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('heading',{name:'new update!',exact:true})).toBeFocused();
 await expect(dialog.locator('.update-notice-new')).toHaveText('NEW');
 await page.keyboard.press('Escape');
 await expect(dialog).not.toBeVisible();
});
