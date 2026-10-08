import {test,expect} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
import {buildCommercialMonth,compareCommercialMonths,publicCommercialMonth} from '../lib/commercial-monthly';
const categoryNames=['한식','일식/중식/양식','제과/커피/패스트푸드','기타요식','할인점/슈퍼마켓','편의점','의복/의류','패션/잡화','스포츠/문화/레저','화장품','약국','유흥','미용서비스','병원','여행'];
const rows=(month:string,multiplier:number)=>[{observed_at:`${month}-01T10:10:00+09:00`,payload:JSON.stringify({commercialAt:`${month}-01T10:10:00+09:00`,categories:categoryNames.map((category,index)=>({category,group:'fixture',payments:index*multiplier,amountMin:100,amountMax:200}))})}];
const current=compareCommercialMonths(buildCommercialMonth(rows('2026-08',2),'2026-08','2026-08-30'),buildCommercialMonth(rows('2026-07',1),'2026-07','2026-07-31'));
for(const lang of ['ko','en','zh','ja'] as const)for(const width of [360,390,430,1280])test(`district and consumption comparisons ${lang} ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/commercial-months*',route=>{const url=new URL(route.request().url());return route.fulfill({json:{status:'READY',area:url.searchParams.get('area'),month:url.searchParams.get('month'),months:['2026-08','2026-07'],calculatedAt:SUMMARY_FIXTURE.generatedAt,data:publicCommercialMonth(current)}});});
 await page.goto(`/${lang}/where-to`);await expect(page.locator('.district-choice')).toHaveCount(4);
 await expect(page.locator('[data-area="myeongdong"] .district-choice-name strong')).toHaveText({ko:'약간 붐빔',en:'Somewhat busy',zh:'略拥挤',ja:'やや混雑'}[lang]);
 await expect(page.locator('.comparison-basis')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.locator('.prediction-view')).toHaveCount(0);await expect(page.locator('.install-app-button')).toHaveCount(1);
 await page.locator('.comparison-details summary').focus();await page.keyboard.press('Enter');await expect(page.locator('.comparison-details')).toHaveAttribute('open','');
 if(width<600){const rows=await page.locator('.bottom-nav a').evaluateAll(links=>links.map(link=>link.getBoundingClientRect().top));expect(new Set(rows).size).toBe(1);}
 if(lang==='ko'){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath(`where-to-${width}.png`)});}
 await page.goto(`/${lang}/consumption`);await expect(page.locator('.consumption-category')).toHaveCount(15);
 await expect(page.locator('.consumption-category-list h2')).toHaveText(categoryNames.slice().sort((a,b)=>a.localeCompare(b,'ko')));
 const zero=page.locator('[data-category="한식"]');await expect(zero.locator('strong')).not.toContainText('100%');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('.consumption-category details summary').first().focus();await page.keyboard.press('Enter');await expect(page.locator('.consumption-category details').first()).toHaveAttribute('open','');
 await expect(page.locator('.install-app-button')).toHaveCount(1);expect(errors).toEqual([]);
 if(lang==='ko'){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath(`consumption-fixture-${width}.png`)});}
});
test('old URL redirects; install remains left of the airport calendar with its full guide',async({page})=>{
 await page.setViewportSize({width:390,height:900});await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.goto('/ko/predictions');await expect(page).toHaveURL(/\/ko\/where-to/);
 await page.goto('/ko/airport');const install=page.locator('.date-nav-tools .install-app-button');await expect(install).toBeVisible();await expect(page.locator('.header-meta .install-app-button')).toHaveCount(0);
 const button=await install.boundingBox(),calendar=await page.locator('.date-nav-tools > :nth-child(2)').boundingBox();expect(button!.height).toBeGreaterThanOrEqual(44);
 expect(button!.x).toBeLessThan(calendar!.x);
 await install.click();await expect(page.locator('.install-modal')).toBeVisible();await page.keyboard.press('Escape');await expect(install).toBeFocused();
});
test('failed monthly request is explicit and can recover without a false zero',async({page})=>{
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));let failed=true;
 await page.route('**/api/live/commercial-months*',route=>route.fulfill({json:failed?{status:'UNAVAILABLE',data:null,months:[]}:{status:'READY',area:'myeongdong',month:'2026-08',months:['2026-08'],data:publicCommercialMonth(current)}}));
 await page.goto('/ko/consumption');await expect(page.locator('.comparison-empty')).toContainText('아직 확인할 수 없습니다');await expect(page.locator('.consumption-category')).toHaveCount(0);
 failed=false;await page.getByRole('button',{name:'다시 확인',exact:true}).click();await expect(page.locator('.consumption-category')).toHaveCount(15);
});
