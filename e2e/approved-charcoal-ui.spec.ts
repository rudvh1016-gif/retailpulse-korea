import {recentFxFixture} from './duty-free-recent-fixture';
import {test,expect} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};
import {kstExchangeDate,dutyFreeSources} from '../lib/duty-free-exchange';
const date='2026-10-19',at='2026-10-19T02:00:00Z';
const datedSummary={...summary,generatedAt:at,todayKst:date,serviceDateKst:date,airport:{...summary.airport,serviceDateKst:date}};
const rate=(day:string,value:number)=>({vendor:'shilla',serviceDateKst:day,currency:'USD',krwPerUnit:value,verifiedAt:day<'2026-10-19'?'2026-10-18T02:00:00Z':at,sourceUrl:dutyFreeSources.shilla,scope:'INTERNET_SHOP',verified:true,dateEvidence:day>date?'EXPLICIT_SOURCE_DATE':'CURRENT_WIDGET'});
for(const lang of ['ko','en','zh','ja'] as const)for(const width of [320,1440])test(`${lang} ${width}: charcoal topic hierarchy and immediate dated rates with explicit graph control`,async({page})=>{
 await page.setViewportSize({width,height:1000});await page.clock.setFixedTime(new Date(at));await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*',r=>r.fulfill({json:datedSummary}));
 for(const [path,json] of [['flights',flights],['airport-months',months],['airport-passenger-stats',passengerStats]] as const)await page.route(`**/api/live/${path}*`,r=>r.fulfill({json}));
 await page.route('**/api/airport/calendar*',r=>r.fulfill({json:{status:'PARTIAL',events:[{id:'heading-fixture',country:'TH',name:'Heading test event',kind:'public_holiday',scope:'national',start:date,end:date,status:'verified',verifiedAt:'2026-10-18',sourceURL:'https://example.test/heading'}],calendarReplacementScopes:[],sources:[],checkedAt:null}}));
 const current=rate(date,1400.67);
 await page.route('**/api/live/duty-free-exchange',r=>r.fulfill({json:{mode:'duty-free-exchange',collectionMode:'AUTOMATED',generatedAt:at,todayKst:date,sources:[{vendor:'shilla',observation:current,observations:[rate('2026-10-18',1432.87),current,rate('2026-10-20',1456.12)],lastAttemptAt:at,lastAttemptStatus:'SUCCESS',errorCode:null,nextAttemptAt:null}]}}));
 let monthlyReads=0;await page.route('**/api/live/duty-free-exchange/recent',r=>{monthlyReads++;return r.fulfill({json:recentFxFixture(date,[null,null,null,null,null,null,1400.67])});});
 expect(kstExchangeDate(Date.parse(at))).toBe(date);expect(datedSummary.todayKst).toBe(date);
 await page.goto(`/${lang}?date=${date}`);
 const bands=page.locator('.focus-report h3.focus-brief-band');await expect(bands).toHaveCount(3);
 await expect(page.locator('.focus-today-title')).toHaveCount(0);await expect(page.locator('.focus-report-date')).toContainText(date);
 await expect(page.locator('.focus-preparation-brief [data-line-icon="month"]')).toHaveCount(0);
 for(const band of await bands.all()){
  await expect(band).toHaveCSS('background-color','rgba(0, 0, 0, 0)');await expect(band).toHaveCSS('border-top-width','0px');await expect(band).toHaveCSS('padding-left','0px');await expect(band).toHaveCSS('font-size','16px');await expect(band).toHaveCSS('font-weight','600');
  await expect(band.locator('svg.ui-line-icon')).toHaveCount(0);
 }
 await expect(page.locator('.focus-passenger-total')).toHaveCSS('font-size',width===320?'24px':'28px');
 for(const sentence of await page.locator('.focus-selected-country-changes:not([aria-label])>p').all())expect((await sentence.innerText()).trim()).not.toMatch(/\.$/);
 const flow=page.locator('.glance-insights[aria-labelledby="airport-staff-briefing-title"]');await expect(flow.locator('.airport-flow-item-title')).toHaveCount(5);
 for(const heading of await flow.locator('.airport-flow-item-title').all()){await expect(heading.locator('.ui-line-icon')).toHaveCount(0);await expect(heading).toHaveCSS('font-size','16px');await expect(heading).toHaveCSS('font-weight',lang==='zh'||lang==='ja'?'600':'700');}
 for(const metric of await flow.locator(':scope > a > strong').all()){await expect(metric).toHaveCSS('font-size','14px');await expect(metric).toHaveCSS('font-weight','400');}
 const content=flow.locator('.staff-brief-grid');
 for(const node of await content.locator('p:visible,h4:visible').all()){await expect(node).toHaveCSS('font-size','14px');await expect(node).toHaveCSS('font-weight','400');}
 for(const node of await flow.locator(':scope > a > small,.staff-brief-grid small:visible').all()){await expect(node).toHaveCSS('font-size','12px');await expect(node).toHaveCSS('font-weight','400');}
 const routeDetails=content.locator('.staff-route-details');await expect(routeDetails).not.toHaveAttribute('open','');await routeDetails.locator('summary').focus();await page.keyboard.press('Enter');await expect(routeDetails).toHaveAttribute('open','');
 for(const node of await flow.locator(':scope > a > strong b,:scope > a > strong span,.staff-brief-grid b:visible,.staff-brief-grid strong:visible').all())await expect(node).toHaveCSS('font-weight','400');
 for(const control of await content.locator('summary:visible').all()){await expect(control).toHaveCSS('font-size','14px');await expect(control).toHaveCSS('font-weight','600');}
 expect((await routeDetails.locator('summary').boundingBox())!.height).toBeGreaterThanOrEqual(44);
 for(const paragraph of await routeDetails.locator('p:visible').all()){await expect(paragraph).toHaveCSS('font-size','14px');await expect(paragraph).toHaveCSS('font-weight','400');}
 await routeDetails.locator('summary').focus();await page.keyboard.press('Space');await expect(routeDetails).not.toHaveAttribute('open','');
 const strip=page.getByTestId('airport-duty-free-exchange');await expect(strip).toHaveAttribute('data-state','VERIFIED_TODAY');await strip.locator('.duty-free-rate-sources>summary').click();
 for(const [day,value]of [['previous','1,432.87'],['next','1,456.12']]){const row=strip.locator(`[data-rate-day="${day}"]`);await expect(row).toBeVisible();await expect(row).toContainText(value);await expect(row.locator('button')).toHaveCount(0);}
 const toggle=strip.locator('.duty-free-monthly-toggle');await expect(toggle).toHaveAttribute('aria-expanded','false');expect(monthlyReads).toBe(0);expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 await toggle.focus();await page.keyboard.press('Enter');await expect(toggle).toHaveAttribute('aria-expanded','true');await expect(strip.locator('.duty-free-monthly-chart circle')).toHaveCount(1);await strip.getByRole('slider').focus();await page.keyboard.press('End');await expect(strip.locator('.duty-free-month-readout')).toContainText('1,400.67');
 await toggle.focus();await page.keyboard.press('Space');await expect(toggle).toHaveAttribute('aria-expanded','false');await expect(strip.locator('.duty-free-monthly-chart')).toHaveCount(0);await expect(toggle).toBeFocused();
 await page.keyboard.press('Enter');await expect(strip.locator('.duty-free-monthly-chart')).toBeVisible();expect(monthlyReads).toBe(2);
 expect(await strip.locator('.duty-free-rate-detail').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await page.locator('#focus-country-trends').scrollIntoViewIfNeeded();
 const scope=page.getByTestId('monthly-airport-scope');await expect(scope).toHaveCount(1);await expect(scope.locator('p')).toContainText('T1 + T2');await expect(scope.locator('small')).toBeVisible();
 expect(await scope.evaluate(node=>node.previousElementSibling?.tagName)).toBe('H2');
 await page.goto(`/${lang}/airport-countries?mode=passengers&date=${date}`);await expect(page.getByTestId('monthly-airport-scope')).toHaveCount(1);
 const countryTitle=page.locator(lang==='ko'?'.airport-country-insights>h1':'.focus-detail>h1');await expect(countryTitle).toHaveText(({ko:'국가별 흐름',en:'T1 + T2 Route-country trends',zh:'T1 + T2 航线国家趋势',ja:'T1 + T2 路線国別の推移'} as const)[lang]);
 const countryScope=page.getByTestId('monthly-airport-scope');await expect(countryScope.locator('small')).toBeVisible();if(lang==='ko')await expect(page.locator('.airport-country-insights>.country-tabs')).toBeVisible();else expect(await countryScope.evaluate(node=>node.previousElementSibling?.tagName)).toBe('H1');
 expect(await countryTitle.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.goto(`/${lang}/airport?date=${date}`);const model=page.getByTestId('airport-concept-model');await expect(model).toBeVisible();
 await expect(page.getByTestId('departure-map').getByTestId('map-flights')).toHaveCount(0);
 const register=model.getByTestId('gate-region-register');await expect(register).not.toHaveAttribute('open','');await expect(model.getByTestId('model-source-evidence')).toBeHidden();await register.locator(':scope > summary').focus();await page.keyboard.press('Enter');await expect(model.getByTestId('model-source-evidence')).toBeVisible();await expect(register.getByRole('link',{name:/./}).last()).toHaveAttribute('href','https://www.airport.kr/geomap/ap_ko/view.do');await page.keyboard.press('Space');await expect(register).not.toHaveAttribute('open','');
 await expect(model.getByTestId('model-unverified-share')).toBeVisible();
 await page.getByRole('button',{name:({ko:'항공편',en:'FLIGHTS',zh:'航班',ja:'フライト'} as const)[lang],exact:true}).click();const board=page.locator('.flight-board');await expect(board).toBeVisible();await expect(board.getByRole('searchbox')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
for(const lang of ['ko','en','zh','ja'] as const)test(`${lang}: empty or failed graph never fabricates exchange observations`,async({page})=>{
 await page.setViewportSize({width:360,height:900});await page.clock.setFixedTime(new Date(at));
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{status:'UNAVAILABLE'}}));await page.route('**/api/live/summary*',r=>r.fulfill({json:datedSummary}));
 const current=rate(date,1400.67);await page.route('**/api/live/duty-free-exchange',r=>r.fulfill({json:{mode:'duty-free-exchange',collectionMode:'AUTOMATED',generatedAt:at,todayKst:date,sources:[{vendor:'shilla',observation:current,lastAttemptAt:at,lastAttemptStatus:'SUCCESS',errorCode:null,nextAttemptAt:null}]}}));
 let failed=false;await page.route('**/api/live/duty-free-exchange/recent',r=>failed?r.fulfill({status:503,json:{status:'UNAVAILABLE'}}):r.fulfill({json:recentFxFixture(date,Array(7).fill(null))}));
 for(const failure of [false,true]){
  failed=failure;await page.goto(`/${lang}/airport`);const strip=page.getByTestId('airport-duty-free-exchange');await expect(strip).toHaveAttribute('data-state','VERIFIED_TODAY');await strip.locator('.duty-free-rate-sources>summary').click();
  const toggle=strip.locator('.duty-free-monthly-toggle');await toggle.focus();await page.keyboard.press('Enter');
  await expect(strip.locator('.duty-free-monthly [role="status"]')).toHaveText(failure?({ko:'최근 환율 조회 실패',en:'Recent rates could not be loaded',zh:'近期汇率读取失败',ja:'直近の為替を取得できません'} as const)[lang]:({ko:'자료 없음',en:'No data',zh:'暂无数据',ja:'データなし'} as const)[lang]);
  await expect(strip.locator('.duty-free-monthly-chart circle')).toHaveCount(0);if(failure)await expect(strip.locator('.duty-free-monthly-chart')).toHaveCount(0);else await expect(strip.locator('.duty-free-monthly-chart')).not.toContainText('0.00');
  for(const day of ['previous','next'])await expect(strip.locator(`[data-rate-day="${day}"]`)).not.toContainText('1,400.67');
  await toggle.focus();await page.keyboard.press('Space');await expect(toggle).toHaveAttribute('aria-expanded','false');
 }
});
