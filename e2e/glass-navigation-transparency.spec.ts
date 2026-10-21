import {test,expect,type Page} from '@playwright/test';
import {routeSummary,SUMMARY_FIXTURE} from './summary-fixture';
import months from './fixtures/airport-focus/months.json' with {type:'json'};
async function open(page:Page){
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/airport-months*',route=>route.fulfill({json:months}));
 await page.goto('/ko/airport-countries');
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
}
for(const colorScheme of ['light','dark'] as const)for(const width of [320,390,430])test(`transparent navigation stays light and legible ${colorScheme} ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:844});await page.emulateMedia({colorScheme,reducedMotion:'reduce'});await open(page);
 const nav=page.locator('.bottom-nav');await expect(nav.locator('a')).toHaveCount(5);
 await expect(nav.locator('a.active')).toHaveCSS('color','rgb(0, 48, 96)');
 await expect(nav.locator('.glass-nav-indicator')).toHaveCSS('background-color','rgba(187, 187, 188, 0.36)');
 const glass=await nav.evaluate(n=>{const s=getComputedStyle(n,'::before');return {background:s.backgroundColor,blur:s.backdropFilter};});
 expect(glass.background).toBe('rgba(255, 255, 255, 0.6)');expect(glass.blur).toBe('blur(24px) saturate(1.1)');
 for(const link of await nav.locator('a').all()){const box=await link.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBe(54);}
 await nav.locator('a.active').focus();await expect(nav.locator('a.active')).toHaveCSS('outline-color','rgb(0, 48, 96)');
 await nav.getByRole('link',{name:'더보기',exact:true}).click();await page.goBack();await page.goForward();await page.goBack();
 await expect(nav.getByRole('link',{name:'국가별 흐름',exact:true})).toHaveAttribute('aria-current','page');
 expect(await page.locator('.glass-nav-indicator').evaluate(n=>n.getAnimations().length)).toBe(0);
 if(width===390)await page.screenshot({path:info.outputPath(`navigation-glass-${colorScheme}.png`)});
});
for(const preference of ['prefers-reduced-transparency','prefers-contrast'])test(`navigation opaque fallback for ${preference}`,async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Emulation.setEmulatedMedia',{features:[{name:preference,value:preference==='prefers-contrast'?'more':'reduce'}]});await open(page);
 const nav=page.locator('.bottom-nav');
 const glass=await nav.evaluate(n=>{const s=getComputedStyle(n,'::before');return {background:s.backgroundColor,blur:s.backdropFilter};});
 expect(glass).toEqual({background:'rgb(244, 244, 246)',blur:'none'});
 await expect(nav.locator('.glass-nav-indicator')).toHaveCSS('background-color','rgb(215, 215, 218)');
 await expect(nav.locator('a.active')).toHaveCSS('color','rgb(0, 48, 96)');
});
test('navigation has an opaque fallback when backdrop support rules are unavailable',async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page);
 // Remove only feature-support branches, exercising the actual base fallback.
 await page.evaluate(()=>{const strip=(sheet:CSSStyleSheet|CSSGroupingRule)=>{for(let i=sheet.cssRules.length-1;i>=0;i--){const rule=sheet.cssRules[i];if(rule instanceof CSSSupportsRule&&rule.conditionText.includes('backdrop-filter'))sheet.deleteRule(i);else if(rule instanceof CSSGroupingRule)strip(rule);}};for(const sheet of document.styleSheets)strip(sheet);});
 expect(await page.locator('.bottom-nav').evaluate(n=>getComputedStyle(n,'::before').backgroundColor)).toBe('rgb(244, 244, 246)');
});
