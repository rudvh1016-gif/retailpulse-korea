'use client';
import {useEffect,useRef,useState} from 'react';
import type {Lang} from './retailpulse-data';
import type {TravelRecord,TravelStore} from '../lib/travel-records/types';
import {makeRecord} from '../lib/travel-records/model.mjs';
import {exportBackup} from '../lib/travel-records/backup.mjs';
import {travelActionsCopy} from './travel-records-actions-copy';
import {travelError} from './travel-records-media';
import styles from './travel-records.module.css';
type Pending={kind:'record'|'photo';before:TravelRecord;after:TravelRecord|null};
export function TravelRecordsActions({lang,store,record,onChanged}:{lang:Lang;store:TravelStore;record:TravelRecord|null;onChanged:(record:TravelRecord|null,message:string)=>void}){
 const c=travelActionsCopy[lang],[pending,setPending]=useState<Pending|null>(null),[confirm,setConfirm]=useState<'record'|'photo'|'finish'|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
 const dialog=useRef<HTMLDialogElement>(null),cancelButton=useRef<HTMLButtonElement>(null),undoButton=useRef<HTMLButtonElement>(null),actions=useRef<HTMLDivElement>(null),working=useRef(false),alive=useRef(true),target=useRef<TravelRecord|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(confirm){dialog.current?.showModal();cancelButton.current?.focus();}else dialog.current?.close();},[confirm]);
 useEffect(()=>{
  const leave=(e:BeforeUnloadEvent)=>{if(pending){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave);
 },[pending]);
 function ask(kind:'record'|'photo'|'finish'){if(working.current)return;target.current=record;setError('');setConfirm(kind);}
 function cancel(){if(working.current)return;setConfirm(null);requestAnimationFrame(()=>{if(pending)undoButton.current?.focus();else actions.current?.querySelector('button')?.focus();});}
 async function change(){
  if(!confirm||working.current)return;
  if(confirm==='finish'){setPending(null);setConfirm(null);setStatus(c.finished);return;}
  const before=target.current;if(!before||pending)return;working.current=true;setBusy(true);setError('');
  try{
   if(confirm==='record'){
    const removed=await store.remove(before.id,before.revision);
    if(alive.current){setPending({kind:'record',before:removed,after:null});onChanged(null,c.deleted);}
   }else{
    const after=await makeRecord(before,null,before);await store.save(after,before.revision);
    if(alive.current){setPending({kind:'photo',before,after});onChanged(after,c.removed);}
   }
   if(alive.current){setConfirm(null);setStatus('');requestAnimationFrame(()=>undoButton.current?.focus());}
  }catch(e){if(alive.current)setError(travelError(e,lang));}
  finally{working.current=false;if(alive.current)setBusy(false);}
 }
 async function undo(){
  if(!pending||working.current)return;working.current=true;setBusy(true);setError('');
  try{
   // A fresh revision also rejects edits from tabs opened before deletion.
   const restored=await makeRecord(pending.before,pending.before.photo,pending.after??pending.before);
   await store.save(restored,pending.after?.revision??null);
   if(alive.current){setPending(null);setStatus('');onChanged(restored,c.undone);}
  }catch(e){if(alive.current)setError(travelError(e,lang));}
  finally{working.current=false;if(alive.current)setBusy(false);}
 }
 async function recovery(){
  if(!pending||working.current)return;working.current=true;setBusy(true);setError('');
  try{
   const blob=await exportBackup([pending.before]);if(!alive.current)return;
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='koretail-travel-recovery.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);setStatus(c.recoveryReady);
  }catch(e){if(alive.current)setError(travelError(e,lang));}
  finally{working.current=false;if(alive.current)setBusy(false);}
 }
 return <section aria-label={c.undo}>
  {record&&<div ref={actions} className={styles.actions}><button id="delete-record" type="button" className={styles.button} disabled={busy||!!pending} onClick={()=>ask('record')}>{c.deleteRecord}</button>{record.photo&&<button id="remove-photo" type="button" className={styles.button} disabled={busy||!!pending} onClick={()=>ask('photo')}>{c.removePhoto}</button>}</div>}
  {pending&&<aside data-testid="travel-undo" className={styles.notice}><p>{c.undoHelp}</p><div className={styles.actions}><button ref={undoButton} id="undo-change" type="button" className={styles.button} disabled={busy} onClick={()=>void undo()}>{busy?c.busy:c.undo}</button><button id="recovery-backup" type="button" className={styles.button} disabled={busy} onClick={()=>void recovery()}>{c.recovery}</button><button id="finish-change" type="button" className={styles.button} disabled={busy} onClick={()=>ask('finish')}>{c.finish}</button></div></aside>}
  <p role="status" aria-live="polite">{status}</p>{!confirm&&<p id="actions-error" role="alert" className={styles.error}>{error}</p>}
  <dialog ref={dialog} id="delete-dialog" className={styles.dialog} aria-labelledby="delete-title" aria-describedby="delete-help" onCancel={e=>{e.preventDefault();cancel();}}>
   <h2 id="delete-title">{confirm==='record'?c.deleteTitle:confirm==='photo'?c.photoTitle:c.finishTitle}</h2><p id="delete-help">{confirm==='record'?c.deleteHelp:confirm==='photo'?c.photoHelp:c.finishHelp}</p>{confirm!=='finish'&&<p>{c.undoHelp}</p>}<p role="alert" className={styles.error}>{error}</p><div className={styles.actions}><button ref={cancelButton} id="cancel-delete" type="button" className={styles.button} disabled={busy} onClick={cancel}>{c.cancel}</button><button id="confirm-delete" type="button" className={styles.button} disabled={busy||!confirm} onClick={()=>void change()}>{busy?c.busy:confirm==='record'?c.confirmDelete:confirm==='photo'?c.confirmPhoto:c.confirmFinish}</button></div>
  </dialog>
 </section>;
}
