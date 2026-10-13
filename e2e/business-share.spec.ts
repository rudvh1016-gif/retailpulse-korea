import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import { shareCopy } from '../lib/prep-share';

async function open(page: Page, lang = 'ko', width = 390, area?:string) {
  await page.setViewportSize({ width, height: 900 });
  let summaryRequests = 0;
  await page.route('**/api/live/summary*', async (route) => { summaryRequests += 1; await routeSummary(SUMMARY_FIXTURE)(route); });
  await page.route('**/api/live/usual*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.goto(`/${lang}/business${area?`?area=${area}`:''}`);
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  const share = page.getByTestId('prep-share');
  await expect(share).toBeVisible();
  return { share, requests: () => summaryRequests };
}

test('copying puts the same dated text on the clipboard without a new data request', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { share, requests } = await open(page);
  const before = requests();
  await share.getByRole('button', { name: shareCopy.copy.ko }).click();
  await expect(share.getByTestId('share-status')).toHaveText(shareCopy.copied.ko);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('[KORETAIL]');
  expect(copied).toContain('2026-08-31 (월) · 명동');
  expect(copied).toContain('/ko/business?date=2026-08-31');
  expect(copied).toContain('17:00–18:00');
  expect(copied).toContain('지금 핵심');expect(copied.replace('지금 핵심','')).not.toContain('지금');await share.locator('summary').click();expect(copied.replaceAll('\r\n','\n')).toBe(await share.getByTestId('share-preview').innerText());
  expect(requests()).toBe(before);
});

test('a refused clipboard shows selectable text instead of a false success', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) } });
  });
  const { share } = await open(page);
  await share.getByRole('button', { name: shareCopy.copy.ko }).click();
  await expect(share.getByTestId('share-status')).toHaveText(shareCopy.copyFailed.ko);
  await expect(share.getByTestId('share-fallback')).toHaveValue(/\[KORETAIL\]/);
});

for (const lang of ['ko', 'en', 'zh', 'ja'] as const) {
  test(`the one-page image downloads as a real PNG, ${lang}`, async ({ page }) => {
    const { share, requests } = await open(page, lang);
    const before = requests();
    const download = page.waitForEvent('download');
    await share.getByRole('button', { name: shareCopy.image[lang] }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('koretail-2026-08-31-myeongdong.png');
    await file.saveAs(test.info().outputPath(`share-${lang}.png`));
    const bytes = await readFile(await file.path());
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.readUInt32BE(16)).toBe(1080);
    expect(bytes.readUInt32BE(20)).toBeGreaterThan(600);
    await expect(share.getByTestId('share-status')).toHaveText(shareCopy.imageReady[lang]);
    expect(requests()).toBe(before);
  });
}

test('an image that cannot be encoded is reported and the text is offered', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.toBlob = function (callback) { callback(null); };
  });
  const { share } = await open(page);
  await share.getByRole('button', { name: shareCopy.image.ko }).click();
  await expect(share.getByTestId('share-status')).toHaveText(shareCopy.imageFailed.ko);
  await expect(share.getByTestId('share-fallback')).toBeVisible();
});

test('the share sheet reports a choice or a cancel, never a delivery', async ({ page }) => {
  await page.addInitScript(() => {
    let calls = 0;
    Object.defineProperty(navigator, 'share', { configurable: true, value: () => (calls++ === 0 ? Promise.resolve() : Promise.reject(new DOMException('cancel', 'AbortError'))) });
  });
  const { share } = await open(page);
  await share.getByRole('button', { name: shareCopy.share.ko }).click();
  await expect(share.getByTestId('share-status')).toHaveText(shareCopy.shareChosen.ko);
  await share.getByRole('button', { name: shareCopy.share.ko }).click();
  await expect(share.getByTestId('share-status')).toHaveText(shareCopy.shareCancelled.ko);
});

