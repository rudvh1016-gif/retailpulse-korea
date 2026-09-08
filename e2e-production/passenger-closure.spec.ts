import { test, expect } from '@playwright/test';
import { PREFERENCE_KEY } from '../lib/personal-briefing';
import { passengerCopy } from '../lib/passenger-copy';
for(const width of [390,1280]) test(`production Seoul and airport truth closure ${width}px`, async({page})=>{
  test.setTimeout(180000);
  await page.setViewportSize({width,height:900});
  await page.addInitScript(key=>localStorage.setItem(key,JSON.stringify({version:1,role:'manager',location:'myeongdong',selectedLocations:['myeongdong','hongdae','seongsu','airport'],terminal:'all',selectedTerminals:['all'],interests:['passengers','weather','events','crowding'],day:'today',selectedDays:['today','tomorrow','yesterday'],analytics:false})),PREFERENCE_KEY);
  await page.goto('/ko');
  for(const area of ['myeongdong','hongdae','seongsu']) {
    await page.locator(`[data-view-location="${area}"]`).click();
    await expect(page.locator('.personal-briefing .area-current-brief, [data-testid="personal-briefing"] .area-current-brief').first()).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`production-visual-results/closure-${area}-${width}.png`,fullPage:false});
  }
  await page.locator('[data-view-location="airport"]').click();
  await expect(page.locator('.airport-current-brief')).toContainText(passengerCopy.today.ko);
  await expect(page.locator('.airport-current-brief')).toContainText(passengerCopy.limitation.ko);
  await page.screenshot({path:`production-visual-results/closure-personal-airport-${width}.png`,fullPage:false});
  await page.goto('/ko/airport');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  for(const terminal of ['T1','T2']) {
    await page.getByRole('tab',{name:terminal,exact:true}).click();
    await expect(page.getByRole('tab',{name:terminal,exact:true})).toHaveAttribute('aria-selected','true');
    await expect(page.locator('.airport-current-brief')).toContainText(passengerCopy.today.ko);
    await expect(page.locator('.airport-current-brief')).toContainText(passengerCopy.limitation.ko);
    await page.screenshot({path:`production-visual-results/closure-${terminal}-${width}.png`,fullPage:false});
  }
  await page.getByRole('button',{name:'내일',exact:true}).click();
  await expect(page.locator('.airport-current-brief')).toContainText(passengerCopy.selected.ko);
  await expect(page.locator('.airport-current-brief')).not.toContainText('전체 공식 예상 출국객');
  await page.screenshot({path:`production-visual-results/closure-tomorrow-${width}.png`,fullPage:false});
  for(const path of ['/ko/more','/ko/about']) {
    await page.goto(path);
    await expect(page.getByText(passengerCopy.limitation.ko,{exact:false}).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('공항 승객에는 내국인과 환승객 등이 포함');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});
