import {expectDateSelection} from './date-selection';
import { expect, test } from '@playwright/test';
import { SUMMARY_FIXTURE } from './summary-fixture';
import { PREFERENCE_KEY } from '../lib/personal-briefing';

for (const width of [320, 390, 430, 1440]) for (const lang of ['ko', 'en', 'zh', 'ja'] as const) {
 test(`airport selector spacing and shortened rules ${lang} ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));
  await page.route('**/api/live/summary*', async route => {
   const date = new URL(route.request().url()).searchParams.get('date') ?? SUMMARY_FIXTURE.todayKst;
   await route.fulfill({ json: { ...SUMMARY_FIXTURE, serviceDateKst: date, airport: { ...SUMMARY_FIXTURE.airport, serviceDateKst: date } } });
  });
  await page.goto(`/${lang}/airport`);
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  const groups = [
   page.locator('#airport-data-flow'),
   page.locator('.airport-context-nav'),
   page.locator('.airport-date-reserved .date-nav-shortcuts'),
  ];
  for (const [index, group] of groups.entries()) {
   await expect(group).toBeVisible();
   const buttons = group.locator(':scope > button');
   await expect(buttons).toHaveCount([4, 5, 3][index]);
   const boxes = await buttons.evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect();
    return { left: box.left, right: box.right, height: box.height };
   }));
   expect(boxes).toHaveLength([4, 5, 3][index]);
   for (const box of boxes) expect(box.height).toBeGreaterThanOrEqual(44);
   if (width <= 600) {
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].left - boxes[i - 1].right).toBeGreaterThanOrEqual(15.5);
    const row = await group.boundingBox(), parent = await group.evaluate(node => {
     const rect = node.parentElement!.getBoundingClientRect();
     return { left: rect.left, width: rect.width };
    });
    expect(row!.width).toBeLessThanOrEqual(parent.width + 1);
    if (lang === 'ko' && width >= 390) {
     expect(row!.width).toBeLessThan(parent.width - 20);
     expect(row!.x).toBeGreaterThan(parent.left + 10);
    }
   }
  }
  if (width <= 600) {
   const labels = page.locator('.airport-view > .airport-menu-label');
   await expect(labels).toHaveCount(2);
   for (const label of await labels.all()) await expect(label).toHaveCSS('margin-top', '8px');
   await expect(groups[1]).toHaveCSS('min-height', '44px');
   await expect(page.locator('.airport-date-reserved .date-nav')).toHaveCSS('padding-top', '4px');
   await expect(page.locator('.airport-date-reserved .date-nav')).toHaveCSS('padding-bottom', '4px');
  } else {
   await expect(groups[1]).toHaveCSS('min-height', '54px');
   await expect(page.locator('.airport-date-reserved .date-nav')).toHaveCSS('padding-top', '8px');
  }
  const terminal = groups[0].getByRole('tab', { name: 'T1', exact: true });
  await terminal.click(); await expect(terminal).toHaveAttribute('aria-selected', 'true');
  const days = groups[2].locator(':scope > button');
  await days.last().focus(); await page.keyboard.press('Enter');
  await expect(days.last()).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  if (lang === 'ko') await page.screenshot({ path: info.outputPath(`airport-selector-spacing-${width}.png`) });
 });
}
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
   await expect(button).toHaveCSS('border-top-width','0px');
  }
  const selectedColor=await buttons.nth(1).evaluate(el=>getComputedStyle(el).backgroundColor);
  expect(selectedColor).not.toBe('rgb(255, 255, 255)');
  await expect(page.locator('.date-nav-shortcuts')).toHaveCSS('border-top-width','1px');
  await expect(page.locator('.date-nav-shortcuts')).toHaveCSS('background-color','rgb(255, 255, 255)');
  await expect(buttons.nth(0)).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await buttons.nth(2).focus();
  expect(await buttons.nth(2).evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
  await buttons.nth(2).press('Enter');
  await expectDateSelection(page, '2026-09-01');
  await expect(buttons.nth(2)).toHaveAttribute('aria-pressed','true');
  await buttons.nth(1).click();
  await expectDateSelection(page, '2026-08-31');
  await page.locator('.date-nav-picker input').fill('2026-08-30');
  await expect(buttons.nth(0)).toHaveAttribute('aria-pressed','true');
  expect(dates).toContain('2026-09-01');
  expect(dates).toContain('2026-08-30');
  await expect(page.locator('.period-outlook-link')).toHaveAttribute('href',new RegExp(`/${lang}/forecast\\?area=myeongdong#prediction-score$`));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(lang==='ko')await page.screenshot({path:info.outputPath(`date-public-${width}.png`)});
  await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({version:1,role:'manager',location:'myeongdong',terminal:'T2',interests:['weather'],day:'today',selectedDays:['today','yesterday','tomorrow'],analytics:false})),PREFERENCE_KEY);
  await page.goto(`/${lang}`);
  await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
  await page.locator(`:is(.top-nav,.bottom-nav) a[href="/${lang}/airport"]:visible`).click();
  // Root is glance; retain the detailed airport date and touch-target checks after navigation.
  const personal=page.locator('.date-nav-shortcuts button');
  await expect(personal).toHaveCount(3);
  expect((await personal.first().boundingBox())!.height).toBeGreaterThanOrEqual(46);
  expect((await personal.first().boundingBox())!.height).toBeLessThan(52);
  await personal.last().focus();await personal.last().press('Space');
  await expect(personal.last()).toHaveAttribute('aria-pressed','true');
  await expectDateSelection(page, '2026-09-01');
  await expect(page.getByTestId('personal-briefing')).toHaveCount(0);
  expect(JSON.parse((await page.evaluate(key=>localStorage.getItem(key),PREFERENCE_KEY))!)).toMatchObject({terminal:'T2',interests:['weather']});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(lang==='ko')await page.screenshot({path:info.outputPath(`date-personal-${width}.png`)});
 });
}

