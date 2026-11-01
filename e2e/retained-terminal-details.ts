import {expect,type Page} from '@playwright/test';
/** The owner removed this duplicate disclosure on phones. Retained numeric/detail
 * assertions below continue on its supported PC surface, after checking absence. */
export async function openRetainedTerminalDetails(page:Page){
 const details=page.locator('.airport-summary-details');
 if((page.viewportSize()?.width??1280)<=600){await expect(details).not.toBeVisible();await page.setViewportSize({width:1280,height:900});}
 await details.locator(':scope > summary').click();
}
