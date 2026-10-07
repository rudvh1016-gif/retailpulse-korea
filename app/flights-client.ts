'use client';

/**
 * Share concurrent reads and short-lived responses across flight views.
 * A day opened before the first collection must refresh later in the same visit.
 */
import { useEffect, useState } from 'react';
import type { MapFlightRow } from '../lib/airport-departure-map';

export interface FlightsPayload { mode: string; serviceDateKst?:string; basis?: string; flights: MapFlightRow[]; retrievedAt?: string | null; truncated?: boolean }
export type Loaded = { status: 'OK'; payload: FlightsPayload } | { status: 'FAILED' };

const pending = new Map<string, Promise<Loaded>>();
const cached = new Map<string, { at: number; value: Loaded }>();
export const FLIGHTS_TTL_MS = 120_000;

export function loadFlights(date: string, refresh = false): Promise<Loaded> {
  let request = pending.get(date);
  if (request) return request;
  const saved = cached.get(date);
  // Coalesce focus/visibility bursts without retaining a successful response forever.
  if (saved && Date.now() - saved.at < (refresh ? 5_000 : FLIGHTS_TTL_MS)) return Promise.resolve(saved.value);
  if (!request) {
    request = fetch(`/api/live/flights?date=${encodeURIComponent(date)}`, { headers: { accept: 'application/json' }, cache: 'no-cache', signal: AbortSignal.timeout(15_000) })
      .then(async (response) => {
        const payload = response.ok ? await response.json() as FlightsPayload : null;
        return payload?.mode === 'live-flights' && (!payload.serviceDateKst||payload.serviceDateKst===date) && Array.isArray(payload.flights) ? { status: 'OK' as const, payload } : { status: 'FAILED' as const };
      })
      .catch(() => ({ status: 'FAILED' as const }));
    pending.set(date, request);
    void request.then((result) => {
      pending.delete(date);
      if (result.status === 'FAILED') cached.delete(date);
      else {
        cached.delete(date);
        cached.set(date, { at: Date.now(), value: result });
        if (cached.size > 8) cached.delete(cached.keys().next().value!);
      }
    });
  }
  return request;
}

export function useFlights(date: string | null): Loaded | undefined {
  const [state, setState] = useState<{ date: string; value: Loaded } | undefined>(undefined);
  useEffect(() => {
    if (!date) return;
    let live = true;
    const update = (refresh = false) => {
      if (document.visibilityState === 'hidden') return;
      void loadFlights(date, refresh).then((value) => { if (live) setState({ date, value }); });
    };
    const onFocus = () => update(true);
    const onVisible = () => { if (document.visibilityState === 'visible') update(true); };
    update();
    const timer = window.setInterval(() => update(true), FLIGHTS_TTL_MS);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [date]);
  return state && state.date === date ? state.value : undefined;
}
