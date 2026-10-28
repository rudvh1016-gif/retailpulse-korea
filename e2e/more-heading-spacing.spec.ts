import {test,expect} from '@playwright/test';
for(const width of [390,1440])for(const locale of ['ko','en','zh','ja'])test(`More heading compact gap without changing navigation ${locale} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.route('**/api/**',route=>route.fulfill({status:503,json:{error:'fixture unavailable'}}));
 await page.goto(`/${locale}/more`,{waitUntil:'domcontentloaded'});
 const intro=page.locator('.more-view > .view-intro'),heading=intro.locator('h1');
 await expect(heading).toBeVisible();await expect(intro).toHaveCSS('min-height','0px');await expect(intro).toHaveCSS('padding-bottom','16px');
 const gap=await intro.evaluate(node=>node.getBoundingClientRect().bottom-node.querySelector('h1')!.getBoundingClientRect().bottom);
 expect(gap).toBeGreaterThanOrEqual(16);expect(gap).toBeLessThanOrEqual(18);
 const trigger=page.locator('.more-section-links .update-notice-trigger[aria-haspopup="dialog"]');await trigger.focus();await expect(trigger).toBeFocused();await trigger.click();
 await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
