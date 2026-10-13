import {test,expect,type Page} from '@playwright/test';
import type {LiveSummary} from '../app/live-signals';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import {buildCommercialMonth,compareCommercialMonths,publicCommercialMonth} from '../lib/commercial-monthly';
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
 await future.getByRole('button',{name:'향후 3 시간',exact:true}).click();await expect(future.locator('.glance-window-note').first()).toContainText('17:10');
 await expect.poll(()=>page.evaluate(()=>window.motionEvents.some(e=>e.duration===220&&e.target==='glance-zone-leaders'))).toBe(true);
 await future.getByRole('button',{name:'향후 6 시간',exact:true}).click();await future.getByRole('button',{name:'향후 1 시간',exact:true}).click();await settled(page);
 await shot(page,`airport-${width}`);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.emulateMedia({reducedMotion:'reduce'});await clear(page);await future.getByRole('button',{name:'향후 3 시간',exact:true}).click();expect(await page.evaluate(()=>window.motionEvents)).toEqual([]);
});

test('population selection moves only marker, immediately commits ranges and survives interruption',async({page})=>{
 await page.setViewportSize({width:390,height:950});await instrument(page);
 const summary=structuredClone(SUMMARY_FIXTURE) as LiveSummary;summary.areas.myeongdong!.realtimeForecast=[17,18,20].map((hour,i)=>({targetAt:`2026-08-31T${hour}:00:00+09:00`,issuedAt:'2026-08-31T14:00:00+09:00',populationMin:10000+i*1000,populationMax:11000+i*1000,congestionLevel:2,congestionLabel:'fixture'}));
 await page.route('**/api/live/summary*',routeSummary(summary));await page.goto('/ko/myeongdong');
 const outlook=page.getByTestId('population-outlook').first(),buttons=outlook.locator('.outlook-times button');await buttons.last().scrollIntoViewIfNeeded();
 const bounds=await outlook.locator('polygon,polyline').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('points')));await clear(page);
 await buttons.last().focus();await page.keyboard.press('Enter');await expect(outlook.locator('time')).toHaveAttribute('datetime','2026-08-31T20:00:00+09:00');
 await expect(outlook.locator('.outlook-selection-range')).toContainText('12,000');expect(await outlook.locator('polygon,polyline').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('points')))).toEqual(bounds);
 await expect.poll(()=>page.evaluate(()=>window.motionEvents.some(e=>e.duration===160&&e.target==='outlook-active-range'))).toBe(true);
 await buttons.first().click();await buttons.nth(1).click();await settled(page);await shot(page,'population-390');
 await page.locator('.population-history-disclosure>summary').click();
 const flow=page.locator('.population-flow').first(),chart=flow.locator('.population-chart');await chart.scrollIntoViewIfNeeded();
 const paths=await chart.locator('.flow-bound').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('d')));
 await flow.getByRole('combobox').selectOption({index:1});await clear(page);
 const box=await chart.boundingBox();await page.mouse.move(box!.x+50,box!.y+100);await page.mouse.down();await page.mouse.move(box!.x+box!.width-20,box!.y+100,{steps:4});await page.mouse.up();
 expect(await page.evaluate(()=>window.motionEvents)).toEqual([]);expect(await chart.locator('.flow-bound').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('d')))).toEqual(paths);
 await page.emulateMedia({reducedMotion:'reduce'});await clear(page);await buttons.last().click();expect(await page.evaluate(()=>window.motionEvents)).toEqual([]);
});

