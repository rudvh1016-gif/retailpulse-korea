import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import {buildCommercialMonth,compareCommercialMonths,publicCommercialMonth} from '../lib/commercial-monthly';
import type {LiveSummary} from '../app/live-signals';
const areas=['myeongdong','seongsu','hongdae','itaewon'] as const;
const monthRows=(month:string,values:number[])=>[{observed_at:`${month}-01T10:10:00+09:00`,payload:JSON.stringify({commercialAt:`${month}-01T10:10:00+09:00`,categories:values.map((payments,i)=>({category:['한식','편의점','여행'][i],group:'fixture',payments,amountMin:10,amountMax:20}))})}];
const comparison=publicCommercialMonth(compareCommercialMonths(buildCommercialMonth(monthRows('2026-08',[50,200,100]),'2026-08','2026-08-30'),buildCommercialMonth(monthRows('2026-07',[100,100,100]),'2026-07','2026-07-31')));
for(const lang of ['ko','en','zh','ja'] as const)test(`owner rate signs and decrease speech ${lang}`,async({page})=>{
 await page.setViewportSize({width:390,height:900});await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/commercial-months*',route=>route.fulfill({json:{status:'READY',area:'myeongdong',month:'2026-08',months:['2026-08'],data:comparison}}));
 await page.goto(`/${lang}/consumption`);
 const decrease=page.locator('[data-category="한식"] .consumption-category-title strong');
 await expect(decrease).toHaveText('△50.0%');await expect(decrease.locator('span')).toHaveAttribute('aria-label',new RegExp({ko:'감소.*역신장',en:'decrease',zh:'下降',ja:'減少'}[lang]));
 await expect(decrease.getByRole('img')).toHaveAccessibleName(new RegExp({ko:'감소.*역신장',en:'decrease',zh:'下降',ja:'減少'}[lang]));
 await expect(page.locator('[data-category="편의점"] .consumption-category-title strong')).toHaveText('+100.0%');
 await expect(page.locator('[data-category="여행"] .consumption-category-title strong')).toHaveText('0%');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
for(const width of [360,390,430,1280])test(`glance agrees with summary at 38 minutes and distinguishes delayed last observations ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 const data=structuredClone(SUMMARY_FIXTURE) as LiveSummary,source=structuredClone(data.areas.myeongdong!);
 const now=Date.parse(data.generatedAt);let age=38;
 await page.route('**/api/live/summary*',route=>{
  const observedAt=new Date(now-age*60_000).toISOString();
  for(const area of areas)data.areas[area]={...structuredClone(source),realtime:{...source.realtime!,observedAt,congestionLevel:3,freshness:age<=40?'LIVE':'STALE'},realtimeForecast:[{targetAt:new Date(now+60*60_000).toISOString(),issuedAt:observedAt,retrievedAt:data.generatedAt,congestionLevel:1,congestionLabel:'여유',populationMin:10,populationMax:20}]};
  return routeSummary(data)(route);
 });
 await page.goto('/ko/where-to');await expect(page.locator('.district-choice-name strong')).toHaveText(Array(4).fill('약간 붐빔'));
 await expect(page.getByTestId('district-last-known')).toHaveCount(0);await expect(page.locator('.comparison-basis')).toContainText('같은 관측시각');
 await expect(page.locator('.district-glance-section').first()).toContainText('여유');
 age=42;await page.reload();await expect(page.locator('.district-choice-name strong')).toHaveText(Array(4).fill('확인 불가'));
 await expect(page.getByTestId('district-last-known')).toHaveCount(4);await expect(page.getByTestId('district-last-known').first()).toContainText('마지막 확인 · 약간 붐빔');
 await expect(page.getByTestId('district-last-known').first()).toContainText('현재 혼잡으로 비교하지 않습니다');
 await expect(page.locator('.district-glance-section').first()).toContainText('덜 붐빌 시간을 비교하지 않습니다');
 await page.getByRole('button',{name:'한산한 곳',exact:true}).click();await expect(page.locator('[data-preference-match="true"]')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(width===390)await page.screenshot({path:info.outputPath('seoul-delay-390.png'),fullPage:true});
});
