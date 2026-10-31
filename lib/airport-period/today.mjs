import {dailyFlightHours,terminalFlightHours} from '../airport-flight-hours.ts';
export function buildTodayProfile(payload,day){
 const profile=dailyFlightHours(payload.flights,day);
 if(profile.unknownBuilding>0||profile.T1.total+profile.T2.total+profile.CONCOURSE.total===0)throw Error('incomplete');
 const a=terminalFlightHours(profile,'T1'),b=terminalFlightHours(profile,'T2');
 return {date:day,T1:a.total,T2:b.total,h1:a.hours,h2:b.hours,provisional:true,retrievedAt:payload.retrievedAt,basis:payload.basis};
}
