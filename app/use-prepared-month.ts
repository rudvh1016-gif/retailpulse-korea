'use client';
import {useEffect,useRef,useState} from 'react';
interface PreparedReply {status:string;month:string;area?:string;data:unknown|null}
/** One network read per identical request while it is in flight. The airport
 * model's monthly block mounts again at another tree position when the flight
 * map finishes loading; it joins the read already on the wire instead of
 * cancelling it and sending the same URL again. Nothing is kept once the read
 * settles, so every later check is a new read. */
const inflight=new Map<string,Promise<unknown>>();
function readOnce(id:string,url:string):Promise<unknown> {
 let read=inflight.get(id);
 if(!read){
  const request=new AbortController(),timeout=setTimeout(()=>request.abort(),15_000);
  read=fetch(url,{signal:request.signal,cache:'no-store'}).then(response=>response.ok?response.json():null).catch(()=>null)
   .finally(()=>{clearTimeout(timeout);inflight.delete(id);});
  inflight.set(id,read);
 }
 return read;
}
/** Three bounded reads per selection. Keeps verified data only for its exact key;
 * late responses cannot replace another selection. No write or refresh API. */
export function usePreparedMonth<T extends PreparedReply>(key:string,url:string,month:string,refreshKey:string) {
 const good=useRef(new Map<string,T>());
 const [retry,setRetry]=useState(0);
 const [state,setState]=useState<{key:string;reply:T|null;pending:boolean;failed:boolean;retained:boolean;attempt:number}|null>(null);
 useEffect(()=>{
  if(!month)return;
  let active=true,backoff:ReturnType<typeof setTimeout>|undefined;
  const run=async(attempt:number)=>{
   if(!active)return;
   setState(previous=>({key,reply:previous?.key===key?previous.reply:good.current.get(key)??null,pending:true,failed:false,retained:good.current.has(key),attempt}));
   let reply:T|null=null;
   // A failed or late read keeps the matching last-good reply; `active` stops it replacing another selection.
   const value=await readOnce(`${refreshKey}\n${url}`,url) as T|null,area=new URLSearchParams(url.split('?')[1]).get('area');
   const data=value?.data as {month?:string;area?:string}|null|undefined;
   if(value?.month===month&&(!area||value.area===area)&&(!data?.month||data.month===month)&&(!data?.area||data.area===area))reply=value;
   if(!active)return;
   const ready=reply?.status==='READY'&&reply.data!=null;
   if(ready){good.current.delete(key);good.current.set(key,reply!);if(good.current.size>3)good.current.delete(good.current.keys().next().value!);}
   const failed=!reply||reply.status==='UNAVAILABLE';
   setState({key,reply:ready?reply:good.current.get(key)??reply,pending:false,failed,retained:!ready&&good.current.has(key),attempt});
   if(!ready&&attempt<3)backoff=setTimeout(()=>void run(attempt+1),attempt===1?2_000:10_000);
  };
  // Defer the first state transition to keep render/effect responsibilities separate.
  backoff=setTimeout(()=>void run(1),0);
  return()=>{active=false;clearTimeout(backoff);};
 },[key,url,month,refreshKey,retry]);
 const current=state?.key===key?state:null;
 return {reply:current?.reply??undefined,pending:!current||current.pending,
  failed:current?.failed??false,retained:current?.retained??false,attempt:current?.attempt??0,retry:()=>setRetry(value=>value+1)};
}
