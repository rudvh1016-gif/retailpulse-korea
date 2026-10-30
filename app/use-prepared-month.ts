'use client';
import {useEffect,useRef,useState} from 'react';
import {createPrimedMonthReads} from '../lib/primed-month-reads';
import {readStoredJson} from '../lib/read-stored-json';
interface PreparedReply {status:string;month:string;area?:string;data:unknown|null}
/** A read a page started before any hook asked for it (primePreparedMonth). The first attempt of
 * the first hook for the same URL takes it over instead of asking again. Each primed read is used
 * once and only within ten seconds of starting; every later attempt, retry or refresh reads the
 * API itself exactly as before, so a primed read can never stand in for a later one. */
const primed=createPrimedMonthReads();
export function primePreparedMonth(url:string){
 primed.prime(url);
}
/** Three bounded reads per selection. Keeps verified data only for its exact key;
 * aborted/late responses cannot replace another selection. No write or refresh API. */
export function usePreparedMonth<T extends PreparedReply>(key:string,url:string,month:string,refreshKey:string) {
 const good=useRef(new Map<string,T>());
 const [retry,setRetry]=useState(0);
 const [state,setState]=useState<{key:string;reply:T|null;pending:boolean;failed:boolean;retained:boolean;attempt:number}|null>(null);
 useEffect(()=>{
  if(!month)return;
  let active=true,backoff:ReturnType<typeof setTimeout>|undefined;
  const controller=new AbortController();
  const run=async(attempt:number)=>{
   if(!active)return;
   setState(previous=>({key,reply:previous?.key===key?previous.reply:good.current.get(key)??null,pending:true,failed:false,retained:good.current.has(key),attempt}));
   const request=new AbortController();
   const abort=()=>request.abort();controller.signal.addEventListener('abort',abort,{once:true});
   let reply:T|null=null;
   try{const value=await ((attempt===1&&primed.take(url,request.signal))||readStoredJson<T>(url,{signal:request.signal,cache:'no-store'})) as T;
    const area=new URLSearchParams(url.split('?')[1]).get('area');
     const data=value?.data as {month?:string;area?:string}|null|undefined;
     if(value?.month===month&&(!area||value.area===area)&&(!data?.month||data.month===month)&&(!data?.area||data.area===area))reply=value;
   }catch{/* Preserve the matching last-good reply. */}
   finally{controller.signal.removeEventListener('abort',abort);}
   if(!active)return;
   const ready=reply?.status==='READY'&&reply.data!=null;
   if(ready){good.current.delete(key);good.current.set(key,reply!);if(good.current.size>3)good.current.delete(good.current.keys().next().value!);}
   const failed=!reply||reply.status==='UNAVAILABLE';
   setState({key,reply:ready?reply:good.current.get(key)??reply,pending:false,failed,retained:!ready&&good.current.has(key),attempt});
   if(!ready&&attempt<3)backoff=setTimeout(()=>void run(attempt+1),attempt===1?2_000:10_000);
  };
  // Defer the first state transition to keep render/effect responsibilities separate.
  backoff=setTimeout(()=>void run(1),0);
  return()=>{active=false;clearTimeout(backoff);controller.abort();};
 },[key,url,month,refreshKey,retry]);
 const current=state?.key===key?state:null;
 return {reply:current?.reply??undefined,pending:!current||current.pending,
  failed:current?.failed??false,retained:current?.retained??false,attempt:current?.attempt??0,retry:()=>setRetry(value=>value+1)};
}
