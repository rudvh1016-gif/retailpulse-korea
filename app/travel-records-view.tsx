'use client';
import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import type {Lang} from './retailpulse-data';
import type {TravelRecord,TravelStore} from '../lib/travel-records/types';
import {openStore} from '../lib/travel-records/storage.mjs';
import {travelMessage,travelRecordsCopy} from './travel-records-copy';
import {TravelRecordForm} from './travel-records-form';
import {TravelRecordsBackup} from './travel-records-backup';
import {TravelRecordsActions} from './travel-records-actions';
import styles from './travel-records.module.css';

import {travelError,travelDate,TravelArt} from './travel-records-media';
export function TravelRecordsView({lang,navigateLocale,homeHref=`/${lang}`,airportHref=`/${lang}/airport`}:{lang:Lang;navigateLocale:(lang:Lang)=>void;homeHref?:string;airportHref?:string|null}){
 const c=travelRecordsCopy[lang],dirty=useRef(false),[store,setStore]=useState<TravelStore|null>(null),[error,setError]=useState(''),[rows,setRows]=useState<TravelRecord[]>([]),[record,setRecord]=useState<TravelRecord|null>(null),[loading,setLoading]=useState(true),[loadedHash,setLoadedHash]=useState(''),[status,setStatus]=useState('');
 const subscribe=useCallback((notify:()=>void)=>{let current=location.hash||'#/';const change=()=>{const next=location.hash||'#/';if(dirty.current&&!window.confirm(c.changed)){history.replaceState(null,'',current);return;}dirty.current=false;current=next;notify();};window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[c.changed]);
 const hash=useSyncExternalStore(subscribe,()=>location.hash||'#/',()=>'#/');
 const parts=hash.slice(2).split('/'),mode=parts[0],id=parts[1];
 useEffect(()=>{
  let live=true,opened:TravelStore|undefined;
  openStore().then(value=>{opened=value;if(live)setStore(value);else value.close();}).catch(e=>{if(live){setError(travelError(e,lang));setLoading(false);}});
  return()=>{live=false;opened?.close();};
 },[lang]);
 useEffect(()=>{
  const leave=(event:BeforeUnloadEvent)=>{if(dirty.current){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',leave);
  return()=>window.removeEventListener('beforeunload',leave);
 },[]);
 useEffect(()=>{
  if(!store)return;let live=true;
  Promise.all([store.list(),id&&(mode==='record'||mode==='edit')?store.get(id):Promise.resolve(null)]).then(([list,value])=>{if(live){setRows(list);setRecord(value);setError('');setLoadedHash(hash);setLoading(false);}}).catch(e=>{if(live){setError(travelError(e,lang));setLoadedHash(hash);setLoading(false);}});
  return()=>{live=false;};
 },[store,hash,id,mode,lang]);
 const navigate=(next:string,message='')=>{dirty.current=false;setStatus(message);location.hash=next;};
 const markDirty=()=>{dirty.current=true;};
 const title=mode==='new'?c.add:mode==='edit'?c.edit:mode==='backup'?c.backup:c.title;
 return <div className={`app lang-${lang} ${styles.root}`} data-testid="travel-records" data-hydrated={store?'true':'false'}>
  <a className={styles.skip} href="#travel-main">{c.skip}</a>
  <div className="site-header"><header className="topbar"><a className="brand" href={homeHref}><span translate="no">KORETAIL</span><span className="brand-descriptor">Retail Demand Signals for Korea</span></a>
   <div className="header-meta">{airportHref&&<a className={styles.link} href={airportHref}>{c.airport}</a>}<label className="language-control"><span className="sr-only">{c.language}</span><select aria-label={c.language} value={lang} onChange={e=>{if(dirty.current&&!window.confirm(c.changed))return;dirty.current=false;navigateLocale(e.target.value as Lang);}}><option value="ko">한국어</option><option value="en">English</option><option value="zh">简体中文</option><option value="ja">日本語</option></select></label></div>
  </header></div>
  <main id="travel-main" className={styles.main}>
   <h1 tabIndex={-1}>{title}</h1><p className={styles.intro}>{c.intro}</p>
   <p role="status" aria-live="polite" className={styles.status} data-testid="travel-status">{status}</p>
   {loading||(store&&loadedHash!==hash)?<p role="status">{c.loading}</p>:error?<div role="alert" className={styles.error}><p>{error}</p><button type="button" className={styles.button} onClick={()=>location.reload()}>{c.retry}</button></div>:store&&<>
    {(mode==='new'||(mode==='edit'&&record))?<TravelRecordForm key={hash} lang={lang} store={store} previous={record&&mode==='edit'?record:null} markDirty={markDirty} onSaved={r=>navigate(`#/record/${r.id}`,c.saved)}/>:mode==='backup'?<TravelRecordsBackup lang={lang} store={store} onRestored={message=>navigate('#/',message)}/>:mode==='record'||mode==='edit'?record?<article data-testid="travel-detail"><a className={styles.link} href="#/">{c.back}</a><TravelArt photo={record.photo} lang={lang} eager/><p className={styles.memo} data-testid="detail-memo">{record.memo}</p><dl className={styles.fields}><dt>{c.date}</dt><dd>{travelDate(record.date,lang)}</dd><dt>{c.from}</dt><dd>{record.from}</dd><dt>{c.to}</dt><dd>{record.to}</dd></dl><a className={styles.button} href={`#/edit/${record.id}`}>{c.edit}</a></article>:<p>{c.missing} <a className={styles.link} href="#/">{c.back}</a></p>:<>
     <div className={styles.actions}><a className={`${styles.button} ${styles.primary}`} href="#/new" data-testid="travel-add">{c.add}</a><a className={styles.link} href="#/backup">{c.backup}</a></div>
     {rows.length?<><p>{travelMessage(c.count,{count:new Intl.NumberFormat(lang).format(rows.length)})}</p><section className={styles.cards} aria-label={c.list}>{rows.map(r=><a className={styles.card} key={r.id} href={`#/record/${r.id}`} data-testid="travel-card"><TravelArt photo={r.photo} lang={lang}/><div><p className={styles.date}>{travelDate(r.date,lang)}</p><p className={styles.route}>{r.from} <span aria-hidden="true">→</span> {r.to}</p><p>{r.memo}</p></div></a>)}</section></>:<section className={styles.empty} data-testid="travel-empty"><TravelArt photo={null} lang={lang} eager/><h2>{c.empty}</h2><p>{c.emptyNote}</p><a className={styles.button} href="#/new">{c.add}</a></section>}
    </>}
   </>}
   {store&&<TravelRecordsActions lang={lang} store={store} record={mode==='record'&&loadedHash===hash?record:null} onChanged={(value,message)=>{setRecord(value);setRows(old=>value?[value,...old.filter(r=>r.id!==value.id)]:old.filter(r=>r.id!==record?.id));navigate(value?`#/record/${value.id}`:'#/',message);}}/>}
   <aside className={styles.notice}><p>{c.local}</p>{mode!=='backup'&&<a className={styles.link} href="#/backup">{c.backup}</a>}</aside>
  </main>
 </div>;
}