test('the share block fits a 360px phone', async ({ page }) => {
  const { share } = await open(page, 'ko', 360);
  await share.locator('summary').click();
  await expect(share.getByTestId('share-preview')).toContainText('[KORETAIL]');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

for(const [place,label,terminal,width] of [['myeongdong','명동','T1',390],['hongdae','홍대','T1',390],['seongsu','성수','T1',390],['itaewon','이태원','T1',390],['airport','인천공항 T1','T1',390],['airport','인천공항 T2','T2',1440]] as const)test(`all export paths share one brief ${place} ${terminal}`,async({page})=>{
 await page.addInitScript(({place,terminal})=>{
  localStorage.setItem('koretail-business-v1',JSON.stringify({version:1,place:place==='airport'?'airport':'area',terminal,side:null,hours:null}));
  localStorage.setItem('retailpulse-preferences',JSON.stringify({lang:'ko',area:place==='airport'?'myeongdong':place,terminal,industry:'beauty'}));
  const capture=window as typeof window&{shared:string;copied:string;drawn:string[]};capture.drawn=[];
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{capture.copied=text;}}});
  Object.defineProperty(navigator,'share',{configurable:true,value:async(data:ShareData)=>{capture.shared=data.text??'';}});
  const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text:string,x:number,y:number,maxWidth?:number){capture.drawn.push(text);return original.call(this,text,x,y,maxWidth as number);};
 },{place,terminal});
 const {share}=await open(page,'ko',width,place==='airport'?undefined:place);await share.locator('summary').click();const preview=await share.getByTestId('share-preview').innerText();expect(preview).toContain(label);expect(preview).toContain('지금 핵심');expect(preview).toContain('영업시간:');
 await share.getByRole('button',{name:shareCopy.copy.ko}).click();await expect(share.getByTestId('share-status')).toHaveText(shareCopy.copied.ko);
 await share.getByRole('button',{name:shareCopy.share.ko}).click();await expect(share.getByTestId('share-status')).toHaveText(shareCopy.shareChosen.ko);
 const download=page.waitForEvent('download');await share.getByRole('button',{name:shareCopy.image.ko}).click();const file=await download;await file.saveAs(test.info().outputPath(`brief-${place}-${terminal}.png`));
 const captured=await page.evaluate(()=>{const c=window as typeof window&{shared:string;copied:string;drawn:string[]};return {shared:c.shared,copied:c.copied,drawn:c.drawn.join('')};});
 expect(captured.shared).toBe(preview);expect(captured.copied).toBe(preview);
 const imageText=preview.replace('[KORETAIL]','KORETAIL').replace(/^■ /gm,'').replace(/^- /gm,'').replace(/\s/g,'');expect(captured.drawn.replace(/\s/g,'')).toBe(imageText);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 if(place==='myeongdong'||place==='airport')await share.screenshot({path:test.info().outputPath(`preview-${place}-${terminal}-${width}.png`)});
});


for(const [area,label] of [['myeongdong','명동'],['hongdae','홍대'],['seongsu','성수'],['itaewon','이태원'],['T1','T1'],['T2','T2']])test(`shared link opens exact place on another device ${area}`,async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('koretail-business-v1',JSON.stringify({version:1,place:'airport',terminal:'T1',side:'WEST',hours:null})));
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 const params=new URLSearchParams({date:'2026-08-31',place:area.startsWith('T')?'airport':'area',...(area.startsWith('T')?{terminal:area,side:'EAST'}:{area})});
 await page.goto(`/ko/business?${params}`);await expect(page.getByTestId('prep-place')).toContainText(label);
 const share=page.getByTestId('prep-share');await share.locator('summary').click();await expect(share.getByTestId('share-preview')).toContainText(`/ko/business?${params}`);
 expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('koretail-business-v1'))??'{}').side).toBe('WEST');
 if(area==='T2'){await page.locator('.prep-change').click();await page.getByRole('radio',{name:'T1',exact:true}).check();await page.locator('.prep-form button[type=submit]').click();await expect(page.getByTestId('prep-place')).toContainText('T1');}
});
