'use client';
import Image from 'next/image';
import {useEffect,useRef} from 'react';
import type {Lang} from './retailpulse-data';
import type {StoredPhoto} from '../lib/travel-records/types';
import {travelConcept,travelRecordsCopy} from './travel-records-copy';
import styles from './travel-records.module.css';
export function travelError(error:unknown,lang:Lang){
 const c=travelRecordsCopy[lang],e=error as {name?:string;code?:string};
 if(e?.name==='QuotaExceededError')return c.quota;
 if(e?.name==='AbortError')return c.cancelled;
 if(e?.name==='ConstraintError')return c.duplicate;
 const codes:Record<string,string>={CONFLICT:c.conflict,DUPLICATE:c.duplicate,FORMAT:c.formatError,VERSION:c.formatError,PHOTO:c.photoError,DATE:c.dateError,TEXT:c.textError,LIMIT:c.limitError,STORAGE:c.storageError};
 return codes[e?.code??'']??c.failure;
}
export function travelDate(date:string,lang:Lang){return new Intl.DateTimeFormat({ko:'ko-KR',en:'en-GB',zh:'zh-CN',ja:'ja-JP'}[lang],{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z'));}
export function TravelArt({photo,lang,eager=false}:{photo:StoredPhoto|null;lang:Lang;eager?:boolean}){
 const ref=useRef<HTMLImageElement>(null),c=travelRecordsCopy[lang];
 useEffect(()=>{if(!photo)return;const url=URL.createObjectURL(photo.blob);if(ref.current)ref.current.src=url;return()=>URL.revokeObjectURL(url);},[photo]);
 const localPhoto=photo&&(
  // eslint-disable-next-line @next/next/no-img-element -- Private IndexedDB blobs need a native image without server optimization or generated srcset.
  <img ref={ref} width={photo.width} height={photo.height} alt={c.photoAlt} loading={eager?'eager':'lazy'} decoding="async"/>
 );
 return <figure className={styles.art}>
  {photo?localPhoto:<Image src={travelConcept.src} width={travelConcept.width} height={travelConcept.height} unoptimized alt={c.conceptAlt} priority={eager}/>}
  {!photo&&<figcaption>{c.illustration}</figcaption>}
 </figure>;
}
