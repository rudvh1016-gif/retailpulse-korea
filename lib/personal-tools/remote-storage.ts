import {parsePersonalBackup,PersonalToolsError,MAX_PERSONAL_STATE_BYTES} from './model';
import type {PersonalStore} from './storage';
const safeErrors=new Set(['CONFLICT','ACCOUNT_CHANGED','UNAUTHENTICATED','RATE_LIMITED','CONFIRMATION','INVALID_SHAPE','INVALID_VALUE','INVALID_ID','INVALID_DATE','INVALID_TIME','INVALID_TIMESTAMP','INVALID_REVISION','INVALID_CHRONOLOGY','STATE_TOO_LARGE','LIMIT_EXCEEDED','DANGLING_REFERENCE','REFERENCE_IN_USE','NOT_FOUND','DUPLICATE_ID','UNSUPPORTED_VERSION']);
/** A store is bound to the identity shown when it opened, never a later login. */
export async function openRemotePersonalStore(accountId:string,fetcher:typeof fetch=fetch):Promise<PersonalStore>{
 if(!/^[0-9a-f-]{36}$/.test(accountId))throw new PersonalToolsError('UNAUTHENTICATED');
 let closed=false;const controllers=new Set<AbortController>();
 async function call(body?:unknown){
  if(closed)throw new PersonalToolsError('CLOSED');
  const controller=new AbortController();controllers.add(controller);const timeout=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetcher('/api/account/state',{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,headers:{'content-type':'application/json','x-koretail-account':accountId},...(body===undefined?{}:{body:JSON.stringify(body)})});
   const reader=response.body?.getReader();if(!reader)throw new PersonalToolsError('STORAGE');
   let length=0;const chunks:Uint8Array[]=[];
   try{while(true){const result=await reader.read();if(result.done)break;length+=result.value.byteLength;if(length>MAX_PERSONAL_STATE_BYTES+4096){await reader.cancel();throw new PersonalToolsError('STATE_TOO_LARGE');}chunks.push(result.value);}}
   finally{reader.releaseLock();}
   const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
   const raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
   if(!response.ok){let error='STORAGE';try{const value=JSON.parse(raw).error;if(safeErrors.has(value))error=value;}catch{}throw new PersonalToolsError(error);}
   if(closed)throw new PersonalToolsError('CLOSED');
   return parsePersonalBackup(raw);
  }finally{clearTimeout(timeout);controllers.delete(controller);}
 }
 return {read:()=>call(),dispatch:(command,expectedRevision)=>call({type:'command',command,expectedRevision}),restore:(raw,expectedRevision)=>call({type:'restore',raw,expectedRevision}),clear:(expectedRevision,confirmation)=>call({type:'clear',expectedRevision,confirmation}),close(){closed=true;for(const controller of controllers)controller.abort();controllers.clear();}};
}
