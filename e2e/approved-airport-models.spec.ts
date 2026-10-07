import { test, expect, type Page } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import { tofuCharacters } from './font-glyphs';
import { airportSides } from '../lib/airport-sides-summary';

const DATE='2026-08-31';
const GATES=['208','215','231','234','263','268','276','279'];
const records=GATES.flatMap(gate=>Array.from({length:17},(_,i)=>({physicalFlightId:`${gate}-${i}`,flightNumber:`TEST${gate}${i}`,terminal:'T2',gate,direction:'departure',scheduledAt:`${DATE}T09:00:00+09:00`,retrievedAt:`${DATE}T03:00:00Z`,status:'scheduled',airportCode:'NRT'})));
async function open(page: Page,{lang='ko',width=390,kind='OK'}={}) {
  await page.setViewportSize({width,height:900});
  await page.emulateMedia({reducedMotion:'reduce'});
  const flights=kind==='ZERO'?[]:records;
  const summary={...SUMMARY_FIXTURE,airport:{...SUMMARY_FIXTURE.airport,sides:airportSides(DATE,'TODAY',[],flights,[],false,false)}};
  await page.route('**/api/live/summary*',routeSummary(summary));
  const requests:string[]=[];
  await page.route('**/api/live/flights*',route=>{
    requests.push(route.request().url());
    return route.fulfill({status:kind==='FAILED'?503:200,contentType:'application/json',body:JSON.stringify({mode:'live-flights',basis:'COLLECTED_FLIGHT_RECORDS',flights:kind==='ZERO'?[]:records,truncated:kind==='PARTIAL',retrievedAt:`${DATE}T03:00:00Z`})});
  });
  await page.route('**/api/live/airport-days*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({mode:'airport-days',history:[]})}));
  await page.goto(`/${lang}/airport?terminal=T2`);
  const model=page.getByTestId('gate-pillar-model');
  await model.scrollIntoViewIfNeeded();
  await expect(model).toBeVisible();
  return {model,requests};
}

for(const lang of ['ko','en','zh','ja']) for(const width of [320,390,430,1280]) {
  test(`approved live models preserve all ties and fit ${lang} ${width}`,async({page})=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    const {model,requests}=await open(page,{lang,width});
    await expect(model.locator('.gate-leader-zones .gate-pillar')).toHaveCount(8);
    const counts=await model.locator('.gate-leader-zones .gate-pillar').evaluateAll(nodes=>nodes.map(node=>Number(node.getAttribute('data-flights'))));
    expect(counts).toEqual(Array(8).fill(17));
    await expect(model.getByTestId('gate-all-list').locator('input')).toHaveCount(0);
    await model.getByTestId('gate-all-list').locator('summary').click();
    const initialRows=model.locator('.gate-full-list li'); await expect(initialRows).toHaveCount(20);
    for(const row of await initialRows.all()) await expect(row).toHaveCSS('content-visibility','visible');
    const images=model.locator('.gate-leader-zones .gate-visual-card img');
    expect(await images.count()).toBeGreaterThan(0);
    await images.first().scrollIntoViewIfNeeded();
    await expect.poll(()=>images.first().evaluate((node:HTMLImageElement)=>node.complete && node.naturalWidth>0)).toBe(true);
    await expect(model.locator('.gate-leader-zones .gate-visual-count')).toHaveCount(8);
    await model.locator('.gate-leader-zones .gate-pillar').first().focus();
    await page.keyboard.press('Enter');
    await expect(model.getByTestId('gate-selected')).toBeVisible();
    const search=model.locator('input[type=search]');await search.fill('215');
    await expect(model.locator('.gate-full-list li')).toHaveCount(1);
    const item=model.locator('.gate-full-list button').first();await item.focus();await page.keyboard.press('Enter');
    await expect(model.getByTestId('gate-selected')).toContainText('215');
    await expect(model.getByTestId('gate-selected').locator('li')).toHaveCount(17);
    await search.fill('no-such-gate');await expect(model.locator('.gate-full-list li')).toHaveCount(0);
    await search.fill('');await model.locator('[data-zone=WEST]').click();
    expect(await model.locator('.gate-full-list button').count()).toBeGreaterThan(0);
    await model.locator('[data-zone=ALL]').click();
    // The existing summary's top-five counts deliberately differ. Complete rows win.
    await expect(model).not.toContainText('18 flights');
    expect(await tofuCharacters(model)).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    expect(requests).toHaveLength(1);
    await model.getByTestId('gate-all-list').locator('summary').click();
    await page.getByTestId('airport-departure-overview').scrollIntoViewIfNeeded();
    const overview=page.getByTestId('airport-departure-overview');
    await expect(page.getByTestId('airport-concept-model')).toContainText('T2');
    const img=page.getByTestId('airport-departure-model-slot').locator('.airport-concept-picture img');
    await expect.poll(()=>img.evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);
    expect(await img.evaluate((el:HTMLImageElement)=>el.currentSrc)).toMatch(/\/v14\/T2_day(?:-390|-900)?\.webp$/);
    const dimensions=await img.evaluate((el:HTMLImageElement)=>({width:el.naturalWidth,height:el.naturalHeight,reservedWidth:el.width,reservedHeight:el.height}));
    // Width descriptors make naturalWidth density-corrected CSS pixels, not the encoded WebP width.
    expect(dimensions.width).toBeGreaterThan(0);expect(dimensions.height/dimensions.width).toBeCloseTo(1073/1784,2);
    await expect(img).toHaveAttribute('width','1784');await expect(img).toHaveAttribute('height','1073');
    await expect(overview.getByTestId('map-groups')).toHaveCount(0);
    await expect(overview.getByTestId('map-T2')).toHaveCount(0);
    await overview.getByTestId('departure-map-section').locator(':scope > summary').click();
    await overview.getByTestId('map-destinations').locator('summary').click();
    await expect(overview.getByTestId('map-groups')).toBeVisible();
    await overview.getByTestId('map-official-coordinates').locator('summary').click();
    await expect(overview.getByTestId('map-T2')).toBeVisible();
    await expect(model.locator('a[href="https://www.airport.kr/geomap/ap_ko/view.do"]')).toHaveCount(1);
    expect(requests).toHaveLength(1);
    await model.screenshot({path:`test-results/approved-C-${lang}-${width}.png`});
    await overview.screenshot({path:`test-results/approved-D-${lang}-${width}.png`});
  });
}

