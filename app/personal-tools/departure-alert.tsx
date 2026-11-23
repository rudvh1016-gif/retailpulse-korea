'use client';

import {useEffect,useRef,useState} from 'react';
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

async function displayNotification(title:string, options:NotificationOptions) {
  if ('serviceWorker' in navigator) {
    try {
      const registration=await navigator.serviceWorker.register('/personal-departure-notifications.js',{scope:'/ko/account'});
      if(registration.active){await registration.showNotification(title,options);return;}
    } catch { /* Some browsers only support notifications through the window. */ }
  }
  new Notification(title,options);
}

export function DepartureAlert({state,accountId,paused,onRefresh}:{
  state:PersonalState;accountId:string;paused:boolean;onRefresh:()=>Promise<boolean>;
}) {
  const [allowed,setAllowed]=useState<Permission>('default');
  const [message,setMessage]=useState('');
  const [testing,setTesting]=useState(false);
  const refresh=useRef(onRefresh);
  const lastPoll=useRef({key:'',at:0});
  const threshold=state.notificationPreferences.departureWaitMinutes;
  useEffect(()=>{refresh.current=onRefresh;},[onRefresh]);

  useEffect(()=>{
    if(!threshold)return;
    const syncPermission=()=>setAllowed(permission());
    const initial=setTimeout(syncPermission,0);
    window.addEventListener('focus',syncPermission);
    document.addEventListener('visibilitychange',syncPermission);
    return()=>{
      clearTimeout(initial);
      window.removeEventListener('focus',syncPermission);
      document.removeEventListener('visibilitychange',syncPermission);
    };
  },[threshold]);

  useEffect(()=>{
    if(!threshold||paused||allowed!=='granted')return;
    let pending:AbortController|null=null;
    const check=async()=>{
      const access=permission();
      if(access!=='granted'){setAllowed(access);return;}
      const now=Date.now();
      const shift=activeDepartureShift(state,now);
      if(document.visibilityState!=='visible'||pending||!shift)return;
      const keyForPoll=[accountId,shift.date,shift.pattern.id,shift.pattern.terminal,shift.pattern.side,threshold].join(':');
      if(lastPoll.current.key===keyForPoll&&now-lastPoll.current.at<checkEvery-1000)return;
      lastPoll.current={key:keyForPoll,at:now};
      const request=new AbortController();
      pending=request;
      const timeout=setTimeout(()=>request.abort(),10_000);
      try{
        const response=await fetch('/api/airport/departure-alert?terminal='+shift.pattern.terminal,
          {credentials:'omit',signal:request.signal});
        if(!response.ok)return;
        const snapshot=await response.json();
        const alert=departureAlert(snapshot,state,Date.now());
        if(!alert||request.signal.aborted||permission()!=='granted'||document.visibilityState!=='visible')return;
        const key='koretail-departure-notice:'+await localMarker(accountId);
        const seen=await localMarker(accountId+':'+alert.shiftKey);
        await navigator.locks.request(key,{signal:request.signal},async()=>{
          const active=()=>!request.signal.aborted&&permission()==='granted'&&document.visibilityState==='visible'
            &&departureAlert(snapshot,state,Date.now())?.shiftKey===alert.shiftKey;
          if(!active()||localStorage.getItem(key)===seen)return;
          // Validate the private schedule once per eligible alert. Changes on any
          // device, including revocation, make the rendered document obsolete.
          const verified=await fetch('/api/account/revision',{cache:'no-store',credentials:'same-origin',signal:request.signal,
            headers:{'x-koretail-account':accountId}});
          if(verified.status===401||verified.status===409){void refresh.current();return;}
          if(!verified.ok)return;
          if((await verified.json()).revision!==state.revision){void refresh.current();return;}
          if(!active())return;
          const body=`${alert.terminal} ${alert.zone} · 대기 ${alert.minutes}분${alert.lowerBound?' 이상':''}`;
          localStorage.setItem(key,seen);
          try{await displayNotification('코리테일 출국장 알림',{body,tag:'koretail-departure'});}
          catch{localStorage.removeItem(key);setMessage('이 브라우저에서 시스템 알림을 표시하지 못했습니다.');return;}
          setMessage(body);
        });
      }catch{/* Absent or unverified information never generates a notification. */}
      finally{clearTimeout(timeout);pending=null;}
    };
    const initial=setTimeout(()=>void check(),0);
    const interval=setInterval(()=>void check(),checkEvery);
    document.addEventListener('visibilitychange',check);
    return()=>{clearTimeout(initial);clearInterval(interval);pending?.abort();document.removeEventListener('visibilitychange',check);};
  },[state,accountId,threshold,paused,allowed]);

  const request=async()=>{
    try{
      if(permission()==='unavailable'){setAllowed('unavailable');return;}
      const result=await Notification.requestPermission();
      setAllowed(result);
      if(result==='granted'&&'serviceWorker' in navigator){
        void navigator.serviceWorker.register('/personal-departure-notifications.js',{scope:'/ko/account'}).catch(()=>{});
      }
    }
    catch{setAllowed('unavailable');}
  };
  const test=async()=>{
    setTesting(true);
    try{
      if(permission()!=='granted')return;
      await displayNotification('코리테일 알림 테스트',{body:'출국장 대기시간 알림을 확인하고 있습니다.',tag:'koretail-departure-test'});
      setMessage('테스트 알림을 표시했습니다.');
    }catch{setMessage('시스템 알림을 표시하지 못했습니다. 브라우저 알림 설정을 확인해 주세요.');}
    finally{setTesting(false);}
  };
  if(!threshold)return null;
  return <div className="pt-inset"><p>이 계정 화면이 보이는 동안 근무표의 터미널을 5분마다 확인합니다. 기준에 도달하면 이 브라우저에서 근무당 한 번 알립니다. T1은 근무표의 동편·서편 선택을 적용합니다.</p>
    {allowed==='default'&&<button type="button" onClick={()=>void request()}>이 브라우저에서 출국장 알림 허용</button>}
    {allowed==='denied'&&<p>브라우저 설정에서 코리테일 알림을 허용해 주세요.</p>}
    {allowed==='unavailable'&&<p>이 브라우저는 출국장 시스템 알림을 지원하지 않습니다.</p>}
    {allowed==='granted'&&<button type="button" disabled={testing} onClick={()=>void test()}>테스트 알림 보내기</button>}
    {message&&<p role="status">{message}</p>}
  </div>;
}
