'use client';
import {createContext,useContext} from 'react';
import type {HomeMonthlySelection} from '../lib/home-monthly-countries';
import type {CalendarEvent} from '../lib/calendar-context.mjs';
import type {CalendarSourceStatus,CalendarReplacementScope} from '../lib/official-calendar-runtime';
export interface FocusTrend {code:string;label:string;points:Array<{month:string;departures:number|null}>}
export interface FocusData {calendarEvents?:CalendarEvent[];calendarSources?:CalendarSourceStatus[];calendarReplacementScopes?:CalendarReplacementScope[];calendarCheckedAt?:string|null;asOf:string;homeMonthlySelection?:HomeMonthlySelection;homeTrends?:FocusTrend[];trends:FocusTrend[];checkedAt:string|null;preview:boolean;failed:boolean}
export const AirportFocusData=createContext<FocusData>({asOf:'',trends:[],checkedAt:null,preview:false,failed:false});
export const useAirportFocusData=()=>useContext(AirportFocusData);
