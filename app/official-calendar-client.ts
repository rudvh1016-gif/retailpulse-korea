'use client';
import {useEffect,useState} from 'react';
import type {CalendarEvent} from '../lib/calendar-context.mjs';
import type {CalendarSourceStatus,CalendarReplacementScope,CalendarChange,AutomaticCalendarCountry} from '../lib/official-calendar-runtime';
interface CalendarReply {changes?:Array<CalendarChange & {country:AutomaticCalendarCountry}>;status:string;events:CalendarEvent[];sources:CalendarSourceStatus[];calendarReplacementScopes:CalendarReplacementScope[];checkedAt:string|null}
let cached:CalendarReply|null=null,readAt=0,inFlight:Promise<CalendarReply>|null=null;
export function requestOfficialCalendar(){if(cached&&Date.now()-readAt<300000)return Promise.resolve(cached);if(inFlight)return inFlight;
 inFlight=fetch('/api/airport/calendar',{signal:AbortSignal.timeout(10000)}).then(async response=>{if(!response.ok)throw Error('CALENDAR_UNAVAILABLE');const data=await response.json() as CalendarReply;if(!Array.isArray(data.events)||data.events.length>1500||!Array.isArray(data.sources)||!Array.isArray(data.calendarReplacementScopes))throw Error('CALENDAR_SCHEMA');cached=data;readAt=Date.now();return data;}).finally(()=>{inFlight=null;});return inFlight;}
/** One small cached read, no polling/provider request. Failed refresh retains
 * last fetched events; source timestamps remain those returned by the API. */
export function useOfficialCalendar(enabled=true){
 const [reply,setReply]=useState<CalendarReply|null>(cached);
 useEffect(()=>{if(!enabled)return;let current=true;requestOfficialCalendar().then(value=>{if(current)setReply(value);}).catch(()=>{});return()=>{current=false;};},[enabled]);
 return {calendarEvents:enabled?reply?.events:undefined,calendarSources:enabled?reply?.sources:undefined,calendarReplacementScopes:enabled?reply?.calendarReplacementScopes:undefined,calendarCheckedAt:enabled?reply?.checkedAt??null:null};
}
