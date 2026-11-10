import {test,expect} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};

for(const width of [320,390,1280])test(`next week survives unavailable calendar and passenger APIs ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/**',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*',route=>route.fulfill({json:{...summary,todayKst:'2026-11-10',serviceDateKst:'2026-11-10'}}));
 await page.goto('/ko?date=2026-11-10',{waitUntil:'domcontentloaded'});
 const brief=page.locator('.focus-preparation-brief');
 await expect(brief.locator('h3')).toContainText('11/16 ~ 11/22');
 await expect(brief.locator('.focus-preparation-event')).toHaveCount(2);
 await expect(brief.locator('[data-country="MX"]')).toContainText('혁명기념일 휴일');
 await expect(brief.locator('[data-country="CZ"]')).toContainText('자유·민주주의의 날');
 await expect(brief).not.toContainText('대조하고 있습니다');
 for(const country of ['MX','CZ']){
  const event=brief.locator(`[data-country="${country}"]`),detail=event.locator('details'),toggle=detail.locator('summary');
  await toggle.focus();await page.keyboard.press('Enter');await expect(detail).toHaveAttribute('open','');
  await expect(detail.locator('a')).toHaveAttribute('href',/^https:\/\/(www\.gob\.mx|mzv\.gov\.cz)\//);
  await page.keyboard.press('Enter');await expect(detail).not.toHaveAttribute('open','');
 }
 expect(await brief.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
});

test('an empty future week has a stable explicit state, not a request that never completes',async({page})=>{
 await page.route('**/api/**',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*',route=>route.fulfill({json:{...summary,todayKst:'2028-02-07',serviceDateKst:'2028-02-07'}}));
 await page.goto('/ko?date=2028-02-07',{waitUntil:'domcontentloaded'});
 const brief=page.locator('.focus-preparation-brief');
 await expect(brief.locator('h3')).toContainText('2/14 ~ 2/20');
 await expect(brief).toContainText('등록된 대표 일정이 없습니다');
 await expect(brief).toContainText('모든 국가의 휴일이 없다는 뜻은 아닙니다');
 await expect(brief).not.toHaveAttribute('aria-busy','true');
 await expect(brief.locator('.focus-preparation-event')).toHaveCount(0);
});

test.describe('KST reference date is independent of selected history and device time',()=>{
 test.use({timezoneId:'America/Los_Angeles'});
 test('a historical selection does not rewind next week',async({page})=>{
  await page.clock.setFixedTime(new Date('2026-11-10T08:00:00-08:00'));
  await page.route('**/api/**',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
  await page.route('**/api/live/summary*',route=>route.fulfill({json:{...summary,todayKst:'2026-11-16',serviceDateKst:'2026-11-10'}}));
  await page.goto('/ko?date=2026-11-10',{waitUntil:'domcontentloaded'});
  const brief=page.locator('.focus-preparation-brief');
  await expect(brief.locator('h3')).toContainText('11/23 ~ 11/29');
  await expect(brief.locator('[data-country="MX"]')).toHaveCount(0);
  await expect(brief.locator('[data-country="CZ"]')).toHaveCount(0);
 });
});


for(const unrelatedReplacement of [false,true])test(`successful empty optional calendar keeps reviewed seed (unrelated scope ${unrelatedReplacement})`,async({page})=>{
 await page.route('**/api/**',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*',route=>route.fulfill({json:{...summary,todayKst:'2026-11-10',serviceDateKst:'2026-11-10'}}));
 await page.route('**/api/airport/calendar*',route=>route.fulfill({json:{status:'PARTIAL',events:[],sources:[{country:'SG',status:'STALE',checkedAt:null,lastVerifiedAt:'2026-11-09T00:00:00Z'}],checkedAt:null,
  calendarReplacementScopes:unrelatedReplacement?[{country:'US',year:2026,scope:'institutional'}]:[]}}));
 await page.goto('/ko?date=2026-11-10',{waitUntil:'domcontentloaded'});
 // This source-state sentinel proves React consumed the reply, not merely
 // that initial static seed rendered before the request completed.
 await page.locator('.focus-calendar-deferred').scrollIntoViewIfNeeded();
 const sources=page.locator('.focus-calendar-source-notes');
 await sources.locator('summary').click();
 await expect(sources).toContainText('싱가포르 갱신 지연 (2026-11-09)');
 const brief=page.locator('.focus-preparation-brief');
 await expect(brief.locator('h3')).toContainText('11/16 ~ 11/22');
 await expect(brief.locator('[data-country="MX"]')).toHaveCount(1);
 await expect(brief.locator('[data-country="CZ"]')).toHaveCount(1);
});
