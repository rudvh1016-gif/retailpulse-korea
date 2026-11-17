import {openRetainedTerminalDetails} from './retained-terminal-details';
import {test,expect} from '@playwright/test';
import {routeSummary,SUMMARY_FIXTURE} from './summary-fixture';

test('airport starts compact, explains unmatched flights and expands truthful next hours',async({page})=>{
 const payload=structuredClone(SUMMARY_FIXTURE) as typeof SUMMARY_FIXTURE & {airport:Record<string,unknown>};
 payload.airport.flightScope={total:561,T1:300,T2:250,CONCOURSE:10,other:0,unassigned:1,conflicting:0,capped:false};
 await page.route('**/api/live/summary*',routeSummary(payload));
 await page.setViewportSize({width:390,height:844});
 await page.goto('/ko/airport');
 await expect(page.locator('.airport-current-brief')).toContainText('탑승동 10편');
 await expect(page.locator('.passenger-scope-note')).toContainText('T1에서 출국 수속 후 탑승동');
 await expect(page.locator('.airport-current-brief')).toContainText('탑승 위치 확인 중 1편');
 for(const selector of ['.flight-scope-note .methodology-details','.passenger-scope-note']){
  const detail=page.locator(selector),toggle=detail.locator(':scope > summary');
  await expect(detail).not.toHaveAttribute('open','');await expect(detail.locator(':scope > p')).toBeHidden();
  await toggle.focus();await page.keyboard.press('Enter');
  await expect(detail.locator(':scope > p')).toBeVisible();
  await page.keyboard.press('Space');await expect(detail).not.toHaveAttribute('open','');
  expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 }

 await expect(page.locator('.airport-today-grid')).not.toBeVisible();
 await openRetainedTerminalDetails(page);
 await expect(page.locator('.airport-today-grid')).toBeVisible();
 await expect(page.locator('.terminal-brief-card').first()).toContainText('15:00 ~ 16:00');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
});

test('source page excludes unconnected candidates and shows a truthful nominal retry',async({page})=>{
 const payload={...SUMMARY_FIXTURE,sources:[{sourceId:'KTO_TOURAPI_EVENT',status:'ERROR',retrievedAt:'2026-08-30T00:00:00Z',detail:'failureClass=NETWORK causeCode=UND_ERR_CONNECT_TIMEOUT'}]};
 await page.route('**/api/live/summary*',routeSummary(payload));
 await page.goto('/ko/more');
 await page.locator('#collection-status summary').click();
 await expect(page.locator('#collection-status')).toContainText('연결 단계 실패');
 await expect(page.locator('#collection-status')).toContainText('2026-09-01 06:07 KST');
 await expect(page.locator('#collection-status')).not.toContainText('UND_ERR');
 await page.locator('.source-toggle').click();
 await expect(page.locator('.source-rows')).toContainText('T2 출국장 대기');
 await expect(page.locator('.source-rows')).not.toContainText('NAVER DATALAB');
});

test('a stale weather source says whether KMA had no data or the connection failed',async({page})=>{
 const noData='mode=scheduled; grids ok 0/4; failed grid 60,127: failureClass=NO_DATA causeCode=KMA_RESULT_03 attempts=1 | grid 61,126: failureClass=NO_DATA causeCode=KMA_RESULT_03 attempts=1';
 const timeout='mode=scheduled; grids ok 3/4; failed grid 60,127: failureClass=TIMEOUT causeCode=UND_ERR_HEADERS_TIMEOUT attempts=2';
 for(const [detail,reason,other] of [[noData,'기상청이 이번 발표 자료를 아직 주지 않음(자료 없음)','응답 대기시간 초과'],[timeout,'응답 대기시간 초과','자료 없음']]){
  await page.unrouteAll();
  await page.route('**/api/live/summary*',routeSummary({...SUMMARY_FIXTURE,sources:[{sourceId:'KMA_VILAGE_FCST',status:'STALE',retrievedAt:'2026-08-31T02:10:00Z',detail}]}));
  await page.goto('/ko/more');
  await page.locator('#collection-status summary').click();
  const status=page.locator('#collection-status');
  await expect(status).toContainText(`최신 자료 미확보 · ${reason}`);
  await expect(status).not.toContainText(other);
  await expect(status).toContainText('마지막 성공 · 2026-08-31 11:10 KST');
  await expect(status).not.toContainText('KMA_RESULT');
 }
});

test('retired Seoul archive: records show the preserved limited scorecard and exact missing weekday inputs',async({page})=>{
 const langCode = 'ko';
 const retiredReads: string[] = [];
 await page.route('**/api/**',route => route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 page.on('request',request => { const url = new URL(request.url()); if (url.pathname === '/api/live/predictions' || url.searchParams.get('view') === 'records') retiredReads.push(request.url()); });
 await page.goto(`/${langCode}/forecast?area=hongdae&date=2026-08-31#prediction-score`);
 await expect(page).toHaveURL(url => url.pathname === `/${langCode}`);
 await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
 await expect(page.locator('.prediction-history, .records-chart, .area-tabs')).toHaveCount(0);
 expect(retiredReads).toEqual([]);
});

test('first load preloads one shared summary and uses the small Korean shell font',async({page})=>{
 let requests=0;
 // Establish the fixture day before the first cache key, not during its response.
 await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));
 await page.route('**/api/live/summary*',async route=>{requests++;await routeSummary(SUMMARY_FIXTURE)(route);});
 await page.goto('/ko/airport');
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page.locator('.airport-current-brief')).toBeVisible();
 await expect(page.locator('link[rel="preload"][as="fetch"][href="/api/live/summary"]')).toHaveCount(1);
 expect(requests).toBe(1);
 const family=await page.locator('.app').evaluate(el=>getComputedStyle(el).fontFamily);
 expect(family.split(',')[0]).toContain('KORETAIL Sans Variable');
});
