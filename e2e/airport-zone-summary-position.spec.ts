import {test,expect,type Locator} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import {airportSides} from '../lib/airport-sides-summary';

const date='2026-08-31';
const flights=[...Array.from({length:133},(_,i)=>['W'+i,'T2','215','09:00']),...Array.from({length:16},(_,i)=>['C'+i,'T2','250','14:30']),...Array.from({length:122},(_,i)=>['E'+i,'T2','280','15:00']),['T1W','T1','29','09:00'],['T1C','T1','26','14:30'],['T1E','T1','5','15:00'],['COW','CONCOURSE','121','09:00'],['COC','CONCOURSE','113','14:30'],['COE','CONCOURSE','101','15:00']].map(([id,terminal,gate,time])=>({physicalFlightId:id,flightNumber:id,terminal,gate,airportCode:'NRT',direction:'departure',status:'scheduled',scheduledAt:`${date}T${time}:00+09:00`,retrievedAt:`${date}T05:00:00Z`}));

async function expectCenteredOverlay(model:Locator){
 const picture=model.locator('.airport-concept-picture'),image=picture.locator('img'),counts=picture.locator('.airport-concept-counts');
 await expect.poll(()=>image.evaluate((i:HTMLImageElement)=>i.complete&&i.naturalWidth>0)).toBe(true);
 await expect(model.locator(':scope > .airport-concept-counts')).toHaveCount(0);
 const frame=(await image.boundingBox())!,row=(await counts.boundingBox())!;
 expect(Math.abs(row.y+row.height/2-(frame.y+frame.height/2))).toBeLessThanOrEqual(1);
 expect(row.x).toBeGreaterThanOrEqual(frame.x);expect(row.x+row.width).toBeLessThanOrEqual(frame.x+frame.width);
 expect(row.y).toBeGreaterThanOrEqual(frame.y);expect(row.y+row.height).toBeLessThanOrEqual(frame.y+frame.height);
 for(const cell of await counts.locator(':scope >div').all()){
  expect(await cell.evaluate(el=>el.scrollWidth<=el.clientWidth+1&&el.scrollHeight<=el.clientHeight+1)).toBe(true);
  expect(await cell.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
 }
 return{frame,row};
}

test.beforeEach(async({page})=>{
 await page.clock.setFixedTime(new Date(`${date}T05:00:00Z`));
 await page.route('**/api/live/summary*',routeSummary({...SUMMARY_FIXTURE,airport:{...SUMMARY_FIXTURE.airport,sides:airportSides(date,'TODAY',[],flights,[],false,false)}}));
 await page.route('**/api/live/flights*',routeSummary({mode:'live-flights',basis:'COLLECTED_FLIGHT_RECORDS',serviceDateKst:date,todayKst:date,flights,truncated:false,retrievedAt:`${date}T05:00:00Z`}));
 await page.route('**/api/live/airport-days*',routeSummary({mode:'airport-days',history:[]}));
});

for(const width of[320,390,430,1280])test(`three live zones sit with the picture above bottom navigation ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/ko/airport?terminal=T2');
 const model=page.getByTestId('airport-departure-model-slot').getByTestId('airport-concept-model'),counts=model.locator('.airport-concept-counts'),image=model.locator('.airport-concept-picture img');
 await expect(model).toHaveAttribute('data-denominator','271');for(const[side,n,share]of[['WEST','133','49.1%'],['CENTER','16','5.9%'],['EAST','122','45.0%']]){const cell=counts.locator(`[data-side=${side}]`);await expect(cell.locator('strong')).toHaveText(n+'편');await expect(cell.locator('small')).toHaveText(share);expect(await cell.locator('.airport-concept-zone-name').evaluate(el=>getComputedStyle(el).color)).toBe('rgb(0, 0, 0)');expect(Number(await cell.locator('.airport-concept-zone-name').evaluate(el=>getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(600);}
 await image.scrollIntoViewIfNeeded();const header=await page.locator('.site-header').boundingBox(),stickyBottom=await page.locator('.airport-context-nav').evaluate(el=>parseFloat(getComputedStyle(el).top)+el.getBoundingClientRect().height);await image.evaluate((el,pad)=>window.scrollBy(0,el.getBoundingClientRect().top-pad),Math.max(0,header?.height??0,stickyBottom)+8);
 const{row,frame:picture}=await expectCenteredOverlay(model),nav=await page.locator('.bottom-nav').boundingBox(),visibleBottom=nav?.y??900,context=(await page.locator('.airport-context-nav').boundingBox())!;expect(picture.y).toBeGreaterThanOrEqual(context.y+context.height);expect(picture.y+picture.height).toBeLessThanOrEqual(visibleBottom);const cells=await counts.locator(':scope >div').all();expect(cells).toHaveLength(3);const boxes=await Promise.all(cells.map(c=>c.boundingBox()));for(const b of boxes){expect(b!.y+b!.height).toBeLessThan(visibleBottom);}expect(row.y+row.height).toBeLessThan(visibleBottom);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath(`zone-summary-${width}.png`)});
 const overview=page.getByTestId('airport-departure-overview'),section=overview.getByTestId('departure-map-section'),map=overview.getByTestId('departure-map'),basis=map.getByTestId('map-counting-basis');if(!await section.evaluate((el:HTMLDetailsElement)=>el.open))await section.locator(':scope > summary').click();await expect(map).toBeVisible();await expect(map.getByTestId('map-counts')).not.toBeVisible();await expect(map.getByTestId('map-lead')).not.toBeVisible();await expect(basis).not.toHaveAttribute('open');
 await map.locator('[data-preset=NEXT3]').click();await expect(model).toHaveAttribute('data-denominator','138');await expect(counts.locator('[data-side=CENTER] small')).toHaveText('11.6%');await expect(counts.locator('[data-side=WEST] strong')).toHaveText('0편');
 await basis.locator('summary').focus();await page.keyboard.press('Enter');await expect(map.getByTestId('map-counts')).toBeVisible();await expect(map.getByTestId('map-lead')).toBeVisible();await expect(map.getByTestId('map-destinations')).toBeVisible();await expect(map.getByTestId('map-official-coordinates')).toBeVisible();await expect(model.getByTestId('zone-range-CENTER')).toContainText('249–252');expect(errors).toEqual([]);
});

for(const width of[320,390,430,1280])test(`all four building views keep the summary centered inside the image ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});if(width===320)await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/ko/airport?terminal=T2');
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');await expect(page.getByTestId('airport-departure-model-slot').getByTestId('airport-concept-model')).toHaveAttribute('data-denominator','271');
 const selector=page.locator('.airport-view >.terminal-selector button');
 for(const[index,scope,n]of[[0,'all',277],[1,'T1',3],[2,'T2',271],[3,'CONCOURSE',3]] as const){
  await selector.nth(index).click();const model=(scope==='CONCOURSE'?page.getByTestId('airport-concourse'):page.getByTestId('airport-departure-model-slot')).getByTestId('airport-concept-model');
  await expect(model).toHaveAttribute('data-denominator',String(n));await expect(model.locator('.airport-concept-picture')).toHaveAttribute('data-building',scope);await expectCenteredOverlay(model);
  const counts=model.locator('.airport-concept-counts');await expect(counts.locator(':scope >div')).toHaveCount(3);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await model.screenshot({path:info.outputPath(`inside-image-${scope}-${width}.png`)});
 }
});

