import {expect,type Page} from '@playwright/test';

/** Hold the hidden streamed copy observed in CI beside the real hydrated UI. */
export async function holdPendingAirportStream(page:Page){
 const live=page.locator('.app[data-hydrated="true"] main .airport-view');
 await expect(live).toBeVisible();
 await live.evaluate(view=>{const stream=document.createElement('div');stream.hidden=true;stream.id='S:harness';stream.append(view.cloneNode(true));document.body.prepend(stream);});
 await expect(page.locator('#airport-data-flow')).toHaveCount(2);
 await expect(page.locator('.app[data-hydrated="true"] main #airport-data-flow')).toHaveCount(1);
}
