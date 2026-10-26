import {test,expect} from '@playwright/test';
import snapshot from '../data/airport-focus-preview/arrival-allowances.json' with {type:'json'};
import {SUMMARY_FIXTURE,routeSummary} from './summary-fixture';
for(const lang of ['ko','en','zh','ja'])for(const width of [390,1440])test(`canonical home navigation, history and selected date/terminal ${lang} ${width}`,async({page,request})=>{
 await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});await page.route('**/api/**',r=>r.fulfill({status:503,json:{status:'UNAVAILABLE'}}));await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 await page.goto(`/${lang}/airport?date=2026-10-19&terminal=T2`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 const nav=page.locator(width<1000?'.bottom-nav':'.top-nav'),home=nav.locator('a').first();await expect(home).toHaveAttribute('href',`/${lang}?date=2026-10-19&terminal=T2`);await home.click();
 await expect(page.getByTestId('airport-glance-preview')).toBeVisible();expect(new URL(page.url()).pathname).toBe('/'+lang);expect(new URL(page.url()).searchParams.get('date')).toBe('2026-10-19');expect(new URL(page.url()).searchParams.get('terminal')).toBe('T2');
 await page.goBack();await expect(page.getByRole('tab',{name:'T2',exact:true})).toHaveAttribute('aria-selected','true');await page.goForward();expect(new URL(page.url()).pathname).toBe('/'+lang);
 const next=lang==='en'?'ko':'en';await page.getByLabel('Language',{exact:true}).selectOption(next);await expect(page).toHaveURL(new RegExp('/'+next+'\\?'));expect(new URL(page.url()).searchParams.get('date')).toBe('2026-10-19');expect(new URL(page.url()).searchParams.get('terminal')).toBe('T2');
 const alias=await request.get(`/${lang}/airport-glance?date=2026-10-19&terminal=T2`);expect(alias.status()).toBe(200);const html=await alias.text();expect(html).toMatch(new RegExp('<link[^>]+rel="canonical"[^>]+href="[^"?]*'+lang+'"'));
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('unhydrated preparation HTML exposes visible reviewed source orientation without default traveler conditions',async({request,browser,baseURL})=>{
 const response=await request.get('/ko/airport-prepare');expect(response.status()).toBe(200);const raw=await response.text(),section=raw.match(/<section[^>]*data-testid="arrival-reviewed-overview"[^>]*>([^]*?)<\/section>/)?.[1];expect(section).toBeTruthy();
 for(const country of snapshot.countries){expect(section).toContain(country.name);if(country.verifiedAt)expect(section).toContain(country.verifiedAt);else expect(section).toContain('수동 확인일 미확인');expect(section).toContain(country.sources[0].url.replaceAll('&','&amp;'));if(country.verifiedAt)expect(section).toContain(country.conditions[0].label);}
 const context=await browser.newContext({baseURL,javaScriptEnabled:false,viewport:{width:390,height:900}});const page=await context.newPage();await page.goto('/ko/airport-prepare');const overview=page.getByTestId('arrival-reviewed-overview');await expect(overview).toBeVisible();await expect(overview.locator('li')).toHaveCount(snapshot.countries.length);await expect(page.getByRole('combobox',{name:'도착 국가·지역',exact:true})).toHaveValue('');await context.close();
});