test('whole-building denominator, zero, terminals and date remain truthful',async({page})=>{
 await page.setViewportSize({width:390,height:900});await page.goto('/ko/airport?terminal=T2');const model=page.getByTestId('airport-departure-model-slot').getByTestId('airport-concept-model');await expect(model).toHaveAttribute('data-denominator','271');const selector=page.locator('.airport-view >.terminal-selector button');
 for(const[index,n]of[[0,277],[1,3],[2,271]]){await selector.nth(index).click();await expect(model).toHaveAttribute('data-denominator',String(n));}
 await selector.nth(3).click();await expect(page.getByTestId('airport-concourse').getByTestId('airport-concept-model')).toHaveAttribute('data-denominator','3');
 const next='2026-09-01';await page.route('**/api/live/summary*',routeSummary({...SUMMARY_FIXTURE,serviceDateKst:next,dayRelation:'FUTURE'}));await page.route('**/api/live/flights*',routeSummary({mode:'live-flights',serviceDateKst:next,todayKst:date,basis:'OFFICIAL_DEPARTURE_SCHEDULE',flights:[],retrievedAt:`${date}T05:00:00Z`,truncated:false}));await page.goto(`/ko/airport?terminal=T2&date=${next}`);await expect(model).toHaveAttribute('data-denominator','0');await expect(model.locator('.airport-concept-counts small')).toHaveText(['비율 계산 안 함','비율 계산 안 함','비율 계산 안 함']);await expect(model.getByTestId('airport-map-model-scope')).toContainText('T2');
});

