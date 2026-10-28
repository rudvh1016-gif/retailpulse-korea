'use client';

/**
 * Share concurrent reads and short-lived responses across flight views.
 * A day opened before the first collection must refresh later in the same visit.
 */
import { useEffect, useMemo, useState } from 'react';
import {scopedFlightPayload,type TerminalFlightFallback} from '../lib/airport-flight-scope';
import {kstDayOf,shiftKstDay} from '../lib/kst';
import type { MapFlightRow } from '../lib/airport-departure-map';

export interface FlightsPayload { mode: string; generatedAt?:string; serviceDateKst?:string; basis?: string; flights: MapFlightRow[]; retrievedAt?: string | null; truncated?: boolean; terminalFallbacks?:Record<string,TerminalFlightFallback<MapFlightRow>> }
export type Loaded = { status: 'OK'; payload: FlightsPayload } | { status: 'FAILED' };

const pending = new Map<string, Promise<Loaded>>();
const cached = new Map<string, { at: number; value: Loaded }>();
export const FLIGHTS_TTL_MS = 120_000;

async function readFlights(url:string,date:string):Promise<Loaded>{
  for(let attempt=0;attempt<2;attempt++){
    try{
      const response=await fetch(url,{headers:{accept:'application/json'},cache:'no-cache',signal:AbortSignal.timeout(15_000)});
      const payload=response.ok?await response.json() as FlightsPayload:null;
      return payload?.mode==='live-flights'&&(!payload.serviceDateKst||payload.serviceDateKst===date)&&Array.isArray(payload.flights)?{status:'OK',payload}:{status:'FAILED'};
    }catch(error){
      // A 200 header is not a completed body. Retry one interrupted transport
      // read of the same stored date; HTTP/JSON/contract failures stay failures.
      const interrupted=error instanceof TypeError||(error instanceof Error&&['AbortError','TimeoutError'].includes(error.name));
      if(attempt===1||!interrupted)return {status:'FAILED'};
    }
  }
  return {status:'FAILED'};
}

export function loadFlights(date: string, refresh = false): Promise<Loaded> {
  const clockDay=kstDayOf(new Date(Date.now()).toISOString()),key=`${date}:${clockDay}`;
  let request = pending.get(key);
  if (request) return request;
  const saved = cached.get(key);
  // Coalesce focus/visibility bursts without retaining a successful response forever.
  if (saved && Date.now() - saved.at < (refresh ? 5_000 : FLIGHTS_TTL_MS)) return Promise.resolve(saved.value);
  if (!request) {
    request = readFlights(`/api/live/flights?date=${encodeURIComponent(date)}&_day=${clockDay}`,date);
    pending.set(key, request);
    void request.then((result) => {
      pending.delete(key);
      if (result.status === 'FAILED') cached.delete(key);
      else {
        cached.delete(key);
        cached.set(key, { at: Date.now(), value: result });
        if (cached.size > 8) cached.delete(cached.keys().next().value!);
      }
    });
  }
  return request;
}

export function useFlights(date: string | null, scope='all'): Loaded | undefined {
  const [state, setState] = useState<{ date: string; value: Loaded } | undefined>(undefined);
  useEffect(() => {
    if (!date) return;
    let live = true;
    let revision = 0;
    const update = (refresh = false) => {
      if (document.visibilityState === 'hidden') return;
      const requestedRevision = ++revision;
      // A late held response must not replace newer records of the same date.
      void loadFlights(date, refresh).then((value) => { if (live && requestedRevision === revision) setState({ date, value }); });
    };
    const onFocus = () => update(true);
    const onVisible = () => { if (document.visibilityState === 'visible') update(true); };
    update();
    const timer = window.setInterval(() => update(true), FLIGHTS_TTL_MS);
    // A fixed future selection keeps its date at midnight. Renew its basis
    // immediately rather than waiting for the two-minute freshness interval.
    let midnightTimer:number;
    const scheduleMidnight=()=>{
      const now=new Date().toISOString(),next=shiftKstDay(kstDayOf(now),1);
      midnightTimer=window.setTimeout(()=>{update(true);scheduleMidnight();},Date.parse(`${next}T00:00:00+09:00`)-Date.parse(now)+10);
    };
    scheduleMidnight();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.clearTimeout(midnightTimer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [date]);
  return useMemo(()=>state && state.date === date ? state.value.status==='OK'?{...state.value,payload:scopedFlightPayload(state.value.payload,scope)}:state.value : undefined,[state,date,scope]);
}
