import {destinationOf} from './airport-destinations';
import {profileOf,type DayProfile} from './airport-day-profile';
import {isValidKstDay} from './kst';
import type {DailyObservation} from './holiday-period-comparison.mjs';
export const COMPARISON_COUNTRIES=['CN','JP','VN','US','TW','TH','HK','SG','AU','CA','PH','MY'] as const;
/** A stored complete scan is required. Unknown destinations/buildings could hide
 * flights for any country, so those days are excluded rather than understated. */
export function countryDayObservations(profile:DayProfile):DailyObservation[]{
 if(!isValidKstDay(profile.day))return [];
 const countries=new Map<string,number>();let unknown=profile.unknownBuilding;
 let invalid=!Number.isSafeInteger(unknown)||unknown<0;
 for(const scope of [profile.T1,profile.T2,profile.CONCOURSE]){
  if(!scope||!Number.isSafeInteger(scope.total)||scope.total<0){invalid=true;continue;}
  let counted=0;
  for(const [name,count] of Object.entries(scope.destinations??{})){
   if(!Number.isSafeInteger(count)||count<0){invalid=true;continue;}counted+=count;
   const country=destinationOf(name)?.country;if(!country)unknown+=count;else countries.set(country,(countries.get(country)??0)+count);
  }
  if(counted!==scope.total)invalid=true;
 }
 const complete=profile.complete===true&&!invalid&&unknown===0;
 return COMPARISON_COUNTRIES.map(country=>({country,date:profile.day,value:complete?(countries.get(country)??0):null,complete,metric:'departure_flights',scope:'ALL'}));
}
export function storedCountryDayObservations(rows:readonly {day:string;payload:string}[]):DailyObservation[]{
 return rows.flatMap(row=>{try{const profile=profileOf(JSON.parse(row.payload));return profile&&profile.day===row.day?countryDayObservations(profile):[];}catch{return [];}});
}
