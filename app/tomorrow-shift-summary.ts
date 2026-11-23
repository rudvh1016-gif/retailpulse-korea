'use client';

import {useEffect,useState} from 'react';
import type {LiveSummary} from './live-signals';
import {readStoredJson} from '../lib/read-stored-json';
import {createStoredReadCache} from '../lib/stored-read-cache';
import {isValidSummaryRefreshPayload} from '../lib/summary-refresh-policy';

const reads=createStoredReadCache<LiveSummary>(async day=>{
 const payload=await readStoredJson<unknown>('/api/live/summary?date='+encodeURIComponent(day));
 if(!isValidSummaryRefreshPayload(payload,day))throw Error('SUMMARY_INVALID_RESPONSE');
 return payload as LiveSummary;
});

/** Take one stored summary while the configured briefing is open. No polling.
 * A selected-date owner supplies its own result so we never duplicate that read. */
export function useTomorrowShiftSummary(day:string|null){
 const [state,setState]=useState<{day:string;summary:LiveSummary|null}|null>(null);
 useEffect(()=>{
  if(!day)return;
  let active=true;
  const read=()=>{
   if(!active||document.visibilityState==='hidden')return;
   document.removeEventListener('visibilitychange',read);
   const settled=(summary:LiveSummary|null)=>{if(active)setState({day,summary});};
   void reads.read(day).then(({value,failed})=>settled(failed?null:value),()=>settled(null));
  };
  if(document.visibilityState==='hidden')document.addEventListener('visibilitychange',read);
  else read();
  return()=>{active=false;document.removeEventListener('visibilitychange',read);};
 },[day]);
 return state?.day===day?state?.summary:undefined;
}
