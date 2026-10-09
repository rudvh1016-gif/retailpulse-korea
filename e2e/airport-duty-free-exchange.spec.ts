import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
import {tofuCharacters} from './font-glyphs';
import observations from '../config/duty-free-exchange-observations.json' with {type:'json'};

const autoSnapshot={mode:'duty-free-exchange',collectionMode:'AUTOMATED',generatedAt:'2026-10-08T03:00:00Z',todayKst:'2026-10-08',
 sources:observations.observations.filter(observation=>observation.vendor==='shilla').map(observation=>({vendor:observation.vendor,observation,lastAttemptAt:observation.verifiedAt,lastAttemptStatus:'SUCCESS',errorCode:null,nextAttemptAt:null}))};

async function fixtures(page:import('@playwright/test').Page){
 await page.route('**/api/live/duty-free-exchange',r=>r.fulfill({json:autoSnapshot}));
 await page.route('**/api/live/summary*',r=>r.fulfill({json:SUMMARY_FIXTURE}));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:{mode:'live-flights',serviceDateKst:'2026-08-31',flights:[],truncated:false,retrievedAt:null}}));
}
for(const lang of ['ko','en','zh','ja'] as const)for(const width of[360,390,430,1280])test(`verified dated duty-free strip fits and cites only Shilla ${lang} ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});await page.clock.setFixedTime(new Date('2026-10-08T03:00:00Z'));await fixtures(page);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const vendorRequests:string[]=[];page.on('request',r=>{if(/shilladfs|ssgdfs|hddfs/.test(r.url()))vendorRequests.push(r.url());});
 await page.goto(`/${lang}/airport`);const strip=page.getByTestId('airport-duty-free-exchange');
 await expect(strip).toHaveAttribute('data-state','VERIFIED_TODAY');await expect(strip.getByTestId('duty-free-rate')).toHaveText(lang==='ko'?'1 USD = 1,343.40원':'1 USD = 1,343.40 KRW');
  expect(await strip.evaluate(node=>node.closest('.topbar') !== null)).toBe(true);
  await expect(page.locator('.topbar .install-app-button')).toHaveCount(1);
  await expect(page.locator('.date-nav-tools .install-app-button, .comparison-date .install-app-button')).toHaveCount(0);
  const install=page.locator('.header-meta .install-app-button'),language=page.getByLabel('Language',{exact:true});
  const positions=await Promise.all([install.boundingBox(),strip.boundingBox(),language.boundingBox()]);
  expect(positions.every(Boolean)).toBe(true);
  const [installBox,rateBox,languageBox]=positions as Array<{x:number;y:number;width:number;height:number}>;
  expect(rateBox.x+rateBox.width).toBeLessThanOrEqual(languageBox.x+1);
  expect(installBox.x+installBox.width).toBeLessThanOrEqual(rateBox.x+1);
  expect(Math.abs(installBox.y+installBox.height/2-rateBox.y-rateBox.height/2)).toBeLessThanOrEqual(2);
  const equation=strip.locator('summary .duty-free-rate'),equals=strip.locator('.duty-free-rate-equals');
  const [equationBox,equalsBox]=await Promise.all([equation.boundingBox(),equals.boundingBox()]);
  expect(equationBox).not.toBeNull();expect(equalsBox).not.toBeNull();expect(equalsBox!.width).toBeGreaterThanOrEqual(5);
  expect(equationBox!.x+equationBox!.width).toBeLessThanOrEqual(languageBox.x+1);
  expect(await equals.evaluate(el=>getComputedStyle(el).transform)).toBe('none');
  expect(await equation.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const tops=[...range.getClientRects()].map(r=>r.top);return Math.max(...tops)-Math.min(...tops)<4;})).toBe(true);
  if(width<=820){expect(installBox.width).toBeGreaterThanOrEqual(44);expect(installBox.height).toBeGreaterThanOrEqual(44);expect((await install.locator('.install-app-compact-label').boundingBox())!.height).toBeLessThan(32);}
 await strip.locator('summary').focus();await page.keyboard.press('Enter');await expect(strip.locator('details')).toHaveAttribute('open');
  const detailBox=await strip.locator('.duty-free-rate-detail').boundingBox();expect(detailBox).not.toBeNull();expect(detailBox!.x).toBeGreaterThanOrEqual(0);expect(detailBox!.x+detailBox!.width).toBeLessThanOrEqual(width+1);
 await expect(strip.locator('a[href="https://www.shilladfs.com/estore/kr/ko/"]')).toHaveCount(1);await expect(strip.locator('a[href="https://www.ssgdfs.com/kr/main/initMain/"]')).toHaveCount(0);
 await expect(strip.locator('time')).toHaveCount(1);expect(await tofuCharacters(strip)).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);expect(vendorRequests).toEqual([]);
  if(lang==='ko')await strip.locator('.duty-free-rate-detail').screenshot({path:info.outputPath(`duty-free-sources-${width}.png`)});
  await page.keyboard.press('Escape');await expect(strip.locator('details')).not.toHaveAttribute('open');await expect(strip.locator('summary')).toBeFocused();
  await install.click();await expect(page.locator('.install-modal')).toBeVisible();await page.keyboard.press('Escape');await expect(install).toBeFocused();
  await language.selectOption(lang==='en'?'ko':'en');await expect(language).toHaveValue(lang==='en'?'ko':'en');
  await expect(strip).toHaveAttribute('data-state','VERIFIED_TODAY');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await language.selectOption(lang);if(lang==='ko'){await page.evaluate(()=>(document.activeElement as HTMLElement)?.blur());await page.locator('.site-header').screenshot({path:info.outputPath(`duty-free-exchange-${width}.png`)});}
});
test('a mounted strip expires across KST midnight and focus cannot revive yesterday',async({page})=>{
 await page.clock.install({time:new Date('2026-10-08T14:59:50Z')});await page.clock.pauseAt(new Date('2026-10-08T14:59:50Z'));await fixtures(page);
 // A fresh automated observation, rather than the old morning manual record.
 await page.route('**/api/live/duty-free-exchange',r=>r.fulfill({json:{...autoSnapshot,sources:autoSnapshot.sources.map(source=>({...source,observation:{...source.observation,verifiedAt:'2026-10-08T14:59:00Z'}}))}}));
 await page.goto('/ko/airport');
 const strip=page.getByTestId('airport-duty-free-exchange');await expect(strip).toHaveAttribute('data-state','VERIFIED_TODAY');
 await page.clock.runFor(10051);await expect(strip).toHaveAttribute('data-state','TODAY_PENDING');await expect(strip.locator('summary')).toContainText('오늘 환율 확인 중');
 await strip.locator('summary').click();await strip.getByRole('button',{name:'어제 환율',exact:true}).click();await expect(strip.locator('time[datetime="2026-10-08T14:59:00Z"]')).toHaveCount(1);
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(strip).toHaveAttribute('data-state','TODAY_PENDING');
});

test('KST rollover expires yesterday even while the stored API request is pending',async({page})=>{
 await page.clock.install({time:new Date('2026-10-08T14:59:50Z')});await page.clock.pauseAt(new Date('2026-10-08T14:59:50Z'));await fixtures(page);
 let reads=0;let pending:import('@playwright/test').Route|undefined;
 await page.route('**/api/live/duty-free-exchange',r=>{if(++reads===1)return r.fulfill({json:{...autoSnapshot,sources:autoSnapshot.sources.map(source=>({...source,observation:{...source.observation,verifiedAt:'2026-10-08T12:00:00Z'}}))}});pending=r;});
 await page.goto('/ko/airport');const strip=page.getByTestId('airport-duty-free-exchange');await expect(strip).toHaveAttribute('data-state','VERIFIED_TODAY');
 await page.clock.runFor(10051);await expect(strip).toHaveAttribute('data-state','TODAY_PENDING');await expect(strip.locator('summary')).toContainText('오늘 환율 확인 중');
 await strip.locator('summary').click();await strip.getByRole('button',{name:'어제 환율',exact:true}).click();await expect(strip.locator('time[datetime="2026-10-08T12:00:00Z"]')).toHaveCount(1);
 await pending?.abort().catch(()=>{});
});
test('unverified future observations are withheld and history selection keeps today’s header',async({page})=>{
 await page.clock.setFixedTime(new Date('2026-10-08T02:00:00Z'));await fixtures(page);await page.goto('/en/airport');
 const strip=page.getByTestId('airport-duty-free-exchange');await expect(strip).toHaveAttribute('data-state','TODAY_PENDING');await expect(strip.getByTestId('duty-free-rate')).toHaveCount(0);
 await page.clock.setFixedTime(new Date('2026-10-08T03:00:00Z'));await page.goto('/en/airport?date=2026-10-07');await expect(strip).toHaveAttribute('data-state','VERIFIED_TODAY');await expect(strip.getByTestId('duty-free-rate')).toHaveCount(1);
});

test('stored API rates refresh while mounted and repeated focus makes no extra reads',async({page})=>{
 await page.clock.install({time:new Date('2026-10-08T03:00:00Z')});await fixtures(page);let reads=0;
 await page.route('**/api/live/duty-free-exchange',r=>{reads++;const value=reads===1?1343.4:1348.27;return r.fulfill({json:{...autoSnapshot,sources:autoSnapshot.sources.map(source=>({...source,observation:{...source.observation,krwPerUnit:value}}))}});});
 const providerRequests:string[]=[];page.on('request',r=>{if(/shilladfs|ssgdfs|hddfs/.test(r.url()))providerRequests.push(r.url());});
 await page.goto('/ko/airport');const strip=page.getByTestId('airport-duty-free-exchange');await expect(strip.getByTestId('duty-free-rate')).toHaveText('1 USD = 1,343.40원');
 await page.evaluate(()=>{for(let i=0;i<5;i++)window.dispatchEvent(new Event('focus'));});expect(reads).toBe(1);
 await page.clock.runFor(15*60_000+100);await expect(strip.getByTestId('duty-free-rate')).toHaveText('1 USD = 1,348.27원');expect(reads).toBe(2);expect(providerRequests).toEqual([]);
});

for(const lang of ['ko','en','zh','ja'] as const)test(`failed collection preserves visibly dated previous evidence ${lang}`,async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.clock.setFixedTime(new Date('2026-10-08T03:00:00Z'));await fixtures(page);
 const older={...autoSnapshot,sources:autoSnapshot.sources.map(source=>({...source,lastAttemptStatus:'BLOCKED',lastAttemptAt:'2026-10-08T02:30:00Z',errorCode:'HTTP_406',observation:{...source.observation,serviceDateKst:'2026-10-07',verifiedAt:'2026-10-07T02:00:00Z'}}))};
 await page.route('**/api/live/duty-free-exchange',r=>r.fulfill({json:older}));await page.goto(`/${lang}/airport`);
 const strip=page.getByTestId('airport-duty-free-exchange');await expect(strip).toHaveAttribute('data-state','TODAY_PENDING');await expect(strip).toContainText({ko:'최근 수집 실패',en:'Latest collection failed',zh:'最近采集失败',ja:'直近の収集に失敗'}[lang]);await expect(strip.locator('summary')).not.toContainText('1,343');await strip.locator('summary').click();await strip.getByRole('button',{name:{ko:'어제 환율',en:'Yesterday’s rate',zh:'昨日汇率',ja:'昨日のレート'}[lang],exact:true}).click();
 await expect(strip.locator('time[datetime="2026-10-07T02:00:00Z"]')).toHaveCount(1);expect(await tofuCharacters(strip)).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

for(const failure of ['network','storage'] as const)test(`API ${failure} failure keeps the prior verification time and labels the retained value`,async({page})=>{
 await page.clock.install({time:new Date('2026-10-08T03:00:00Z')});await fixtures(page);let reads=0;
 await page.route('**/api/live/duty-free-exchange',r=>{reads++;return reads===1?r.fulfill({json:autoSnapshot}):failure==='network'?r.abort():r.fulfill({json:{...autoSnapshot,sources:autoSnapshot.sources.map(source=>({...source,observation:null,lastAttemptStatus:'NEVER',errorCode:'STORAGE_UNAVAILABLE'}))}});});
 await page.goto('/ko/airport');const strip=page.getByTestId('airport-duty-free-exchange');await expect(strip).toHaveAttribute('data-state','VERIFIED_TODAY');
 await page.clock.runFor(15*60_000+100);await expect.poll(()=>reads).toBe(2);await expect(strip).toHaveAttribute('data-state','VERIFIED_TODAY');await strip.locator('summary').click();
 await expect(strip.locator('[role=status]')).toContainText('새 자료 조회 실패');await expect(strip.locator('time[datetime="2026-10-08T02:49:39.401Z"]')).toHaveCount(1);
});

test('legacy two-source cached payload keeps Shilla current and omits retired vendor evidence',async({page})=>{
 await page.clock.setFixedTime(new Date('2026-10-08T03:00:00Z'));await fixtures(page);
 const legacy=observations.observations.find(observation=>observation.vendor==='shinsegae')!;
 await page.route('**/api/live/duty-free-exchange',r=>r.fulfill({json:{...autoSnapshot,sources:[...autoSnapshot.sources,
  {vendor:'shinsegae',observation:legacy,lastAttemptAt:legacy.verifiedAt,lastAttemptStatus:'NEVER',errorCode:'STORAGE_UNAVAILABLE',nextAttemptAt:null}]}}));
 await page.goto('/ko/airport');const strip=page.getByTestId('airport-duty-free-exchange');
 await expect(strip).toHaveAttribute('data-state','VERIFIED_TODAY');await expect(strip.getByTestId('duty-free-rate')).toHaveText('1 USD = 1,343.40원');
 await strip.locator('summary').click();await expect(strip.locator('a')).toHaveCount(1);await expect(strip.locator('a')).toHaveText('신라');
 await expect(strip).not.toContainText('신세계');await expect(strip.locator('[role=status]')).toHaveCount(0);
});

test('verified today survives reload during API outage, while stale cached days stay off the headline',async({page})=>{
 await page.clock.setFixedTime(new Date('2026-10-08T03:00:00Z'));await fixtures(page);await page.goto('/ko/airport');
 const strip=page.getByTestId('airport-duty-free-exchange');await expect(strip).toHaveAttribute('data-state','VERIFIED_TODAY');
 await page.route('**/api/live/duty-free-exchange',r=>r.abort());await page.reload();
 await expect(strip).toHaveAttribute('data-state','VERIFIED_TODAY');await expect(strip.getByTestId('duty-free-rate')).toHaveText('1 USD = 1,343.40원');
 await strip.locator('summary').click();await expect(strip.locator('[role=status]')).toBeVisible();
 await page.clock.setFixedTime(new Date('2026-10-09T03:00:00Z'));await page.reload();await expect(strip).toHaveAttribute('data-state','TODAY_PENDING');await expect(strip.locator('summary')).not.toContainText('1,343');
});
test('tomorrow is available only behind its button with an explicit source date, and promotes at midnight',async({page})=>{
 await page.clock.install({time:new Date('2026-10-08T14:59:50Z')});await page.clock.pauseAt(new Date('2026-10-08T14:59:50Z'));await fixtures(page);
 const future={...autoSnapshot.sources[0].observation,serviceDateKst:'2026-10-09',krwPerUnit:1338,verifiedAt:'2026-10-08T14:00:00Z',dateEvidence:'EXPLICIT_SOURCE_DATE'};
 await page.route('**/api/live/duty-free-exchange',r=>r.fulfill({json:{...autoSnapshot,sources:autoSnapshot.sources.map(source=>({...source,observations:[future]}))}}));
 await page.goto('/ko/airport');const strip=page.getByTestId('airport-duty-free-exchange');await expect(strip).toHaveAttribute('data-state','VERIFIED_TODAY');await expect(strip.locator('summary')).not.toContainText('1,338');
 await strip.locator('summary').focus();await page.keyboard.press('Enter');await strip.getByRole('button',{name:'내일 환율',exact:true}).focus();await page.keyboard.press('Enter');
 await expect(strip.getByTestId('duty-free-selected-day')).toContainText('2026-10-09');await expect(strip.getByTestId('duty-free-selected-day')).toContainText('1,338.00');
 await page.clock.runFor(10051);await expect(strip.locator('summary')).toContainText('1,338.00');await expect(strip).toHaveAttribute('data-state','VERIFIED_TODAY');
});
test('midnight stored reads are bounded at twelve, and recover on an existing scheduled read',async({page})=>{
 await page.clock.install({time:new Date('2026-10-08T15:00:00Z')});await page.clock.pauseAt(new Date('2026-10-08T15:00:00Z'));await fixtures(page);
 let reads=0;await page.route('**/api/live/duty-free-exchange',r=>{reads++;return r.fulfill({json:autoSnapshot});});
 await page.goto('/ko/airport');const strip=page.getByTestId('airport-duty-free-exchange');await expect.poll(()=>reads).toBe(1);
 for(let i=0;i<11;i++){await page.clock.runFor(60_100);await expect.poll(()=>reads).toBe(i+2);}
 await page.clock.runFor(3*60_000);expect(reads).toBe(12);
 await strip.locator('summary').click();await strip.getByRole('button',{name:'내일 환율',exact:true}).click();await expect(strip.getByTestId('duty-free-selected-day')).toContainText('확인된 환율 없음');
 await page.route('**/api/live/duty-free-exchange',r=>{reads++;return r.fulfill({json:{...autoSnapshot,sources:autoSnapshot.sources.map(source=>({...source,observation:{...source.observation,serviceDateKst:'2026-10-09',verifiedAt:'2026-10-08T15:10:00Z'}}))}});});
 await page.clock.runFor(12*60_000+100);await expect(strip).toHaveAttribute('data-state','VERIFIED_TODAY');expect(reads).toBe(13);
});
test('blocked browser storage still reads today and retains it in memory after failure',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('unavailable');}});});
 await page.clock.install({time:new Date('2026-10-08T03:00:00Z')});await fixtures(page);await page.goto('/ko/airport');
 const strip=page.getByTestId('airport-duty-free-exchange');await expect(strip).toHaveAttribute('data-state','VERIFIED_TODAY');
 await page.route('**/api/live/duty-free-exchange',r=>r.abort());await page.clock.runFor(15*60_000+100);
 await strip.locator('summary').click();await expect(strip.locator('[role=status]')).toBeVisible();await expect(strip).toHaveAttribute('data-state','VERIFIED_TODAY');
});
