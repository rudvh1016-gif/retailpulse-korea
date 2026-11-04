import {test,expect} from '@playwright/test';
for(const width of [390,1440])test(`briefing label removal and peer typography live ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.goto('/ko');
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const report=page.locator('.focus-report[data-brief-cards=approved]');await expect(report).toBeVisible();
 await expect(report.getByText('계산 기준',{exact:true})).toHaveCount(0);
 await expect(report.locator('.focus-people-metric details')).toHaveCount(0);
 await expect(report.locator('.focus-brief-parts')).toBeVisible();
 await expect(report.locator('.focus-report-basis,.focus-calculation-evidence')).toHaveCount(0);
 await expect(report).not.toContainText('숫자 비교 기준');
 if(width===390){const people=(await report.locator('.focus-people-metric').boundingBox())!,flightLabel=(await report.locator('.focus-flight-metric>.focus-metric-label').boundingBox())!;expect(flightLabel.y-people.y-people.height).toBeLessThanOrEqual(32);}
 expect(await report.evaluate(node=>node.lastElementChild?.classList.contains('focus-preparation-brief'))).toBe(true);
 const flow=page.locator('.glance-insights[aria-labelledby="airport-staff-briefing-title"]'),reference=flow.locator('.staff-brief-grid>section:first-child>p').first();
 await expect(reference).toBeVisible();
 // Capture one synchronous DOM snapshot: public data may refresh the holiday
 // list between awaits, so a previously enumerated nth locator can disappear.
 const typography=await flow.evaluate(root=>{
  const peer=root.querySelector('.staff-brief-grid>section:first-child>p')!;
  const read=(el:Element)=>{const s=getComputedStyle(el);return {fontFamily:s.fontFamily,fontSize:s.fontSize,lineHeight:s.lineHeight,fontWeight:s.fontWeight};};
  return {reference:read(peer),bodies:[...root.querySelectorAll('.staff-brief-grid>section:nth-child(2) p,.staff-brief-grid>section:nth-child(2) h4')].map(read)};
 });
 expect(typography.bodies.length).toBeGreaterThan(0);
 for(const body of typography.bodies)expect(body).toEqual(typography.reference);
 await page.screenshot({path:info.outputPath(`briefing-polish-${width}.png`),fullPage:true});
});
