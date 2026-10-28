import {dailyFlightProfile} from '../airport-day-profile.ts';
import {terminalDay} from '../airport-day-compare.ts';
export function buildTodayProfile(payload,day){
 const profile=dailyFlightProfile(payload.flights,day,false);
 if(profile.unknownBuilding>0||profile.T1.total+profile.T2.total+profile.CONCOURSE.total===0)throw Error('incomplete');
 const a=terminalDay(profile,'T1'),b=terminalDay(profile,'T2');
 return {date:day,T1:a.total,T2:b.total,h1:a.hours,h2:b.hours,provisional:true,retrievedAt:payload.retrievedAt,basis:payload.basis};
}
