import {test,expect} from '@playwright/test';
for(const width of [390,1440])test(`approved airport glance and menu live ${width}`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});await page.goto('/ko/airport-glance');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const glance=page.getByTestId('airport-glance-preview');await expect(glance).toBeVisible();await expect(glance.locator('.glance-header')).toHaveCount(0);await expect(glance.locator('.glance-heading')).not.toContainText('공개 반영 전');
 const nav=page.locator(width<1000?'.bottom-nav':'.top-nav'),names=['한눈에','공항현황','국가별 흐름','미리 준비','더보기'];
 const paths=['/ko','/ko/airport','/ko/airport-countries','/ko/airport-prepare','/ko/more'];
 await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',new URL('/ko',page.url()).href);
 await expect(nav).toBeVisible();await expect(nav.locator('a')).toHaveText(names);
 // Date/terminal selections may add query parameters; the approved destinations
 // must remain exact, rather than letting a partial href match the wrong screen.
 expect(await nav.locator('a').evaluateAll(links=>links.map(link=>new URL((link as HTMLAnchorElement).href).pathname))).toEqual(paths);
 await expect(nav.locator('a').first()).toHaveAttribute('aria-current','page');
 await expect(glance.getByRole('button',{name:'탑승동',exact:true})).toBeVisible();await glance.getByRole('button',{name:'탑승동',exact:true}).click();await expect(glance.getByTestId('glance-shared-processing')).toContainText('탑승동도 T1에서 출국수속');await expect(glance.locator('.glance-detail-link').first()).toHaveAttribute('href',/building=CONCOURSE/);
 await expect.poll(()=>glance.locator('.glance-art-frame>img').evaluate(e=>(e as HTMLImageElement).complete&&(e as HTMLImageElement).naturalWidth>0)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await testInfo.attach(`approved-release-${width}.png`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 await nav.locator('a').last().click();await expect(page).toHaveURL(url=>url.pathname==='/ko/more');
 const more=page.locator('.more-section-links');
 await expect(more.locator('a')).toHaveText(['서울 한눈에','서울','요즘 뜨는 소비','매장','관광안내','기록','소개']);
 expect(await more.locator('a').evaluateAll(links=>links.map(link=>new URL((link as HTMLAnchorElement).href).pathname))).toEqual(['/ko/where-to','/ko/myeongdong','/ko/consumption','/ko/business','/ko/tourism-desk/myeongdong','/ko/forecast','/ko/about']);
 const business=more.locator('a[href="/ko/business"]');await expect(business).toBeVisible();await business.click();await expect(page).toHaveURL(url=>url.pathname==='/ko/business');await expect(page.locator('.business-view')).toBeVisible();
 await page.goBack();await expect(more).toBeVisible();await page.goBack();await expect(glance).toBeVisible();
});
