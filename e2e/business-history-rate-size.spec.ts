import {test,expect,type Page} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';

async function openHistory(page:Page, width:number, lang='ko') {
 await page.setViewportSize({width,height:900});
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.goto(`/${lang}/business?area=myeongdong`);
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await page.locator('.business-mode [role="tab"]').last().click();
 const metrics=page.locator('.business-history .history-kpis');
 await expect(metrics).toBeVisible();
 return metrics;
}

// A nested ChangeRate span must not pick up the small KPI-label typography.
for(const [lang,width] of [['ko',821],['ko',1024],['ko',1440],['ko',2048],['en',1440],['zh',1440],['ja',1440]] as const) {
 test(`business history change is a primary desktop metric ${lang} ${width}`,async({page},info)=>{
  const metrics=await openHistory(page,width,lang);
  const rate=metrics.locator('strong .change-rate');
  await expect(rate).toHaveText('△ 9%');
  await expect(rate).toHaveCSS('color','rgb(161, 45, 63)');
  const sizes=await metrics.evaluate(el=>{
   const value=el.querySelector('strong .change-rate')!;
   const strong=value.closest('strong')!;
   const style=getComputedStyle(value),primary=getComputedStyle(strong);
   return {rate:parseFloat(style.fontSize),primary:parseFloat(primary.fontSize),weight:style.fontWeight,primaryWeight:primary.fontWeight,spacing:style.letterSpacing,primarySpacing:primary.letterSpacing,
    overflow:Array.from(el.children).some(cell=>cell.scrollWidth>cell.clientWidth+1)};
  });
  expect(sizes.rate).toBeGreaterThanOrEqual(26);
  expect(sizes.rate).toBe(sizes.primary);
  expect(sizes.weight).toBe(sizes.primaryWeight);
  expect(sizes.spacing).toBe(sizes.primarySpacing);
  expect(sizes.overflow).toBe(false);
  await expect(metrics.locator('strong > [role="img"]')).toHaveAccessibleName(new RegExp({ko:'감소',en:'decrease',zh:'下降',ja:'減少'}[lang]));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(lang==='ko'&&width===1440)await metrics.screenshot({path:info.outputPath('desktop-history-kpis.png')});
 });
}

for(const width of [390,820])test(`business history keeps its existing narrow typography ${width}`,async({page})=>{
 const metrics=await openHistory(page,width);
 const styles=await metrics.evaluate(el=>[...el.querySelectorAll('strong,.change-rate')].map(node=>({text:node.textContent,size:getComputedStyle(node).fontSize})));
 expect(styles).toEqual([{text:'14,933명',size:'25px'},{text:'△ 9%',size:'25px'},{text:'△ 9%',size:'10px'},{text:'2026-02',size:'25px'}]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
