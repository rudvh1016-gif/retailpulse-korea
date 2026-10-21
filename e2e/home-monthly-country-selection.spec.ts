import {test,expect} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};

// Synthetic ranking variations are test-only. No production or collector writes.
for(const lang of ['ko','en','zh','ja'])for(const width of [390,1440])test(`home monthly ranking uses all countries and preserves gaps · ${lang} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await page.clock.setFixedTime(new Date(summary.generatedAt));
 const fixture=structuredClone(passengerStats);
 for(const [label,count] of [['인도',1_000_000],['인도네시아',950_000],['뉴질랜드',940_000]] as const)fixture.current.ROUTE_COUNTRY_PASSENGERS.rows.find(row=>row.label===label)!.departures=count;
 // No prior month: selection must still work, and history must not become zero.
 fixture.previous.ROUTE_COUNTRY_PASSENGERS.rows=[];
 const requests:string[]=[];
 await page.route('**/api/live/summary*',route=>route.fulfill({json:summary}));
 await page.route('**/api/live/flights*',route=>route.fulfill({json:flights}));
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:months}));
 await page.route('**/api/live/airport-passenger-stats*',route=>{requests.push(new URL(route.request().url()).searchParams.get('month')!);return route.fulfill({json:fixture});});
 await page.goto(`/${lang}?date=2026-10-19`,{waitUntil:'domcontentloaded'});
 const section=page.locator('#focus-country-trends');await section.scrollIntoViewIfNeeded();
 const cards=section.locator('.focus-trend-grid > article');
 await expect(cards.locator('.focus-trend-top h3')).toHaveText(['인도','인도네시아','뉴질랜드']);
 const basis=section.locator('.focus-monthly-selection-basis');await expect(basis).toHaveAttribute('data-month','2026-09');
 if(lang!=='ko')expect(await basis.innerText()).not.toMatch(/[가-힣]/);
 await expect(cards.first().locator('.focus-trend-value')).toContainText('1,000,000');
 const chart=cards.first().locator('.focus-interactive-line-chart');
 await expect(chart.locator('.focus-month-point')).toHaveCount(1);
 const august=chart.locator('button[data-month="2026-08"]');await august.focus();
 await expect(chart.getByRole('tooltip')).toHaveText('8월 · 자료 없음');
 await page.keyboard.press('ArrowRight');await expect(chart.getByRole('tooltip')).toHaveText('9월 · 1,000,000명');
 await expect(chart.getByRole('tooltip')).toHaveCSS('pointer-events','none');
 await expect(chart.getByRole('tooltip')).toHaveCSS('background-color','rgba(255, 255, 255, 0.68)');
 await page.keyboard.press('Escape');await expect(chart.getByRole('tooltip')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(requests.length).toBeLessThanOrEqual(3);expect(new Set(requests).size).toBe(requests.length);
});
