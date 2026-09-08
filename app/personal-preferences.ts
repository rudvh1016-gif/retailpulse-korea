'use client';
import { useSyncExternalStore } from 'react';
import { parsePreferences, PREFERENCE_KEY, type PersonalPreferences } from '../lib/personal-briefing';
const CHANGE = 'koretail-preferences-changed';
let fallback: string | null = null;
let failed = false;
function subscribe(listener: ()=>void) {
  const storage = (event: StorageEvent) => { if(event.key===PREFERENCE_KEY || event.key===null) {fallback=null;failed=false;listener();} };
  window.addEventListener(CHANGE,listener);
  window.addEventListener('storage',storage);
  return ()=>{window.removeEventListener(CHANGE,listener);window.removeEventListener('storage',storage);};
}
function snapshot() {
  if(failed) return fallback;
  try{return window.localStorage.getItem(PREFERENCE_KEY);}catch{return fallback;}
}
export function usePersonalPreferences() {
  const raw = useSyncExternalStore(subscribe,snapshot,()=>undefined);
  return {ready:raw!==undefined,preferences:parsePreferences(raw ?? null),storageFailed:failed};
}
export function savePersonalPreferences(p: PersonalPreferences | null) {
  fallback = p ? JSON.stringify(p) : null;
  try {
    if(fallback) window.localStorage.setItem(PREFERENCE_KEY,fallback);
    else window.localStorage.removeItem(PREFERENCE_KEY);
    failed=false;
  } catch {failed=true;}
  window.dispatchEvent(new Event(CHANGE));
}
// One answer per question, service date, role and place on this device.
// The bounded ledger also survives a refresh; failures fall back to memory.
const FEEDBACK_KEY = 'koretail-feedback-v1';
const answers = new Map<string,string>();
export function feedbackValue(key:string) {
  try {const ledger = JSON.parse(window.localStorage.getItem(FEEDBACK_KEY) ?? '{}'); if(ledger && typeof ledger[key]==='string') return ledger[key];}catch{}
  return answers.get(key) ?? null;
}
export function rememberFeedback(key:string,value:'yes'|'no') {
  if(feedbackValue(key)) return false;
  answers.set(key,value);
  try {
    const raw = JSON.parse(window.localStorage.getItem(FEEDBACK_KEY) ?? '{}');
    const ledger = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    ledger[key]=value;
    window.localStorage.setItem(FEEDBACK_KEY,JSON.stringify(Object.fromEntries(Object.entries(ledger).slice(-100))));
  }catch{}
  window.dispatchEvent(new Event(CHANGE));
  return true;
}
export function useFeedback(key:string) {return useSyncExternalStore(subscribe,()=>feedbackValue(key),()=>null);}
