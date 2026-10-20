import {test,expect} from '@playwright/test';
test.use({storageState:{cookies:[],origins:[]}});
test('Japan reviewed numeric update is shown with notice, but minor alcohol/tobacco restrictions remain',async({page})=>{
 await page.route('**/api/airport/allowance-status',route=>route.fulfill({json:{status:'STORED',cadenceHours:24,countries:[{id:'JP',state:'NUMERIC_VERIFIED',lastCheckedAt:'2026-10-20T00:00:00Z',nextCheckAt:'2026-10-21T00:00:00Z'}],japan:{values:{liquorBottles:4,liquorBottleMl:760,cigarettes:220,perfumeOunces:3},updatedAt:'2026-10-20T00:00:00Z',changedAt:'2026-10-20T00:00:00Z',sourceUrl:'https://www.customs.go.jp/kaigairyoko/menzei.htm'}}}));
 await page.goto('/ko/airport-prepare',{waitUntil:'domcontentloaded'});
 const dialog=page.getByRole('dialog');if(await dialog.isVisible())await dialog.getByRole('button',{name:'닫기',exact:true}).click();
 await page.getByLabel('도착 국가·지역',{exact:true}).selectOption('JP');
 await page.getByLabel('여행·물품 구분',{exact:true}).selectOption('ordinary');await page.getByLabel('나이',{exact:true}).selectOption('adult');
 const section=page.locator('#arrival-allowances');await expect(section).toContainText('[공지] 일본 세관 현행 안내');await expect(section).toContainText('760mL 기준 4병');await expect(section).toContainText('궐련만 220개비');await expect(section).toContainText('3온스, 약 84mL');await expect(section).toContainText('JPY 200,000');
 await page.getByLabel('나이',{exact:true}).selectOption('young');await expect(section).toContainText('20세 미만은 주류 면세가 없습니다.');await expect(section).toContainText('20세 미만은 담배 면세가 없습니다.');await expect(section).not.toContainText('궐련만 220개비');
});
test('unavailable automation keeps the reviewed snapshot with an honest pending status',async({page})=>{
 await page.route('**/api/airport/allowance-status',route=>route.fulfill({json:{status:'UNAVAILABLE',countries:[]}}));await page.goto('/ko/airport-prepare',{waitUntil:'domcontentloaded'});
 const dialog=page.getByRole('dialog');if(await dialog.isVisible())await dialog.getByRole('button',{name:'닫기',exact:true}).click();
 await page.getByLabel('도착 국가·지역',{exact:true}).selectOption('JP');await page.getByLabel('여행·물품 구분',{exact:true}).selectOption('ordinary');await page.getByLabel('나이',{exact:true}).selectOption('adult');
 const section=page.locator('#arrival-allowances');await expect(section).toContainText('760mL 기준 3병');await expect(section).toContainText('자동 확인 기록 대기');await expect(section).not.toContainText('[공지]');
});
