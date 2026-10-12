import {test,expect} from '@playwright/test';
for(const width of [390,1440])test(`approved airport glance and menu live ${width}`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});await page.goto('/ko/airport-glance');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const glance=page.getByTestId('airport-glance-preview');await expect(glance).toBeVisible();await expect(glance.locator('.glance-header')).toHaveCount(0);await expect(glance.locator('.glance-heading')).not.toContainText('공개 반영 전');
 const nav=page.locator(width<1000?'.bottom-nav':'.top-nav'),names=['공항 한눈에','공항','서울 한눈에','서울','소비 흐름',...(width<1000?[]:['매장']),'더보기'];await expect(nav).toBeVisible();await expect(nav.locator('a')).toHaveText(names);
 await expect(glance.getByRole('button',{name:'탑승동',exact:true})).toBeVisible();await glance.getByRole('button',{name:'탑승동',exact:true}).click();await expect(glance.getByTestId('glance-shared-processing')).toContainText('탑승동도 T1에서 출국수속');await expect(glance.locator('.glance-detail-link').first()).toHaveAttribute('href',/building=CONCOURSE/);
 await expect.poll(()=>glance.locator('.glance-art-frame>img').evaluate(e=>(e as HTMLImageElement).complete&&(e as HTMLImageElement).naturalWidth>0)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await testInfo.attach(`approved-release-${width}.png`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 await nav.locator('a').last().click();await expect(page.locator('.more-section-links a[href="/ko/business"]')).toBeVisible();
});