test('typing a year in the free picker requests only the finished date and adds one history entry', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const dates: string[] = [];
  await page.route('**/api/live/summary*', async route => {
    const date = new URL(route.request().url()).searchParams.get('date') ?? SUMMARY_FIXTURE.todayKst;
    dates.push(date);
    await route.fulfill({ json: { ...SUMMARY_FIXTURE, serviceDateKst: date, airport: { ...SUMMARY_FIXTURE.airport, serviceDateKst: date } } });
  });
  await page.goto('/ko/myeongdong');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  const input = page.locator('.date-nav-picker input[type=date]');
  await expect(input).toHaveValue(SUMMARY_FIXTURE.todayKst);
  // The picker stays unbounded: older stored dates are never blocked.
  await expect(input).not.toHaveAttribute('min');
  await expect(input).not.toHaveAttribute('max');
  const before = dates.length, history = await page.evaluate(() => window.history.length);
  // Chromium commits 0002, 0020 and 0202 while the year is being typed.
  await input.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('2025', { delay: 50 });
  const target = `2025${SUMMARY_FIXTURE.todayKst.slice(4)}`;
  await expect(input).toHaveValue(target);
  await expect(page).toHaveURL(new RegExp(`date=${target}`));
  await expect.poll(() => dates.slice(before)).toEqual([target]);
  expect(await page.evaluate(() => window.history.length)).toBe(history + 1);
});

test('typing a two-digit day or month requests only the finished date, once each', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const dates: string[] = [];
  await page.route('**/api/live/summary*', async route => {
    const date = new URL(route.request().url()).searchParams.get('date') ?? SUMMARY_FIXTURE.todayKst;
    dates.push(date);
    await route.fulfill({ json: { ...SUMMARY_FIXTURE, serviceDateKst: date, airport: { ...SUMMARY_FIXTURE.airport, serviceDateKst: date } } });
  });
  await page.goto('/ko/myeongdong');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  const input = page.locator('.date-nav-picker input[type=date]');
  const [year, month] = SUMMARY_FIXTURE.todayKst.split('-');
  const history = await page.evaluate(() => window.history.length);
  // Chromium commits the 2nd on the way to the 25th.
  let before = dates.length;
  await input.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('25', { delay: 50 });
  const day = `${year}-${month}-25`;
  await expect(input).toHaveValue(day);
  await expect.poll(() => dates.slice(before)).toEqual([day]);
  await expect(page).toHaveURL(new RegExp(`date=${day}`));
  // Enter applies a typed month at once; it passes January on the way to October.
  before = dates.length;
  // The finished day moved the caret on to the year; go back to the month.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.type('10', { delay: 50 });
  await page.keyboard.press('Enter');
  const october = `${year}-10-25`;
  await expect.poll(() => dates.slice(before)).toEqual([october]);
  await expect(input).toHaveValue(october);
  await page.waitForTimeout(1200);
  expect(dates.slice(before)).toEqual([october]);
  expect(await page.evaluate(() => window.history.length)).toBe(history + 2);
});
