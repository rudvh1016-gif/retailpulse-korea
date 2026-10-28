import {test,expect} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import calendar from '../data/airport-focus-preview/calendar-context.json' with {type:'json'};
const sourceNames={ko:'공항 출발 항공편',en:'Airport departure records',zh:'机场出发航班',ja:'空港の出発便記録'};
for(const lang of ['ko','en','zh','ja'] as const)for(const width of [320,1440])test(`guide disclosures, source counts and month selection ${lang} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.clock.setFixedTime(new Date('2026-10-29T03:00:00+09:00'));
 await page.route('**/api/live/summary*',route=>route.fulfill({json:{...summary,todayKst:'2026-10-29',serviceDateKst:'2026-10-29',sources:[{sourceId:'KASI_PUBLIC_HOLIDAYS',status:'ERROR',detail:'failureClass=AUTH',retrievedAt:null},{sourceId:'INCHEON_FLIGHT_DETAIL',status:'ERROR',detail:'failureClass=NETWORK',retrievedAt:null}]}}));
 await page.route('**/api/airport/calendar',route=>route.fulfill({json:{status:'PARTIAL',events:calendar.events,calendarReplacementScopes:[],sources:[],checkedAt:null}}));
 await page.goto(`/${lang}/more`);const guide=page.locator('.site-usage-guide'),items=guide.locator(':scope > details');
 expect(await items.count()).toBe(lang==='ko'?4:3);
 for(const item of await items.all()){
  if(width>=1000)await expect(item).toHaveAttribute('open','');else await expect(item).not.toHaveAttribute('open','');
  const summary=item.locator('summary');await summary.focus();await page.keyboard.press('Enter');
  if(width>=1000)await expect(item).not.toHaveAttribute('open','');else await expect(item).toHaveAttribute('open','');
 }
 const status=page.locator('#collection-status');await expect(status).toContainText('1');await status.locator('summary').click();
 await expect(status.locator('article')).toHaveCount(1);await expect(status.locator('article')).toContainText(sourceNames[lang]);
 await expect(status.locator('article')).not.toContainText(/공휴일 달력|Public holiday calendar|公休历|祝日カレンダー/);
 await page.goto(`/${lang}/airport-prepare`);const month=page.locator('.preparation-month'),picker=month.getByLabel('달력 년월 선택');await expect(picker).toHaveValue('2026-10');
 await picker.fill('2026-11');await expect(month.getByRole('heading',{name:'2026년 11월'})).toBeVisible();
 const exam=month.getByRole('button',{name:/11월 19일,/});await expect(exam).toContainText('주요');await exam.click();const detail=page.locator('#preparation-day-details');
 await expect(detail).toContainText('대학수학능력시험');await expect(detail).toContainText('공휴일 아님');await expect(detail).toContainText('13:10–13:35 KST');await expect(detail).toContainText('개별 항공편 지연');
 await expect(detail.getByRole('link',{name:'공식 날짜 확인 ↗'})).toHaveAttribute('href',/moe\.go\.kr/);await expect(detail.getByRole('link',{name:'항공 운항 조정 근거 ↗'})).toHaveAttribute('href',/korea\.kr/);
 await month.getByRole('button',{name:'11월 15일,',exact:false}).click();await expect(detail).toContainText('코리아 그랜드 페스티벌');await expect(detail).toContainText('참여 여부를 확인');
 await picker.fill('2027-11');await expect(month.getByRole('heading',{name:'2027년 11월'})).toBeVisible();await expect(month.getByRole('button',{name:/11월 19일,/})).not.toContainText('대학수학능력시험');
 expect((await picker.boundingBox())!.height).toBeGreaterThanOrEqual(44);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
