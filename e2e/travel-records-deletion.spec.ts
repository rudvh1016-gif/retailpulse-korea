import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {travelActionsCopy} from '../app/travel-records-actions-copy';
const standalone=process.env.TRAVEL_STANDALONE==='true';
const path=(lang='ko')=>standalone?'/':`/${lang}/travel-records`;
const photo=new URL('../public/visuals/travel-records/v1/departure.webp',import.meta.url);
async function add(page:Page,withPhoto=false,lang='ko'){
 await page.goto(`${path(lang)}#/new`);await expect(page.locator('#save')).toBeVisible();
 if(standalone&&lang!=='ko')await page.getByRole('combobox').selectOption(lang);
 await page.locator('#date').fill('2026-05-18');await page.locator('#from').fill('ICN');await page.locator('#to').fill('HND');await page.locator('#memo').fill('SYNTHETIC_DELETE_QA');
 if(withPhoto){await page.locator('#photo').setInputFiles({name:'synthetic.webp',mimeType:'image/webp',buffer:await readFile(photo)});await expect(page.locator('#photo-status')).not.toBeEmpty();await expect(page.locator('#save')).toBeEnabled();}
 await page.locator('#save').click();await expect(page.getByTestId('travel-detail')).toBeVisible();
}
async function rows(page:Page){return page.evaluate(()=>new Promise<Array<{id:string;memo:string;revision:number;fingerprint:string;photo:{sha256:string}|null}>>((resolve,reject)=>{
 const q=indexedDB.open('koretail-travel-local-v1',1);q.onerror=()=>reject(q.error);q.onsuccess=()=>{const db=q.result,tx=db.transaction('records'),r=tx.objectStore('records').getAll();r.onsuccess=()=>resolve(r.result);tx.oncomplete=()=>db.close();};
}));}
async function newerEdit(page:Page){await page.evaluate(()=>new Promise<void>((resolve,reject)=>{
 const q=indexedDB.open('koretail-travel-local-v1',1);q.onsuccess=()=>{const db=q.result,tx=db.transaction('records','readwrite'),s=tx.objectStore('records'),r=s.getAll();r.onsuccess=()=>s.put({...r.result[0],memo:'SYNTHETIC_OTHER_TAB',revision:r.result[0].revision+1});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};
}));}
async function download(page:Page,selector:string){const event=page.waitForEvent('download');await page.locator(selector).click();const file=await event,local=await file.path();if(!local)throw Error('No download bytes');return readFile(local);}
async function backup(page:Page){await page.goto(`${path()}#/backup`);return download(page,'#export');}
for(const lang of ['ko','en','zh','ja'] as const)test(`confirmed deletion, Cancel, Escape and undo preserve ${lang} record`,async({page})=>{
 await page.setViewportSize({width:390,height:844});await add(page,false,lang);const before=await rows(page);
 await page.locator('#delete-record').click();await expect(page.locator('#delete-title')).toHaveText(travelActionsCopy[lang].deleteTitle);await expect(page.locator('#cancel-delete')).toBeFocused();
 await page.locator('#cancel-delete').click();expect(await rows(page)).toEqual(before);
 await page.locator('#delete-record').click();await page.keyboard.press('Escape');expect(await rows(page)).toEqual(before);
 await page.locator('#delete-record').click();await page.locator('#confirm-delete').click();await expect(page.getByTestId('travel-empty')).toBeVisible();expect(await rows(page)).toEqual([]);
 await page.locator('#undo-change').click();await expect(page.getByTestId('travel-detail')).toBeVisible();const after=await rows(page);expect(after[0].id).toBe(before[0].id);expect(after[0].memo).toBe(before[0].memo);expect(after[0].revision).toBeGreaterThan(before[0].revision);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('photo removal preserves fields, exports null, skips older same-ID backup and undo restores photo',async({page})=>{
 await add(page,true);const before=await rows(page),oldBackup=await backup(page),json=JSON.parse(oldBackup.toString('utf8'));
 await page.goto(`${path()}#/record/${before[0].id}`);await expect(page.locator('#remove-photo')).toBeVisible();await page.locator('#remove-photo').click();await page.locator('#cancel-delete').click();expect(await rows(page)).toEqual(before);
 await page.locator('#remove-photo').click();await page.locator('#confirm-delete').click();await expect(page.locator('#remove-photo')).toHaveCount(0);const removed=await rows(page);expect(removed[0].photo).toBeNull();expect(removed[0].memo).toBe(before[0].memo);expect(removed[0].fingerprint).not.toBe(before[0].fingerprint);
 // Hash navigation retains the in-memory undo copy.
 await page.locator('a[href="#/backup"]').first().click();const bytes=await download(page,'#export');const noPhoto=JSON.parse(bytes.toString('utf8'));expect(noPhoto.records[0].photo).toBeNull();for(const field of ['id','date','from','to','memo','createdAt'])expect(noPhoto.records[0][field]).toBe(json.records[0][field]);
 await page.locator('#import-file').setInputFiles({name:'old.json',mimeType:'application/json',buffer:oldBackup});await expect(page.locator('#import-dialog')).toBeVisible();await page.locator('#confirm-import').click();await expect(page.getByTestId('travel-card')).toHaveCount(1);expect((await rows(page))[0].photo).toBeNull();
 await page.locator('#undo-change').click();await expect(page.locator('#remove-photo')).toBeVisible();expect((await rows(page))[0].photo?.sha256).toBe(before[0].photo?.sha256);
});
test('deleted record recovery JSON restores only after preview and confirmation',async({page})=>{
 await add(page,true);const before=await rows(page);await page.locator('#delete-record').click();await page.locator('#confirm-delete').click();await expect(page.getByTestId('travel-empty')).toBeVisible();
 const bytes=await download(page,'#recovery-backup');expect(JSON.parse(bytes.toString('utf8')).records[0].id).toBe(before[0].id);
 await page.locator('#finish-change').click();await page.locator('#cancel-delete').click();await expect(page.getByTestId('travel-undo')).toBeVisible();await page.locator('#finish-change').click();await page.locator('#confirm-delete').click();await expect(page.getByTestId('travel-undo')).toHaveCount(0);
 await page.locator('a[href="#/backup"]').first().click();await page.locator('#import-file').setInputFiles({name:'recovery.json',mimeType:'application/json',buffer:bytes});await expect(page.locator('#import-dialog')).toBeVisible();expect(await rows(page)).toEqual([]);await page.locator('#cancel-import').click();expect(await rows(page)).toEqual([]);
 await page.locator('#import-file').setInputFiles({name:'recovery.json',mimeType:'application/json',buffer:bytes});await expect(page.locator('#import-dialog')).toBeVisible();await page.locator('#confirm-import').click();await expect(page.getByTestId('travel-card')).toHaveCount(1);expect((await rows(page))[0].photo?.sha256).toBe(before[0].photo?.sha256);
});
test('stale deletion cannot erase another tab edit',async({page})=>{
 await add(page);await page.locator('#delete-record').click();await newerEdit(page);await page.locator('#confirm-delete').click();await expect(page.locator('#delete-dialog [role=alert]')).not.toBeEmpty();expect((await rows(page))[0].memo).toBe('SYNTHETIC_OTHER_TAB');await expect(page.getByTestId('travel-undo')).toHaveCount(0);
});
test('backup recovery uses a fresh revision and rejects a pre-deletion editor',async({page,context})=>{
 await add(page);const before=await rows(page),editor=await context.newPage();await editor.goto(`${path()}#/edit/${before[0].id}`);await editor.locator('#memo').fill('SYNTHETIC_STALE_AFTER_RESTORE');
 await page.locator('#delete-record').click();await page.locator('#confirm-delete').click();await expect(page.getByTestId('travel-empty')).toBeVisible();const bytes=await download(page,'#recovery-backup');await page.locator('#finish-change').click();await page.locator('#confirm-delete').click();
 await page.locator('a[href="#/backup"]').first().click();await page.locator('#import-file').setInputFiles({name:'recover.json',mimeType:'application/json',buffer:bytes});await expect(page.locator('#import-dialog')).toBeVisible();await page.locator('#confirm-import').click();await expect(page.getByTestId('travel-card')).toHaveCount(1);
 await editor.locator('#save').click();await expect(editor.locator('#form-error')).not.toBeEmpty();expect((await rows(page))[0].memo).toBe(before[0].memo);
 await page.locator('a[href^="#/record/"]').click();await page.locator('a[href^="#/edit/"]').click();await page.locator('#memo').fill('SYNTHETIC_FRESH_RESTORED_EDIT');await page.locator('#save').click();await expect(page.getByTestId('detail-memo')).toHaveText('SYNTHETIC_FRESH_RESTORED_EDIT');
});
test('photo undo cannot overwrite another tab edit and keeps recovery available',async({page})=>{
 await add(page,true);await page.locator('#remove-photo').click();await page.locator('#confirm-delete').click();await expect(page.getByTestId('travel-undo')).toBeVisible();await newerEdit(page);await page.locator('#undo-change').click();await expect(page.locator('#actions-error')).not.toBeEmpty();expect((await rows(page))[0].memo).toBe('SYNTHETIC_OTHER_TAB');expect((await rows(page))[0].photo).toBeNull();await expect(page.locator('#recovery-backup')).toBeEnabled();
});
test('delete transaction failure and undo quota failure do not lose records or recovery copy',async({page})=>{
 await add(page);const before=await rows(page);await page.evaluate(()=>{const native=IDBObjectStore.prototype.delete;IDBObjectStore.prototype.delete=function(key){IDBObjectStore.prototype.delete=native;throw new DOMException(String(key),'UnknownError');};});
 await page.locator('#delete-record').click();await page.locator('#confirm-delete').click();await expect(page.locator('#delete-dialog [role=alert]')).not.toBeEmpty();expect(await rows(page)).toEqual(before);await page.locator('#cancel-delete').click();
 await page.locator('#delete-record').click();await page.locator('#confirm-delete').click();await expect(page.getByTestId('travel-empty')).toBeVisible();await page.evaluate(()=>{const native=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(){IDBObjectStore.prototype.add=native;throw new DOMException('Synthetic full','QuotaExceededError');};});
 await page.locator('#undo-change').click();await expect(page.locator('#actions-error')).not.toBeEmpty();expect(await rows(page)).toEqual([]);await expect(page.locator('#recovery-backup')).toBeEnabled();await page.locator('#undo-change').click();await expect(page.getByTestId('travel-detail')).toBeVisible();
});
