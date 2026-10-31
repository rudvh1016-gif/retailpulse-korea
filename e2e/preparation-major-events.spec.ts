import {test,expect} from '@playwright/test';
import reviewed from '../data/reviewed-major-events.json' with {type:'json'};
const today='2026-10-30';
for(const width of [390,1440])test(`reviewed major events keep exact scope, dates and source after filter and repeated month navigation ${width}`,async({page},info)=>{
 test.setTimeout(90000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width,height:1000});
 await page.route('**/api/live/summary*',route=>route.fulfill({json:{mode:'live-summary',todayKst:today,serviceDateKst:today,generatedAt:`${today}T00:00:00Z`,dayRelation:'TODAY',areas:{},airport:{},sources:[]}}));
 // New reviewed events remain available when the unrelated holiday API fails.
 await page.route('**/api/airport/calendar',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.goto('/ko/airport-prepare',{waitUntil:'domcontentloaded'});
 const month=page.locator('.preparation-month'),detail=page.locator('#preparation-day-details'),filter=page.locator('.focus-country-filter select');
 await expect(month.locator('h3').first()).toHaveText('2026년 10월');
 await expect(async()=>{if((await month.locator('h3').first().innerText()).includes('10월'))await month.getByRole('button',{name:'다음 달',exact:true}).click();await expect(month.locator('h3').first()).toHaveText('2026년 11월',{timeout:500});}).toPass();
 await filter.selectOption('네팔');await month.locator('time[datetime="2026-11-11"]').locator('..').click();
 await expect(detail).toContainText('락슈미 푸자부터 바이티카 다음 날까지 이어지는 티하르 휴가입니다'.replace(/입니다$/,''));
 await expect(detail).not.toContainText('2083년 공식 관보');await expect(detail).not.toContainText('BS/AD');await expect(detail).not.toContainText('카르틱');
 const nepalSource=detail.locator('details');await expect(nepalSource).not.toHaveAttribute('open','');
 await nepalSource.locator('summary').click();await expect(nepalSource).toContainText('민간 전체 휴무는 별도 미확인');
 for(const id of ['KR-2026-11-19-csat','CN-SH-2026-11-05-ciie','US-2026-11-03-general-election']){
  const event=reviewed.events.find(e=>e.id===id)!;
  await filter.selectOption(event.countryLabel);
  const day=month.locator(`time[datetime="${event.start}"]`).locator('..');
  await expect(day).toContainText(event.name);await day.click();
  await expect(detail).toContainText(event.scope);await expect(detail).toContainText(event.description_ko.split(/[.!?]/)[0]);
  const source=detail.locator('details');await expect(source).not.toHaveAttribute('open','');await expect(source.getByRole('link')).toBeHidden();await source.locator('summary').focus();await page.keyboard.press('Enter');await expect(source.getByRole('link')).toBeVisible();
  await expect(detail).toContainText(`공식 자료 확인 ${today}`);
  await expect(detail.getByRole('link',{name:'공식 날짜 확인'})).toHaveAttribute('href',event.sourceURL);
  await expect(page.locator(`#holiday-${event.id}`)).toContainText('적용 대상·공식 출처');
  await day.click();await expect(detail).toBeHidden();await day.click();await expect(detail).toBeVisible();
 }
 await filter.selectOption('all');
 await month.getByRole('button',{name:'다음 달',exact:true}).click();
 await month.getByRole('button',{name:'다음 달',exact:true}).click();
 await expect(month.locator('h3').first()).toHaveText('2027년 1월');await expect(detail).toBeHidden();
 for(const [country,date,name] of [['일본','2027-01-16','2027년도 대학입학 공통테스트'],['대만','2027-01-22','116학년도 학과능력측험(학측)'],['홍콩','2027-01-17','2027 홍콩 마라톤']]){
  await filter.selectOption(country);await month.locator(`time[datetime="${date}"]`).locator('..').click();
  await expect(detail).toContainText(name);await expect(detail).toContainText('2027-01-');
 }
 await month.getByRole('button',{name:'오늘',exact:true}).click();await expect(month.locator('h3').first()).toHaveText('2026년 10월');
 await filter.selectOption('한국');await month.getByRole('button',{name:'다음 달',exact:true}).click();
 await month.locator('time[datetime="2026-11-19"]').locator('..').click();
 await expect(detail).toContainText('2027학년도 대학수학능력시험');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
 await page.screenshot({path:info.outputPath(`major-events-${width}.png`),fullPage:false});
});
