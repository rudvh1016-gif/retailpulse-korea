import {test,expect} from '@playwright/test';
import {chineseText} from '../lib/chinese-ui';
test.use({storageState:{cookies:[],origins:[]}});
// Notices may arrive after navigation; dismiss through the real UI before an obstructed action.
test.beforeEach(async({page})=>{
 await page.addLocatorHandler(page.locator('dialog.update-notice[open]'),async dialog=>{await dialog.locator('.update-notice-close').click();});
});
test('Japan reviewed numeric update is shown with notice, but minor alcohol/tobacco restrictions remain',async({page})=>{
 await page.route('**/api/airport/allowance-status',route=>route.fulfill({json:{status:'STORED',cadenceHours:24,countries:[{id:'JP',state:'NUMERIC_VERIFIED',lastCheckedAt:'2026-10-20T00:00:00Z',nextCheckAt:'2026-10-21T00:00:00Z'}],japan:{values:{liquorBottles:4,liquorBottleMl:760,cigarettes:220,perfumeOunces:3},updatedAt:'2026-10-20T00:00:00Z',changedAt:'2026-10-20T00:00:00Z',sourceUrl:'https://www.customs.go.jp/kaigairyoko/menzei.htm'}}}));
 await page.goto('/ko/airport-prepare',{waitUntil:'domcontentloaded'});
 await page.getByLabel('도착 국가·지역',{exact:true}).selectOption('JP');
 await page.getByLabel('여행·물품 구분',{exact:true}).selectOption('ordinary');await page.getByLabel('나이',{exact:true}).selectOption('adult');
 const section=page.locator('#arrival-allowances');await expect(section).toContainText('[공지] 일본 세관 현행 안내');await expect(section).toContainText('760mL 기준 4병');await expect(section).toContainText('궐련만 220개비');await expect(section).toContainText('3온스, 약 84mL');await expect(section).toContainText('JPY 200,000');
 await page.getByLabel('나이',{exact:true}).selectOption('young');await expect(section).toContainText('20세 미만은 주류 면세가 없습니다.');await expect(section).toContainText('20세 미만은 담배 면세가 없습니다.');await expect(section).not.toContainText('궐련만 220개비');await expect(section.locator('.arrival-result')).not.toContainText('4병');await expect(section.locator('.arrival-result')).toContainText('휴대품·별송품은 합산합니다.');
});

