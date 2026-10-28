import {expect,type Page} from '@playwright/test';

/** Hydrating the shared shell does not mean its lazy airport screen is ready. */
export async function waitForRenderedRoute(page:Page,path:string){
 await expect(page.locator('main.page-shell')).toBeVisible();
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 if(new URL(path,'https://koretaildata.com').pathname.endsWith('/airport')){
  await expect(page.locator('.airport-view > .view-intro')).toBeVisible();
  await expect(page.locator('.airport-view > .view-intro h1')).toBeVisible();
  await expect(page.locator('.airport-view .airport-date-reserved .date-nav-shortcuts > button')).toHaveCount(3);
 }
 await page.evaluate(async()=>{await document.fonts.ready;});
}
