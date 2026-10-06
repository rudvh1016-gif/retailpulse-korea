import {test,expect,type Page} from '@playwright/test';
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';

function sample(values:Array<number|string>=["60+",50,45,40,30,20,10,6]) {
  const cloned=structuredClone(SUMMARY_FIXTURE);
  type QueueRow=Omit<typeof cloned.airport.congestion[number],'waitTimeMinutes'|'waitTimeRaw'|'waitingCount'> & {waitTimeMinutes:number|null;waitTimeRaw:string|null;waitingCount:number|null};
  const summary={...cloned,airport:{...cloned.airport,congestion:cloned.airport.congestion as QueueRow[]}};
  const base=summary.airport.congestion.find(row=>row.terminal==='T2')!;
  const rows=values.map((value,index)=>({...base,zone:`DG${index<4?1:2}_${'ABCD'[index%4]}`,waitTimeRaw:String(value),waitTimeMinutes:typeof value==='number'?value:null,waitingCount:100-index}));
  summary.airport.congestion=[...summary.airport.congestion.filter(row=>row.terminal==='T1'),...rows];
  return summary;
}
async function open(page:Page,summary=sample(),lang='ko',width=390) {
  await page.setViewportSize({width,height:950});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('**/api/live/summary**',routeSummary(summary));
  await page.goto(`/${lang}/airport?terminal=T2`);
  return page.locator('.airport-checkpoints');
}

for(const width of [320,390,430,1280]) for(const lang of ['ko','en','zh','ja']) test(`three representative cards fit one row: ${lang} ${width}`,async({page})=>{
  const section=await open(page,sample(),lang,width),cards=section.locator('article');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText('1A');await expect(cards.nth(1)).toContainText('1D');await expect(cards.nth(2)).toContainText('2D');
  await expect(cards.nth(0).locator('b')).toContainText('60+');await expect(cards.nth(1).locator('b')).toContainText('40');await expect(cards.nth(2).locator('b')).toContainText('6');
  await expect(cards.nth(1).locator('p')).toContainText('97');
  await expect(cards.nth(0)).toContainText('14:06');
  await expect(cards.nth(0).locator('.airport-queue-scene')).toHaveAttribute('data-heat','very-busy');
  await expect(cards.nth(1).locator('.airport-queue-scene')).toHaveAttribute('data-heat','busy');
  await expect(cards.nth(2).locator('.airport-queue-scene')).toHaveAttribute('data-heat','clear');
  await cards.first().scrollIntoViewIfNeeded();
  await expect.poll(()=>cards.locator('img').evaluateAll(elements=>elements.every(e=>(e as HTMLImageElement).complete&&(e as HTMLImageElement).naturalWidth>0))).toBe(true);
  const positions=await cards.evaluateAll(elements=>elements.map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,overflow:e.scrollWidth>e.clientWidth+1};}));
  expect(positions.every(p=>p.y===positions[0].y&&p.x>=0&&p.right<=width&&!p.overflow)).toBe(true);
  expect(await section.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
  expect(await cards.first().locator('strong').evaluate(e=>getComputedStyle(e).fontSize)).toBe('13px');
  expect(await cards.first().locator('b').evaluate(e=>getComputedStyle(e).color)).toBe('rgb(0, 0, 0)');
  if(lang==='ko')await section.screenshot({path:`outputs/queue-representatives-${width}.png`,style:'header,.bottom-nav,.airport-context-nav{visibility:hidden!important}'});
  const toggle=section.getByRole('button');await toggle.focus();await page.keyboard.press('Enter');
  await expect(cards).toHaveCount(8);await expect(toggle).toHaveAttribute('aria-expanded','true');
  await toggle.click();await toggle.click();await expect(cards).toHaveCount(8);
  await toggle.focus();await page.keyboard.press('Space');await expect(cards).toHaveCount(3);await expect(toggle).toBeFocused();
});

test('zero warns about unverified operation; closed, stale and missing rows stay in the full list',async({page})=>{
  const summary=sample([60,45,20,0]);
  const base=summary.airport.congestion.find(row=>row.terminal==='T2')!;
  summary.airport.congestion.push({...base,zone:'DG2_A',waitTimeMinutes:99,waitTimeRaw:'99',freshness:'STALE'});
  summary.airport.congestion.push({...base,zone:'DG2_B',waitTimeMinutes:0,waitTimeRaw:'운영 종료'});
  summary.airport.congestion.push({...base,zone:'DG2_C',waitTimeMinutes:null,waitTimeRaw:null});
  const section=await open(page,summary),cards=section.locator('article');
  await expect(cards).toHaveCount(3);await expect(cards.last()).toContainText('0분 표시 · 운영 여부 확인 필요');
  await expect(cards.last().locator('b')).toContainText('0분');
  await expect(section).not.toContainText('바로 입장');
  await expect(section).not.toContainText('2A');await expect(section).not.toContainText('2B');await expect(section).not.toContainText('2C');
  await section.getByRole('button').click();await expect(cards).toHaveCount(7);
  await expect(section).toContainText('99분');await expect(section).toContainText('운영 종료');await expect(section).toContainText('대기시간 미확인');
  await section.screenshot({path:'outputs/queue-representatives-zero-expanded.png',style:'header,.bottom-nav,.airport-context-nav{visibility:hidden!important}'});
});

test('equal observations do not invent differences; partial data keeps only available cards',async({page})=>{
  const section=await open(page,sample([6,6,6,6,6,6,6,6]));
  await expect(section.locator('article')).toHaveCount(3);
  await expect(section.locator('.checkpoint-role').filter({hasText:'동일 대기시간'})).toHaveCount(3);
  await expect(section).toContainText('대기시간 표시가 모두 같습니다');
  await page.locator('#airport-data-flow').getByRole('tab',{name:'T1',exact:true}).click();
  await expect(section.locator('article')).toHaveCount(2);
  await expect(section.locator('.checkpoint-role').filter({hasText:'중간'})).toHaveCount(0);
  await expect(section).toContainText('비교 가능한 출국장만 표시');
});

test('all scope compares just three halls and labels their terminals',async({page})=>{
  await open(page);
  await page.goto('/ko/airport?terminal=all');
  const cards=page.locator('.airport-checkpoints article');await expect(cards).toHaveCount(3);
  for(const card of await cards.all())await expect(card.locator('strong')).toContainText(/T[12]/);
});

test('no eligible readings shows an honest empty comparison while retaining disclosure',async({page})=>{
  const summary=sample([60,0]);
  for(const row of summary.airport.congestion)row.freshness='STALE';
  const section=await open(page,summary);
  await expect(section).toContainText('비교할 최신 대기시간이 없습니다');await expect(section.locator('article')).toHaveCount(0);
  await section.getByRole('button').click();await expect(section.locator('article')).toHaveCount(2);
  await expect(section).toContainText('60분');await expect(section).toContainText('0분 표시');
});
