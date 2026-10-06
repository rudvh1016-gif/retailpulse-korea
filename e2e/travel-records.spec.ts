import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {travelRecordsCopy} from '../app/travel-records-copy';
const photoPath=new URL('../public/visuals/travel-records/v1/departure.webp',import.meta.url);
async function add(page:Page,memo='Synthetic integration QA'){
 await page.goto('/ko/travel-records#/new');
 await page.locator('#date').fill('2026-05-18');await page.locator('#from').fill('ICN');await page.locator('#to').fill('HND');await page.locator('#memo').fill(memo);
 await page.locator('#save').click();await expect(page.getByTestId('travel-detail')).toBeVisible();
}
async function backupFile(page:Page){
 await page.goto('/ko/travel-records#/backup');
 const download=page.waitForEvent('download');await page.locator('#export').click();const file=await download;const path=await file.path();if(!path)throw Error('No backup bytes');
 return readFile(path);
}
async function recordCount(page:Page){return page.evaluate(()=>new Promise<number>((resolve,reject)=>{const q=indexedDB.open('koretail-travel-local-v1',1);q.onerror=()=>reject(q.error);q.onsuccess=()=>{const db=q.result,r=db.transaction('records').objectStore('records').count();r.onsuccess=()=>{resolve(r.result);db.close();};r.onerror=()=>reject(r.error);};}));}
for(const lang of ['ko','en','zh','ja'] as const)for(const width of [320,390,430,1280]){
 test(`fresh empty records, ${lang} at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`/${lang}/travel-records`);await expect(page.getByTestId('travel-empty')).toBeVisible();
  await expect(page.locator('h1')).toHaveText(travelRecordsCopy[lang].title);await expect(page.getByTestId('travel-card')).toHaveCount(0);expect(await recordCount(page)).toBe(0);
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content',/noindex/);
  await expect(page.locator('img')).toHaveAttribute('src','/visuals/travel-records/v1/departure.webp');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 });
}
test('existing main departure guide provides a keyboard-usable independent entry',async({page})=>{
 await page.goto('/ko/airport');await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');const guide=page.getByTestId('departure-preparation');await guide.locator(':scope > summary').click();const link=page.getByTestId('travel-records-entry');await expect(link).toHaveAttribute('href','/ko/travel-records');await link.focus();await page.keyboard.press('Enter');await expect(page.getByTestId('travel-empty')).toBeVisible();
});
test('add, reopen, edit, reload and locale change keep the same device record',async({page})=>{
 await add(page);const hash=new URL(page.url()).hash;await expect(page.getByTestId('detail-memo')).toHaveText('Synthetic integration QA');
 await page.reload();await expect(page.getByTestId('travel-detail')).toBeVisible();await page.locator('a[href^="#/edit/"]').click();await page.locator('#memo').fill('Synthetic edited QA');await page.locator('#save').click();await expect(page.getByTestId('detail-memo')).toHaveText('Synthetic edited QA');expect(new URL(page.url()).hash).toBe(hash);
 await page.getByRole('combobox').selectOption('en');await expect(page.locator('h1')).toHaveText('Travel records');await expect(page.getByTestId('detail-memo')).toHaveText('Synthetic edited QA');expect(await recordCount(page)).toBe(1);
 await page.goto('/ko/travel-records');await expect(page.getByTestId('travel-card')).toHaveCount(1);
});
test('photo and text stay local; corrupt and HEIC replacements keep the existing photo',async({page})=>{
 const sent:string[]=[];page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))sent.push(r.method()+' '+r.url());});
 await page.goto('/ko/travel-records#/new');await page.locator('#date').fill('2026-05-18');await page.locator('#from').fill('ICN');await page.locator('#to').fill('HND');await page.locator('#memo').fill('PRIVATE_SYNTHETIC_NOTE_QA');
 await page.locator('#photo').setInputFiles({name:'synthetic.webp',mimeType:'image/webp',buffer:await readFile(photoPath)});await expect(page.locator('#save')).toBeEnabled();await page.locator('#save').click();await expect(page.getByTestId('travel-detail')).toBeVisible();
 const image=page.getByTestId('travel-detail').locator('img');await expect(image).toHaveAttribute('src',/^blob:/);await expect.poll(()=>image.evaluate((i:HTMLImageElement)=>i.complete&&i.naturalWidth>0)).toBe(true);
 await page.locator('a[href^="#/edit/"]').click();await expect(page.locator('#memo')).toHaveValue('PRIVATE_SYNTHETIC_NOTE_QA');
 const original=await page.locator('form img').getAttribute('src');
 await page.locator('#photo').setInputFiles({name:'unsupported.heic',mimeType:'image/heic',buffer:Buffer.from('synthetic HEIC failure fixture')});await expect(page.locator('#form-error')).toContainText('JPG');await expect(page.locator('form img')).toHaveAttribute('src',original!);await expect(page.locator('#memo')).toHaveValue('PRIVATE_SYNTHETIC_NOTE_QA');
 await page.locator('#photo').setInputFiles({name:'corrupt.png',mimeType:'image/png',buffer:Buffer.from('not an image')});await expect(page.locator('#form-error')).not.toBeEmpty();await expect(page.locator('form img')).toHaveAttribute('src',original!);
 await page.locator('#save').click();await expect(page.getByTestId('travel-detail')).toBeVisible();expect(sent).toEqual([]);
 const resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name));expect(resources.some(u=>u.includes('PRIVATE_SYNTHETIC_NOTE_QA'))).toBe(false);expect(resources.every(u=>u.startsWith(new URL(page.url()).origin)||u.startsWith('blob:')||u.startsWith('data:'))).toBe(true);
});
test('standard image-element decoder and PNG encoder fallback preserve supported photos',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(window,'createImageBitmap',{value:undefined,configurable:true});const native=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(callback){return native.call(this,callback,'image/png');};});
 await page.goto('/ko/travel-records#/new');await page.locator('#date').fill('2026-05-18');await page.locator('#from').fill('ICN');await page.locator('#to').fill('HND');await page.locator('#memo').fill('Synthetic PNG fallback QA');await page.locator('#photo').setInputFiles({name:'synthetic.webp',mimeType:'image/webp',buffer:await readFile(photoPath)});await expect(page.locator('#photo-status')).toContainText('준비 완료');await page.locator('#save').click();await expect(page.getByTestId('travel-detail').locator('img')).toHaveAttribute('src',/^blob:/);
 const bytes=await backupFile(page),json=JSON.parse(bytes.toString('utf8'));expect(json.records[0].photo.type).toBe('image/png');expect(json.records[0].photo.width).toBe(960);
});
test('quota failure keeps inputs and does not claim saved',async({page})=>{
 await page.addInitScript(()=>{IDBObjectStore.prototype.add=function(){throw new DOMException('Synthetic quota failure','QuotaExceededError');};});
 await page.goto('/ko/travel-records#/new');await page.locator('#date').fill('2026-05-18');await page.locator('#from').fill('ICN');await page.locator('#to').fill('HND');await page.locator('#memo').fill('Synthetic retained input');await page.locator('#save').click();await expect(page.locator('#form-error')).toContainText('저장 공간');await expect(page.locator('#memo')).toHaveValue('Synthetic retained input');await expect(page.locator('#save')).toBeEnabled();expect(await recordCount(page)).toBe(0);await expect(page.getByTestId('travel-status')).toBeEmpty();
});
test('storage denial shows retry without a synthetic record or memory fallback',async({page})=>{
 await page.addInitScript(()=>{IDBFactory.prototype.open=function(){throw new DOMException('Synthetic storage denial','SecurityError');};});
 await page.goto('/ko/travel-records');await expect(page.getByRole('alert')).toContainText('작업을 완료하지 못');await expect(page.getByRole('button',{name:'다시 시도'})).toBeVisible();await expect(page.getByTestId('travel-card')).toHaveCount(0);await expect(page.getByTestId('travel-add')).toHaveCount(0);
});
test('backup export, preview cancel, duplicate skip and tamper rejection preserve records',async({page})=>{
 await add(page);const bytes=await backupFile(page);const before=await recordCount(page);
 await page.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:bytes});await expect(page.locator('#import-dialog')).toBeVisible();await expect(page.locator('#backup-status')).toContainText('아직');await page.locator('#cancel-import').click();await expect(page.locator('#backup-status')).toContainText('취소');expect(await recordCount(page)).toBe(before);
 await page.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:bytes});await expect(page.locator('#import-dialog')).toBeVisible();await page.locator('#confirm-import').click();await expect(page.getByTestId('travel-card')).toHaveCount(before);
 await page.goto('/ko/travel-records#/backup');await page.locator('#import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"not":"a backup"}')});await expect(page.locator('#backup-error')).not.toBeEmpty();await expect(page.locator('#import-dialog')).not.toBeVisible();expect(await recordCount(page)).toBe(before);
 const value=JSON.parse(bytes.toString('utf8'));value.version=999;await page.locator('#import-file').setInputFiles({name:'version.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});await expect(page.locator('#backup-error')).not.toBeEmpty();expect(await recordCount(page)).toBe(before);
});
test('backup restores into a fresh device context only after confirmation',async({page,browser})=>{
 await add(page);const bytes=await backupFile(page),context=await browser.newContext({baseURL:test.info().project.use.baseURL});const fresh=await context.newPage();
 try{await fresh.goto('/ko/travel-records#/backup');await expect(fresh.locator('#import-file')).toBeVisible();await fresh.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:bytes});await expect(fresh.locator('#import-dialog')).toBeVisible();expect(await recordCount(fresh)).toBe(0);await fresh.locator('#confirm-import').click();await expect(fresh.getByTestId('travel-card')).toHaveCount(1);expect(await recordCount(fresh)).toBe(1);}finally{await context.close();}
});
test('cancel during backup validation and Escape after validation leave no pending import',async({page})=>{
 await add(page);const bytes=await backupFile(page);
 await page.evaluate(()=>{const native=File.prototype.arrayBuffer;File.prototype.arrayBuffer=async function(){if(this.name==='slow.json')await new Promise(r=>setTimeout(r,1000));return native.call(this);};});
 await page.locator('#import-file').setInputFiles({name:'slow.json',mimeType:'application/json',buffer:bytes});await expect(page.locator('#cancel-read')).toBeVisible();await page.locator('#cancel-read').click();await expect(page.locator('#backup-status')).toContainText('취소');await expect(page.locator('#import-file')).toBeEnabled();await expect(page.locator('#import-dialog')).not.toBeVisible();expect(await recordCount(page)).toBe(1);
 await page.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:bytes});await expect(page.locator('#import-dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#backup-status')).toContainText('취소');await expect(page.locator('#import-dialog')).not.toBeVisible();expect(await recordCount(page)).toBe(1);
});
test('stale edit revision fails visibly and preserves the draft',async({page})=>{
 await add(page);await page.locator('a[href^="#/edit/"]').click();await page.locator('#memo').fill('Synthetic stale draft');
 await page.evaluate(()=>new Promise<void>((resolve,reject)=>{const q=indexedDB.open('koretail-travel-local-v1',1);q.onerror=()=>reject(q.error);q.onsuccess=()=>{const db=q.result,tx=db.transaction('records','readwrite'),s=tx.objectStore('records'),r=s.getAll();r.onsuccess=()=>{const first=r.result[0];s.put({...first,revision:first.revision+1});};tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};}));
 await page.locator('#save').click();await expect(page.locator('#form-error')).toContainText('다른 창');await expect(page.locator('#memo')).toHaveValue('Synthetic stale draft');expect(await recordCount(page)).toBe(1);
});
test('cancelling navigation keeps the unsaved form',async({page})=>{
 await page.goto('/ko/travel-records#/new');await page.locator('#memo').fill('Synthetic unsaved draft');page.once('dialog',d=>d.dismiss());await page.locator('form a[href="#/"]').click();await expect(page.locator('#memo')).toHaveValue('Synthetic unsaved draft');expect(new URL(page.url()).hash).toBe('#/new');
});