test('unknown buildings remain in the all-building denominator and apart from the three zones',async({page})=>{
 const unknown={physicalFlightId:'UNKNOWN',terminal:null,gate:null,status:'scheduled',direction:'departure',scheduledAt:`${date}T15:00:00+09:00`,retrievedAt:`${date}T05:00:00Z`};await page.route('**/api/live/flights*',routeSummary({mode:'live-flights',serviceDateKst:date,todayKst:date,flights:[unknown],retrievedAt:`${date}T05:00:00Z`,truncated:false}));await page.goto('/ko/airport');await page.locator('.airport-view >.terminal-selector button').nth(0).click();const model=page.getByTestId('airport-departure-model-slot').getByTestId('airport-concept-model');await expect(model).toHaveAttribute('data-denominator','1');await expect(model.getByTestId('model-unverified-share')).toContainText('1편 · 100.0%');const counts=model.locator('.airport-concept-counts');await expect(counts.getByTestId('model-gates-pending').locator('strong')).toHaveText('1편');await expect(counts.locator('small')).toHaveText('게이트 위치 확인 전');await expect(counts.locator('[data-side]')).toHaveCount(0);await expect(counts).not.toContainText('0.0%');
});

for(const lang of['en','zh','ja'])test(`summary keeps all three labels and dynamic percentages ${lang}`,async({page})=>{await page.setViewportSize({width:320,height:900});await page.goto(`/${lang}/airport?terminal=T2`);const model=page.getByTestId('airport-departure-model-slot').getByTestId('airport-concept-model'),counts=model.locator('.airport-concept-counts');await expect(counts.locator(':scope >div')).toHaveCount(3);await expect(counts.locator('small')).toHaveText(['49.1%','5.9%','45.0%']);await expectCenteredOverlay(model);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);});

for(const[lang,label]of[['ko','비율 계산 안 함'],['en','Share not calculated'],['zh','未计算比例'],['ja','割合は未計算']])test(`confirmed zero zone labels wrap without overflow ${lang} 320`,async({page},info)=>{
 await page.setViewportSize({width:320,height:900});await page.route('**/api/live/flights*',routeSummary({mode:'live-flights',serviceDateKst:date,flights:[],retrievedAt:`${date}T05:00:00Z`,truncated:false}));await page.goto(`/${lang}/airport?terminal=T2`);const model=page.getByTestId('airport-departure-model-slot').getByTestId('airport-concept-model'),counts=model.locator('.airport-concept-counts');await expect(model).toHaveAttribute('data-denominator','0');await expect(counts.locator('small')).toHaveText([label,label,label]);await expect(counts.locator('strong')).toHaveCount(3);await expectCenteredOverlay(model);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await counts.scrollIntoViewIfNeeded();if(lang==='en')await page.screenshot({path:info.outputPath('zero-zone-labels-en-320.png')});
});
