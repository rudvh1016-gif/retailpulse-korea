import type {Lang} from '../app/retailpulse-data';
import type {MapFlight} from './airport-departure-map';

export const domesticDestinationLabel=(lang:Lang)=>({ko:'국내 목적지',en:'Domestic destinations',zh:'国内目的地',ja:'国内の目的地'})[lang];
export const domesticTransitLabel=(lang:Lang)=>({ko:'국내 환승편',en:'Domestic transit flight',zh:'国内中转航班',ja:'国内乗り継ぎ便'})[lang];
export const domesticTransitGuide='https://www.koreanair.com/contents/booking/reservation-guide/how-to-book/domestic-transit?hl=ko';

// Confirmed outbound examples, checked against the airline's domestic-transit
// guide on 2026-10-12. This is deliberately not a rule for every KR destination.
const confirmedTransit:Readonly<Record<string,string>>={KE1401:'PUS',KE1403:'PUS',KE1405:'PUS',KE1407:'PUS',KE1409:'PUS',KE1431:'TAE'};
export function domesticFlightKind(flight:Pick<MapFlight,'flightNumber'|'destination'>):'transit'|'domestic'|null{
 if(flight.destination?.country!=='KR')return null;
 const number=flight.flightNumber.replace(/\s/g,'').toUpperCase();
 return confirmedTransit[number]===flight.destination.iata?'transit':'domestic';
}
