'use client';
import {useEffect,useRef,useState} from 'react';
import type {Lang} from './retailpulse-data';
import type {TravelStore,TravelRecord,ImportSummary} from '../lib/travel-records/types';
import {exportBackup,parseBackup,previewImport} from '../lib/travel-records/backup.mjs';
import {travelMessage,travelRecordsCopy} from './travel-records-copy';
import {travelError} from './travel-records-media';
import styles from './travel-records.module.css';
export function TravelRecordsBackup({lang,store,onRestored}:{lang:Lang;store:TravelStore;onRestored:(message:string)=>void}){
 const c=travelRecordsCopy[lang],[count,setCount]=useState(0),[busy,setBusy]=useState<'export'|'read'|'write'|null>(null),[status,setStatus]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState<{records:TravelRecord[];plan:ImportSummary}|null>(null);
 const alive=useRef(true),controller=useRef<AbortController|null>(null),dialog=useRef<HTMLDialogElement>(null),input=useRef<HTMLInputElement>(null),cancelButton=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  alive.current=true;store.list().then(rows=>{if(alive.current)setCount(rows.length);}).catch(e=>{if(alive.current)setError(travelError(e,lang));});
  const fileInput=input.current,stop=()=>setStatus(c.cancelled);fileInput?.addEventListener('cancel',stop);
  return()=>{alive.current=false;controller.current?.abort();fileInput?.removeEventListener('cancel',stop);};
 },[store,lang,c.cancelled]);
 useEffect(()=>{if(pending){dialog.current?.showModal();cancelButton.current?.focus();}else dialog.current?.close();},[pending]);
 const cancel=()=>{if(busy==='write')return;controller.current?.abort();setPending(null);setStatus(c.cancelled);input.current?.focus();};
 async function exportFile(){
  if(busy)return;setBusy('export');setError('');
  try{const blob=await exportBackup(await store.list());if(!alive.current)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='koretail-travel-backup.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);setStatus(c.exportReady);}
  catch(e){if(alive.current)setError(travelError(e,lang));}finally{if(alive.current)setBusy(null);}
 }
 async function readFile(file?:File){
  if(!file||busy)return;controller.current?.abort();const active=new AbortController();controller.current=active;setBusy('read');setPending(null);setError('');setStatus(c.reading);
  try{const records=await parseBackup(file,active.signal),plan=await previewImport(store,records);if(!alive.current)return;if(active.signal.aborted)throw new DOMException('Cancelled','AbortError');setPending({records,plan});setStatus(c.pending);}
  catch(e){if(alive.current){setStatus(c.cancelled);if((e as {name?:string})?.name!=='AbortError')setError(travelError(e,lang));}}
  finally{if(alive.current){setBusy(null);if(input.current)input.current.value='';}}
 }
 async function confirm(){
  if(!pending||busy)return;setBusy('write');setError('');
  try{const result=await store.importRecords(pending.records,controller.current?.signal);if(alive.current){setPending(null);onRestored(travelMessage(c.restored,{added:result.added}));}}
  catch(e){if(alive.current){setPending(null);setError(travelError(e,lang));setStatus(c.failure);}}
  finally{if(alive.current)setBusy(null);}
 }
 return <section><a className={styles.link} href="#/">{c.back}</a><section className={styles.backupSection}><h2>{c.export}</h2><p>{c.exportHelp}</p><p>{travelMessage(c.count,{count})}</p><button id="export" className={styles.button} type="button" disabled={!count||busy!==null} onClick={()=>void exportFile()}>{c.export}</button></section>
  <section className={styles.backupSection}><h2>{c.restore}</h2><p>{c.restoreHelp}</p><label htmlFor="import-file">{c.backupFile}<input ref={input} id="import-file" name="backup" type="file" accept=".json,application/json" disabled={busy!==null} onChange={e=>void readFile(e.currentTarget.files?.[0])}/></label>{busy==='read'&&<button id="cancel-read" type="button" className={styles.button} onClick={cancel}>{c.cancelRead}</button>}</section>
  <p id="backup-status" role="status" aria-live="polite">{status}</p><p id="backup-error" role="alert" className={styles.error}>{error}</p>
  <dialog ref={dialog} id="import-dialog" className={styles.dialog} aria-labelledby="import-title" onCancel={e=>{e.preventDefault();cancel();}}><h2 id="import-title">{c.confirmTitle}</h2><p id="import-summary">{pending&&travelMessage(c.summary,pending.plan)}</p><p>{c.restoreHelp}</p><div className={styles.actions}><button ref={cancelButton} id="cancel-import" type="button" className={styles.button} disabled={busy==='write'} onClick={cancel}>{c.cancel}</button><button id="confirm-import" type="button" className={`${styles.button} ${styles.primary}`} disabled={busy!==null||!pending} onClick={()=>void confirm()}>{busy==='write'?c.saving:c.confirm}</button></div></dialog>
 </section>;
}
