import {test,expect} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};
test.use({hasTouch:true,isMobile:true});
for(const lang of ['ko','en','zh','ja'])test(`${lang}: More optional explanations open and close natively while limits remain visible`,async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route('**/api/live/summary*',route=>route.fulfill({json:summary}));
 await page.goto(`/${lang}/more`);
 const guide=page.locator('.site-usage-guide');
 await expect(guide.locator('.site-usage-limit')).toBeVisible();
 await expect(guide.locator('h3')).toHaveCount(1);
 for(const id of ['usage-examples','usage-updates']){
  const details=guide.getByTestId(id),toggle=details.locator('summary');
  await expect(details).not.toHaveAttribute('open','');
  await expect(details.locator(id==='usage-examples'?'dl':'p').first()).toBeHidden();
  await toggle.focus();await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open','');
  await expect(details.locator(id==='usage-examples'?'dl':'p').first()).toBeVisible();
  expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await toggle.focus();await page.keyboard.press('Space');await expect(details).not.toHaveAttribute('open','');
  await toggle.tap();await expect(details).toHaveAttribute('open','');
  await toggle.tap();await expect(details).not.toHaveAttribute('open','');
 }
 await expect(guide.locator('.site-usage-limit')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

for(const lang of ['ko','en','zh','ja'])test(`${lang}: monthly retrospective calendar is optional, with the qualification always visible`,async({page})=>{
 await page.setViewportSize({width:320,height:844});
 await page.clock.setFixedTime(new Date(summary.generatedAt));
 await page.route('**/api/live/summary*',route=>route.fulfill({json:summary}));
 await page.route('**/api/live/flights*',route=>route.fulfill({json:flights}));
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:months}));
 await page.route('**/api/live/airport-passenger-stats*',route=>route.fulfill({json:passengerStats}));
 await page.goto(`/${lang}/airport-countries?date=2026-10-19`);
 const context=page.locator('.focus-trend-context[data-country="CN"] .focus-calendar-context');
 const details=context.getByTestId('monthly-calendar-reference'),toggle=details.locator('summary');
 await expect(toggle).toHaveText(({ko:'비교 시기 참고 일정 · 공식 근거',en:'Comparison-period calendar · official sources',zh:'比较期间日程 · 官方依据',ja:'比較期間の日程・公式根拠'} as Record<string,string>)[lang]);
 await expect(context.locator(':scope > p')).toHaveText('일정 참고 · 증감 원인 단정 불가 · 한국 일정은 출발지 기준');
 await expect(details).not.toHaveAttribute('open','');
 await expect(details.locator('[data-calendar-role]').first()).toBeHidden();
 await toggle.focus();await page.keyboard.press('Enter');
 await expect(details.locator('[data-calendar-role]').first()).toBeVisible();
 await expect(details).toContainText('중국');await expect(details).toContainText('2026-09-25');
 await expect(details.locator('a').first()).toHaveAttribute('href',/^https:\/\//);
 expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 await toggle.tap();await expect(details).not.toHaveAttribute('open','');
 await toggle.tap();await expect(details).toHaveAttribute('open','');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await toggle.focus();await page.keyboard.press('Space');await expect(details).not.toHaveAttribute('open','');
 await expect(context.locator(':scope > p')).toBeVisible();
});
