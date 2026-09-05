import { expect,test } from '@playwright/test';
import { routeSummary,SUMMARY_FIXTURE } from './summary-fixture';
test('outlook separates official/reference, shows missing history, and stays usable on mobile',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/predictions*',routeSummary({targetDate:'2026-09-06',run:null,coverage:{days:10,firstAt:'2026-08-27T10:00:00+09:00',latestAt:'2026-09-05T12:00:00+09:00',missingDays:['2026-08-20'],dailyHours:[{day:'2026-09-05',hours:12}]},records:[]}));
 await page.goto('/ko/predictions');
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page.getByRole('heading',{name:'언제 붐빌까요?'})).toBeVisible();
 await expect(page.getByText('비교할 같은 요일 기록을 모으고 있습니다.',{exact:false})).toBeVisible();
 await expect(page.locator('.prediction-history')).toContainText('10일');
 await page.getByText('날짜별 수집 상태',{exact:true}).click();
 await expect(page.locator('.prediction-history')).toContainText('12/24');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 await page.getByRole('button',{name:'홍대',exact:true}).click();
 await expect(page.getByRole('button',{name:'홍대',exact:true})).toHaveAttribute('aria-pressed','true');
});
test('reference forecast reveals contributing dates and later observations',async({page})=>{
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/predictions*',routeSummary({targetDate:'2026-09-06',run:{createdAt:'2026-09-05T09:30:00Z',status:'PRELIMINARY',hours:[{hour:10,value:1600,sampleDates:['2026-08-30','2026-08-23']}],history:{missingDays:[]}},coverage:{days:20,firstAt:null,latestAt:null,missingDays:[],dailyHours:[]},records:[{targetAt:'2026-09-05T10:00:00+09:00',predicted:1600,actual:1800}]}));
 await page.goto('/ko/predictions');
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page.locator('.outlook-value').last()).toContainText('1,600');
 await page.getByText('시간별 예상과 기준 날짜 보기',{exact:true}).click();
 await expect(page.getByText('2026-08-30 · 2026-08-23')).toBeVisible();
 await page.getByText('지난 예상과 실제 관측 비교',{exact:true}).click();
 await expect(page.locator('.prediction-history')).toContainText('관측 1,800');
});
