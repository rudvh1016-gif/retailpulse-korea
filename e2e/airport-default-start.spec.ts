import {test,expect} from '@playwright/test';
import {routeSummary,SUMMARY_FIXTURE} from './summary-fixture';
for(const width of [390,1440])test(`default start preserves dated direct routes and history ${width}`,async({page,request},testInfo)=>{
 await page.setViewportSize({width,height:900});await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const manifest of ['/manifest.webmanifest','/manifest-20261007.webmanifest']){
  const body=await (await request.get(manifest)).json();expect(body.id).toBe('/');expect(body.start_url).toBe('/ko');
 }
 await page.goto('/?date=2026-10-01&area=hongdae');await expect(page).toHaveURL(/\/ko\?date=2026-10-01&area=hongdae/);
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
 await expect(page.locator('.glance-controls input')).toHaveValue('2026-10-01');
 const nav=page.locator(width<1000?'.bottom-nav':'.top-nav');await nav.locator('a[href="/ko/hongdae?date=2026-10-01"]').click();await expect(page).toHaveURL(/\/ko\/hongdae\?date=2026-10-01/);
 await page.goBack();await expect(page.getByTestId('airport-glance-preview')).toBeVisible();await expect(page.locator('.glance-controls input')).toHaveValue('2026-10-01');
 await page.goForward();await expect(page).toHaveURL(/\/ko\/hongdae\?date=2026-10-01/);await expect(nav.locator('a[href="/ko/hongdae?date=2026-10-01"]')).toHaveAttribute('aria-current','page');await expect(page.getByTestId('airport-glance-preview')).toHaveCount(0);
 await page.goto('/ko/airport?date=2026-10-01&terminal=T2');await expect(page.getByRole('heading',{name:'인천공항',exact:true})).toBeVisible();await expect(page.getByRole('tab',{name:'T2',exact:true})).toHaveAttribute('aria-selected','true');await expect(page).toHaveURL(/\/airport\?date=2026-10-01&terminal=T2/);await expect(page.getByTestId('airport-glance-preview')).toHaveCount(0);
 await page.getByRole('button',{name:'KORETAIL home'}).click();await expect(page.getByTestId('airport-glance-preview')).toBeVisible();await expect(page.locator('.glance-controls input')).toHaveValue('2026-10-01');
 await page.goBack();await expect(page.getByRole('heading',{name:'인천공항',exact:true})).toBeVisible();await expect(page.getByRole('tab',{name:'T2',exact:true})).toHaveAttribute('aria-selected','true');await expect(page).toHaveURL(/terminal=T2/);
 await page.goto('/ko');await expect(page.getByTestId('airport-glance-preview')).toBeVisible();await expect.poll(()=>page.locator('.glance-art-frame>img').evaluate(e=>(e as HTMLImageElement).complete&&(e as HTMLImageElement).naturalWidth>0)).toBe(true);
 await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');await expect(page.locator('.glance-preview')).toHaveCSS('background-color','rgb(255, 255, 255)');
 await expect(page.locator('body')).toHaveCSS('background-color','rgb(255, 255, 255)');
 await page.screenshot({path:testInfo.outputPath(`default-start-${width}.png`)});expect(errors).toEqual([]);
});
