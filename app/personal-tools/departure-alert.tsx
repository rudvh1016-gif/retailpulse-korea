'use client';

import {useEffect,useState} from 'react';
import {activeDepartureShift,departureAlert} from '../../lib/personal-tools/departure-alert';
import type {PersonalState} from '../../lib/personal-tools/model';

type Permission = NotificationPermission | 'unavailable';
const permission = (): Permission => typeof Notification !== 'undefined' && navigator.locks
  ? Notification.permission : 'unavailable';
const checkEvery = 5 * 60_000;
async function localMarker(value:string) {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}

export function DepartureAlert({state,accountId,paused}:{state:PersonalState;accountId:string;paused:boolean}) {
  const [allowed,setAllowed]=useState<Permission>('default');
  const [message,setMessage]=useState('');
  const enabled=Boolean(state.notificationPreferences.departureWaitMinutes);

  useEffect(()=>{
    if(!enabled||paused)return;
    let pending:AbortController|null=null;
    const check=async()=>{
      const access=permission();
      setAllowed(access);
      if(access!=='granted'||document.visibilityState!=='visible'||pending||!activeDepartureShift(state,Date.now()))return;
      const request=new AbortController();
      pending=request;
      const timeout=setTimeout(()=>request.abort(),10_000);
      try{
        const response=await fetch('/api/live/summary',{signal:request.signal});
        if(!response.ok)return;
        const snapshot=await response.json();
        const alert=departureAlert(snapshot,state,Date.now());
        if(!alert||request.signal.aborted||permission()!=='granted'||document.visibilityState!=='visible')return;
        // Web Locks serialize multiple tabs. One local record expires on the next shift.
        const key='koretail-departure-notice:'+await localMarker(accountId);
        const seen=await localMarker(accountId+':'+alert.shiftKey);
        await navigator.locks.request(key,()=>{
          if(request.signal.aborted||permission()!=='granted'||document.visibilityState!=='visible'||
             !activeDepartureShift(state,Date.now())||localStorage.getItem(key)===seen)return;
          localStorage.setItem(key,seen);
          const body=`${alert.terminal} ${alert.zone} · 대기 ${alert.minutes}분${alert.lowerBound?' 이상':''}`;
          try{new Notification('코리테일 출국장 알림',{body,tag:'koretail-departure'});}
          catch{localStorage.removeItem(key);setMessage('이 브라우저에서 시스템 알림을 표시하지 못했습니다.');return;}
          setMessage(body);
        });
      }catch{/* No notification when the current observation could not be confirmed. */}
      finally{clearTimeout(timeout);pending=null;}
    };
    const initial=setTimeout(()=>void check(),0);
    const interval=setInterval(()=>void check(),checkEvery);
    return()=>{clearTimeout(initial);clearInterval(interval);pending?.abort();};
  },[state,accountId,enabled,paused,allowed]);

  const request=async()=>{
    try{if(permission()!=='unavailable')setAllowed(await Notification.requestPermission());else setAllowed('unavailable');}
    catch{setAllowed('unavailable');}
  };
  if(!enabled)return null;
  return <div className="pt-inset"><p>이 계정 화면이 열린 동안 근무표의 터미널에서 기준에 도달하면 근무당 한 번 알립니다. T1은 근무표의 동편·서편 선택을 적용합니다.</p>
    {allowed==='default'&&<button type="button" onClick={()=>void request()}>이 브라우저에서 출국장 알림 허용</button>}
    {allowed==='denied'&&<p>브라우저 설정에서 코리테일 알림을 허용해 주세요.</p>}
    {allowed==='unavailable'&&<p>이 브라우저는 출국장 시스템 알림을 지원하지 않습니다.</p>}
    {allowed==='granted'&&<p>브라우저 알림이 허용됐습니다.</p>}
    {message&&<p role="status">{message}</p>}
  </div>;
}
