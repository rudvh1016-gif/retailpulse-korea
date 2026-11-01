'use client';

import { useEffect, useState } from 'react';
import type { ShiftHistoryRow } from '../lib/shift-briefing';
import { isValidKstDay } from '../lib/kst';

/** Existing /airport-days response: terminal/hour history, not side/hour data. */
export interface AirportHistoryPayload {
  mode: 'airport-days';
  date: string;
  generatedAt?: string;
  history: ShiftHistoryRow[];
  rowsRead?: number;
  withoutProfile?: number;
  /** Client-side invalid rows remain missing from comparison coverage. */
  discardedRows?: number;
}
export type AirportHistoryLoad = { status: 'OK'; payload: AirportHistoryPayload } | { status: 'FAILED' };
const TTL_MS = 600_000;
const cached = new Map<string, { at: number; value: AirportHistoryLoad }>();
const pending = new Map<string, Promise<AirportHistoryLoad>>();

/** Validate the selected date before any response enters the shared cache. */
export function airportHistoryPayload(value: unknown, date: string): AirportHistoryPayload | null {
  const body = value as Partial<AirportHistoryPayload> | null;
  if (!isValidKstDay(date) || body?.mode !== 'airport-days' || body.date !== date
    || !Array.isArray(body.history) || body.history.length > 63) return null;
  const count = (number: unknown): number is number => typeof number === 'number' && Number.isSafeInteger(number) && number >= 0;
  const history = body.history.filter(row => row && row.T1 && row.T2 && row.T1.day === row.T2.day
    && isValidKstDay(row.T1.day) && row.T1.day < date
    && (['T1', 'T2'] as const).every(terminal => {
      const day = row[terminal];
      return typeof day.complete === 'boolean' && typeof day.sidesVersion === 'string' && count(day.total)
        && Array.isArray(day.hours) && day.hours.length === 24 && day.hours.every(count)
        && day.hours.reduce((sum, value) => sum + value, 0) === day.total
        && Array.isArray(day.sides) && day.sides.length === 4 && day.sides.every(count)
        && day.groups !== null && typeof day.groups === 'object' && !Array.isArray(day.groups)
        && Object.values(day.groups).every(count);
    }));
  return { ...body, history, discardedRows: body.history.length - history.length } as AirportHistoryPayload;
}

/** One bounded stored-data read per date, coalesced across home and radar. */
export function loadAirportHistory(date: string, refresh = false): Promise<AirportHistoryLoad> {
  if (!isValidKstDay(date)) return Promise.resolve({ status: 'FAILED' });
  const running = pending.get(date);
  if (running) return running;
  const saved = cached.get(date);
  if (saved && Date.now() - saved.at < (refresh ? 5_000 : TTL_MS)) return Promise.resolve(saved.value);
  const request = fetch(`/api/live/airport-days?date=${encodeURIComponent(date)}`, {
    headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000),
  }).then(async response => {
    const body = response.ok ? airportHistoryPayload(await response.json(), date) : null;
    return body ? { status: 'OK' as const, payload: body } : { status: 'FAILED' as const };
  }).catch(() => ({ status: 'FAILED' as const }));
  pending.set(date, request);
  void request.then(value => {
    pending.delete(date);
    if (value.status === 'FAILED') cached.delete(date);
    else {
      cached.delete(date);
      cached.set(date, { at: Date.now(), value });
      if (cached.size > 8) cached.delete(cached.keys().next().value!);
    }
  });
  return request;
}

export function useAirportHistory(date: string | null): AirportHistoryLoad | undefined {
  const [state, setState] = useState<{ date: string; value: AirportHistoryLoad } | null>(null);
  useEffect(() => {
    if (!date) return;
    let active = true, revision = 0;
    const refresh = (force = false) => {
      if (document.visibilityState === 'hidden') return;
      const requestRevision = ++revision;
      void loadAirportHistory(date, force).then(value => {
        if (active && requestRevision === revision) setState({ date, value });
      });
    };
    const focused = () => refresh(true);
    refresh();
    const timer = window.setInterval(() => refresh(), TTL_MS);
    window.addEventListener('focus', focused);
    document.addEventListener('visibilitychange', focused);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', focused);
      document.removeEventListener('visibilitychange', focused);
    };
  }, [date]);
  return state?.date === date ? state.value : undefined;
}
