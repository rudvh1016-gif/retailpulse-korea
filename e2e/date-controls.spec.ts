import { expect, test } from '@playwright/test';
import { SUMMARY_FIXTURE } from './summary-fixture';
import { PREFERENCE_KEY } from '../lib/personal-briefing';
for (const width of [375,390,430,1280]) for (const lang of ['ko','en','zh','ja']) {
 test(`date controls preserve selection and touch targets at ${lang} ${width}`, async ({ page }, info) => {
  await page.setViewportSize({width,height:900});
  // A foreign, deliberately wrong device date must not change server-day labels.
  await page.clock.setFixedTime(new Date('2030-01-01T00:00:00Z'));
  const dates:string[]=[];
  await page.route('**/api/live/summary*',async route=>{
   const date=new URL(route.request().url()).searchParams.get('date')??SUMMARY_FIXTURE.todayKst;
   dates.push(date);
   await route.fulfill({json:{...SUMMARY_FIXTURE,serviceDateKst:date,airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:date}}});
  });
  await page.goto(`/${lang}/myeongdong`);
  const buttons=page.locator('.date-nav-shortcuts button');
  await expect(buttons).toHaveCount(3);
  await expect(buttons.nth(1)).toHaveAttribute('aria-pressed','true');
  await expect(buttons.nth(1).locator('time')).toHaveAttribute('datetime','2026-08-31');
  for (const button of await buttons.all()) {
   expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(48);
   await expect(button).toHaveCSS('border-top-width','1px');
  }
  const selectedColor=await buttons.nth(1).evaluate(el=>getComputedStyle(el).backgroundColor);
  expect(selectedColor).not.toBe('rgb(255, 255, 255)');
  await expect(buttons.nth(0)).toHaveCSS('background-color','rgb(255, 255, 255)');
  await buttons.nth(2).focus();
  expect(await buttons.nth(2).evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
  await buttons.nth(2).press('Enter');
  await expect(page.locator('.date-nav-picker input')).toHaveValue('2026-09-01');
  await expect(buttons.nth(2)).toHaveAttribute('aria-pressed','true');
  await buttons.nth(1).click();
  await expect(page.locator('.date-nav-picker input')).toHaveValue('2026-08-31');
  await page.locator('.date-nav-picker input').fill('2026-08-30');
  await expect(buttons.nth(0)).toHaveAttribute('aria-pressed','true');
  expect(dates).toContain('2026-09-01');
  expect(dates).toContain('2026-08-30');
  await expect(page.locator('.period-outlook-link')).toHaveAttribute('href',new RegExp(`/${lang}/predictions\\?area=myeongdong#prediction-score$`));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(lang==='ko')await page.screenshot({path:info.outputPath(`date-public-${width}.png`)});
  await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({version:1,role:'manager',location:'myeongdong',terminal:'T2',interests:['weather'],day:'today',selectedDays:['today','yesterday','tomorrow'],analytics:false})),PREFERENCE_KEY);
  await page.goto(`/${lang}`);
  const personal=page.locator('.personal-day-switches button');
  await expect(personal).toHaveCount(3);
  expect((await personal.first().boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await personal.last().focus();await personal.last().press('Space');
  await expect(personal.last()).toHaveAttribute('aria-pressed','true');
  await expect(page.getByTestId('personal-briefing')).toContainText('2026-09-01');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(lang==='ko')await page.screenshot({path:info.outputPath(`date-personal-${width}.png`)});
 });
}
