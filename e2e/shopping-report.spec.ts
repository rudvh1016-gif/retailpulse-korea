import {readFileSync} from 'node:fs';
import { test, expect } from '@playwright/test';

const storeMix=JSON.parse(readFileSync('data/shopping-briefing-panpan-2026.json','utf8')) as {categories:string[];values:number[][][]};

for(const width of [320,390,600,820,821,1440])test(`all six store mixes open before the relocated monthly choices ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/shopping-report/index.html');
 const stores=page.locator('.store-overview');await expect(stores).toHaveCount(6);
 await expect(stores.locator('details[open]')).toHaveCount(6);
 for(let i=0;i<6;i++){
  const card=stores.nth(i);await expect(card.locator('summary')).toHaveCSS('border-top-width','0px');
  await expect(card.locator('details')).toHaveCSS('border-top-width',width<=820?'0px':'1px');
  await expect(card.locator('.mix-list dt')).toHaveText(storeMix.categories);
  for(const value of await card.locator('.mix-list dd').all())await expect(value).toBeVisible();
  await expect(card.locator('.mix-current')).toHaveText(storeMix.values[8][i].map(value=>value.toFixed(1)+'%'));
 }
 const monthly=page.locator('#store-monthly-view'),detail=page.locator('#store-monthly-detail');
 await expect(monthly).toHaveCount(1);await expect(page.locator('#month-store')).toHaveCount(1);await expect(page.locator('#month-category')).toHaveCount(1);
 expect(await monthly.evaluate(node=>node.previousElementSibling?.classList.contains('caption')&&node.previousElementSibling.previousElementSibling?.classList.contains('store-overview-grid'))).toBe(true);
 expect(await monthly.evaluate(node=>node.nextElementSibling?.matches('.links')&&!!node.nextElementSibling.querySelector('a[href="https://www.data.go.kr/data/15084726/fileData.do"]'))).toBe(true);
 if(width<=820){await expect(detail).not.toHaveAttribute('open');await detail.locator('summary').click();}
 else await expect(detail).toHaveAttribute('open','');
 await expect(page.locator('#month-store option')).toHaveCount(6);await expect(page.locator('#month-category option')).toHaveCount(5);
 await page.locator('#month-category').selectOption('4');
 for(let i=0;i<6;i++){
  await page.locator('#month-store').selectOption(String(i));
  await expect(page.locator('.monthly-row>b')).toHaveText(storeMix.values.map(month=>month[i][4].toFixed(1)+'%'));
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 if(width===390||width===1440){await page.locator('.store-overview-grid').screenshot({path:info.outputPath('all-six-stores.png')});await monthly.screenshot({path:info.outputPath('monthly-after-stores.png')});}
});

test('a store can still be collapsed and its mobile choice survives desktop resizing',async({page})=>{
 await page.setViewportSize({width:390,height:1000});await page.goto('/shopping-report/index.html');
 const first=page.locator('.store-overview details').first();await expect(first).toHaveAttribute('open','');
 await first.locator('summary').click();await expect(first).not.toHaveAttribute('open');
 await page.setViewportSize({width:1440,height:1000});await expect(page.locator('.store-overview details[open]')).toHaveCount(6);
 await page.setViewportSize({width:390,height:1000});await expect(first).not.toHaveAttribute('open');
 await expect(page.locator('.store-overview details[open]')).toHaveCount(5);
 await first.locator('summary').press('Enter');await expect(first).toHaveAttribute('open','');
});

for (const width of [320, 390, 820, 821, 1440]) {
  test(`shopping entry preserves the airport shell at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/ko');
    const entry = page.locator(width <= 820 ? '.shopping-mobile-entry' : '.shopping-desktop-entry');
    await expect(entry).toBeVisible();
    await expect(entry).toHaveText(/외국인은 뭘 살까\?/);
    await expect(page.locator('.bottom-nav a')).toHaveCount(5);
    if (width <= 820) {
      const title = await page.locator('.glance-heading h1').boundingBox();
      const button = await entry.boundingBox();
      expect(button!.x).toBeGreaterThanOrEqual(title!.x + title!.width + 3);
      expect(button!.height).toBeGreaterThanOrEqual(44);
    } else {
      await expect(page.locator('.top-nav a')).toHaveText(['한눈에', '공항현황', '국가별 흐름', '미리 준비', '외국인은 뭘 살까?', '더보기']);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await entry.click();
    await expect(page).toHaveURL(/\/shopping-report\/(?:index\.html)?$/);
    await expect(page.locator('h1')).toHaveText('외국인 쇼핑,무엇을 사고 어디서 샀을까?');
    await expect(page.locator('.store-overview')).toHaveCount(6);
  });
}