test('reviewed major-country results put declaration actions before product details without extending excluded conditions',async({page})=>{
 await page.route('**/api/airport/allowance-status',route=>route.fulfill({json:{status:'UNAVAILABLE',countries:[]}}));
 await page.goto('/ko/airport-prepare',{waitUntil:'domcontentloaded'});
 const section=page.locator('#arrival-allowances'),actions=section.locator('.arrival-next-actions');
 await page.getByLabel('도착 국가·지역',{exact:true}).selectOption('JP');await page.getByLabel('여행·물품 구분',{exact:true}).selectOption('ordinary');await page.getByLabel('나이',{exact:true}).selectOption('young');
 await expect(actions).toBeVisible();await expect(actions).toContainText('한도 이내여도 입국 물품을 신고');await expect(section.locator('.arrival-result')).not.toContainText('3병');
 await page.getByLabel('나이',{exact:true}).selectOption('child');await expect(actions).toHaveCount(0);
 await page.getByLabel('도착 국가·지역',{exact:true}).selectOption('VN');await page.getByLabel('여행·물품 구분',{exact:true}).selectOption('ordinary');await page.getByLabel('나이',{exact:true}).selectOption('minor');
 await expect(actions).toBeVisible();await expect(actions).toContainText('세관 검사구역을 지나기 전에 신고');await expect(actions).toContainText('만 18세 미만');await expect(section.locator('.arrival-result')).not.toContainText('1.5L');
 await page.getByLabel('여행·물품 구분',{exact:true}).selectOption('special');await expect(actions).toHaveCount(0);
 await page.getByLabel('도착 국가·지역',{exact:true}).selectOption('TH');await page.getByLabel('여행·물품 구분',{exact:true}).selectOption('ordinary');
 await expect(actions).toBeVisible();await expect(actions).toContainText('일반물품 초과');await expect(actions).toContainText('술·담배 초과분은 세관 지정함');
 const alcohol=section.locator('details').filter({has:page.locator('summary').filter({hasText:'주류·담배'})});await alcohol.locator('summary').click();await expect(alcohol).toContainText('면세 적용 연령은 확인한 공식 안내에 명시되지 않았습니다.');
 expect(await actions.evaluate(node=>Boolean(node.compareDocumentPosition(document.querySelector('.arrival-category')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
 await page.getByLabel('여행·물품 구분',{exact:true}).selectOption('gift');await expect(actions).toHaveCount(0);await expect(section.locator('.arrival-condition-guidance')).toContainText('선물은 본인용 한도로 단정하지 않습니다');await expect(section.locator('.arrival-result dl')).toHaveCount(0);
});
test('unavailable automation keeps the reviewed snapshot with an honest pending status',async({page})=>{
 await page.route('**/api/airport/allowance-status',route=>route.fulfill({json:{status:'UNAVAILABLE',countries:[]}}));await page.goto('/ko/airport-prepare',{waitUntil:'domcontentloaded'});
 await page.getByLabel('도착 국가·지역',{exact:true}).selectOption('JP');await page.getByLabel('여행·물품 구분',{exact:true}).selectOption('ordinary');await page.getByLabel('나이',{exact:true}).selectOption('adult');
 const section=page.locator('#arrival-allowances');await expect(section).toContainText('760mL 기준 3병');await expect(section).toContainText('아직 자동 확인 기록이 없어요.');await expect(section).not.toContainText('[공지]');
});

test('small manual review date remains distinct from newer collection attempts and missing evidence',async({page})=>{
 await page.route('**/api/airport/allowance-status',route=>route.fulfill({json:{status:'STORED',countries:[{id:'JP',state:'SOURCE_UNCHANGED',lastCheckedAt:'2026-10-23T00:00:00Z',nextCheckAt:'2026-10-24T00:00:00Z'}]}}));
 await page.goto('/ko/airport-prepare',{waitUntil:'domcontentloaded'});
 for(const [id,date] of [['CN','2026-10-22'],['VN','2026-10-22'],['TH','2026-10-22'],['JP','2026-10-22'],['PH','미확인 · 검토 필요'],['MY','미확인 · 검토 필요']]){
  await page.getByLabel('도착 국가·지역',{exact:true}).selectOption(id);
  const line=page.locator('.arrival-review-date');await expect(line).toBeVisible();await expect(line).toHaveCount(1);await expect(line).toContainText(date==='미확인 · 검토 필요'?'표시 기준 수동 확인일 미확인':`표시 기준 수동 확인 ${date}`);
  expect(await line.evaluate(node=>parseFloat(getComputedStyle(node).fontSize))).toBeLessThanOrEqual(12);expect(await line.evaluate(node=>Boolean(node.compareDocumentPosition(document.querySelector('.arrival-filters')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);await expect(line).not.toContainText('2026-10-23');
 }
});

// Route coverage: English/Chinese use reviewed translations; Japanese retains Korean guidance.
for(const locale of ['ko','en','zh','ja'])test(`${locale}: condition guidance switches without carrying another country's answers`,async({page})=>{
 await page.route('**/api/airport/allowance-status',route=>route.fulfill({json:{status:'STORED',countries:[{id:'CN',state:'CHECK_UNAVAILABLE',accessReviewRequired:true,lastSuccessfulCheckAt:null,lastCheckedAt:'2026-10-21T00:00:00Z',nextCheckAt:'2026-10-22T00:00:00Z'}]}}));
 await page.goto(`/${locale}/airport-prepare`,{waitUntil:'domcontentloaded'});
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const text=(ko:string,zh:string)=>locale==='zh'?zh:locale==='en'?chineseText('en',ko):ko;
 const section=page.locator('#arrival-allowances');await expect(section).toHaveAttribute('lang',locale==='ja'?'ko':locale);
 await section.getByLabel(text('도착 국가·지역','入境国家与地区'),{exact:true}).selectOption('CN');
 for(const [label,value] of [[text('여행·물품 구분','旅行及物品类别'),'ordinary'],[text('통상 거주지 (국적과 다름)','通常居住地（不同于国籍）'),'visitor'],[text('중국 본토 직전 출발지','进入中国大陆前的出发地'),'korea'],[text('나이','年龄'),'adult'],[text('이번 입국을 포함한 15일 이내 중국 본토 입국','包括本次入境在内，15天内进入中国大陆的次数'),'frequent']])await section.getByLabel(label,{exact:true}).selectOption(value);
 await expect(section.locator('.arrival-condition-guidance')).toContainText(text('15일 내 반복 입국','15天内多次入境'));await expect(section.locator('.arrival-condition-guidance')).toContainText(text('적색통로','红色通道'));await expect(section.locator('.arrival-result dl')).toHaveCount(0);
 const conditionDetails=section.locator('.arrival-condition-guidance details');await expect(conditionDetails).toHaveJSProperty('open',false);await expect(conditionDetails.locator('a').first()).toBeHidden();await conditionDetails.locator('summary').click();await expect(conditionDetails.locator('a').first()).toBeVisible();await expect(conditionDetails).toContainText(text('이번 입국을 포함','入境次数包含本次'));
 await expect(section.locator('.arrival-check-status')).toContainText(text('자동 조회 미구성','未配置自动查询'));await section.locator('.arrival-source summary').click();await expect(section.locator('.arrival-source')).toContainText(text('원문을 요청하지 않았습니다','未请求原文'));await expect(section.locator('.arrival-review-date')).toContainText('2026-10-22');
 await section.getByLabel(text('이번 입국을 포함한 15일 이내 중국 본토 입국','包括本次入境在内，15天内进入中国大陆的次数'),{exact:true}).selectOption('normal');await expect(section.locator('.arrival-result')).toContainText('CNY 2,000');
 await section.getByLabel(text('도착 국가·지역','入境国家与地区'),{exact:true}).selectOption('JP');await expect(section.getByLabel(text('여행·물품 구분','旅行及物品类别'),{exact:true})).toHaveValue('');await expect(section.locator('.arrival-result')).toHaveCount(0);
 await section.getByLabel(text('여행·물품 구분','旅行及物品类别'),{exact:true}).selectOption('ordinary');await section.getByLabel(text('나이','年龄'),{exact:true}).selectOption('child');await expect(section.locator('.arrival-condition-guidance')).toContainText(text('본인이 사용할','本人使用'));
 await section.getByLabel(text('도착 국가·지역','入境国家与地区'),{exact:true}).selectOption('VN');await section.getByLabel(text('여행·물품 구분','旅行及物品类别'),{exact:true}).selectOption('ordinary');await section.getByLabel(text('나이','年龄'),{exact:true}).selectOption('minor');await expect(section.locator('.arrival-result')).toContainText('VND 10,000,000');
 await section.getByLabel(text('도착 국가·지역','入境国家与地区'),{exact:true}).selectOption('TH');await section.getByLabel(text('여행·물품 구분','旅行及物品类别'),{exact:true}).selectOption('gift');await expect(section.locator('.arrival-condition-guidance')).toContainText(text('선물은 본인용 한도로 단정하지 않습니다','不直接按本人使用额度判断礼品'));await expect(section.locator('.arrival-result dl')).toHaveCount(0);
});
