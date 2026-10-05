import {test,expect,type Page} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';

async function open(page:Page,lang='ko') {
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));
 await page.route('**/api/live/summary*',r=>r.fulfill({json:SUMMARY_FIXTURE}));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:{mode:'live-flights',flights:[],truncated:false,retrievedAt:SUMMARY_FIXTURE.generatedAt}}));
 await page.goto(`/${lang}/airport?audience=staff`);
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
}
async function bottomGap(page:Page){return page.locator('.bottom-nav').evaluate(nav=>{const v=visualViewport;return Math.abs((v?v.offsetTop+v.height:innerHeight)-nav.getBoundingClientRect().bottom);});}
for(const lang of ['ko','en','zh','ja'])for(const width of [360,390,430])test(`bottom navigation follows scrolling and viewport changes ${lang} ${width}`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width,height:844});await open(page,lang);
 for(const height of [844,740,844,420,844]){await page.setViewportSize({width,height});for(const y of [0,450,1200,2200]){await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),y);await expect.poll(()=>bottomGap(page)).toBeLessThanOrEqual(1);}}
 await page.setViewportSize({width:780,height:390});await expect.poll(()=>bottomGap(page)).toBeLessThanOrEqual(1);
 await page.setViewportSize({width:1280,height:900});await expect(page.locator('.bottom-nav')).toBeHidden();
 await page.setViewportSize({width,height:844});await expect(page.locator('.bottom-nav')).toBeVisible();await expect.poll(()=>bottomGap(page)).toBeLessThanOrEqual(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});

test('visible viewport toolbar offset, keyboard resize and safe area contract',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 // Browser API contract emulation; this is not an iOS Safari reproduction.
 await page.addInitScript(()=>{const v=Object.assign(new EventTarget(),{height:844,width:390,offsetTop:0,offsetLeft:0,scale:1});Object.defineProperty(window,'visualViewport',{value:v,configurable:true});});
 await open(page);await page.addStyleTag({content:'.bottom-nav{padding-bottom:34px}'});
 for(const state of [{height:740,offsetTop:0,scale:1},{height:760,offsetTop:44,scale:1},{height:420,offsetTop:80,scale:1},{height:844,offsetTop:0,scale:1}]){
  await page.evaluate(state=>{Object.assign(visualViewport!,state);visualViewport!.dispatchEvent(new Event('resize'));visualViewport!.dispatchEvent(new Event('scroll'));},state);
  await expect.poll(()=>bottomGap(page),{timeout:2000}).toBeLessThanOrEqual(1);
 }
 await page.evaluate(()=>{Object.assign(visualViewport!,{height:422,offsetTop:0,scale:2});visualViewport!.dispatchEvent(new Event('resize'));});
 await expect.poll(()=>page.locator('.bottom-nav').evaluate(n=>n.style.top)).toBe('');
 await expect(page.locator('meta[name=viewport]')).not.toHaveAttribute('content',/maximum-scale=1|user-scalable=no/);
});

test('unsupported visual viewport keeps the native CSS bottom fallback',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.addInitScript(()=>Object.defineProperty(window,'visualViewport',{value:null,configurable:true}));await open(page);
 await page.evaluate(()=>scrollTo({top:1300,behavior:'instant'}));await expect.poll(()=>bottomGap(page)).toBeLessThanOrEqual(1);
 await expect(page.locator('.bottom-nav')).toHaveCSS('position','fixed');await expect(page.locator('.bottom-nav')).toHaveCSS('bottom','0px');
});
