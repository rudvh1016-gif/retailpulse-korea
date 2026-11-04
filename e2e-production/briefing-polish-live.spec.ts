import {test,expect} from '@playwright/test';
for(const width of [390,1440])test(`briefing label removal and peer typography live ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.goto('/ko');
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const report=page.locator('.focus-report[data-brief-cards=approved]');await expect(report).toBeVisible();
 await expect(report.getByText('계산 기준',{exact:true})).toHaveCount(0);
 await expect(report.locator('.focus-people-metric details')).toHaveCount(0);
 await expect(report.locator('.focus-brief-parts')).toBeVisible();
 const evidence=report.locator('.focus-report-basis'),toggle=evidence.locator('summary');
 await toggle.focus();await page.keyboard.press('Enter');await expect(evidence).toHaveAttribute('open','');
 await expect(evidence).toContainText('중복을 제거한 공식 총출국객 수가 아닙니다.');
 await page.keyboard.press('Space');await expect(evidence).not.toHaveAttribute('open','');
 const flow=page.locator('.glance-insights[aria-labelledby="airport-staff-briefing-title"]'),reference=flow.locator('.staff-brief-grid>section:first-child>p').first();
 await expect(reference).toBeVisible();
 const typography=await reference.evaluate(el=>{const s=getComputedStyle(el);return {fontFamily:s.fontFamily,fontSize:s.fontSize,lineHeight:s.lineHeight,fontWeight:s.fontWeight};});
 for(const item of await flow.locator('.staff-brief-grid>section:nth-child(2) p,.staff-brief-grid>section:nth-child(2) h4').all()){
  for(const [property,value] of Object.entries(typography))expect(await item.evaluate((el,p)=>getComputedStyle(el)[p as keyof CSSStyleDeclaration],property)).toBe(value);
 }
 await page.screenshot({path:info.outputPath(`briefing-polish-${width}.png`),fullPage:true});
});