test('gate counts remain readable when illustration requests fail',async({page})=>{
  await page.route('**/visuals/gates/*.webp',route=>route.fulfill({status:404,body:''}));
  const {model}=await open(page,{width:320});
  await expect(model.locator('.gate-leader-zones .gate-pillar')).toHaveCount(8);
  await expect(model.locator('.gate-leader-zones .gate-visual-count').first()).toContainText('17');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for(const kind of ['FAILED','PARTIAL','ZERO']) test(`gate model handles ${kind} without a false leader`,async({page})=>{
  const {model}=await open(page,{kind});
  await expect(model.locator('.gate-leader-zones .gate-pillar')).toHaveCount(0);
  if(kind==='FAILED'||kind==='PARTIAL')await expect(model.getByRole('status')).toBeVisible();
  if(kind==='FAILED'||kind==='PARTIAL'){
    const illustration=page.getByTestId('airport-departure-model-slot').locator('.airport-concept-picture');
    await illustration.scrollIntoViewIfNeeded();await expect(illustration).toBeVisible();
    await expect(illustration.locator('.airport-concept-label')).toHaveCount(0);
    await expect(page.getByTestId('airport-concept-model')).toHaveCount(0);
  }
  if(kind==='ZERO'){
    await model.getByTestId('gate-all-list').locator('summary').click();
    await model.locator('.gate-full-list button').first().click();
    await expect(model.getByTestId('gate-selected').locator('li')).toHaveCount(0);
    await expect(model.getByTestId('gate-selected').locator('.gate-pillar')).toHaveAttribute('data-flights','0');
  }
});

test('terminal switches reset the open gate, retain counts and share the read',async({page})=>{
  const {model,requests}=await open(page);
  await model.locator('.gate-leader-zones .gate-pillar').first().click();
  await expect(model.getByTestId('gate-selected')).toBeVisible();
  for(const terminal of ['T1','T2','T1','T2']){
    await page.locator('.terminal-selector').getByRole('tab',{name:terminal,exact:true}).click();
    await expect(model.getByTestId('gate-selected')).toHaveCount(0);
    await expect(model.locator('.gate-leader-zones .gate-pillar')).toHaveCount(terminal==='T2'?8:0);
  }
  expect(requests).toHaveLength(1);
  await page.goBack();
  await expect(page.locator('.terminal-selector').getByRole('tab',{name:'T1',exact:true})).toHaveAttribute('aria-selected','true');
});
