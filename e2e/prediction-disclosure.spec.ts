import {expect,test} from '@playwright/test';
import {routeSummary,SUMMARY_FIXTURE} from './summary-fixture';

const payload={
 targetDate:'2026-09-01',run:null,
 coverage:{days:28,firstAt:null,latestAt:'2026-08-31T14:00:00+09:00',missingDays:[],dailyHours:[{day:'2026-08-31',hours:12}],
  readiness:{targetDate:'2026-09-01',hours:Array.from({length:24},(_,hour)=>({hour,ready:true,compatible:true,missingWeeks:0,sampleDates:['2026-08-25','2026-08-18']}))}},
 records:[
  {targetAt:'2026-08-31T13:00:00+09:00',predicted:1600,actual:1800,createdAt:'2026-08-30T09:30:00Z',actualAt:'2026-08-31T13:05:00+09:00'},
  {targetAt:'2026-08-31T14:00:00+09:00',predicted:1900,actual:null,createdAt:'2026-08-30T09:30:00Z',actualAt:null},
 ],
};
const labels={ko:'자료·예측 정확도',en:'Data and forecast accuracy',zh:'资料与预测准确度',ja:'資料・予測精度'};
test.use({hasTouch:true});
test.beforeEach(async({page})=>{
 await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/predictions*',routeSummary(payload));
});

for(const [lang,width] of [['ko',320],['ko',390],['ko',430],['en',390],['zh',390],['ja',390]] as const){
 test(`prediction evidence stays compact and keyboard/touch accessible ${lang} ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:900});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`/${lang}/forecast`);
  const history=page.locator('details.prediction-history'),summary=history.locator(':scope > summary');
  await expect(summary).toHaveText(labels[lang]);
  await expect(history).not.toHaveAttribute('open','');
  await expect(history.locator('h2')).not.toBeVisible();
  await expect(page.locator('.prediction-score')).not.toBeVisible();
  await expect(page.locator('.prediction-readiness')).not.toBeVisible();
  await expect(summary).toHaveCSS('color','rgb(17, 17, 17)');
  expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(lang==='ko'){
   await expect(page.locator('.outlook-grid')).toHaveCount(0);
   await summary.scrollIntoViewIfNeeded();
   await page.screenshot({path:info.outputPath(`prediction-closed-${width}.png`)});
  }
  await summary.focus();await page.keyboard.press('Enter');
  await expect(history.locator('h2')).toBeVisible();
  await expect(summary).toBeFocused();
  expect(await summary.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('solid');
  await expect(page.locator('.prediction-score')).toBeVisible();
  await expect(page.locator('.prediction-readiness > summary')).toContainText('24/24');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(lang==='ko'){
   await expect(page.locator('.prediction-score')).toContainText('평균 차이 약 200명');
   await expect(page.locator('.prediction-score')).toContainText('연결 대기 1개 시간');
   await page.screenshot({path:info.outputPath(`prediction-open-${width}.png`)});
  }
  await page.keyboard.press('Space');
  await expect(page.locator('.prediction-score')).not.toBeVisible();
  await summary.tap();
  await expect(page.locator('.prediction-score')).toBeVisible();
  await summary.tap();
  await expect(page.locator('.prediction-score')).not.toBeVisible();
  expect(errors).toEqual([]);
 });
}

test('score link opens async evidence and still works after closing it',async({page})=>{
 let release!:()=>void;
 const ready=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/live/predictions*',async route=>{await ready;await route.fulfill({json:payload});});
 await page.goto('/ko/forecast#prediction-score');
 await expect(page.locator('.prediction-history')).toHaveCount(0);
 release();
 const score=page.locator('#prediction-score'),summary=page.locator('.prediction-history > summary');
 await expect(score).toBeVisible();
 await expect(score).toBeInViewport();
 await summary.click();await expect(score).not.toBeVisible();
 await page.evaluate(()=>{location.hash='';});
 await page.evaluate(()=>{location.hash='prediction-score';});
 await expect(score).toBeVisible();
 await expect(score).toBeInViewport();
});

test('existing Seoul history link reaches the preserved scorecard',async({page})=>{
 await page.goto('/ko/myeongdong');
 await page.locator('.period-outlook-link').click();
 await expect(page).toHaveURL(/\/ko\/forecast\?area=myeongdong#prediction-score$/);
 await expect(page.locator('#prediction-score')).toBeVisible();
 await expect(page.locator('#prediction-score')).toBeInViewport();
});

test('missing coverage does not render an empty disclosure',async({page})=>{
 await page.route('**/api/live/predictions*',routeSummary({...payload,coverage:null,records:[]}));
 await page.goto('/ko/forecast');
 await expect(page.getByText('아직 보유한 관측·예측 비교 기록이 없습니다.',{exact:true})).toBeVisible();
 await expect(page.locator('.prediction-history')).toHaveCount(0);
});