test('report keeps all comparisons, monthly choices, source links and reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/shopping-report/index.html');
  await expect(page.locator('h1')).toHaveCSS('color', 'rgb(112, 43, 62)');
  await expect(page.locator('#quarters')).toContainText('74.1%');
  await expect(page.locator('#quarters')).toContainText('+1.2');
  await page.locator('#industry-choice').selectOption('5');
  await expect(page.locator('.index-group:visible')).toContainText('106.2');
  await page.locator('#store-monthly-detail summary').click();
  await page.locator('#month-category').selectOption('0');
  await page.locator('#month-store').selectOption('3');
  await expect(page.locator('#monthly-takeaway')).toContainText('8월 74.0% → 9월 75.5% (+1.5%p)');
  await expect(page.locator('.monthly-row')).toHaveCount(9);
  await expect(page.locator('.mix-list dd:visible')).toHaveCount(30);
  await expect(page.locator('.bar25').first()).toHaveCSS('transform', 'none');
  await expect(page.locator('#source a').first()).toHaveAttribute('href', /bcIdx=311046/);
  expect(errors).toEqual([]);
});

test('desktop detail charts keep a common growth scale and mobile disclosures', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/shopping-report/index.html');
  await expect(page.locator('#retail-detail')).toHaveAttribute('open', '');
  await expect(page.locator('.store-overview details[open]')).toHaveCount(6);
  await expect(page.locator('#store-monthly-detail')).toHaveAttribute('open', '');
  await expect(page.locator('.monthly-desktop-reading')).toContainText('9월 구성비61.4%8월 64.9%8월 대비 변화−3.5%p');
  await expect(page.locator('.mix-comparison:visible')).toHaveCount(30);
  await expect(page.locator('.mix-list dd:visible')).toHaveCount(30);
  await expect(page.locator('.detail-chart b')).toHaveText(['+142.0%', '+48.7%', '+39.9%', '+59.1%', '+33.4%', '+33.0%', '+32.8%']);
  const widths = await page.locator('.detail-bar').evaluateAll(bars => bars.map(bar => parseFloat((bar as HTMLElement).style.width)));
  [142, 48.7, 39.9, 59.1, 33.4, 33, 32.8].forEach((value, i) => expect(widths[i]).toBeCloseTo(value / 150 * 100, 4));
  const bar = page.locator('.detail-bar').first();
  await expect(bar).toHaveCSS('transition-duration', '1.2s');
  await expect(bar).toHaveCSS('transform', 'matrix(0, 0, 0, 1, 0, 0)');
  await bar.scrollIntoViewIfNeeded();
  await expect.poll(() => bar.evaluate(e => new DOMMatrix(getComputedStyle(e).transform).a)).toBeGreaterThan(.99);
  await page.locator('#month-store').selectOption('3');
  await page.locator('#month-category').selectOption('0');
  await expect(page.locator('.monthly-desktop-reading')).toContainText('9월 구성비75.5%8월 74.0%8월 대비 변화+1.5%p');
  await expect(page.locator('.monthly-change').last()).toHaveCSS('font-weight', '700');
  await expect(page.locator('.index-group:visible')).toHaveCSS('border-bottom-width', '0px');
  await expect(page.locator('#retail-detail')).toHaveCSS('border-bottom-width', '0px');
  for (const line of await page.locator('.source-top .survey-facts').all()) await expect(line).toHaveCSS('font-weight', '700');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(bar).toHaveCSS('transition-duration', '0s');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#retail-detail')).not.toHaveAttribute('open');
  await expect(page.locator('.store-overview details[open]')).toHaveCount(6);
  await expect(page.locator('#store-monthly-detail')).not.toHaveAttribute('open');
  await expect(page.locator('.index-group:visible')).toHaveCSS('border-bottom-width', '1px');
  await expect(page.locator('#retail-detail')).toHaveCSS('border-bottom-width', '1px');
  await page.locator('#retail-detail summary').click();
  await expect(page.locator('.detail-copy').first()).toBeVisible();
  await expect(page.locator('.detail-chart').first()).toBeHidden();
});
