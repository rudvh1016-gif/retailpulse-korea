import {test,expect} from '@playwright/test';
import {routeSummary,SUMMARY_FIXTURE} from './summary-fixture';

test('airport starts compact, explains unmatched flights and expands truthful next hours',async({page})=>{
 const payload=structuredClone(SUMMARY_FIXTURE) as typeof SUMMARY_FIXTURE & {airport:Record<string,unknown>};
 payload.airport.flightScope={total:561,T1:300,T2:250,other:0,unassigned:11,conflicting:0,capped:false};
 await page.route('**/api/live/summary*',routeSummary(payload));
 await page.setViewportSize({width:390,height:844});
 await page.goto('/ko/airport');
 await expect(page.locator('.airport-current-brief')).toContainText('터미널 미표기 11편');
 await expect(page.locator('.airport-today-grid')).not.toBeVisible();
 await page.locator('.airport-summary-details > summary').click();
 await expect(page.locator('.airport-today-grid')).toBeVisible();
 await expect(page.locator('.terminal-brief-card').first()).toContainText('15:00–16:00');
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

test('prediction shows a limited scorecard and exact missing weekday inputs',async({page})=>{
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/predictions*',routeSummary({targetDate:'2026-09-06',run:null,
 coverage:{days:7,latestAt:null,missingDays:[],dailyHours:[],readiness:{targetDate:'2026-09-06',hours:[{hour:10,ready:false,compatible:true,missingWeeks:1,sampleDates:['2026-08-30']}]}},
 records:[{targetAt:'2026-09-05T10:00:00+09:00',predicted:1600,actual:1800,createdAt:'2026-09-04T09:30:00Z',actualAt:'2026-09-05T10:05:00+09:00'}]}));
 await page.goto('/ko/predictions');
 await expect(page.locator('.prediction-score')).toContainText('평균 차이 약 200명');
 await page.locator('.prediction-readiness summary').click();
 await expect(page.locator('.prediction-readiness')).toContainText('1주 확보 · 1주 더 필요');
});
