import {test,expect} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengerStats from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};

for(const lang of ['ko','en','zh','ja'])test(`upcoming ${lang}: 320px, keyboard disclosure and preserved evidence`,async({page})=>{
 await page.setViewportSize({width:320,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));
 for(const [path,json] of [['flights',flights],['airport-months',months],['airport-passenger-stats',passengerStats]] as const)await page.route(`**/api/live/${path}*`,r=>r.fulfill({json}));
 await page.route('**/api/airport/calendar*',r=>r.fulfill({json:{status:'UNAVAILABLE',events:[],sources:[],replacementScopes:[]}}));
 await page.route('**/api/live/passenger-reference*',r=>r.fulfill({json:{status:'UNAVAILABLE',data:null}}));
 await page.goto(`/${lang}?date=2026-10-19`,{waitUntil:'domcontentloaded'});
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const brief=page.locator('.focus-preparation-brief');
 await expect(brief.locator('h3')).toHaveCount(2);
 const events=brief.locator('.focus-preparation-event');await expect(events).toHaveCount(4);
 for(const event of await events.all()){
  await expect(event.locator('h4')).toBeVisible();await expect(event.locator('time').first()).toBeVisible();
  await expect(event.locator('.focus-event-country img')).toHaveAttribute('alt','');
  const detail=event.locator('details'),toggle=detail.locator('summary');
  expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  if(lang==='ja')await expect(toggle).toHaveText('日程の詳細');
  await expect(detail).not.toHaveAttribute('open','');await expect(detail.locator('.focus-holiday-gloss')).not.toBeVisible();
  await toggle.focus();await page.keyboard.press('Enter');await expect(detail).toHaveAttribute('open','');
  await expect(detail.locator('.focus-holiday-gloss')).toBeVisible();await expect(detail.locator('a')).toHaveAttribute('href',/^https:\/\//);
  expect(await brief.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await toggle.focus();await page.keyboard.press('Space');await expect(detail).not.toHaveAttribute('open','');
  // A second open/close must leave the same native focus target and content intact.
  await page.keyboard.press('Enter');await expect(detail).toHaveAttribute('open','');
  await page.keyboard.press('Enter');await expect(detail).not.toHaveAttribute('open','');await expect(toggle).toBeFocused();
 }
 const turkey=brief.locator('[data-country="TR"]');
 if(await turkey.count())await expect(turkey.locator('.focus-event-timing')).toContainText('10/28');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 if(lang==='en'||lang==='zh')expect(await brief.textContent()).not.toMatch(/[가-힣]/);
});
