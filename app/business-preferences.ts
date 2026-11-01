'use client';
import { useSyncExternalStore } from 'react';
import { BUSINESS_KEY, DEFAULT_BUSINESS_PREFERENCES, parseBusinessPreferences, resolveBusinessContext, serializeBusinessPreferences, sharedBusinessPlace, type BusinessPreferences } from '../lib/business-preferences';
import type { PrepArea } from '../lib/business-prep';

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

function subscribeVisit(listener: () => void) {
  window.addEventListener('popstate', listener);
  window.addEventListener(CHANGE, listener);
  return () => { window.removeEventListener('popstate', listener); window.removeEventListener(CHANGE, listener); };
}

/** Shared by the tabs, briefing and guide so a linked scope cannot split the screen. */
export function useBusinessContext(area: PrepArea) {
  const stored = useBusinessPreferences();
  const address = useSyncExternalStore(subscribeVisit, () => window.location.pathname + window.location.search, () => '');
  const [pathname, query = ''] = address.split('?');
  const scope = /^\/(ko|en|zh|ja)\/(business|more)\/?$/.test(pathname) ? sharedBusinessPlace(new URLSearchParams(query)) : null;
  return { ...stored, savedPreferences: stored.preferences, ...resolveBusinessContext(stored.preferences, area, scope), scope };
}

function clearSavedVisitScope() {
  const url = new URL(window.location.href);
  if (!/^\/(ko|en|zh|ja)\/business\/?$/.test(url.pathname) || (!url.searchParams.has('place') && !url.searchParams.has('area'))) return;
  for (const key of ['place', 'area', 'terminal', 'side']) url.searchParams.delete(key);
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

export function saveBusinessPreferences(value: BusinessPreferences | null) {
  fallback = value ? serializeBusinessPreferences(value) : null;
  try {
    if (fallback) window.localStorage.setItem(BUSINESS_KEY, fallback);
    else window.localStorage.removeItem(BUSINESS_KEY);
    failed = false;
  } catch { failed = true; }
  // Only an explicit choice/save dismisses a visiting link. Opening it never writes storage.
  clearSavedVisitScope();
  window.dispatchEvent(new Event(CHANGE));
}
