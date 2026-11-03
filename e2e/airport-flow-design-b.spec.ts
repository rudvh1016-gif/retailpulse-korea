import {test,expect,type Page} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
// The overview deliberately refuses to label a historical selection as live.
// Match the server's actual KST date; freeze time only within that same day.
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),at=date+'T01:00:00Z';
async function data(page:Page,raw='17',fresh=true){
 await page.clock.setFixedTime(new Date(at));
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*',r=>r.fulfill({json:{...summary,todayKst:date,serviceDateKst:date,dayRelation:'TODAY',generatedAt:at,airport:{...summary.airport,serviceDateKst:date,congestion:[{terminal:'T2',zone:'DG1_A',waitTimeMinutes:Number.parseInt(raw),waitTimeRaw:raw,observedAt:fresh?at:date+'T00:00:00Z',freshness:fresh?'LIVE':'STALE'}]}}}));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:flights}));
 await page.route('**/api/live/airport-months*',r=>r.fulfill({json:months}));
}
for(const width of [320,390,430,700,701,1440])test(`B wait highlight is mobile only and keeps real values and links ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});await data(page);
 await page.goto('/ko?date='+date);
 const flow=page.getByRole('region',{name:'주목할 공항 흐름',exact:true}),wait=flow.getByTestId('glance-key-wait');
 await expect(wait).toContainText('T2 출국장 1A');await expect(wait.locator('.flow-wait-number')).toHaveText('17');
 await expect(wait).toContainText('10:00 KST');await expect(wait).toHaveAttribute('href',/#airport-checkpoints-title$/);
 await expect(flow.getByTestId('glance-key-upcoming')).toHaveAttribute('href',/#airport-departure-model-slot$/);
 await expect(flow.locator('.staff-brief-grid>section')).toHaveCount(2);
 const waitNumber=wait.locator('.flow-wait-number');
 if(width<=700){
  await expect(wait).toHaveCSS('background-color','rgb(24, 60, 103)');await expect(waitNumber).toHaveCSS('font-size','40px');
  await expect(waitNumber).toHaveCSS('color','rgb(255, 255, 255)');
  await expect(wait.locator('.flow-wait-unit')).toHaveCSS('font-size','14px');
  const number=(await waitNumber.boundingBox())!,location=(await wait.locator('.flow-wait-location').boundingBox())!;
  expect(number.y+number.height).toBeLessThanOrEqual(location.y+1);
  for(const title of await flow.locator('a:not([data-testid="glance-key-wait"])>.airport-flow-item-title,.staff-brief-grid>section>.airport-flow-item-title').all()){
   expect(await title.evaluate(el=>getComputedStyle(el,'::before').width)).toBe('2px');
   expect(await title.evaluate(el=>getComputedStyle(el,'::before').display)).toBe('block');
  }
  for(const topic of await flow.locator(':scope>a:not([data-testid="glance-key-wait"])').all())await expect(topic).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 }else{
  await expect(wait).toHaveCSS('background-color','rgba(0, 0, 0, 0)');await expect(waitNumber).toHaveCSS('font-size','14px');
  await expect(wait.locator('.flow-inline-separator')).not.toHaveCSS('display','none');
 }
 await wait.focus();await expect(wait).toBeFocused();await expect(wait).toHaveCSS('outline-style','solid');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await flow.getByRole('heading',{name:'주목할 공항 흐름',exact:true}).click();
 await flow.screenshot({path:`../design-b-local-${width}.png`});
});
for(const [raw,fresh] of [['60+',true],['0',true],['17',false]] as const)test(`wait truth survives B layout: ${raw} fresh=${fresh}`,async({page})=>{
 await page.setViewportSize({width:390,height:1000});await data(page,raw,fresh);await page.goto('/ko?date='+date);
 const wait=page.getByRole('region',{name:'주목할 공항 흐름',exact:true}).getByTestId('glance-key-wait');
 if(fresh&&raw!=='0')await expect(wait.locator('.flow-wait-number')).toHaveText(raw);
 else if(raw==='0'){await expect(wait.locator('.flow-wait-number')).toHaveCount(0);await expect(wait).not.toContainText('17');}
 else {await expect(wait.locator('.flow-wait-number')).toHaveCount(0);await expect(wait).not.toContainText('17');}
});
