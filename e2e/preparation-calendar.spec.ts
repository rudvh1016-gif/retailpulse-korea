import {test,expect} from '@playwright/test';
import calendar from '../data/airport-focus-preview/calendar-context.json' with {type:'json'};
import manual from '../data/official-calendar/priority-country-multiyear.json' with {type:'json'};
const today='2026-10-21';
const nationalDay=calendar.events.find(event=>event.country==='KR'&&event.start==='2026-10-03')!;
for(const width of [390,1440])test(`reviewed adjusted rest intervals retain their scope ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});
 await page.route('**/api/live/summary*',route=>route.fulfill({json:{mode:'live-summary',todayKst:today,serviceDateKst:today,generatedAt:`${today}T00:00:00Z`,dayRelation:'TODAY',areas:{},airport:{},sources:[]}}));
 await page.route('**/api/airport/calendar',route=>route.fulfill({json:{status:'PARTIAL',events:[...calendar.events.filter(e=>e.country!=='CN'),...manual.events],calendarReplacementScopes:[],sources:[],checkedAt:null}}));
 await page.goto('/ko/airport-prepare',{waitUntil:'domcontentloaded'});
 const month=page.locator('.preparation-month');await expect(month.locator('h3').first()).toHaveText('2026년 10월');
 await expect(async()=>{if((await month.locator('h3').first().innerText()).includes('10월'))await month.getByRole('button',{name:'이전 달',exact:true}).click();await expect(month.locator('h3').first()).toHaveText('2026년 9월',{timeout:500});}).toPass();
 await month.locator('time[datetime="2026-09-25"]').locator('..').click();
 const china=page.locator('.preparation-day-description').filter({has:page.locator('strong').filter({hasText:'중국 · 중추절'})});
 await expect(china).toContainText('전국 조정 휴무 구간');await expect(china).not.toContainText('전국 법정 공휴일');
 await expect(china).toContainText('모든 날짜가 법정 공휴일이라는 뜻은 아닙니다');
 await month.getByRole('button',{name:'다음 달',exact:true}).click();await month.locator('time[datetime="2026-10-01"]').locator('..').click();
 const national=page.locator('.preparation-day-description').filter({has:page.locator('strong').filter({hasText:'중국 · 국경절'})});
 await expect(national).toContainText('보충근무일 2026-09-20, 2026-10-10 (휴일 아님)');
});
for(const width of [320,390,1440])test(`preparation month grid and preserved details ${width}`,async({page},info)=>{
 test.setTimeout(90000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/api/live/summary*',route=>route.fulfill({json:{mode:'live-summary',todayKst:today,serviceDateKst:today,generatedAt:`${today}T00:00:00Z`,dayRelation:'TODAY',areas:{},airport:{},sources:[]}}));
 await page.route('**/api/airport/calendar',route=>route.fulfill({json:{status:'PARTIAL',events:calendar.events,calendarReplacementScopes:[],sources:[],checkedAt:null}}));
 await page.goto('/ko/airport-prepare',{waitUntil:'domcontentloaded'});
 const month=page.locator('.preparation-month'),list=page.locator('.focus-holiday-list');
 await expect(month.getByRole('heading',{name:'2026년 10월'})).toBeVisible();
 // Only the compact filter and event chips receive the owner's requested tint.
 const glass=page.locator('.focus-country-filter > .preparation-country-glass');
 await expect(glass).toHaveCSS('background-color','rgba(255, 255, 255, 0.76)');
 await expect(glass).toHaveCSS('backdrop-filter','blur(12px)');
 await expect(glass).toHaveCSS('border-radius','999px');
 const glassBounds=await glass.boundingBox();expect(glassBounds!.width).toBeLessThanOrEqual(280);expect(glassBounds!.height).toBeGreaterThanOrEqual(44);expect(glassBounds!.height).toBeLessThanOrEqual(48);
 // Match pure-white.spec.ts: transparent layout wrappers inherit the first
 // painted ancestor, which must be opaque white, never an image or tint.
 for(const surface of ['body','main.page-shell','.focus-detail','.preparation-month','.preparation-arrival-link']){
  const painted=await page.locator(surface).first().evaluate(start=>{
   let node:Element|null=start;
   while(node){
    const style=getComputedStyle(node);
    if(style.backgroundImage!=='none')return `image:${style.backgroundImage}`;
    if(!['rgba(0, 0, 0, 0)','transparent'].includes(style.backgroundColor))return style.backgroundColor;
    node=node.parentElement;
   }
   return 'unpainted';
  });
  expect(painted,`${surface} first painted background`).toBe('rgb(255, 255, 255)');
 }
 await expect(month.locator('.preparation-event-chip[data-country="KR"]').first()).toHaveCSS('background-color','rgb(255, 240, 223)');
 await expect(month.locator('.preparation-event-chip:not([data-country="KR"])').first()).toHaveCSS('background-color','rgb(241, 244, 247)');
 await expect(month.locator('.preparation-event-chip[data-country="KR"]')).toHaveCount(3);
 await expect(month.locator('[aria-current="date"] time')).toHaveText('21');
 await expect(list).toContainText('띠딘쥣 연휴');await expect(list).toContainText('성탄절');
 await page.locator('.focus-country-filter select').selectOption('한국');
 await expect(list).toContainText('성탄절');await expect(list).not.toContainText('미얀마');
 await month.getByRole('button',{name:'10월 3일,',exact:false}).click();
 const detail=page.locator('#preparation-day-details');await expect(detail).toContainText('개천절');await expect(detail).toContainText(`공식 자료 확인 ${nationalDay.verifiedAt}`);await expect(detail.getByRole('link',{name:'공식 날짜 확인'})).toHaveAttribute('href',nationalDay.sourceURL);
 const next=month.getByRole('button',{name:'다음 달'});await next.focus();await page.keyboard.press('Enter');
 await expect(month.getByRole('heading',{name:'2026년 11월'})).toBeVisible();await expect(detail).toBeHidden();await expect(list).toContainText('성탄절');
 await month.getByRole('button',{name:'오늘',exact:true}).click();await expect(month.getByRole('heading',{name:'2026년 10월'})).toBeVisible();
 await page.locator('.focus-country-filter select').selectOption('all');await next.click();await next.click();
 const christmas=month.getByRole('button',{name:'12월 25일,',exact:false});await expect(christmas.locator('.preparation-event-more')).toBeVisible();await christmas.click();
 await expect(detail).toContainText('한국 · 성탄절');await expect(detail.getByRole('link',{name:'공식 날짜 확인'})).toHaveCount(await detail.locator('.preparation-day-description').count());
 await christmas.click();await expect(detail).toBeHidden();
 for(const control of await month.locator('.preparation-month-navigation button').all()){const box=await control.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath(`preparation-calendar-${width}.png`),fullPage:false});
 const action=page.getByRole('link',{name:'도착국 반입 면세한도 확인하기',exact:false});await expect(action).toHaveAttribute('href','#arrival-allowances');await expect(action.locator('.preparation-arrival-icon')).toHaveCSS('animation-name','none');
 await action.click();await expect(page.locator('#arrival-allowances')).toBeInViewport();expect(errors).toEqual([]);
});
