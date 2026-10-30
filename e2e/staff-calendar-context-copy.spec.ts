import {test,expect} from '@playwright/test';
import type {LiveSummary} from '../app/live-signals';
// Calendar-only fixture: no passenger, flight or observation values are invented or redated.
const summary:LiveSummary={mode:'live-summary',todayKst:'2026-10-30',serviceDateKst:'2026-10-30',generatedAt:'2026-10-30T13:00:00Z',dayRelation:'TODAY',areas:{},sources:[],dateAvailability:{airportFlights:[],airportPassengerForecast:[],airportDepartureSchedule:[],seoulObserved:[]},airport:{
 congestion:[],currentBusiestDepartureHallByTerminal:{},departuresTrackedToday:null,departuresTrackedTodayByTerminal:{},departuresTrackedTodayRetrievedAt:null,
 topDepartureGate:null,topDepartureGateTerminal:null,topDepartureGateFlights:null,topDepartureGateByTerminal:{},busyDepartureGates:[],busyDepartureGatesByTerminal:{},topDepartureGateRetrievedAt:null,topDepartureGateRetrievedAtByTerminal:{},gateCoverageRatio:0,gateCoverageRatioByTerminal:{},
 serviceDateKst:'2026-10-30',periodStartAt:null,periodEndAt:null,latestRetrievedAt:null,todayExpectedPassengersTotal:null,todayExpectedPassengersByTerminal:{},remainingExpectedPassengers:null,remainingExpectedPassengersByTerminal:{},passengerForecastRetrievedAt:null,passengerForecastRetrievedAtByTerminal:{},peakExpectedTimeBand:null,peakExpectedTimeBandByTerminal:{},peakExpectedPassengers:null,peakExpectedPassengersByTerminal:{},passengerForecastTimeline:[],passengerForecastTimelineByTerminal:{},forecastCoverage:{all:'UNAVAILABLE',byTerminal:{}},
 arrivalForecast:{todayExpectedPassengersTotal:null,todayExpectedPassengersByTerminal:{},nextExpectedTimeBand:null,peakExpectedTimeBand:null,passengerForecastRetrievedAt:null,forecastCoverage:{all:'UNAVAILABLE',byTerminal:{}}},scheduled:[],passengerForecast:[],transferForecast:[],
}};
for(const width of [320,390,1440])test(`weekly official calendar separates countries and folds secondary copy ${width}`,async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error'&&message.text().includes('TypeError'))errors.push(message.text());});
 test.setTimeout(90000);await page.clock.setFixedTime(new Date('2026-10-30T13:00:00Z'));await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/live/summary*',route=>route.fulfill({json:summary}));
 await page.route('**/api/airport/calendar',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.goto('/ko/airport',{waitUntil:'domcontentloaded'});
 const card=page.locator('.focus-staff-calendar');await expect(card).toContainText('이번 주 공식 일정');await expect(card).toContainText('2026-10-26–2026-11-01');
 await expect(card.locator(':scope > small').first()).toHaveCSS('font-size',width<=700?'11px':'12px');await expect(card.locator('.focus-staff-calendar-source')).toHaveCSS('font-size',width<=700?'11px':'12px');
 const rows=card.locator('.focus-staff-calendar-event');await expect(rows).toHaveCount(2);
 await expect(rows.nth(0)).toHaveCSS('font-size','14px');await expect(rows.nth(0)).toContainText('미얀마');await expect(rows.nth(1)).toContainText('카자흐스탄');await expect(rows.locator('small')).toHaveCount(0);
 const first=await rows.nth(0).boundingBox(),second=await rows.nth(1).boundingBox();expect(second!.y-(first!.y+first!.height)).toBeGreaterThanOrEqual(15);
 await expect(card).not.toContainText('종료되었습니다');
 const source=card.locator('.focus-staff-calendar-source');await expect(source).not.toHaveAttribute('open','');await expect(source.getByRole('link',{name:'공식 일정 ↗',includeHidden:true})).toHaveCount(2);await expect(source.getByRole('link',{name:'공식 일정 ↗',includeHidden:true}).first()).toBeHidden();
 await card.screenshot({path:info.outputPath(`weekly-calendar-closed-${width}.png`)});
 await source.locator('summary').focus();await page.keyboard.press('Enter');await expect(source.getByRole('link',{name:'공식 일정 ↗'})).toHaveCount(2);await expect(source).toContainText('외교부 공표 공휴일');await expect(source).toContainText('공식 자료 확인 2026-10-19');
 await expect(source.getByRole('link',{name:'공식 일정 ↗'}).first()).toHaveAttribute('href','https://www.mofa.gov.mm/about-myanmar/public-holidays/');
 await source.locator('summary').press('Enter');await expect(source.getByRole('link',{name:'공식 일정 ↗',includeHidden:true}).first()).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await card.getByRole('button',{name:'국가별 일정과 적용 대상 보기 ↗'}).click();await expect(page.locator('.preparation-month-grid')).toBeVisible();expect(errors).toEqual([]);
});
