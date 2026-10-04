'use client';
import {useCallback,useSyncExternalStore} from 'react';
function subscribeDOM(listener:()=>void) {
 const observer=new MutationObserver(listener);
 observer.observe(document.body,{childList:true,subtree:true});
 return ()=>observer.disconnect();
}
const serverSnapshot=()=>null;
export function useAirportModelTarget(id?:string) {
 const snapshot=useCallback(()=>id?document.getElementById(id):null,[id]);
 return useSyncExternalStore(subscribeDOM,snapshot,serverSnapshot);
}
