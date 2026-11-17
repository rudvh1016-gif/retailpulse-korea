import {test,expect,type Page} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import {prepCopy} from '../lib/business-prep-copy';

type MotionEvent={target:string;duration:number;text:string};
declare global {interface Window {motionEvents:MotionEvent[];copyResult:'ok'|'fail'|'pending';resolveCopy:()=>void}}
async function instrument(page:Page){
 await page.addInitScript(()=>{
  window.motionEvents=[];window.copyResult='ok';
  const original=Element.prototype.animate;
  Element.prototype.animate=function(frames,options){window.motionEvents.push({target:this.getAttribute('data-prep-motion')??this.getAttribute('class')??this.tagName,duration:typeof options==='number'?options:Number(options?.duration),text:this.textContent??''});return original.call(this,frames,options);};
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>window.copyResult==='fail'?Promise.reject(new Error('denied')):window.copyResult==='pending'?new Promise<void>(resolve=>{window.resolveCopy=resolve;}):Promise.resolve()}});
 });
 await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/airport-months*',r=>r.fulfill({json:{status:'MISSING',data:null}}));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:{mode:'live-flights',serviceDateKst:SUMMARY_FIXTURE.serviceDateKst,retrievedAt:SUMMARY_FIXTURE.generatedAt,truncated:false,flights:Array.from({length:9},(_,i)=>({physicalFlightId:`motion-${i}`,direction:'departure',terminal:'T1',gate:'45',airportCode:'NRT',scheduledAt:`2026-08-31T${15+i}:00:00+09:00`,status:'scheduled'}))}}));
}
async function clear(page:Page){await page.evaluate(()=>{window.motionEvents=[];});}
async function settled(page:Page){await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length)).toBe(0);}
async function shot(page:Page,name:string){await page.screenshot({path:test.info().outputPath(`${name}.png`),fullPage:false});}

for(const width of [320,390,1280])test(`airport finite choice feedback and final values ${width}`,async({page})=>{
 await page.setViewportSize({width,height:950});await instrument(page);await page.goto('/ko/airport-glance-preview');
 const app=page.getByTestId('airport-glance-preview');await expect(app.locator('.glance-map-heading')).toContainText('9 편');await clear(page);
 const art=app.locator('.glance-art-frame>img'),before=await art.boundingBox();
 await app.getByRole('button',{name:'T1',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.motionEvents.some(e=>e.duration===180&&e.target==='glance-building-label'))).toBe(true);
 await app.getByRole('button',{name:'T2',exact:true}).click();await app.getByRole('button',{name:'전체',exact:true}).click();
 await expect(app.locator('.glance-map-heading')).toContainText('9 편');await settled(page);expect(await art.boundingBox()).toEqual(before);
 expect(await art.evaluate(el=>getComputedStyle(el).transform)).toBe('none');
 const future=app.getByTestId('glance-future');await future.scrollIntoViewIfNeeded();await clear(page);
 await future.getByRole('button',{name:'향후 3 시간',exact:true}).click();await expect(future.getByTestId('glance-zone-period')).toContainText('17:10');
 await expect.poll(()=>page.evaluate(()=>window.motionEvents.some(e=>e.duration===220&&e.target==='glance-zone-leaders'))).toBe(true);
 await future.getByRole('button',{name:'향후 6 시간',exact:true}).click();await future.getByRole('button',{name:'향후 1 시간',exact:true}).click();await settled(page);
 await shot(page,`airport-${width}`);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.emulateMedia({reducedMotion:'reduce'});await clear(page);await future.getByRole('button',{name:'향후 3 시간',exact:true}).click();expect(await page.evaluate(()=>window.motionEvents)).toEqual([]);
});

for(const lang of ['ko','en','zh','ja'])test(`retired population choice opens airport without old chart ${lang}`,async({page})=>{
 await page.setViewportSize({width:390,height:950});await instrument(page);
 await page.goto(`/${lang}/myeongdong`);await expect(page).toHaveURL(new RegExp(`/${lang}$`));
 await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
 await expect(page.getByTestId('population-outlook')).toHaveCount(0);
 await expect(page.locator('.population-chart')).toHaveCount(0);
});

