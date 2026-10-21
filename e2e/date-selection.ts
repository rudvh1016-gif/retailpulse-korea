import {expect,type Page} from '@playwright/test';
export async function expectDateSelection(page:Page,date:string){
 // The navigator mounts after its summary arrives. A count before that point
 // incorrectly selects the legacy branch while the compact picker is closed.
 await expect(page.locator('.date-nav')).toBeVisible();
 const compact=page.locator('.airport-view .date-nav');
 if(await compact.count()){await expect(compact).toHaveAttribute('data-selected-date',date);return;}
 await expect(page.locator('.date-nav-picker input[type=date], [data-testid=date-calendar-trigger]')).toBeVisible();
 const trigger=page.getByTestId('date-calendar-trigger');
 if(await trigger.count()){await expect(trigger).toHaveAttribute('data-date',date);await expect(trigger.locator('time')).toHaveAttribute('datetime',date);}
 else await expect(page.locator('.date-nav-picker input[type=date]')).toHaveValue(date);
}
export async function chooseDate(page:Page,date:string){
 await expect(page.locator('.date-nav')).toBeVisible();
 const stored=page.locator('.airport-view .stored-date-picker');
 if(await stored.count() && await stored.getAttribute('open')===null)await stored.locator(':scope > summary').click();
 await expect(page.locator('.date-nav-picker input[type=date], [data-testid=date-calendar-trigger]')).toBeVisible();
 const trigger=page.getByTestId('date-calendar-trigger');
 if(await trigger.count()){
  await trigger.click();const dialog=page.getByTestId('date-calendar-dialog');
  await dialog.locator('input[type=month]').fill(date.slice(0,7));await dialog.locator(`button[data-date="${date}"]`).click();await expect(dialog).toHaveCount(0);await expectDateSelection(page,date);
 }else await page.locator('.date-nav-picker input[type=date]').fill(date);
}
