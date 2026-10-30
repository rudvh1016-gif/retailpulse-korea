import {test,expect,type Page,type Locator} from '@playwright/test';
import summary from './fixtures/airport-focus/summary.json' with {type:'json'};
import flights from './fixtures/airport-focus/flights.json' with {type:'json'};
import months from './fixtures/airport-focus/months.json' with {type:'json'};
import passengers from './fixtures/airport-focus/passenger-stats.json' with {type:'json'};
async function fixtures(page:Page){
 await page.route('**/api/live/summary*',r=>r.fulfill({json:summary}));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:flights}));
 await page.route('**/api/live/airport-months*',r=>r.fulfill({json:months}));
 await page.route('**/api/live/airport-passenger-stats*',r=>r.fulfill({json:passengers}));
 await page.route('**/api/live/passenger-reference*',r=>r.fulfill({json:{status:'UNAVAILABLE',data:null}}));
 await page.route(/google-analytics\.com|googletagmanager\.com/,r=>r.abort());
}
async function chineseOnly(root:Locator){
 expect(await root.evaluate(node=>{
  const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT),remaining:string[]=[];
  while(walker.nextNode()){
   const element=walker.currentNode.parentElement,text=walker.currentNode.textContent?.trim()??'';
   if(element?.checkVisibility()&&/[가-힣]/.test(text)&&!element.closest('script,style,option,[lang="ko"]'))remaining.push(text);
  }
  for(const element of node.querySelectorAll('[aria-label],[placeholder]'))if(element.checkVisibility())for(const key of ['aria-label','placeholder']){const value=element.getAttribute(key)??'';if(/[가-힣]/.test(value))remaining.push(value);}
  return remaining;
 })).toEqual([]);
}
for(const width of [360,1440])test(`Chinese monthly country flights preserve controls, scope and truth ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await fixtures(page);await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/zh/airport-countries?mode=flights&period=monthly&date=2026-10-19');
 const panel=page.locator('.cfp-panel');await expect(panel.locator('.cfp-list>li').first()).toBeVisible();
 await chineseOnly(panel);
 const counts=await panel.locator('.cfp-total strong').innerText();
 await panel.getByRole('combobox',{name:'各国航班排序方式'}).selectOption('increase');
 await panel.getByRole('combobox',{name:'各国航班排序方式'}).selectOption('decrease');
 await panel.getByRole('combobox',{name:'各国航班排序方式'}).selectOption('volume');
 await expect(panel.locator('.cfp-total strong')).toHaveText(counts);
 await panel.getByRole('searchbox',{name:'查找目的地国家'}).fill('JP');
 await expect(panel.locator('.cfp-list>li')).toHaveCount(1);await expect(panel.locator('.cfp-country-heading h3')).toContainText('日本');
 await panel.locator('.cfp-zone-detail summary').press('Enter');await expect(panel.locator('.cfp-zone-detail')).toHaveAttribute('open');await chineseOnly(panel);
 await panel.getByRole('searchbox').fill('不匹配XYZ');await expect(panel.locator('.cfp-list>li')).toHaveCount(0);await expect(panel.locator('.cfp-list-basis')).toContainText('没有匹配');
 await panel.getByRole('button',{name:'清除',exact:true}).click();await expect(panel.locator('.cfp-list>li')).toHaveCount(8);
 await panel.getByRole('button',{name:/查看全部\d+个目的地/}).click();expect(await panel.locator('.cfp-list>li').count()).toBeGreaterThan(8);
 await panel.getByRole('button',{name:'仅显示前8个'}).click();await expect(panel.locator('.cfp-list>li')).toHaveCount(8);
 for(const name of ['T1主楼','卫星厅','T2','全部']){await panel.getByRole('button',{name,exact:true}).click();await expect(panel.getByRole('button',{name,exact:true})).toHaveAttribute('aria-pressed','true');await chineseOnly(panel);}
 await panel.locator('.cfp-method summary').press('Enter');await expect(panel.locator('.cfp-method')).toContainText('目的地未定');await expect(panel.locator('.cfp-method')).toContainText('不列入国家列表，但计入整体合计');await chineseOnly(panel);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath(`zh-country-monthly-${width}.png`),fullPage:true});
});
test('Chinese zone controls retain same date, scope and closed source disclosure',async({page})=>{
 await fixtures(page);await page.goto('/zh/airport-countries?date=2026-10-19');
 const panel=page.locator('#country-flow-zones');await expect(panel.getByTestId('map-zone-countries')).toBeVisible();await chineseOnly(panel);
 await panel.getByRole('button',{name:'自选时段',exact:true}).click();await panel.getByLabel('开始',{exact:true}).selectOption('10');await panel.getByLabel('结束',{exact:true}).selectOption('15');
 await panel.getByRole('button',{name:'T1主楼',exact:true}).click();await expect(panel.getByRole('button',{name:'T1主楼',exact:true})).toHaveAttribute('aria-pressed','true');
 await panel.getByRole('button',{name:'全天',exact:true}).click();
 const details=panel.getByTestId('country-counting-details');await expect(details).not.toHaveAttribute('open');await details.locator('summary').press('Enter');await expect(details).toContainText('采集时间');await expect(details).toContainText(flights.retrievedAt);await chineseOnly(panel);
});
for(const failure of ['missing','truncated','unknown-completeness'] as const)test(`Chinese missing zone source stays unavailable, not zero: ${failure}`,async({page})=>{
 await fixtures(page);await page.route('**/api/live/flights*',r=>failure==='missing'?r.fulfill({status:503,json:{status:'UNAVAILABLE'}}):r.fulfill({json:{...flights,truncated:failure==='truncated'?true:undefined}}));
 await page.goto('/zh/airport-countries?date=2026-10-19');
 const panel=page.locator('#country-flow-zones');await expect(panel.getByRole('status').filter({hasText:'无法确认所选日期和时段的航班资料'})).toBeVisible();await expect(panel.getByTestId('map-zone-countries')).toHaveCount(0);await chineseOnly(panel);
});
test('Chinese missing monthly records do not become measured zeroes',async({page})=>{
 await fixtures(page);await page.route('**/api/live/airport-months*',r=>r.fulfill({json:{status:'READY',month:'2026-10',data:{...months.data,months:[]}}}));
 await page.goto('/zh/airport-countries?mode=flights&period=monthly&date=2026-10-19');const panel=page.locator('.cfp-panel');
 await expect(panel.getByRole('status')).toContainText('缺失日期不会按0班计算');await expect(panel.locator('.cfp-list')).toHaveCount(0);await chineseOnly(panel);
});
test('Chinese More guide opens with keyboard and keeps all four locale links',async({page})=>{
 await fixtures(page);await page.goto('/zh/more');
 const guide=page.getByTestId('airport-usage-guide');await expect(guide).not.toHaveAttribute('open');await page.getByRole('button',{name:'仁川机场使用指南 ›',exact:true}).press('Enter');await expect(guide).toHaveAttribute('open');
 for(const path of ['/zh','/zh/airport','/zh/airport-countries','/zh/airport-prepare'])await expect(guide.locator(`a[href="${path}"]`)).toBeVisible();
 for(const item of await page.locator('.site-usage-guide > details').all())if(await item.getAttribute('open')===null)await item.locator(':scope > summary').press('Enter');
 await chineseOnly(page.locator('.site-usage-guide'));
 await page.goto('/zh/about');await expect(page.locator('.about-section')).toHaveCount(4);await chineseOnly(page.locator('.about-view'));await expect(page.locator('.about-view')).toContainText('目的地国家不代表乘客国籍');
});
