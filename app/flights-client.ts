'use client';

/**
 * One /api/live/flights read per date for the whole page visit, shared by the
 * departure map and the day comparison. A failure is forgotten so a later
 * open can try again.
 */
import { useEffect, useState } from 'react';
import type { MapFlightRow } from '../lib/airport-departure-map';

export interface FlightsPayload { mode: string; serviceDateKst?:string; basis?: string; flights: MapFlightRow[]; retrievedAt?: string | null; truncated?: boolean }
export type Loaded = { status: 'OK'; payload: FlightsPayload } | { status: 'FAILED' };

const pending = new Map<string, Promise<Loaded>>();

export function loadFlights(date: string): Promise<Loaded> {
  let request = pending.get(date);
  if (!request) {
    request = fetch(`/api/live/flights?date=${encodeURIComponent(date)}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
      .then(async (response) => {
        const payload = response.ok ? await response.json() as FlightsPayload : null;
        return payload?.mode === 'live-flights' && (!payload.serviceDateKst||payload.serviceDateKst===date) && Array.isArray(payload.flights) ? { status: 'OK' as const, payload } : { status: 'FAILED' as const };
      })
      .catch(() => ({ status: 'FAILED' as const }));
    pending.set(date, request);
    void request.then((result) => { if (result.status === 'FAILED') pending.delete(date); });
  }
  return request;
}

export function useFlights(date: string | null): Loaded | undefined {
  const [state, setState] = useState<{ date: string; value: Loaded } | undefined>(undefined);
  useEffect(() => {
    if (!date) return;
    let live = true;
    void loadFlights(date).then((value) => { if (live) setState({ date, value }); });
    return () => { live = false; };
  }, [date]);
  return state && state.date === date ? state.value : undefined;
}
