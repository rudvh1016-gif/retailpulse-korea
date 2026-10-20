'use client';
import {createContext,useContext} from 'react';
export interface FocusTrend {code:string;label:string;points:Array<{month:string;departures:number|null}>}
export interface FocusData {asOf:string;trends:FocusTrend[];checkedAt:string|null;preview:boolean;failed:boolean}
export const AirportFocusData=createContext<FocusData>({asOf:'',trends:[],checkedAt:null,preview:false,failed:false});
export const useAirportFocusData=()=>useContext(AirportFocusData);
