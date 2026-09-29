'use client';
import { useSyncExternalStore } from 'react';
import { BUSINESS_KEY, DEFAULT_BUSINESS_PREFERENCES, parseBusinessPreferences, serializeBusinessPreferences, type BusinessPreferences } from '../lib/business-preferences';

// Same shape as app/personal-preferences.ts: device-only, and when storage is
// blocked (private mode, a strict in-app browser) the choice lives in memory
// for the visit instead of failing.
const CHANGE = 'koretail-business-changed';
let fallback: string | null = null;
let failed = false;

function subscribe(listener: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === BUSINESS_KEY || event.key === null) { fallback = null; failed = false; listener(); } };
  window.addEventListener(CHANGE, listener);
  window.addEventListener('storage', storage);
  return () => { window.removeEventListener(CHANGE, listener); window.removeEventListener('storage', storage); };
}

function snapshot() {
  if (failed) return fallback;
  try { return window.localStorage.getItem(BUSINESS_KEY); } catch { return fallback; }
}

export function useBusinessPreferences() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => undefined);
  const saved = parseBusinessPreferences(raw ?? null);
  return { ready: raw !== undefined, saved: saved !== null, preferences: saved ?? DEFAULT_BUSINESS_PREFERENCES, storageFailed: failed };
}

export function saveBusinessPreferences(value: BusinessPreferences | null) {
  fallback = value ? serializeBusinessPreferences(value) : null;
  try {
    if (fallback) window.localStorage.setItem(BUSINESS_KEY, fallback);
    else window.localStorage.removeItem(BUSINESS_KEY);
    failed = false;
  } catch { failed = true; }
  window.dispatchEvent(new Event(CHANGE));
}
