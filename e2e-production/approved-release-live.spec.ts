import {test,expect} from '@playwright/test';

const insightLabels=['공항한눈에','내 근무 브리핑','언제 몰렸나요?','항공편 주말이 더 많나요?','어느 터미널이 달라졌나요?','연휴에는 늘었나요?'];

for(const width of [390,1440]){
 test(`new airport store defaults live ${width}`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});
  await page.goto('/ko/business');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  const view=page.locator('.business-view'),prep=view.getByTestId('business-prep'),guide=view.getByTestId('industry-guide');
  await expect(view).toBeVisible();
  await expect(prep).toHaveAttribute('data-place','airport');
  await expect(prep.getByTestId('prep-place')).toHaveText('인천공항 T1');
  await expect(prep.getByTestId('prep-industry')).toHaveText('업종 선택 전');
  await expect(view.locator('.area-tabs').getByRole('tab',{name:'인천공항',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(guide).toHaveAttribute('id','airport-industry-guide');
  await expect(guide.getByTestId('industry-unselected')).toBeVisible();
  await expect(guide.locator('button[aria-pressed="true"]')).toHaveCount(0);
  await expect(guide.locator('.operating-checklist')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await testInfo.attach(`new-airport-store-${width}.png`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 });

 test(`approved airport glance and menu live ${width}`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});
  await page.goto('/ko/airport-glance');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  const glance=page.getByTestId('airport-glance-preview');
  await expect(glance).toBeVisible();
  await expect(glance.locator('.glance-header')).toHaveCount(0);
  await expect(page.locator('.airport-insight-shell > .glance-heading')).toContainText('인천공항 한눈에');
  await expect(page.locator('.airport-insight-shell > .glance-heading')).not.toContainText('공개 반영 전');
  const nav=page.locator(width<1000?'.bottom-nav':'.top-nav'),names=['한눈에','공항현황','국가별 흐름','미리 준비','더보기'];
  const paths=['/ko','/ko/airport','/ko/airport-countries','/ko/airport-prepare','/ko/more'];
  if(width>=1000){names.splice(4,0,'외국인은 뭘 살까?');paths.splice(4,0,'/shopping-report/index.html');}
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',new URL('/ko',page.url()).href);
  await expect(nav).toBeVisible();
  await expect(nav.locator('a')).toHaveText(names);
  // Date/terminal selections may add query parameters; the approved destinations
  // must remain exact, rather than letting a partial href match the wrong screen.
  expect(await nav.locator('a').evaluateAll(links=>links.map(link=>new URL((link as HTMLAnchorElement).href).pathname))).toEqual(paths);
  await expect(nav.locator('a').first()).toHaveAttribute('aria-current','page');

  const insightTabs=page.locator('#airport-glance-tabs'),briefingTab=insightTabs.getByRole('tab',{name:'내 근무 브리핑',exact:true});
  await expect(insightTabs.getByRole('tab')).toHaveText(insightLabels);
  await briefingTab.click();
  await expect(page).toHaveURL(url=>url.pathname==='/ko/airport-glance'&&url.searchParams.get('insight')==='briefing');
  await expect(briefingTab).toHaveAttribute('aria-selected','true');
  await expect(briefingTab).toHaveAttribute('aria-controls','airport-insight-briefing');
  const briefingPanel=page.locator('#airport-insight-briefing'),briefing=briefingPanel.getByTestId('shift-briefing');
  await expect(briefingPanel).toBeVisible();
  await expect(briefingPanel).toHaveAttribute('aria-labelledby','airport-insight-tab-briefing');
  await expect(briefing).toHaveAttribute('data-configured','false');
  await expect(briefing.getByTestId('shift-settings')).toBeVisible();
  await expect(briefing.getByRole('combobox',{name:'업종',exact:true})).toHaveValue('');
  await expect(glance).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await testInfo.attach(`approved-shift-briefing-${width}.png`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
  // The query is also a direct entry: refreshing must keep the same panel.
  await page.reload();
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  await expect(briefingTab).toHaveAttribute('aria-selected','true');
  await expect(briefing.getByTestId('shift-settings')).toBeVisible();
  await insightTabs.getByRole('tab',{name:'공항한눈에',exact:true}).click();
  await expect(page).toHaveURL(url=>url.pathname==='/ko/airport-glance'&&!url.searchParams.has('insight'));
  await expect(glance).toBeVisible();

  await expect(glance.getByRole('button',{name:'탑승동',exact:true})).toBeVisible();
  await glance.getByRole('button',{name:'탑승동',exact:true}).click();
  await expect(glance.getByTestId('glance-shared-processing')).toContainText('탑승동도 T1에서 출국수속');
  await expect(glance.locator('.glance-detail-link').first()).toHaveAttribute('href',/building=CONCOURSE/);
  await expect.poll(()=>glance.locator('.glance-art-frame>img').evaluate(e=>(e as HTMLImageElement).complete&&(e as HTMLImageElement).naturalWidth>0)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await testInfo.attach(`approved-release-${width}.png`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
  // T2 differs from the new-reader default, so this catches lost airport context.
  await glance.getByRole('button',{name:'T2',exact:true}).click();
  await nav.locator('a').last().click();
  await expect(page).toHaveURL(url=>url.pathname==='/ko/more');
  const more=page.locator('.more-section-links');
  await expect(more.locator('a')).toHaveText(['서울 한눈에','서울','요즘 뜨는 소비','매장','관광안내','기록','소개']);
  expect(await more.locator('a').evaluateAll(links=>links.map(link=>new URL((link as HTMLAnchorElement).href).pathname))).toEqual(['/ko/where-to','/ko/myeongdong','/ko/consumption','/ko/business','/ko/tourism-desk/myeongdong','/ko/forecast','/ko/about']);
  const business=more.getByRole('link',{name:'매장',exact:true});
  await expect(business).toBeVisible();
  const businessUrl=new URL((await business.getAttribute('href'))!,page.url()),businessQuery={place:'airport',terminal:'T2'};
  expect(businessUrl.pathname).toBe('/ko/business');
  expect(Object.fromEntries(businessUrl.searchParams)).toEqual(businessQuery);
  await business.click();
  await expect(page).toHaveURL(url=>url.pathname==='/ko/business');
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual(businessQuery);
  await expect(page.locator('.business-view')).toBeVisible();
  const prep=page.getByTestId('business-prep');
  await expect(prep).toHaveAttribute('data-place','airport');
  await expect(prep.getByTestId('prep-place')).toHaveText('인천공항 T2');
  await expect(prep.getByTestId('prep-industry')).toHaveText('업종 선택 전');
  await page.goBack();await expect(more).toBeVisible();
  await page.goBack();await expect(glance).toBeVisible();
 });
}
