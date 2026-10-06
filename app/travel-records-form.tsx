'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {Lang} from './retailpulse-data';
import type {TravelRecord,TravelStore} from '../lib/travel-records/types';
import {makeRecord} from '../lib/travel-records/model.mjs';
import {preparePhoto} from '../lib/travel-records/photos.mjs';
import {travelRecordsCopy} from './travel-records-copy';
import {TravelArt,travelError} from './travel-records-media';
import styles from './travel-records.module.css';
function localDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function TravelRecordForm({lang,store,previous,markDirty,onSaved}:{lang:Lang;store:TravelStore;previous:TravelRecord|null;markDirty:()=>void;onSaved:(r:TravelRecord)=>void}){
 const c=travelRecordsCopy[lang],[photo,setPhoto]=useState(previous?.photo??null),[photoBusy,setPhotoBusy]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[photoStatus,setPhotoStatus]=useState('');
 const alive=useRef(true),job=useRef(0),photoInput=useRef<HTMLInputElement>(null),errorRef=useRef<HTMLParagraphElement>(null);
 useEffect(()=>{alive.current=true;const input=photoInput.current,stop=()=>setPhotoStatus(c.photoCancelled);input?.addEventListener('cancel',stop);return()=>{alive.current=false;input?.removeEventListener('cancel',stop);};},[c.photoCancelled]);
 async function choosePhoto(file?:File){
  if(!file)return;markDirty();const current=++job.current;setPhotoBusy(true);setPhotoStatus(c.photoPreparing);setError('');
  try{const prepared=await preparePhoto(file);if(alive.current&&current===job.current){setPhoto(prepared);setPhotoStatus(c.photoReady);}}
  catch(e){if(alive.current&&current===job.current){setError(travelError(e,lang));setPhotoStatus(c.photoKeep);}}
  finally{if(alive.current&&current===job.current){setPhotoBusy(false);if(photoInput.current)photoInput.current.value='';}}
 }
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy||photoBusy)return;setBusy(true);setError('');const data=new FormData(event.currentTarget);
  try{const r=await makeRecord({date:String(data.get('date')??''),from:String(data.get('from')??''),to:String(data.get('to')??''),memo:String(data.get('memo')??'')},photo,previous);await store.save(r,previous?.revision??null);if(alive.current)onSaved(r);}
  catch(e){if(alive.current){setError(travelError(e,lang));requestAnimationFrame(()=>errorRef.current?.focus());}}
  finally{if(alive.current)setBusy(false);}
 }
 return <section><a className={styles.link} href={previous?`#/record/${previous.id}`:'#/'}>{c.back}</a><form className={styles.form} id="record-form" onSubmit={save} onChange={markDirty}>
  <label htmlFor="date">{c.date}<input id="date" name="date" type="date" min="1900-01-01" max="2199-12-31" required defaultValue={previous?.date??localDate()} autoComplete="off"/></label>
  <div className={styles.pair}><label htmlFor="from">{c.from}<input id="from" name="from" maxLength={60} required defaultValue={previous?.from??''} autoComplete="off" spellCheck={false}/></label><label htmlFor="to">{c.to}<input id="to" name="to" maxLength={60} required defaultValue={previous?.to??''} autoComplete="off" spellCheck={false}/></label></div>
  <label htmlFor="memo">{c.memo}<input id="memo" name="memo" maxLength={80} required defaultValue={previous?.memo??''} autoComplete="off" aria-describedby="memo-help"/></label><p className={styles.help} id="memo-help">{c.memoHelp}</p>
  <label htmlFor="photo">{c.photo}<input ref={photoInput} id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} aria-describedby="photo-help" onChange={e=>void choosePhoto(e.currentTarget.files?.[0])}/></label><p className={styles.help} id="photo-help">{c.photoHelp}</p><p className={styles.help} role="status" id="photo-status">{photoStatus||(photo?c.photoReady:c.noPhoto)}</p>
  {photo&&<TravelArt photo={photo} lang={lang}/>}
  <p ref={errorRef} tabIndex={-1} id="form-error" role="alert" className={styles.error}>{error}</p><div className={styles.actions}><button id="save" type="submit" disabled={busy||photoBusy} className={`${styles.button} ${styles.primary}`}>{busy?c.saving:c.save}</button>{!busy&&<a className={styles.button} href={previous?`#/record/${previous.id}`:'#/'}>{c.cancel}</a>}</div>
 </form></section>;
}
