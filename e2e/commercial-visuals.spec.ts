import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
import type {CategoryActivity} from '../lib/seoul-context';
import type {LiveSummary} from '../app/live-signals';
import {commercialCategoryIcons} from '../app/commercial-category-icons';
const labels={ko:{amount:'금액 범위',missing:'미제공'},en:{amount:'Amount range',missing:'Not supplied'},zh:{amount:'金额范围',missing:'未提供'},ja:{amount:'金額範囲',missing:'未提供'}};
const rows:CategoryActivity[]=[
 {group:'Dining',category:'한식',level:'분주한',payments:0,amountMin:0,amountMax:0},
 {group:'Dining',category:'일식/중식/양식',level:'한산한',payments:2,amountMin:100,amountMax:300},
 {group:'Retail',category:'편의점',level:null,payments:null,amountMin:null,amountMax:null},
 {group:'New',category:'새 분류의 매우 긴 업종 이름',level:'새 등급',payments:5,amountMin:20,amountMax:50},
 {group:'Fashion',category:'의복/의류',level:'보통',payments:20,amountMin:200,amountMax:400},
 {group:'Health',category:'약국',level:'분주한',payments:1,amountMin:null,amountMax:500},
];
for(const lang of ['ko','en','zh','ja'] as const)for(const width of [360,390,430,1280])test(`data-based consumption chart ${lang} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));let categories=rows;
 await page.route('**/api/live/summary*',async route=>{
  const data=structuredClone(SUMMARY_FIXTURE) as LiveSummary;const date=new URL(route.request().url()).searchParams.get('date')??data.todayKst;
  data.serviceDateKst=date;data.dayRelation=date===data.todayKst?'TODAY':'PAST';
  for(const area of Object.values(data.areas))if(area)area.context={commercialAt:`${date}T14:05:00+09:00`,categories,weather:null,retrievedAt:data.generatedAt};
  await route.fulfill({json:data});
 });
 await page.goto(`/${lang}/myeongdong`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const panel=page.getByTestId('commercial-composition'),cards=panel.locator('.commercial-miniature-card'),details=panel.locator('.commercial-full-details');
 await expect(cards).toHaveCount(6);for(const card of await cards.all())await expect(card).toBeVisible();
 await expect(panel).toHaveAttribute('data-status','missing');await expect(panel.locator('.commercial-share').filter({hasText:'—'})).toHaveCount(6);await expect(details).not.toHaveAttribute('open','');
 await panel.locator('.commercial-miniature-card[data-category="한식"]').click();
 const selected=panel.locator('.commercial-selected');await expect(selected.locator('.commercial-value-prism')).toHaveAttribute('data-zero','true');await expect(selected.locator('.commercial-prism-front')).toHaveCount(0);
 await panel.locator('.commercial-miniature-card[data-category="일식/중식/양식"]').click();await expect(selected.locator('.commercial-value-prism')).toHaveAttribute('data-upper','10');
 await panel.locator('.commercial-miniature-card[data-category="편의점"]').click();await expect(selected).toContainText(labels[lang].missing);await expect(selected.locator('.commercial-value-prism')).toHaveCount(0);
 await details.locator('summary').focus();await page.keyboard.press('Enter');await expect(details).toHaveAttribute('open','');
 const list=details.locator('.context-category-list');await expect(list.locator('li')).toHaveCount(6);await expect(list).toContainText(rows[3].category);
 await details.getByRole('button',{name:labels[lang].amount,exact:true}).click();
 const second=list.locator('li[data-category="일식/중식/양식"]');await expect(second.locator('.commercial-value-prism')).toHaveAttribute('data-lower','20');await expect(second.locator('.commercial-value-prism')).toHaveAttribute('data-upper','60');
 const partial=list.locator('li[data-category="약국"]');await expect(partial).toContainText(labels[lang].missing);await expect(partial.locator('.commercial-value-prism')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 categories=[{...rows[0],payments:40,amountMin:1000,amountMax:2000}];await page.goto(`/${lang}/hongdae?date=2026-08-30`);
 await expect(cards).toHaveCount(1);await expect(panel).toHaveAttribute('data-status','valid');await expect(panel.locator('.commercial-share')).toHaveText('100%');
 await cards.first().click();await expect(selected.locator('.commercial-value-prism')).toHaveAttribute('data-upper','100');await expect(panel).toContainText('08-30');expect(page.url()).toContain('date=2026-08-30');
 categories=[];await page.reload();await expect(page.locator('.commercial-category-empty')).toBeVisible();await expect(cards).toHaveCount(0);await expect(page.locator('.commercial-value-prism')).toHaveCount(0);expect(errors).toEqual([]);
});
test('consumption values and observation time survive a failed browser refresh',async({page})=>{
 await page.clock.install({time:new Date(SUMMARY_FIXTURE.generatedAt)});let fail=false,requests=0;
 await page.route('**/api/live/summary*',route=>{requests++;if(fail)return route.fulfill({status:503,json:{error:'temporarily unavailable'}});const data=structuredClone(SUMMARY_FIXTURE) as LiveSummary;data.areas.myeongdong!.context={commercialAt:'2026-08-31T14:05:00+09:00',categories:rows,weather:null,retrievedAt:data.generatedAt};return route.fulfill({json:data});});
 await page.goto('/ko/myeongdong');await page.locator('.commercial-miniature-card[data-category="일식/중식/양식"]').click();
 await expect(page.locator('.commercial-selected .commercial-value-prism')).toHaveAttribute('data-upper','10');const initialRequests=requests;fail=true;await page.clock.fastForward(301_000);
 await expect(page.getByTestId('summary-refresh-failed')).toBeVisible();expect(requests).toBe(initialRequests+1);await expect(page.locator('.consumption-categories')).toContainText('08-31 14:05 KST');await expect(page.locator('.commercial-selected .commercial-value-prism')).toHaveAttribute('data-upper','10');await expect(page.locator('.commercial-category-empty')).toHaveCount(0);
});
test('an initial HTTP error leaves no fabricated consumption category values',async({page})=>{
 await page.route('**/api/live/summary*',route=>route.fulfill({status:503,json:{error:'temporarily unavailable'}}));await page.goto('/ko/myeongdong');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');await expect(page.getByRole('status').filter({hasText:'자료를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.'})).toBeVisible();await expect(page.locator('.commercial-value-prism')).toHaveCount(0);
});
test('reviewed miniatures and detailed icons fail without losing source data',async({page})=>{
 const published=Object.keys(commercialCategoryIcons).map((category,i)=>({...rows[1],category,payments:i+1}));published.push({...rows[1],category:'새 업종',payments:20});
 await page.route('**/api/live/summary*',route=>{const data=structuredClone(SUMMARY_FIXTURE) as LiveSummary;data.areas.myeongdong!.context={commercialAt:'2026-08-31T14:05:00+09:00',categories:published,weather:null,retrievedAt:data.generatedAt};return route.fulfill({json:data});});
 await page.goto('/ko/myeongdong');const cards=page.locator('.commercial-miniature-card');await expect(cards).toHaveCount(published.length);
 for(const card of await cards.all()){const icon=card.locator('img');await icon.scrollIntoViewIfNeeded();await expect(icon).toHaveAttribute('loading','lazy');expect(await icon.evaluate(async element=>{const im=element as HTMLImageElement,source=new Image();source.src=im.currentSrc;await source.decode();return source.naturalWidth>=im.getBoundingClientRect().width*devicePixelRatio;})).toBe(true);}
 await expect(cards.locator('[src="/commercial-icons/miniatures/fallback-128.webp"]')).toHaveCount(1);
 await page.route('**/commercial-icons/miniatures/korean_food-128.webp',route=>route.abort());await page.route('**/commercial-icons/korean_food-64.webp',route=>route.abort());await page.route('**/commercial-icons/sharp-v1/korean_food-256.webp',route=>route.abort());await page.reload();
 const card=page.locator('.commercial-miniature-card[data-category="한식"]');await card.scrollIntoViewIfNeeded();await expect(card.locator('img')).toHaveAttribute('src','/commercial-icons/miniatures/fallback-128.webp');await card.click();
 const detail=page.locator('.commercial-selected');await expect(detail.locator('.commercial-category-icon img')).toHaveCount(0);await expect(detail.locator('.commercial-category-icon svg')).toBeVisible();await expect(detail.locator('.commercial-value-prism')).toHaveAttribute('data-upper','5');
});
