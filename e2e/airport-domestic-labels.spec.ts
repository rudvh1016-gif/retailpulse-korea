import {test,expect} from '@playwright/test';
import {airportSides} from '../lib/airport-sides-summary';
import {SUMMARY_FIXTURE} from './summary-fixture';
import {AIRPORT_MONTH_VERSION,buildAirportFlightMonth} from '../lib/airport-monthly-flights';
import {AIRPORT_SIDES_VERSION} from '../lib/airport-sides';
import {DESTINATIONS_VERSION} from '../lib/airport-destinations';
const date='2026-10-12',stamp=date+'T06:43:00Z';
const rows=[['KE1401','PUS'],['KE1431','TAE'],['7C167','CJU'],['KE9999','PUS'],['KE703','NRT']].map(([flightNumber,airportCode],i)=>({physicalFlightId:String(i),flightNumber,operatingFlight:flightNumber,airportCode,terminal:'T2',gate:'274',direction:'departure',status:'scheduled',scheduledAt:date+'T10:00:00+09:00',retrievedAt:stamp}));
const monthly={status:'READY',month:'2026-10',months:['2026-10','2026-09'],calculatedAt:stamp,data:{version:AIRPORT_MONTH_VERSION,asOf:date,sidesVersion:AIRPORT_SIDES_VERSION,destinationsVersion:DESTINATIONS_VERSION,months:['2026-10','2026-09'].map(month=>buildAirportFlightMonth(month,date,rows.map(row=>({...row,scheduledAt:month+'-01T10:00:00+09:00'})),new Set([month+'-01'])))}};
const cases=[{lang:'ko',width:360},{lang:'ko',width:390},{lang:'en',width:390},{lang:'zh',width:390},{lang:'ja',width:390}] as const;
for(const {lang,width}of cases)test(`domestic totals and individual transit evidence stay distinct ${lang} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:950});await page.clock.setFixedTime(new Date(stamp));await page.emulateMedia({reducedMotion:'reduce'});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/live/summary*',r=>r.fulfill({json:{...SUMMARY_FIXTURE,generatedAt:stamp,todayKst:date,serviceDateKst:date,airport:{...SUMMARY_FIXTURE.airport,serviceDateKst:date,sides:airportSides(date,'TODAY',[],rows,[],false,false)}}}));
 await page.route('**/api/live/flights*',r=>r.fulfill({json:{mode:'live-flights',serviceDateKst:date,basis:'COLLECTED_FLIGHT_RECORDS',flights:rows,truncated:false,retrievedAt:stamp}}));
 await page.route('**/api/live/airport-months*',r=>r.fulfill({json:monthly}));await page.goto(`/${lang}/airport`);
 const domestic={ko:'국내 목적지',en:'Domestic destinations',zh:'国内目的地',ja:'国内の目的地'}[lang],transit={ko:'국내 환승편',en:'Domestic transit flight',zh:'国内中转航班',ja:'国内乗り継ぎ便'}[lang];
 if(lang==='ko'||lang==='zh')await page.goto(`/${lang}/airport-countries?mode=zones&date=${date}&building=T2`);
 const month=page.getByTestId('airport-month-flights'),card=month.locator('li[data-country="KR"]');await expect(card.locator('h5')).toHaveText(domestic);await expect(card.locator('h5 img')).toHaveCount(0);await expect(card.locator('[data-period=current] strong')).toHaveText('4');await expect(month.locator('.airport-month-total strong')).toHaveText('5 → 5');await expect(card).not.toContainText(transit);
 const countries=month.getByTestId('month-list-destinationCountries');await countries.locator('summary').click();await expect(countries.locator('tbody th')).toContainText([domestic]);
 const registry=month.getByTestId('month-list-registrationCountries');await registry.locator('summary').click();await expect(registry.locator('tbody th')).toContainText([new Intl.DisplayNames([lang],{type:'region'}).of('KR')!]);await expect(registry).not.toContainText(domestic);
 // The duplicate browser is absent from the model; its full retained browser is tested on the legacy business screen.
 if(lang==='ko'||lang==='zh')await page.goto(`/${lang}/airport`);
 await expect(page.getByTestId('departure-map').getByTestId('map-flights')).toHaveCount(0);
 await page.evaluate(()=>localStorage.setItem('koretail-business-v1',JSON.stringify({version:1,place:'airport',terminal:'T2',side:null,hours:null})));
 await page.goto(`/${lang}/business`);await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
 await expect(page.getByTestId('business-prep')).toHaveAttribute('data-place','airport');
 await page.getByTestId('business-prep').getByTestId('departure-map-section').locator(':scope > summary').click();
 const browser=page.getByTestId('map-flights');await browser.locator(':scope > summary').focus();await page.keyboard.press('Enter');await browser.locator('.airport-flight-hour > summary').click();const flights=browser.locator('.airport-flight-rows > li');await expect(flights).toHaveCount(5);
 const verified=flights.filter({hasText:'KE1401'});await expect(verified.locator('summary')).toContainText(transit);if(lang==='ko')await expect(verified.locator('summary')).toContainText('김해');await verified.locator('summary').click();await expect(verified.getByRole('link')).toHaveAttribute('href',/koreanair.com\/contents\/booking\/reservation-guide\/how-to-book\/domestic-transit/);
 for(const number of ['7C167','KE9999']){const other=flights.filter({hasText:number});await expect(other.locator('summary')).toContainText(domestic);await expect(other).not.toContainText(transit);}
 await expect(flights.filter({hasText:'KE703'})).not.toContainText(domestic);
 for(const query of ['PUS','김해']){await browser.getByRole('searchbox').fill(query);await browser.locator('.airport-flight-hour > summary').click();await expect(browser.locator('.airport-flight-rows > li')).toHaveCount(2);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
});
