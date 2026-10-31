import {test,expect} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};

// Home now shows checkpoints. Detail history preserves original counts and gaps.
for(const lang of ['ko','en','zh','ja'])for(const width of [390,1440])test(`home replacement preserves country-detail history gaps · ${lang} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await page.clock.setFixedTime(new Date(summary.generatedAt));
 const fixture=structuredClone(passengerStats);fixture.current.ROUTE_COUNTRY_PASSENGERS.rows.find(row=>row.label==='일본')!.departures=1_000_000;fixture.previous.ROUTE_COUNTRY_PASSENGERS.rows=[];
 await page.route('**/api/**',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 for(const [path,json] of [['summary',summary],['flights',flights],['airport-months',months],['airport-passenger-stats',fixture]] as const)await page.route(`**/api/live/${path}*`,route=>route.fulfill({json}));
 await page.goto(`/${lang}?date=2026-10-19`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page.locator('.home-checkpoint-waits')).toHaveCount(1);await expect(page.locator('#focus-country-trends')).toHaveCount(0);
 await page.goto(`/${lang}/airport-countries?mode=passengers&date=2026-10-19`);
 const section=page.locator('#focus-country-trends');await expect(section).toBeVisible();await section.scrollIntoViewIfNeeded();
 const cards=section.locator('.focus-trend-grid > article');await expect(cards).toHaveCount(12);
 const card=cards.first();await expect(card.locator('.focus-trend-top h3')).toHaveText(lang==='zh'?'日本':lang==='en'?'Japan':'일본');await expect(card.locator('.focus-trend-value')).toContainText('1,000,000');
 const chart=card.locator('.focus-interactive-line-chart');await expect(chart.locator('.focus-month-point')).toHaveCount(1);
 await chart.locator('button[data-month="2026-08"]').focus();await expect(chart.getByRole('tooltip')).not.toContainText('0명');await expect(chart.getByRole('tooltip')).toContainText(lang==='zh'?'暂无资料':lang==='en'?'No data':'자료 없음');
 await page.keyboard.press('ArrowRight');await expect(chart.getByRole('tooltip')).toContainText('1,000,000');await page.keyboard.press('Escape');await expect(chart.getByRole('tooltip')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
