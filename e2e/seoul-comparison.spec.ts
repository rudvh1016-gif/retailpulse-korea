import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import {buildCommercialMonth,compareCommercialMonths,publicCommercialMonth} from '../lib/commercial-monthly';
import type {LiveSummary} from '../app/live-signals';
const categoryNames=['한식','일식/중식/양식','제과/커피/패스트푸드','기타요식','할인점/슈퍼마켓','편의점','의복/의류','패션/잡화','스포츠/문화/레저','화장품','약국','유흥','미용서비스','병원','여행'];
const rows=(month:string,multiplier:number)=>[{observed_at:`${month}-01T10:10:00+09:00`,payload:JSON.stringify({commercialAt:`${month}-01T10:10:00+09:00`,categories:categoryNames.map((category,index)=>({category,group:'fixture',payments:index*multiplier,amountMin:100,amountMax:200}))})}];
const current=compareCommercialMonths(buildCommercialMonth(rows('2026-08',2),'2026-08','2026-08-30'),buildCommercialMonth(rows('2026-07',1),'2026-07','2026-07-31'));
for(const lang of ['ko','en','zh','ja'] as const)for(const width of [360,390,430,1280])test(`district and consumption comparisons ${lang} ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/commercial-months*',route=>{const url=new URL(route.request().url());return route.fulfill({json:{status:'READY',area:url.searchParams.get('area'),month:url.searchParams.get('month'),months:['2026-08','2026-07'],calculatedAt:SUMMARY_FIXTURE.generatedAt,data:publicCommercialMonth(current)}});});
 await page.goto(`/${lang}/where-to`);await expect(page.locator('.district-choice')).toHaveCount(4);
 await expect(page.locator('[data-area="myeongdong"] .district-choice-name strong')).toHaveText({ko:'약간 붐빔',en:'Somewhat busy',zh:'略拥挤',ja:'やや混雑'}[lang]);
 await expect(page.locator('.comparison-basis')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.locator('.prediction-view')).toHaveCount(0);await expect(page.locator('.install-app-button')).toHaveCount(1);
 await page.locator('.comparison-details summary').focus();await page.keyboard.press('Enter');await expect(page.locator('.comparison-details')).toHaveAttribute('open','');
 if(width<600){const rows=await page.locator('.bottom-nav a').evaluateAll(links=>links.map(link=>link.getBoundingClientRect().top));expect(new Set(rows).size).toBe(1);}
 if(lang==='ko'){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath(`where-to-${width}.png`)});}
 await page.goto(`/${lang}/consumption`);await expect(page.locator('.consumption-category')).toHaveCount(15);
 await expect(page.locator('.consumption-category-list h2')).toHaveText(categoryNames.slice().sort((a,b)=>a.localeCompare(b,'ko')));
 const zero=page.locator('[data-category="한식"]');await expect(zero.locator('strong')).not.toContainText('100%');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('.consumption-category details summary').first().focus();await page.keyboard.press('Enter');await expect(page.locator('.consumption-category details').first()).toHaveAttribute('open','');
 await expect(page.locator('.install-app-button')).toHaveCount(1);expect(errors).toEqual([]);
 if(lang==='ko'){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath(`consumption-fixture-${width}.png`)});}
});
test('old URL redirects; install remains left of the airport calendar with its full guide',async({page})=>{
 await page.setViewportSize({width:390,height:900});await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.goto('/ko/predictions');await expect(page).toHaveURL(/\/ko\/where-to/);
 await page.goto('/ko/airport');const install=page.locator('.date-nav-tools .install-app-button');await expect(install).toBeVisible();await expect(page.locator('.header-meta .install-app-button')).toHaveCount(0);
 const button=await install.boundingBox(),calendar=await page.locator('.date-nav-tools > :nth-child(2)').boundingBox();expect(button!.height).toBeGreaterThanOrEqual(44);
 expect(button!.x).toBeLessThan(calendar!.x);
 await install.click();await expect(page.locator('.install-modal')).toBeVisible();await page.keyboard.press('Escape');await expect(install).toBeFocused();
});
test('failed monthly request is explicit and can recover without a false zero',async({page})=>{
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));let failed=true;
 await page.route('**/api/live/commercial-months*',route=>route.fulfill({json:failed?{status:'UNAVAILABLE',data:null,months:[]}:{status:'READY',area:'myeongdong',month:'2026-08',months:['2026-08'],data:publicCommercialMonth(current)}}));
 await page.goto('/ko/consumption');await expect(page.locator('.comparison-empty')).toContainText('아직 확인할 수 없습니다');await expect(page.locator('.consumption-category')).toHaveCount(0);
 failed=false;await page.getByRole('button',{name:'다시 확인',exact:true}).click();await expect(page.locator('.consumption-category')).toHaveCount(15);
});

test('district preferences require all four fresh same-time readings; missing remains unavailable',async({page})=>{
 const data=structuredClone(SUMMARY_FIXTURE) as LiveSummary;
 const source=structuredClone(data.areas.myeongdong!);
 for(const [index,area] of (['myeongdong','seongsu','hongdae','itaewon'] as const).entries())data.areas[area]={...structuredClone(source),realtime:{...source.realtime!,observedAt:data.generatedAt,congestionLevel:index===0?1:index===3?4:2,freshness:'LIVE'}};
 await page.route('**/api/live/summary*',routeSummary(data));await page.goto('/ko/where-to');
 await expect(page.locator('.comparison-basis')).toContainText('같은 관측시각');
 await page.getByRole('button',{name:'한산한 곳',exact:true}).click();await expect(page.locator('[data-preference-match="true"]')).toHaveAttribute('data-area','myeongdong');
 await page.getByRole('button',{name:'붐비는 곳',exact:true}).click();await expect(page.locator('[data-preference-match="true"]')).toHaveAttribute('data-area','itaewon');
 data.areas.hongdae!.realtime=null;await page.reload();await page.getByRole('button',{name:'붐비는 곳',exact:true}).click();
 await expect(page.locator('.comparison-basis')).toContainText('순위를 매기지 않습니다');await expect(page.locator('[data-preference-match="true"]')).toHaveCount(0);
 await expect(page.locator('[data-area="hongdae"] .district-choice-name strong')).toHaveText('확인 불가');
});

test('rapid district and month changes cannot show a late response from a previous selection',async({page})=>{
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 let release!:()=>void;const delayed=new Promise<void>(resolve=>{release=resolve;});let held=false;
 await page.route('**/api/live/commercial-months*',async route=>{
  const url=new URL(route.request().url()),area=url.searchParams.get('area')!,month=url.searchParams.get('month')!;
  if(area==='seongsu'&&!held){held=true;await delayed;}
  const data=publicCommercialMonth({...current,month,previousMonth:month==='2026-07'?'2026-06':'2026-07',categories:current.categories.slice(0,area==='hongdae'?3:15)});
  await route.fulfill({json:{status:'READY',area,month,months:['2026-08','2026-07'],data}}).catch(()=>{});
 });
 await page.goto('/ko/consumption');await expect(page.locator('.consumption-category')).toHaveCount(15);
 await page.getByRole('tab',{name:'성수',exact:true}).click();await expect.poll(()=>held).toBe(true);await page.getByRole('tab',{name:'홍대',exact:true}).click();
 await expect(page.locator('.consumption-category')).toHaveCount(3);release();
 await page.getByRole('combobox',{name:'비교월',exact:true}).selectOption('2026-07');await page.getByRole('combobox',{name:'비교월',exact:true}).selectOption('2026-08');
 await expect(page).toHaveURL(/area=hongdae.*month=2026-08/);await expect(page.locator('.consumption-category')).toHaveCount(3);
 await expect(page.locator('.consumption-legend')).toContainText('2026-08');await expect(page.getByRole('tab',{name:'홍대',exact:true})).toHaveAttribute('aria-selected','true');
});

for(const width of [360,390,430,1280])test(`airport hourly bars preserve values and desktop geometry at ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));
 const data=structuredClone(SUMMARY_FIXTURE) as LiveSummary;
 const timeline=Array.from({length:24},(_,hour)=>({targetStartAt:`2026-08-31T${String(hour).padStart(2,'0')}:00:00+09:00`,targetEndAt:hour===23?'2026-09-01T00:00:00+09:00':`2026-08-31T${String(hour+1).padStart(2,'0')}:00:00+09:00`,expectedPassengers:hour===14?6000:1000+hour*50}));
 data.airport.passengerForecastTimeline=timeline;data.airport.passengerForecastTimelineByTerminal={T1:timeline.map(row=>({...row,expectedPassengers:row.expectedPassengers*.6})),T2:timeline.map(row=>({...row,expectedPassengers:row.expectedPassengers*.4}))};
 data.airport.peakExpectedTimeBand=timeline[14];data.airport.peakExpectedTimeBandByTerminal={T1:data.airport.passengerForecastTimelineByTerminal.T1[14],T2:data.airport.passengerForecastTimelineByTerminal.T2[14]};
 await page.route('**/api/live/summary*',routeSummary(data));await page.goto('/ko/airport');
 const figure=page.locator('.airport-flow').first();await expect(figure.locator('.airport-hourly-prisms>g')).not.toHaveCount(0);
 const geometry=await figure.evaluate(el=>{
  const svg=el.querySelector('svg')!,mobile=svg.viewBox.baseVal.width<560;
  const bands=Array.from(el.querySelectorAll('.airport-flow-band')).map(band=>({start:band.getAttribute('data-start'),x:Number(band.getAttribute('x')),width:Number(band.getAttribute('width'))}));
  const bars=Array.from(el.querySelectorAll('.airport-hourly-prisms>g')).map(bar=>{const rect=bar.querySelector('rect')!;return {start:bar.getAttribute('data-start'),x:Number(rect.getAttribute('x')),width:Number(rect.getAttribute('width')),height:Number(rect.getAttribute('height')),declaredHeight:Number(bar.getAttribute('data-height')),value:Number(bar.getAttribute('data-value')),band:bands.find(band=>band.start===bar.getAttribute('data-start'))!};});
  return {mobile,bars};
 });
 for(const bar of geometry.bars){expect(bar.height).toBeCloseTo(bar.declaredHeight,6);expect(bar.value).toBeGreaterThan(0);expect(bar.width/bar.band.width).toBeCloseTo(geometry.mobile?.38:.55,6);expect((bar.x-bar.band.x)/bar.band.width).toBeCloseTo(geometry.mobile?.24:.2,6);}
 await expect(figure.locator('.airport-flow-legend')).toHaveCSS('color','rgb(0, 0, 0)');
 await expect(figure.locator('.airport-flow-legend i.stack-lower')).toHaveCSS('background-color','rgb(200, 188, 228)');
 await expect(figure.locator('.airport-flow-legend i.stack-upper')).toHaveCSS('background-color','rgb(139, 162, 220)');
 for(const terminal of ['T1','T2','전체 T1·T2','T1','전체 T1·T2'] as const){await page.locator('#airport-data-flow').getByRole('tab',{name:terminal,exact:true}).click();await expect(figure.locator('.airport-flow-band')).toHaveCount(24);}
 await figure.locator('.airport-flow-band').first().focus();await expect(figure.locator('.airport-flow-tip')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await figure.screenshot({path:info.outputPath(`airport-hourly-${width}.png`)});
});
