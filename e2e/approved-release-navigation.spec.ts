import {test,expect} from '@playwright/test';
import {routeSummary,SUMMARY_FIXTURE} from './summary-fixture';
const labels={ko:['공항 한눈에','공항','서울 한눈에','서울','소비 흐름','더보기'],en:['Airport glance','Airport','Seoul at a glance','Seoul','Spending','More'],zh:['机场一览','机场','首尔一览','首尔','消费','更多'],ja:['空港一覧','空港','ソウルひと目で','ソウル','消費','その他']} as const;
for(const [lang,width] of [['ko',360],['ko',390],['ko',430],['ko',1440],['en',390],['zh',390],['ja',390]] as const)test(`approved release navigation ${lang} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:{status:'OK',flights:[],serviceDate:'2026-10-12',truncated:false,retrievedAt:'2026-10-12T00:00:00Z'}}));
 await page.route('**/api/live/airport-months*',r=>r.fulfill({json:{status:'UNAVAILABLE',data:null}}));
 await page.goto(`/${lang}/airport-glance`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');await expect(page.getByTestId('airport-glance-preview')).toBeVisible();await expect(page.locator('main')).toHaveCount(1);await expect(page.locator('.glance-header')).toHaveCount(0);
 const nav=page.locator(width<1000?'.bottom-nav':'.top-nav');await expect(nav).toBeVisible();const expected=[...labels[lang]] as string[];if(width>=1000)expected.splice(5,0,'매장');await expect(nav.locator('a')).toHaveCount(expected.length);for(let i=0;i<expected.length;i++){if(width<1000)await expect(nav.locator('a').nth(i)).toHaveAttribute('aria-label',expected[i]);else await expect(nav.locator('a').nth(i)).toHaveText(expected[i]);}
 await expect(nav.locator('a').first()).toHaveAttribute('aria-current','page');await expect(page.locator('.glance-heading')).not.toContainText('공개 반영 전');
 if(lang==='ko'){await page.getByRole('button',{name:'탑승동',exact:true}).click();await expect(page.locator('.glance-detail-link').first()).toHaveAttribute('href',/building=CONCOURSE/);}
 await nav.locator('a').last().click();await expect(page).toHaveURL(new RegExp(`/${lang}/more`));await expect(page.locator('.more-section-links a[href$="/business"]')).toBeVisible();await page.goBack();await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});

for(const width of [390,1440])test(`airport glance keeps shared date URL and history ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));await page.goto('/ko/airport-glance?date=2026-10-01');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const input=page.locator('.glance-controls input[type=date]');await expect(input).toHaveValue('2026-10-01');await input.fill('2026-10-02');await expect(page).toHaveURL(/date=2026-10-02/);await expect(input).toHaveValue('2026-10-02');
 await page.goBack();await expect(input).toHaveValue('2026-10-01');await page.goForward();await expect(input).toHaveValue('2026-10-02');
 const nav=page.locator(width<1000?'.bottom-nav':'.top-nav');await nav.locator('a[href="/ko/airport"]').click();await expect(page).toHaveURL(/airport\?date=2026-10-02/);await nav.locator('a[href="/ko/airport-glance"]').click();await expect(input).toHaveValue('2026-10-02');
 await page.getByLabel('Language',{exact:true}).selectOption('en');await expect(input).toHaveValue('2026-10-02');await expect(page).toHaveURL(/en\/airport-glance\?date=2026-10-02/);
 await page.locator('.glance-controls').getByRole('button',{name:'Today',exact:true}).click();await expect(page).not.toHaveURL(/date=/);await expect(input).toHaveValue(SUMMARY_FIXTURE.serviceDateKst);
});
