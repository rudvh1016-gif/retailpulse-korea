import type {AirportFlightMonth, MonthCounts} from './airport-monthly-flights';

/** Stored T1 includes the separately counted concourse on exactly the same dates.
 * Project their exact difference for the main-building UI, leaving the stored
 * terminal contract and official passenger statistics untouched. */
export function mainBuildingMonth(month:AirportFlightMonth|undefined):AirportFlightMonth|undefined {
 if(!month)return undefined;
 const t1=month.scopes.T1,concourse=month.scopes.CONCOURSE;
 if(!t1||!concourse)return undefined;
 const subtract=(all:Record<string,number>,part:Record<string,number>)=>{
  const out:Record<string,number>={};
  for(const key of new Set([...Object.keys(all),...Object.keys(part)])){
   const a=all[key]??0,b=part[key]??0;
   if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||b<0||a<b)throw Error('UNAVAILABLE_BUILDING_SPLIT');
   if(a>b)out[key]=a-b;
  }
  return out;
 };
 try{
  const total=subtract({total:t1.total},{total:concourse.total}).total??0;
  const destinationCountries=subtract(t1.destinationCountries,concourse.destinationCountries);
  const sides={...t1.sides,UNVERIFIED:subtract({n:t1.sides.UNVERIFIED},{n:concourse.total}).n??0};
  let destinationSides:MonthCounts['destinationSides'];
  if(t1.destinationSides){
   destinationSides={};
   for(const country of Object.keys(destinationCountries)){
    const cross=t1.destinationSides[country];
    if(!cross)throw Error('UNAVAILABLE_BUILDING_SPLIT');
    destinationSides[country]={...cross,UNVERIFIED:subtract({n:cross.UNVERIFIED},{n:concourse.destinationCountries[country]??0}).n??0};
   }
  }
  return {...month,scopes:{...month.scopes,T1:{total,sides,destinationCountries,destinationSides,
   airlines:subtract(t1.airlines,concourse.airlines),registrationCountries:subtract(t1.registrationCountries,concourse.registrationCountries)}}};
 }catch{return undefined;}
}