test('preparation changes only affected items; copy acknowledgement follows success',async({page})=>{
 await page.setViewportSize({width:390,height:2400});await instrument(page);await page.goto('/ko/business');const prep=page.getByTestId('business-prep');await expect(prep.getByTestId('prep-actions')).toBeVisible();
 await prep.getByRole('button',{name:prepCopy.change.ko}).click();await clear(page);await prep.getByLabel(prepCopy.industry.ko).selectOption('food');
 await prep.getByRole('button',{name:prepCopy.save.ko,exact:true}).click();
 expect(await page.evaluate(()=>window.motionEvents.filter(e=>e.target.startsWith('fact:')))).toEqual([]);
 expect(await page.evaluate(()=>window.motionEvents.some(e=>e.target==='action:CROWD'&&e.duration===180))).toBe(true);
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

test('monthly paired bars transition on district and month; missing values and back navigation remain intact',async({page})=>{
 await page.setViewportSize({width:390,height:950});await instrument(page);
 const rows=(month:string,scale:number)=>[{observed_at:`${month}-01T10:10:00+09:00`,payload:JSON.stringify({commercialAt:`${month}-01T10:10:00+09:00`,categories:[{category:'한식',payments:20*scale,amountMin:100,amountMax:200},{category:'여행',payments:null,amountMin:null,amountMax:null}]})}];
 await page.route('**/api/live/commercial-months*',r=>{const u=new URL(r.request().url()),month=u.searchParams.get('month')??'2026-08',previous=month==='2026-08'?'2026-07':'2026-06',data=publicCommercialMonth(compareCommercialMonths(buildCommercialMonth(rows(month,2),month,month+'-30'),buildCommercialMonth(rows(previous,1),previous,previous+'-30')));return r.fulfill({json:{status:'READY',area:u.searchParams.get('area'),month,months:['2026-08','2026-07'],data}});});
 await page.goto('/ko/consumption');await expect(page.locator('.consumption-category')).toHaveCount(2);await page.locator('.consumption-pair').first().scrollIntoViewIfNeeded();await clear(page);
 await page.getByRole('tab',{name:'홍대',exact:true}).click();await expect(page.locator('.consumption-category')).toHaveCount(2);await expect.poll(()=>page.evaluate(()=>window.motionEvents.some(e=>e.duration===200))).toBe(true);
 await page.getByRole('combobox',{name:'비교월',exact:true}).selectOption('2026-07');await expect(page.locator('.consumption-legend')).toContainText('2026-07');await settled(page);
 await expect(page.locator('[data-category="여행"] .consumption-pair g')).toHaveCount(0);await shot(page,'consumption-390');
 await page.goBack();await expect(page).toHaveURL(/consumption/);await settled(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('departure order is opt-in finite, conditional-plan-safe and stops offscreen',async({page})=>{
 await page.setViewportSize({width:320,height:950});await instrument(page);await page.goto('/ko/airport');await page.getByTestId('departure-guide-entry').click();
 await page.getByTestId('prep-route').getByRole('button',{name:'T1 본관 탑승',exact:true}).click();
 const order=page.getByTestId('departure-order-motion');await order.scrollIntoViewIfNeeded();await expect(order.locator('[data-order-step]')).toHaveCount(4);
 const summary=page.getByTestId('prep-live-summary'),before=await summary.innerText();await order.getByRole('button',{name:'순서 보기'}).focus();await page.keyboard.press('Enter');
 await expect.poll(()=>order.locator('[data-order-link]').first().getAttribute('style')).not.toBeNull();
 await order.getByRole('button',{name:'순서 보기'}).click();await page.waitForTimeout(2600);expect(await summary.innerText()).toBe(before);
 await expect.poll(()=>order.locator('[data-order-link]').evaluateAll(nodes=>nodes.every(n=>!(n as HTMLElement).style.transform))).toBe(true);
 await shot(page,'departure-320');await order.getByRole('button',{name:'순서 보기'}).click();await page.evaluate(()=>scrollTo(0,0));
 await expect.poll(()=>order.locator('[data-order-link]').evaluateAll(nodes=>nodes.every(n=>!(n as HTMLElement).style.transform))).toBe(true);
 await page.emulateMedia({reducedMotion:'reduce'});await order.getByRole('button',{name:'순서 보기'}).click();expect(await order.locator('[data-order-link]').evaluateAll(nodes=>nodes.every(n=>!(n as HTMLElement).style.transform))).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
