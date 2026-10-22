import {buildAirportFlightMonth,type AirportFlightMonth} from '../../lib/airport-monthly-flights';
import type {EventFlightContext} from '../../lib/event-country-flights';
export function flightBaseline(totals:Record<string,number>={TH:554,TW:30,JP:600},days=30,month='2026-09'):AirportFlightMonth{
 const base=buildAirportFlightMonth(month,'2026-10-22',[],new Set());
 base.includedDays=Array.from({length:days},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`);
 base.excludedDays=base.excludedDays.filter(row=>!base.includedDays.includes(row.day));
 base.scopes.ALL.destinationCountries={...totals};base.scopes.ALL.total=Object.values(totals).reduce((a,b)=>a+b,0);
 return base;
}
export const eventFlights=(overrides:Partial<EventFlightContext>={}):EventFlightContext=>({day:'2026-10-22',scope:'all',status:'READY',countries:[{country:'TH',flights:16},{country:'TW',flights:90},{country:'JP',flights:20}],baseline:flightBaseline(),...overrides});
