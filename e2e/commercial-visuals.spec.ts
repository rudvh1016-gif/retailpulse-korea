import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
import type {CategoryActivity} from '../lib/seoul-context';
import type {LiveSummary} from '../app/live-signals';
import {commercialCategoryIcons,commercialCategoryFallback} from '../app/commercial-category-icons';
const labels={ko:{count:'결제 건수',amount:'금액 범위',missing:'미제공'},en:{count:'Payment count',amount:'Amount range',missing:'Not supplied'},zh:{count:'支付笔数',amount:'金额范围',missing:'未提供'},ja:{count:'決済件数',amount:'金額範囲',missing:'未提供'}};
const rows:CategoryActivity[]=[
 {group:'음식·음료',category:'한식',level:'분주한',payments:0,amountMin:0,amountMax:0},
 {group:'음식·음료',category:'일식/중식/양식',level:'한산한',payments:2,amountMin:100,amountMax:300},
 {group:'유통',category:'편의점',level:null,payments:null,amountMin:null,amountMax:null},
 {group:'새 분류',category:'앞으로 공개될 매우 긴 업종 이름과 새 분류',level:'새 등급',payments:5,amountMin:20,amountMax:50},
 {group:'패션·뷰티',category:'의복/의류',level:'보통',payments:20,amountMin:200,amountMax:400},
 {group:'의료',category:'약국',level:'분주한',payments:1,amountMin:null,amountMax:500},
];
for(const lang of ['ko','en','zh','ja'] as const)for(const width of [360,390,430,1280])test(`data-based consumption chart ${lang} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 let categories=rows;
 await page.route('**/api/live/summary*',async route=>{
  const data=structuredClone(SUMMARY_FIXTURE) as LiveSummary;const date=new URL(route.request().url()).searchParams.get('date')??data.todayKst;
  data.serviceDateKst=date;data.dayRelation=date===data.todayKst?'TODAY':'PAST';
  for(const area of Object.values(data.areas))if(area){area.context={commercialAt:`${date}T14:05:00+09:00`,categories,weather:null,retrievedAt:data.generatedAt};}
  await route.fulfill({json:data});
 });
 await page.goto(`/${lang}/myeongdong`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const panel=page.locator('.consumption-categories');const list=panel.locator('.context-category-list');
 await expect(list.locator('li')).toHaveCount(3);
 await expect(panel.locator('.commercial-chart-scale')).toContainText('20');
 const first=list.locator('li').nth(0),second=list.locator('li').nth(1),missing=list.locator('li').nth(2);
 await expect(first.locator('.commercial-value-prism')).toHaveAttribute('data-zero','true');
 await expect(first.locator('.commercial-prism-front')).toHaveCount(0);
 await expect(second.locator('.commercial-value-prism')).toHaveAttribute('data-upper','10');
 await expect(missing).toContainText(labels[lang].missing);await expect(missing.locator('.commercial-value-prism')).toHaveCount(0);
 await panel.getByRole('button',{name:labels[lang].amount,exact:true}).click();
 await expect(second.locator('.commercial-value-prism')).toHaveAttribute('data-lower','20');
 await expect(second.locator('.commercial-value-prism')).toHaveAttribute('data-upper','60');
 const toggle=panel.locator('.context-more .event-list-toggle');await toggle.focus();await page.keyboard.press('Enter');
 await expect(list.locator('li')).toHaveCount(6);await expect(toggle).toHaveAttribute('aria-expanded','true');
 await expect(list).toContainText(rows[3].category);await expect(list.locator('li').nth(5)).toContainText(labels[lang].missing);
 await expect(list.locator('li').nth(5).locator('.commercial-value-prism')).toHaveCount(0);
 const guide=panel.locator('.commercial-method');await expect(guide).not.toHaveAttribute('open','');
 await guide.locator('summary').focus();await page.keyboard.press('Enter');await expect(guide).toHaveAttribute('open','');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 categories=[{...rows[0],payments:40,amountMin:1000,amountMax:2000}];
 await page.goto(`/${lang}/hongdae?date=2026-08-30`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page.locator('.context-category-list li')).toHaveCount(1);
 await expect(page.locator('.commercial-value-prism')).toHaveAttribute('data-upper','100');
 await expect(page.locator('.consumption-categories')).toContainText('08-30');expect(page.url()).toContain('date=2026-08-30');
 categories=[];await page.reload();await expect(page.locator('.commercial-category-empty')).toBeVisible();
 await expect(page.locator('.commercial-value-prism')).toHaveCount(0);expect(errors).toEqual([]);
});

test('consumption values and observation time survive a failed browser refresh',async({page})=>{
 await page.clock.install({time:new Date(SUMMARY_FIXTURE.generatedAt)});
 let fail=false,requests=0;
 await page.route('**/api/live/summary*',route=>{
  requests++;
  if(fail)return route.fulfill({status:503,json:{error:'temporarily unavailable'}});
  const data=structuredClone(SUMMARY_FIXTURE) as LiveSummary;
  data.areas.myeongdong!.context={commercialAt:'2026-08-31T14:05:00+09:00',categories:rows,weather:null,retrievedAt:data.generatedAt};
  return route.fulfill({json:data});
 });
 await page.goto('/ko/myeongdong');await expect(page.locator('.commercial-value-prism').nth(1)).toHaveAttribute('data-upper','10');
 const initialRequests=requests;fail=true;await page.clock.fastForward(301_000);
 await expect(page.getByTestId('summary-refresh-failed')).toBeVisible();expect(requests).toBe(initialRequests+1);
 await expect(page.locator('.consumption-categories')).toContainText('08-31 14:05 KST');
 await expect(page.locator('.commercial-value-prism').nth(1)).toHaveAttribute('data-upper','10');
 await expect(page.locator('.commercial-category-empty')).toHaveCount(0);
});

test('an initial HTTP error leaves no fabricated consumption category values',async({page})=>{
 await page.route('**/api/live/summary*',route=>route.fulfill({status:503,json:{error:'temporarily unavailable'}}));
 await page.goto('/ko/myeongdong');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page.getByRole('status').filter({hasText:'자료를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.'})).toBeVisible();
 await expect(page.locator('.commercial-value-prism')).toHaveCount(0);
});

test('reviewed icons retain exact category keys, load lazily and fail without losing chart data',async({page})=>{
 const published=Object.keys(commercialCategoryIcons).map((category,i)=>({...rows[1],category,payments:i+1}));
 published.push({...rows[1],category:'새 업종',payments:20});
 await page.route('**/api/live/summary*',route=>{
  const data=structuredClone(SUMMARY_FIXTURE) as LiveSummary;
  data.areas.myeongdong!.context={commercialAt:'2026-08-31T14:05:00+09:00',categories:published,weather:null,retrievedAt:data.generatedAt};
  return route.fulfill({json:data});
 });
 await page.goto('/ko/myeongdong');
 await page.locator('.context-more button').click();
 const list=page.locator('.context-category-list');await expect(list.locator('li')).toHaveCount(published.length);
 for(const row of await list.locator('li').all()){
  const icon=row.locator('img');await icon.scrollIntoViewIfNeeded();
  await expect(icon).toHaveAttribute('loading','lazy');await expect(icon).toHaveJSProperty('naturalWidth',64);
 }
 await expect(list.locator('li').last().locator('img')).toHaveAttribute('src',commercialCategoryFallback.src);
 await page.route('**/commercial-icons/korean_food-64.webp',route=>route.abort());
 await page.reload();const first=page.locator('.context-category-list li').first();await first.scrollIntoViewIfNeeded();
 await expect(first.locator('.commercial-category-icon img')).toHaveCount(0);
 await expect(first.locator('.commercial-category-icon svg')).toBeVisible();
 await expect(first.locator('.commercial-value-prism')).toHaveAttribute('data-upper','5');
});
