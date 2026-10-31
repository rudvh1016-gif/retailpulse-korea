import {test,expect} from '@playwright/test';
import reviewed from '../data/reviewed-major-events.json' with {type:'json'};
const today='2026-10-30';
for(const width of [320,390,1440])test(`tourism dates retain filtered exhibition sport festival and CSAT visibility ${width}`,async({page},info)=>{
 test.setTimeout(90000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width,height:1000});
 await page.route('**/api/live/summary*',route=>route.fulfill({json:{mode:'live-summary',todayKst:today,serviceDateKst:today,generatedAt:`${today}T00:00:00Z`,dayRelation:'TODAY',areas:{},airport:{},sources:[]}}));
 await page.route('**/api/airport/calendar',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.goto('/ko/airport-prepare',{waitUntil:'domcontentloaded'});
 const month=page.locator('.preparation-month'),detail=page.locator('#preparation-day-details'),filter=page.locator('.focus-country-filter select');
 await expect(month.locator('h3').first()).toHaveText('2026년 10월');
 await expect(async()=>{if((await month.locator('h3').first().innerText()).includes('10월'))await month.getByRole('button',{name:'다음 달',exact:true}).click();await expect(month.locator('h3').first()).toHaveText('2026년 11월',{timeout:500});}).toPass();
 const csatDay=month.locator('time[datetime="2026-11-19"]').locator('..');
 await expect(csatDay.locator('.preparation-event-chip[title="2027학년도 대학수학능력시험"] > span').last()).toHaveText('수능');
 await expect(csatDay.locator('.preparation-event-chip[title="2026 라스베이거스 F1 그랑프리"] > span').last()).toHaveText('F1');
 await expect(csatDay.locator('.preparation-event-chip[title="2026 후쿠오카 11월 스모 대회"]')).toHaveCount(0);
 await expect(csatDay).not.toContainText('스모');
 await csatDay.click();
 const rows=detail.locator('.preparation-day-description > strong');
 await expect(detail).toContainText('2026 후쿠오카 11월 스모 대회');
 await expect(detail).toContainText('2026 라스베이거스 F1 그랑프리');
 await expect(detail).toContainText('2027학년도 대학수학능력시험');
 const names=await rows.allTextContents();
 expect(names.indexOf('일본 · 2026 후쿠오카 11월 스모 대회')).toBeLessThan(names.indexOf('미국 · 2026 라스베이거스 F1 그랑프리'));
 expect(names.indexOf('미국 · 2026 라스베이거스 F1 그랑프리')).toBeLessThan(names.indexOf('한국 · 2027학년도 대학수학능력시험'));
 await expect(csatDay).toHaveAccessibleName(new RegExp(`${names.length}개 일정`));
 await expect(csatDay.locator('.preparation-event-more')).toHaveText(`+${names.length-2}`);
 for(const [id,date] of [['CN-GZ-2026-10-31-canton-fair-phase3','2026-11-01'],['JP-FUK-2026-11-08-sumo','2026-11-08'],['TH-PAT-2026-11-27-fireworks','2026-11-27']]){
  const event=reviewed.events.find(e=>e.id===id)!;
  await filter.selectOption(event.countryLabel);
  const day=month.locator(`time[datetime="${date}"]`).locator('..');
  const shortNames:Record<string,string>={'CN':'교역회','JP':'스모','TH':'불꽃축제'};
  const chip=day.locator('.preparation-event-chip').filter({hasText:shortNames[event.country]});
  await expect(chip).toHaveAttribute('title',event.name);await expect(chip.locator('span').last()).toHaveText(shortNames[event.country]);await day.click();
  await expect(detail).toContainText(event.name);
  await expect(detail).toContainText(event.description_ko.split(/[.!?]/)[0]);
  const source=detail.locator('details').filter({hasText:event.scope});
  await expect(source).not.toHaveAttribute('open','');
  await source.locator('summary').focus();await page.keyboard.press('Enter');
  await expect(source).toContainText(event.scope);
  await expect(source.getByRole('link',{name:'공식 날짜 확인'})).toHaveAttribute('href',event.sourceURL);
  for(const condition of event.displayConditions_ko??[])await expect(source).toContainText(condition);
 }
 await filter.selectOption('all');await csatDay.click();await expect(detail).toContainText('2027학년도 대학수학능력시험');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(errors).toEqual([]);
 await page.screenshot({path:info.outputPath(`tourism-events-${width}.png`),fullPage:false});
});

for(const lang of ['ko','zh'] as const)test(`short major labels preserve old election holiday and counts in ${lang}`,async({page})=>{
 await page.setViewportSize({width:390,height:1000});
 await page.route('**/api/live/summary*',route=>route.fulfill({json:{mode:'live-summary',todayKst:today,serviceDateKst:today,generatedAt:`${today}T00:00:00Z`,dayRelation:'TODAY',areas:{},airport:{},sources:[]}}));
 await page.route('**/api/airport/calendar',route=>route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.goto(`/${lang}/airport-prepare`,{waitUntil:'domcontentloaded'});
 const month=page.locator('.preparation-month'),filter=page.locator('.focus-country-filter select'),detail=page.locator('#preparation-day-details');
 await expect(month.locator('h3').first()).toContainText('10');
 await expect(async()=>{if((await month.locator('h3').first().innerText()).includes('10'))await month.getByRole('button',{name:lang==='ko'?'다음 달':'下个月',exact:true}).click();await expect(month.locator('h3').first()).toContainText('11',{timeout:500});}).toPass();
 const cases=lang==='ko'?
  [['한국','2026-11-19','수능','2027학년도 대학수학능력시험'],['미국','2026-11-03','총선','2026년 연방 총선거'],['일본','2026-11-03','문화의 날','문화의 날']]:
  [['한국','2026-11-19','韩国高考','2027学年度韩国大学修学能力考试'],['미국','2026-11-03','大选','2026年美国联邦大选'],['일본','2026-11-03','文化日','文化日']];
 for(const [country,date,shortName,fullName] of cases){
  await filter.selectOption(country);
  const day=month.locator(`time[datetime="${date}"]`).locator('..');
  const chip=day.locator('.preparation-event-chip').filter({hasText:shortName});
  await expect(chip).toHaveAttribute('title',fullName);await expect(chip.locator('span').last()).toHaveText(shortName);
  const accessibleBefore=await day.getAttribute('aria-label');
  await day.click();await expect(detail).toContainText(fullName);await expect(detail).toContainText(date);
  const count=await detail.locator('.preparation-day-description > strong').count();
  expect(accessibleBefore).toContain(`${count}개 일정`); // Preserve the existing day-label wording and actual count in both locales.
  await expect(day).toHaveAttribute('aria-label',accessibleBefore!);
 }
});
