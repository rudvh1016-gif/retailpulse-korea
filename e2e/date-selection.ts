import {expect,type Page} from '@playwright/test';
export async function expectDateSelection(page:Page,date:string){
 const trigger=page.getByTestId('date-calendar-trigger');
 if(await trigger.count()){await expect(trigger).toHaveAttribute('data-date',date);await expect(trigger.locator('time')).toHaveAttribute('datetime',date);}
 else await expect(page.locator('.date-nav-picker input[type=date]')).toHaveValue(date);
}
export async function chooseDate(page:Page,date:string){
 const trigger=page.getByTestId('date-calendar-trigger');
 if(await trigger.count()){
  await trigger.click();const dialog=page.getByTestId('date-calendar-dialog');
  await dialog.locator('input[type=month]').fill(date.slice(0,7));await dialog.locator(`button[data-date="${date}"]`).click();await expect(dialog).toHaveCount(0);await expectDateSelection(page,date);
 }else await page.locator('.date-nav-picker input[type=date]').fill(date);
}
