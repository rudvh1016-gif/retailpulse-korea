'use client';
/* eslint-disable @next/next/no-css-tags -- private tools stylesheet stays out of anonymous public pages */
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import PersonalToolsPreview from './preview';
type Status={enabled:boolean;authenticated:boolean;accountId?:string;privacyVersion?:string};
const changeKey='koretail-account-session-change',pendingKey='koretail-account-login-pending';
function signalSessionChange(){try{localStorage.setItem(changeKey,crypto.randomUUID());}catch{/* Focus revalidation remains available when storage is blocked. */}}
function validStatus(value:unknown):Status {
 if(!value||typeof value!=='object')throw Error();
 const data=value as Status;
 if(typeof data.enabled!=='boolean'||typeof data.authenticated!=='boolean'||(data.authenticated&&(typeof data.accountId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(data.accountId))))throw Error();
 return data;
}
export default function Account(){
 const [status,setStatus]=useState<Status|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[phrase,setPhrase]=useState(''),[checking,setChecking]=useState(true);
 const [verificationFailed,setVerificationFailed]=useState(false);
 const active=useRef(true),sequence=useRef(0),statusRequest=useRef<AbortController|null>(null),actionLock=useRef(false);
 const invalidate=useCallback(()=>{setStatus(null);setPhrase('');setChecking(true);setMessage('계정이 바뀌었거나 로그인이 종료되었습니다. 개인 자료를 숨겼습니다.');},[]);
 const verify=useCallback(async()=>{
  const turn=++sequence.current;statusRequest.current?.abort();const controller=new AbortController();statusRequest.current=controller;
  const timer=setTimeout(()=>controller.abort(),15000);setChecking(true);setVerificationFailed(false);
  try{
   const response=await fetch('/api/account/status',{cache:'no-store',credentials:'same-origin',redirect:'error',signal:controller.signal});
   if(!response.ok)throw Error();const next=validStatus(await response.json());
   if(active.current&&turn===sequence.current){setStatus(next);setPhrase('');setChecking(false);}
  }catch{if(active.current&&turn===sequence.current){setStatus(null);setPhrase('');setVerificationFailed(true);}}
  finally{clearTimeout(timer);}
 },[]);
 useEffect(()=>{
  active.current=true;
  const initial=setTimeout(()=>{if(new URLSearchParams(window.location.search).get('auth')==='failed')setMessage('Google 로그인을 완료하지 못했습니다. 다시 시도해 주세요.');void verify();},0);
  try{if(sessionStorage.getItem(pendingKey)){sessionStorage.removeItem(pendingKey);signalSessionChange();}}catch{}
  const focus=()=>void verify(),hide=()=>{sequence.current++;statusRequest.current?.abort();setChecking(true);},visibility=()=>{if(document.visibilityState==='visible')void verify();else hide();};
  const storage=(event:StorageEvent)=>{if(event.key===changeKey){invalidate();void verify();}};
  window.addEventListener('focus',focus);window.addEventListener('blur',hide);window.addEventListener('storage',storage);document.addEventListener('visibilitychange',visibility);
  // Invalidate every request generation, not a captured DOM ref.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return()=>{clearTimeout(initial);active.current=false;sequence.current++;statusRequest.current?.abort();window.removeEventListener('focus',focus);window.removeEventListener('blur',hide);window.removeEventListener('storage',storage);document.removeEventListener('visibilitychange',visibility);};
 },[invalidate,verify]);
 const accountInvalid=useCallback(()=>{invalidate();void verify();},[invalidate,verify]);
 async function action(kind:'login'|'logout'|'delete'){
  if(actionLock.current||checking)return;actionLock.current=true;setBusy(true);setMessage('');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000),accountId=status?.accountId;
  const options={credentials:'same-origin' as const,cache:'no-store' as const,redirect:'error' as const,signal:controller.signal};
  // Local privacy must not depend on a successful network logout response.
  if(kind==='logout')invalidate();
  try{
   if(kind==='delete'){
    if(phrase!=='DELETE KORETAIL ACCOUNT')throw Error('삭제 확인 문구를 입력해 주세요.');
    const current=await fetch('/api/account/state',{...options,headers:{'x-koretail-account':accountId??''}});
    if(!current.ok){accountInvalid();throw Error('현재 계정을 다시 확인해 주세요.');}
    const data=await current.json();
    const removed=await fetch('/api/account/delete',{...options,method:'POST',headers:{'content-type':'application/json','x-koretail-account':accountId??''},body:JSON.stringify({expectedRevision:data.revision,confirmation:phrase})});
    if(!removed.ok){const error=await removed.json();if(error.error==='UNAUTHENTICATED'||error.error==='ACCOUNT_CHANGED')accountInvalid();throw Error(error.error==='REAUTH_REQUIRED'?'계정 삭제 전 Google로 다시 로그인해 주세요.':'삭제하지 못했습니다. 최신 자료를 확인한 뒤 다시 시도해 주세요.');}
    invalidate();signalSessionChange();window.location.replace('/ko');return;
   }
   const response=await fetch('/api/account/'+(kind==='login'?'google/start':'logout'),{...options,method:'POST',headers:{'x-koretail-account':accountId??''}});
   if(!response.ok)throw Error('계정 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.');
   if(kind==='login'){
    const result=await response.json(),target=new URL(result.url);
    if(target.origin!=='https://accounts.google.com'||target.pathname!=='/o/oauth2/v2/auth')throw Error('로그인 주소를 확인하지 못했습니다.');
    try{sessionStorage.setItem(pendingKey,'1');}catch{}
    window.location.assign(target.href);
   }else{invalidate();signalSessionChange();await verify();}
  }catch(error){if(active.current)setMessage(kind==='logout'?'로그아웃 완료 여부를 확인하지 못했습니다. 개인 자료는 이 화면에서 숨겼습니다.':error instanceof Error?error.message:'계정 요청을 완료하지 못했습니다.');}
  finally{clearTimeout(timer);actionLock.current=false;if(active.current)setBusy(false);}
 }
 return <main><section className="pt-shell"><link rel="stylesheet" href="/personal-tools-preview.css"/><Link href="/ko" prefetch={false}>← 로그인 없이 KORETAIL 이용</Link><h1 data-heading="page"><span className="heading-marker" aria-hidden="true"/>내 계정</h1>
  <p>Google이 로그인 응답에 이메일을 포함할 수 있습니다. KORETAIL은 계정 연결에 Google 계정 식별자만 사용합니다. 이메일과 프로필 이름은 저장하지 않으며 연락처·Drive·Google 캘린더 권한은 요청하지 않습니다.</p>
  <p>로그인한 개인 도구에서 저장하는 근무·메모·즐겨찾기·체크리스트·알림 선택은 KORETAIL의 별도 계정 저장소에 내용을 보호해 보관합니다. 다른 기기에서도 같은 Google 계정으로 읽을 수 있습니다. 이 브라우저의 기존 로컬 자료는 자동으로 올리지 않습니다.</p>
  <p>개인 자료는 직접 삭제할 때까지 보관합니다. 로그인 세션은 최대 7일입니다. 백업 파일은 본인이 보관하며 계정을 삭제해도 다운로드한 백업은 지워지지 않습니다.</p>
  <p role="status">{verificationFailed?'계정을 확인하지 못해 개인 자료를 숨겼습니다. 다시 확인해 주세요.':message||(checking?'계정 확인 중…':status?.authenticated?'Google 계정으로 로그인했습니다.':'공개 서비스는 가입 없이 계속 이용할 수 있습니다.')}</p>
  {status?.enabled&&<button disabled={busy||checking} onClick={()=>void action(status.authenticated?'logout':'login')}>{status.authenticated?'로그아웃':'Google로 가입 / 로그인'}</button>}
  {status?.authenticated&&<button disabled={busy||checking} onClick={()=>void action('login')}>Google로 다시 확인</button>}
  {!status&&<button onClick={()=>void verify()}>계정 다시 확인</button>}
 </section>
 {status?.authenticated&&status.accountId&&<div data-private-account hidden={checking}>
  <PersonalToolsPreview key={status.accountId} accountId={status.accountId} onAccountInvalid={accountInvalid} alertsPaused={checking}/>
  <section className="pt-shell"><h2 data-heading="section"><span className="heading-marker" aria-hidden="true"/>계정 삭제</h2><p>먼저 개인 도구의 JSON 백업을 내려받으세요. 이 계정과 서버 개인 자료를 삭제하고 모든 기기의 세션을 종료합니다. 다시 가입해도 삭제된 자료는 자동 복구되지 않습니다. 최근 5분 안의 Google 로그인이 필요합니다.</p><label>계정 삭제 확인<input value={phrase} autoComplete="off" onChange={e=>setPhrase(e.target.value)} placeholder="DELETE KORETAIL ACCOUNT"/></label><button disabled={busy||checking||phrase!=='DELETE KORETAIL ACCOUNT'} onClick={()=>void action('delete')}>계정과 서버 개인 자료 삭제</button></section>
 </div>}
 </main>;
}
