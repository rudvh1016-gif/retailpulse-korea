import {test,expect} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};

for(const width of [320,360,390,430,1280,1440])test(`국가별 출발 구역에서 터미널과 날짜를 선택 ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:flights}));
 await page.route('**/api/live/airport-months*',r=>r.fulfill({json:months}));
 await page.goto('/ko/airport-countries?date=2026-10-19');
 await expect(page.getByRole('tab',{name:'국가별 출발 구역'})).toHaveAttribute('aria-selected','true');
 await expect(page.getByTestId('map-zone-countries')).toBeVisible();
 expect(await page.getByTestId('map-zone-countries').evaluate(node=>Boolean(node.compareDocumentPosition(document.querySelector('[data-testid="airport-month-flights"]')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
 await page.getByRole('tab',{name:'국가별 출발 구역'}).click();
 await expect(page.getByRole('tab',{name:'국가별 출발 구역'})).toHaveAttribute('aria-selected','true');
 await expect(page.getByRole('group',{name:'출발 구역 터미널 선택'})).toBeVisible();
 await expect(page.getByTestId('map-zone-countries')).toBeVisible();
 await expect(page.getByTestId('daily-country-heading')).toContainText('2026-10-19');
 await page.getByRole('button',{name:'시간 직접 선택'}).click();
 await expect(page.getByLabel('시작',{exact:true})).toBeVisible();
 await expect(page.getByLabel('끝',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'T1 본관',exact:true}).click();
 await expect(page.getByRole('button',{name:'T1 본관',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByTestId('airport-month-flights')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

for(const failure of ['unavailable','truncated','unknown-completeness'] as const)test(`국가별 출발 구역은 ${failure} 자료를 0으로 보이지 않음`,async({page})=>{
 await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));
 await page.route('**/api/live/airport-months*',r=>r.fulfill({json:months}));
 await page.route('**/api/live/flights*',r=>failure==='unavailable'?r.fulfill({status:503,json:{status:'UNAVAILABLE'}}):r.fulfill({json:{...flights,truncated:failure==='truncated'?true:undefined}}));
 await page.goto('/ko/airport-countries?mode=zones&date=2026-10-19&building=T2');
 await expect(page.getByRole('status').filter({hasText:'항공편 자료를 확인할 수 없습니다'})).toBeVisible();
 await expect(page.getByTestId('map-zone-countries')).toHaveCount(0);
});
