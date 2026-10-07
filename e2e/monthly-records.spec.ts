import { test, expect, type Page } from '@playwright/test';
import { recordsFixture } from './monthly-records-fixture';
import { SUMMARY_FIXTURE } from './summary-fixture';
import { recordText } from '../app/monthly-records-copy';
import type { Lang } from '../app/retailpulse-data';
import type { RecordArea } from '../lib/monthly-records';

async function setup(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-06T10:00:00Z'));
  await page.route('**/api/live/summary**',async route=>{
    const url=new URL(route.request().url());
    const data=url.searchParams.get('view')==='records'
      ? recordsFixture((url.searchParams.get('area')??'myeongdong') as RecordArea,url.searchParams.get('month')??'2026-10')
      : {...SUMMARY_FIXTURE,generatedAt:'2026-10-06T10:00:00Z',todayKst:'2026-10-06',serviceDateKst:'2026-10-06'};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
}
for(const lang of ['ko','en','zh','ja'] as Lang[]) for(const width of [320,360,390,430,1280]) {
  test(`records by month, preserved ranges, keyboard and layout: ${lang} ${width}`,async({page})=>{
    await page.setViewportSize({width,height:960}); await setup(page);
    const errors:string[]=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`/${lang}/forecast`);
    const section=page.locator('.monthly-records');
    await expect(page.getByTestId('monthly-records-result')).toBeVisible();
    await expect(page.locator('h1')).toHaveText(recordText('title',lang));
    await expect(page.locator('.insight-now-title, .home-today-brief, .airport-today')).toHaveCount(0);
    await expect(page.getByTestId('record-month-2026-10')).toContainText('27,000–29,000');
    await expect(page.getByTestId('record-month-2026-10')).toContainText('4 / 5');
    await expect(page.getByTestId('record-month-2026-09')).toContainText('28 / 30');
    await expect(section).toContainText('2026-10-05 KST');
    expect(await section.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    expect(await section.locator('h2').evaluate(el=>getComputedStyle(el).color)).toBe('rgb(17, 17, 17)');
    const details=section.locator('details').first(), summary=details.locator('summary');
    await summary.focus(); await page.keyboard.press('Enter'); await expect(details).toHaveAttribute('open','');
    const link=details.getByRole('link'); await expect(link).toHaveAttribute('href','https://data.seoul.go.kr/dataList/OA-21285/A/1/datasetView.do');
    await page.keyboard.press('Space'); await expect(details).not.toHaveAttribute('open','');
    await summary.click(); await summary.click(); await expect(details).not.toHaveAttribute('open','');
    const daily=section.locator('details').nth(1); await daily.locator('summary').click();
    await expect(daily.getByRole('row').filter({has:page.getByRole('rowheader',{name:'10-03'})})).toContainText('23/24');
    await expect(daily.getByRole('row').filter({has:page.getByRole('rowheader',{name:'10-03'})})).toContainText(recordText('partial',lang));
    await expect(daily.getByRole('row').filter({has:page.getByRole('rowheader',{name:'10-06'})})).toContainText(recordText('progress',lang));
    await daily.locator('summary').click();
    await section.getByRole('combobox',{name:recordText('month',lang),exact:true}).selectOption('2026-09');
    await expect(page.getByTestId('record-month-2026-08')).toBeVisible();
    await expect(section).not.toContainText(recordText('pending',lang));
    await section.getByRole('combobox',{name:recordText('area',lang),exact:true}).selectOption('hongdae');
    await expect(page.getByTestId('record-month-2026-09')).toContainText('53,650–55,650');
    expect(await section.locator('.records-chart-dates span').last().evaluate(el=>el.getBoundingClientRect().height)).toBeLessThan(20);
    if(lang==='ko') {
      await page.locator('.insights-view').screenshot({path:`outputs/records-monthly-${width}.png`,style:'.site-header, .bottom-nav { visibility: hidden !important; }'});
      await section.getByRole('combobox',{name:'조회 월',exact:true}).selectOption('2026-10');
      await expect(page.getByTestId('record-month-2026-10')).toContainText('55,000–57,000');
      if(width===390||width===1280) await page.locator('.insights-view').screenshot({path:`outputs/records-current-${width}.png`,style:'.site-header, .bottom-nav { visibility: hidden !important; }'});
    }
    expect(errors).toEqual([]); expect(await page.locator('vite-error-overlay').count()).toBe(0);
  });
}
test('month changes discard a slower earlier response and leave controls usable after failure',async({page})=>{
  await setup(page); let release: (()=>void)|undefined; let failed=false;
  const slow=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/live/summary*view=records*',async route=>{
    const url=new URL(route.request().url()); const month=url.searchParams.get('month')??'2026-10';
    if(month==='2026-09') await slow;
    if(month==='2026-08'&&!failed){failed=true;await route.fulfill({status:503,body:'{}'});return;}
    await route.fulfill({contentType:'application/json',body:JSON.stringify(recordsFixture('myeongdong',month))});
  });
  await page.goto('/ko/forecast'); await expect(page.getByTestId('monthly-records-result')).toBeVisible();
  const month=page.getByRole('combobox',{name:'조회 월',exact:true});
  await month.selectOption('2026-09'); await month.selectOption('2026-08');
  await expect(page.getByRole('status')).toContainText('불러오지 못했습니다'); await expect(month).toBeEnabled();
  await page.getByRole('button',{name:'다시 불러오기'}).click(); await expect(page.getByTestId('record-month-2026-07')).toBeVisible();
  release!(); await expect(month).toHaveValue('2026-08');
  await expect(page.getByTestId('record-month-2026-07')).toBeVisible();
  await expect(page.getByTestId('record-month-2026-09')).toHaveCount(0);
});
test('empty history and older incompatible API payloads stay explicit, with no invented zero',async({page})=>{
  await setup(page); let older=true;
  await page.route('**/api/live/summary*view=records*',async route=>{
    const data=recordsFixture();
    data.current.min=null; data.current.max=null; data.current.includedDays=0; data.change=null;
    data.current.days=data.current.days.map(day=>({...day,hours:0,min:null,max:null,status:'MISSING'}));
    await route.fulfill({contentType:'application/json',body:JSON.stringify(older?SUMMARY_FIXTURE:data)});
  });
  await page.goto('/ko/forecast'); await expect(page.getByRole('status')).toContainText('불러오지 못했습니다');
  older=false; await page.getByRole('button',{name:'다시 불러오기'}).click();
  await expect(page.getByTestId('record-month-2026-10')).toContainText('—');
  await expect(page.getByTestId('record-month-2026-10')).not.toContainText('0–0');
});
test('reduced motion keeps monthly records static and usable',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'}); await setup(page); await page.goto('/ko/forecast');
  await expect(page.getByTestId('monthly-records-result')).toBeVisible();
  expect(await page.locator('.monthly-records').evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
});
