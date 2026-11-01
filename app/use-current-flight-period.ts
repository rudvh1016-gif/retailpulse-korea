'use client';
import {useMemo,useState} from 'react';
import {currentFlightPeriod} from '../lib/current-flight-period';
import type {AirportFlightMonth} from '../lib/airport-monthly-flights';
import type {GlanceWeekReference} from '../lib/glance-week-comparison';
import {kstDayOf} from '../lib/kst';
import {usePresentationClock} from './presentation-clock';
import {useFlights} from './flights-client';
import {usePreparedMonth} from './use-prepared-month';
type Reply={status:string;month:string;data:GlanceWeekReference|null};
/** The existing cached flight read + one bounded same-epoch witness read.
 * Historical and already-populated monthly views never start either additional read. */
export function useCurrentFlightPeriod(day:string|null,month:string,previous:AirportFlightMonth|undefined,enabled:boolean){
 const now=usePresentationClock(new Date().toISOString()),today=kstDayOf(new Date(now).toISOString());
 const active=enabled&&day===today&&month===today.slice(0,7);
 const [revision,refresh]=useState(0);
 const flights=useFlights(active?day:null,'all',revision),payload=flights?.status==='OK'?flights.payload:null;
 const witnessMonth=active&&payload?month:'';
 const reference=usePreparedMonth<Reply>(`${day}:${payload?.retrievedAt??''}:${revision}`,`/api/live/glance-week-reference?date=${day??''}`,witnessMonth,`${day}:${payload?.retrievedAt??''}:${revision}`);
 const value=useMemo(()=>active&&day?currentFlightPeriod(day,payload,reference.reply?.data,previous,new Date(now).toISOString()):null,[active,day,payload,reference.reply?.data,previous,now]);
 return {active,value,pending:active&&(flights===undefined||reference.pending),retry:()=>refresh(n=>n+1)};
}
