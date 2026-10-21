import {test,expect,type Locator} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';
const material=(target:Locator,pseudo?:string)=>target.evaluate((node,p)=>{const c=getComputedStyle(node,p);return {background:c.backgroundColor,filter:c.backdropFilter,webkit:c.getPropertyValue('-webkit-backdrop-filter'),shadow:c.boxShadow,border:c.borderTopWidth,radius:c.borderRadius};},pseudo);
for(const width of [320,390,820])for(const contrast of ['no-preference','more'] as const)test(`five airport controls match bottom glass ${width} ${contrast}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce',contrast});
 await page.route('**/api/live/summary*',r=>r.fulfill({json:SUMMARY_FIXTURE}));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:{mode:'live-flights',flights:[],truncated:false}}));
 await page.goto('/ko/airport');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const guide=page.getByTestId('departure-guide-entry'),news=page.getByTestId('airport-customs-news-entry');
 const days=page.locator('.airport-view .airport-date-reserved .date-nav-shortcuts > button');
 await expect(days).toHaveCount(3);const nav=page.locator('nav.bottom-nav.glass-nav');await expect(nav).toBeVisible();
 const reference=await material(nav,'::before');
 expect(reference.background).toBe(contrast==='more'?'rgb(244, 244, 246)':'rgba(255, 255, 255, 0.6)');
 for(const target of [guide,news,...await days.all()]){
  await expect(target).toBeVisible();expect(await material(target)).toEqual(reference);
  const box=await target.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width);
 }
 for(const i of [0,2,1]){await days.nth(i).click();await expect(days.nth(i)).toHaveAttribute('aria-pressed','true');await expect(days.nth(i)).toHaveAttribute('aria-current','date');await expect(days.nth(i)).toHaveCSS('font-weight',await days.nth(i).evaluate(n=>getComputedStyle(n).getPropertyValue('--weight-strong').trim()));expect(await days.nth(i).evaluate(n=>getComputedStyle(n,'::after').height)).toBe('2px');expect(await material(days.nth(i))).toEqual(reference);}
 await guide.click();await expect(page.getByTestId('departure-preparation')).toHaveAttribute('open','');await guide.click();await expect(page.getByTestId('departure-preparation')).not.toHaveAttribute('open','');
 await news.focus();await expect(news).toBeFocused();await expect(news).toHaveAttribute('href','/ko/airport-news');
 await expect(page.locator('body')).toHaveCSS('background-color','rgb(255, 255, 255)');await expect(page.locator('.airport-focus-shell').first()).toHaveCSS('background-color','rgb(255, 255, 255)');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await news.click();await expect(page).toHaveURL(/\/ko\/airport-news$/);
});
