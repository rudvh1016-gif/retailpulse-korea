import {test,expect} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};
// Artificial arithmetic boundary fixtures only: these are not production observations.
async function fixtures(page:import('@playwright/test').Page){
 await page.route('**/api/live/summary*',route=>route.fulfill({json:summary}));
 for(const [path,json] of [['flights',flights],['airport-months',months],['airport-passenger-stats',passengerStats]] as const)await page.route(`**/api/live/${path}*`,route=>route.fulfill({json}));
 await page.route('**/api/airport/calendar*',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/airport-days*',route=>route.fulfill({json:{mode:'airport-days',date:summary.todayKst,history:[],countryDays:[]}}));
}
const baseline={month:'2026-09',start:'2026-09-01',end:'2026-09-30',expectedDays:30,completeDays:30,missingDates:[],mean:100000,status:'COMPLETE'};
test('same-basis full-month daily mean is visible, not departure-only change',async({page})=>{
 await fixtures(page);await page.route('**/api/live/passenger-reference*',route=>route.fulfill({json:{status:'READY',month:'2026-09',data:{all:baseline,T1:baseline,T2:baseline}}}));
 await page.goto('/ko?date=2026-10-19',{waitUntil:'domcontentloaded'});
 await expect(page.locator('.focus-passenger-comparison')).toContainText('100,000명');
 await expect(page.locator('.focus-passenger-comparison')).toContainText('+12%');
 await expect(page.locator('.focus-people-metric > .focus-metric-label')).toHaveText('예상 인원 · 단순합계');
 await expect(page.locator('.focus-passenger-total')).toHaveText('112,403명');
});
test('incomplete prior month shows covered dates and never a misleading percentage',async({page})=>{
 await fixtures(page);const partial={...baseline,status:'PARTIAL',mean:null,completeDays:29,missingDates:['2026-09-01']};
 await page.route('**/api/live/passenger-reference*',route=>route.fulfill({json:{status:'READY',month:'2026-09',data:{all:partial,T1:partial,T2:partial}}}));
 await page.goto('/ko?date=2026-10-19',{waitUntil:'domcontentloaded'});
 await expect(page.locator('.focus-passenger-comparison')).toContainText('30일 중 29일');
 await expect(page.locator('.focus-passenger-comparison .change-rate')).toHaveCount(0);
});
test('holiday comparison renders fetched completed daily flight observations and sample coverage',async({page})=>{
 await fixtures(page);const date=summary.todayKst;
 await page.route('**/api/live/airport-days*',route=>route.fulfill({json:{mode:'airport-days',date,history:[],countryDays:[{country:'CN',date:'2026-10-01',value:150,complete:true,metric:'departure_flights',scope:'ALL'},{country:'CN',date:'2026-10-08',value:100,complete:true,metric:'departure_flights',scope:'ALL'}]}}));
 await page.goto('/ko/airport-countries?date=2026-10-19',{waitUntil:'domcontentloaded'});
 await expect(page.locator('.focus-recent-calendar').filter({hasText:'국경절'})).toContainText('일평균 150편');
 await expect(page.locator('.focus-recent-calendar').filter({hasText:'국경절'})).toContainText('일평균 100편');
 await expect(page.locator('.focus-recent-calendar').filter({hasText:'국경절'})).toContainText('일부 날짜 미확인');
});

