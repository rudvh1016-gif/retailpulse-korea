import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
import {airportSides} from '../lib/airport-sides-summary';
const date='2026-08-31';
const base={scheduledAt:date+'T10:00:00+09:00',retrievedAt:date+'T01:00:00Z',status:'scheduled',direction:'departure',airportCode:'NRT'};
const flights=[{...base,physicalFlightId:'t1',flightNumber:'KE1',terminal:'T1',gate:'1'},{...base,physicalFlightId:'conc',flightNumber:'KE2',terminal:'CONCOURSE',gate:null},{...base,physicalFlightId:'t2',flightNumber:'KE3',terminal:'T2',gate:'215'},{...base,physicalFlightId:'unk',flightNumber:'KE4',terminal:null,gate:null}];
for(const width of [360,390,430,1280])for(const lang of ['ko','en','zh','ja'] as const)test(`distinct compact scenes and unavailable concourse data ${lang} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 await page.clock.install({time:new Date('2026-10-04T03:00:00Z')});
 await page.route('**/api/live/summary*',r=>r.fulfill({json:SUMMARY_FIXTURE}));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:{mode:'live-flights',basis:'OFFICIAL_DEPARTURE_SCHEDULE',flights,truncated:false,retrievedAt:base.retrievedAt}}));
 const requested:string[]=[];page.on('request',r=>{if(r.url().includes('/airport-models/v8/'))requested.push(r.url());});
 await page.goto(`/${lang}/airport`);
 const tabs=page.locator('.airport-view>.terminal-selector button');
 const image=page.locator('.airport-hero .airport-concept-picture img').first();
 await expect(image).toHaveAttribute('src','/airport-models/v8/OVERVIEW_day.webp');
 for(const scope of ['T1','T2','T1','all'] as const){await tabs.nth(scope==='all'?0:scope==='T1'?1:2).click();await expect(image).toHaveAttribute('src',`/airport-models/v8/${scope==='all'?'OVERVIEW':scope}_day.webp`);}
 const box=await image.boundingBox();expect(box).not.toBeNull();if(width<=430)expect(box!.height).toBeLessThan(260);
 const dimensions=await image.evaluate(el=>{const img=el as HTMLImageElement;const c=img.closest('.airport-concept-picture')!.getBoundingClientRect();const i=img.getBoundingClientRect();return{top:i.top-c.top,bottom:c.bottom-i.bottom,width:img.naturalWidth,height:img.naturalHeight};});expect(dimensions.top).toBeGreaterThanOrEqual(-1);expect(dimensions.bottom).toBeGreaterThanOrEqual(-1);
 await tabs.nth(3).click();const conc=page.getByTestId('airport-concourse');await expect(conc).toBeVisible();await expect(conc.getByTestId('concourse-flight-count')).toHaveText('1');await expect(conc.locator('[data-building="CONCOURSE"] img')).toHaveAttribute('src','/airport-models/v8/CONCOURSE_day.webp');await expect(conc.getByTestId('concourse-unsupported')).toBeVisible();await expect(page.locator('.airport-current-brief')).toHaveCount(0);
  await conc.getByTestId('concourse-flight-list').locator(':scope > summary').click();await conc.locator('input[type="search"]').fill('KE2');await conc.locator('.airport-flight-hour > summary').click();await expect(conc.getByTestId('concourse-flight-list')).toContainText('KE2');await conc.locator('input[type="search"]').fill('KE1');await expect(conc.locator('.airport-flight-hour')).toHaveCount(0);
  await expect(page).toHaveURL(/building=CONCOURSE/);await page.reload();await expect(page.getByTestId('airport-concourse')).toBeVisible();
  await tabs.nth(1).click();await expect(page.getByTestId('airport-concourse')).toHaveCount(0);await expect(image).toHaveAttribute('src','/airport-models/v8/T1_day.webp');
  await page.goBack();await expect(page.getByTestId('airport-concourse')).toBeVisible();await page.goForward();await expect(page.getByTestId('airport-concourse')).toHaveCount(0);
 await page.clock.setSystemTime(new Date('2026-10-04T09:00:00Z'));await page.clock.runFor(60_001);await expect(image).toHaveAttribute('src','/airport-models/v8/T1_night.webp');
 expect(requested.some(url=>url.includes('OVERVIEW_STACK'))).toBe(false);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 if(lang==='ko')await page.locator('.airport-flow').first().screenshot({path:`outputs/v5-${width}-T1-night.png`});
});
test('all-building country totals reconcile; physical building switches and time filters reuse the source',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 const summary={...SUMMARY_FIXTURE,airport:{...SUMMARY_FIXTURE.airport,sides:airportSides(date,'TODAY',[],flights,[],false,false)}};
 await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));let reads=0;
 await page.route('**/api/live/flights*',r=>{reads++;return r.fulfill({json:{mode:'live-flights',basis:'OFFICIAL_DEPARTURE_SCHEDULE',flights,truncated:false,retrievedAt:base.retrievedAt}});});
 await page.goto('/ko/airport');const overview=page.getByTestId('airport-departure-overview');await overview.scrollIntoViewIfNeeded();const map=overview.getByTestId('departure-map');await expect(map).toBeVisible();
 const zones=page.getByTestId('map-zone-countries');
 const total=()=>zones.locator('[data-side][data-total]').evaluateAll(nodes=>nodes.reduce((s,n)=>s+Number(n.getAttribute('data-total')),0));
 await expect.poll(total).toBe(4);await expect(page.getByTestId('airport-departure-model-slot').locator('[data-building="all"] img')).toHaveAttribute('src',/OVERVIEW_(day|night)\.webp$/);
 for(const [index,scope]of [[1,'T1'],[2,'T2'],[3,'CONCOURSE'],[0,'all']] as const){await map.locator('.terminal-selector button').nth(index).click();await expect.poll(total).toBe(scope==='all'?4:1);await expect(page.getByTestId('airport-map-model-scope')).toHaveAttribute('data-terminal',scope);}
 await map.locator('[data-preset="CUSTOM"]').click();await map.getByTestId('map-from').selectOption('11');await map.getByTestId('map-to').selectOption('12');await expect.poll(total).toBe(0);
 expect(reads).toBe(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('concourse mobile reading order and country cards remain clear of fixed navigation',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/live/summary*',r=>r.fulfill({json:SUMMARY_FIXTURE}));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:{mode:'live-flights',basis:'OFFICIAL_DEPARTURE_SCHEDULE',flights,truncated:false,retrievedAt:base.retrievedAt}}));
 await page.goto('/ko/airport?building=CONCOURSE');const conc=page.getByTestId('airport-concourse');const countries=conc.getByTestId('map-zone-countries');await expect(conc.getByTestId('concourse-flight-count')).toHaveText('1');
 expect(await conc.evaluate(el=>{const count=el.querySelector('[data-testid="concourse-flight-count"]')!;const chart=el.querySelector('[data-testid="map-zone-countries"]')!;const model=el.querySelector('[data-building="CONCOURSE"]')!;return Boolean(count.compareDocumentPosition(chart)&Node.DOCUMENT_POSITION_FOLLOWING)&&Boolean(model.compareDocumentPosition(chart)&Node.DOCUMENT_POSITION_FOLLOWING);})).toBe(true);
 await expect(countries.locator('details.prep-evidence')).not.toHaveAttribute('open','');await countries.getByText('주의사항',{exact:true}).focus();await page.keyboard.press('Enter');await expect(countries).toContainText('P02');await page.keyboard.press('Enter');
 const last=countries.locator('[data-side][data-total]').last();await last.evaluate(el=>el.scrollIntoView({block:'start'}));expect((await last.boundingBox())!.width).toBeGreaterThan(300);await expect.poll(async()=>{const card=await last.boundingBox();const nav=await page.locator('nav.bottom-nav').boundingBox();return card!.y+card!.height-nav!.y;}).toBeLessThan(0);
 await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));expect(await page.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('.page-shell')!).paddingBottom))).toBeGreaterThan(await page.locator('nav.bottom-nav').evaluate(el=>el.getBoundingClientRect().height));
});
for(const kind of ['FAILED','PARTIAL','ZERO','UNAVAILABLE','WRONG_DAY'] as const)test(`concourse ${kind} never invents passenger forecasts or flight totals`,async({page})=>{
 await page.route('**/api/live/summary*',r=>r.fulfill({json:SUMMARY_FIXTURE}));
 await page.route('**/api/live/flights*',r=>r.fulfill({status:kind==='FAILED'?503:200,json:{mode:'live-flights',serviceDateKst:kind==='WRONG_DAY'?'2026-09-01':date,flights:kind==='UNAVAILABLE'?[]:kind==='ZERO'?[flights[3]]:flights,truncated:kind==='PARTIAL',retrievedAt:kind==='UNAVAILABLE'?null:base.retrievedAt}}));
 await page.goto('/ko/airport?building=CONCOURSE');const conc=page.getByTestId('airport-concourse');await expect(conc).toBeVisible();await expect(conc.getByTestId('concourse-unsupported')).toBeVisible();await expect(page.locator('.airport-current-brief')).toHaveCount(0);
 if(kind==='ZERO'){await expect(conc.getByTestId('concourse-flight-count')).toHaveText('0');await expect(conc.locator('.airport-country-prism')).toHaveCount(0);for(const heading of await conc.getByTestId('map-zone-countries').locator('h5').all())await expect(heading).not.toContainText('0.0%');await conc.getByTestId('concourse-flight-list').locator('summary').focus();await page.keyboard.press('Enter');await expect(conc.getByTestId('concourse-flight-list')).toHaveAttribute('open','');await expect(conc.getByTestId('concourse-flight-list').locator('li')).toHaveCount(0);}
 else {await expect(conc.getByRole('status')).toBeVisible();await expect(conc.getByTestId('concourse-flight-count')).toHaveCount(0);await expect(conc.getByTestId('map-zone-countries')).toHaveCount(0);}
});