test('preparation changes only affected items; copy acknowledgement follows success',async({page})=>{
 await page.setViewportSize({width:390,height:2400});await instrument(page);await page.goto('/ko/business?place=airport');const prep=page.getByTestId('business-prep');await expect(prep.getByTestId('prep-actions')).toBeVisible();
 await prep.getByRole('button',{name:prepCopy.change.ko}).click();await clear(page);await prep.getByLabel(prepCopy.industry.ko).selectOption('food');
 await prep.getByRole('button',{name:prepCopy.save.ko,exact:true}).click();
 expect(await page.evaluate(()=>window.motionEvents.filter(e=>e.target.startsWith('fact:')))).toEqual([]);
 expect(await page.evaluate(()=>window.motionEvents.some(e=>e.target==='action:AIRPORT_PEAK'&&e.duration===180))).toBe(true);
 const share=page.getByTestId('prep-share'),copy=share.locator('button').first(),icon=copy.locator('svg');await copy.scrollIntoViewIfNeeded();
 await page.evaluate(()=>{window.copyResult='pending';});await copy.click();await expect(icon).toHaveAttribute('data-copied','false');
 await page.evaluate(()=>window.resolveCopy());await expect(icon).toHaveAttribute('data-copied','true');await settled(page);
 await page.evaluate(()=>{window.copyResult='fail';});await clear(page);await copy.click();await expect(share.getByTestId('share-status')).toHaveAttribute('data-status','copyFailed');await expect(icon).toHaveAttribute('data-copied','false');expect(await page.evaluate(()=>window.motionEvents)).toEqual([]);
 await page.evaluate(()=>{window.copyResult='ok';});await copy.click();await expect(icon).toHaveAttribute('data-copied','true');await settled(page);await shot(page,'preparation-390');
});

test('a pending copy cannot acknowledge a different preparation document',async({page})=>{
 await page.setViewportSize({width:390,height:950});await instrument(page);await page.goto('/ko/business');
 const prep=page.getByTestId('business-prep'),share=prep.getByTestId('prep-share'),copy=share.locator('button').first(),icon=copy.locator('svg'),status=share.getByTestId('share-status');
 await expect(copy).toBeVisible();const originalText=await share.getByTestId('share-preview').textContent();
 await share.evaluate(node=>{node.setAttribute('data-race-identity','same-component');});
 await page.evaluate(()=>{window.copyResult='pending';});await copy.click();
 await prep.getByRole('button',{name:prepCopy.change.ko}).click();await prep.getByLabel(prepCopy.industry.ko).selectOption('food');
 await expect(share.getByTestId('share-preview')).not.toHaveText(originalText!);await expect(share).toHaveAttribute('data-race-identity','same-component');
 await page.evaluate(()=>window.resolveCopy());await expect(status).toHaveAttribute('data-status','idle');await expect(icon).toHaveAttribute('data-copied','false');
 await page.evaluate(()=>{window.copyResult='ok';});await copy.click();await expect(status).toHaveAttribute('data-status','copied');await expect(icon).toHaveAttribute('data-copied','true');
 await prep.getByLabel(prepCopy.industry.ko).selectOption('fashion');await expect(status).toHaveAttribute('data-status','idle');await expect(icon).toHaveAttribute('data-copied','false');
});

test('retired consumption route keeps date and returns to the active airport screen',async({page})=>{
 await instrument(page);await page.goto('/ko/airport?date=2026-08-31');
 await expect(page.locator('.airport-view')).toBeVisible();
 await page.goto('/ko/consumption?date=2026-08-31');
 await expect(page).toHaveURL(/\/ko\?date=2026-08-31$/);
 await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
 await expect(page.locator('.consumption-category')).toHaveCount(0);
 await page.goBack();await expect(page.locator('.airport-view')).toBeVisible();
 await expect(page).toHaveURL(/\/ko\/airport\?date=2026-08-31$/);
});
