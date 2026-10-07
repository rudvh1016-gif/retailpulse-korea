import {test, expect, type Page} from '@playwright/test';
import {routeSummary, SUMMARY_FIXTURE} from './summary-fixture';

function heatFixture() {
  const summary=structuredClone(SUMMARY_FIXTURE);
  const base=summary.airport.congestion.find(row=>row.terminal==='T2')!;
  const samples=[
    ['DG1_A',6,'6',52,'LIVE'], ['DG1_B',20,'20',45,'LIVE'],
    ['DG1_C',45,'45',44,'LIVE'], ['DG1_D',null,'60+',40,'LIVE'],
    ['DG2_A',80,'80',41,'STALE'], ['DG2_B',null,null,null,'LIVE'],
    ['DG2_C',null,'운영 안 함',null,'LIVE'], ['DG2_D',0,'0',0,'LIVE'],
  ];
  const rows=samples.map(([zone,waitTimeMinutes,waitTimeRaw,waitingCount,freshness])=>Object.assign({...base},{zone,waitTimeMinutes,waitTimeRaw,waitingCount,freshness}));
  summary.airport.congestion=[...summary.airport.congestion.filter(row=>row.terminal==='T1'),...rows];
  summary.airport.currentBusiestDepartureHallByTerminal.T2=rows[3];
  return summary;
}

async function open(page: Page, width=1280, lang='ko', reducedMotion:'reduce'|'no-preference'='reduce') {
  await page.setViewportSize({width,height:1000});
  await page.clock.setFixedTime(new Date('2026-08-31T14:10:00+09:00'));
  await page.emulateMedia({reducedMotion});
  await page.route('**/api/live/summary**',routeSummary(heatFixture()));
  await page.goto(`/${lang}/airport?terminal=T2`);
  const section=page.locator('.airport-checkpoints');
  await expect(section.locator('article')).toHaveCount(3);
  await section.getByRole('button').click();
  await expect(section.locator('article')).toHaveCount(8);
  return section;
}

for(const width of [320,390,430,1280]) test(`heat categories and original values/layout at ${width}px`,async({page})=>{
  const section=await open(page,width);
  const card=(zone:string)=>section.locator('article').filter({has:page.getByText(`출국장 ${zone}`,{exact:true})});
  for(const [zone,level] of [['1A','clear'],['1B','normal'],['1C','busy'],['1D','very-busy'],['2A','neutral'],['2B','neutral'],['2C','neutral'],['2D','clear']]) {
    await expect(card(zone).locator('.airport-queue-scene')).toHaveAttribute('data-heat',level);
  }
  await expect(card('1A')).toContainText('6분'); await expect(card('1A')).toContainText('52명');
  await expect(card('1D')).toContainText('60+분'); await expect(card('1D')).toContainText('14:06');
  await expect(card('2A')).toContainText('오래된 관측');
  await expect(card('2B')).toContainText('대기시간 미확인');
  await expect(card('2C').locator('.airport-queue-state')).toHaveText('운영 안 함');
  await expect(card('2C').locator('b')).not.toContainText('운영 안 함분');
  await expect(card('2D')).toContainText('0분'); await expect(card('2D')).toContainText('0명');
  const positions=await section.locator('article').evaluateAll(elements=>elements.map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right}}));
  const columns=width>=821?4:2;
  expect(positions.slice(0,columns).every(p=>p.y===positions[0].y)).toBe(true);
  expect(positions.every(p=>p.x>=0&&p.right<=width)).toBe(true);
  expect(await card('1A').locator('strong').evaluate(e=>getComputedStyle(e).fontSize)).toBe('13px');
  expect(await card('1A').locator('b').evaluate(e=>getComputedStyle(e).color)).toBe('rgb(0, 0, 0)');
  await card('1D').scrollIntoViewIfNeeded();
  expect(await section.locator('.airport-queue-heat').evaluateAll(elements=>elements.flatMap(e=>e.getAnimations({subtree:true})).length)).toBe(0);
  await section.screenshot({path:`outputs/queue-heat-${width}.png`,style:'header,.bottom-nav,.airport-context-nav{visibility:hidden!important}'});
  const toggle=section.getByRole('button');await toggle.focus();await page.keyboard.press('Space');
  await expect(section.locator('article')).toHaveCount(3);
  await toggle.click();await toggle.click();await expect(section.locator('article')).toHaveCount(3);
  await page.locator('#airport-data-flow').getByRole('tab',{name:'T1',exact:true}).click();
  await expect(section.locator('.airport-queue-scene')).toHaveCount(2);
  await expect(section.locator('.airport-queue-scene').first()).toHaveAttribute('data-state','unverified');
  await expect(section).toContainText('24분');
});

for(const [lang,label] of [['en','Very busy'],['zh','非常拥挤'],['ja','非常に混雑']]) test(`category text ${lang}`,async({page})=>{
  const section=await open(page,390,lang);
  await expect(section.locator('[data-heat="very-busy"] .airport-queue-state')).toHaveText(label);
});

test('heat is finite, only starts in view, and cancels when offscreen',async({page})=>{
  const section=await open(page,1280,'ko','no-preference');
  // Clicking the disclosure may scroll the section into view. Reload with it initially above the viewport.
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.reload();
  const scene=section.locator('[data-heat="very-busy"]');
  await expect(scene).toHaveCount(1);
  await page.evaluate(()=>window.scrollTo(0,0));
  await expect(scene).not.toHaveAttribute('data-motion','running');
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute('data-motion','running');
  await expect.poll(()=>scene.evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running').length)).toBeGreaterThan(0);
  await page.screenshot({path:'outputs/queue-heat-motion.png'});
  await expect.poll(()=>scene.evaluate(e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),{timeout:4000}).toBe(0);
  await page.evaluate(()=>window.scrollTo(0,0));
  await expect(scene).toHaveAttribute('data-motion','off');
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute('data-motion','off');
});

test('background visibility and runtime reduced-motion changes cancel heat',async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});});
  const section=await open(page,1280,'ko','no-preference');
  const scene=section.locator('[data-heat="very-busy"]');await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute('data-motion','off');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(scene).toHaveAttribute('data-motion','running');
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(scene).toHaveAttribute('data-motion','off');
  expect(await scene.evaluate(e=>e.getAnimations({subtree:true}).length)).toBe(0);
});

test('a LIVE response ages to neutral without inventing a new observation',async({page})=>{
  const section=await open(page);
  const aged=heatFixture();aged.generatedAt='2026-08-31T14:27:00+09:00';
  // routeSummary fixes browser time to generatedAt, so advance that reference only.
  await page.unroute('**/api/live/summary**');
  await page.route('**/api/live/summary**',routeSummary(aged));
  await page.reload();
  await expect(section.locator('article')).toHaveCount(0);
  await expect(section).toContainText('비교할 최신 대기시간이 없습니다');
  await section.getByRole('button').click();
  await expect(section.locator('[data-heat="very-busy"]')).toHaveCount(0);
  await expect(section.locator('[data-state="stale"]')).toHaveCount(7);
  await expect(section).toContainText('14:06');
  await expect(section).toContainText('60+분');
});
