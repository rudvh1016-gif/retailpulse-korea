import type {AirportFlightMonth} from './airport-monthly-flights';
import type {RateLang} from './change-rate';
import {comparisonBasisLabel} from './comparison-basis';

const locales={ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'};
const t=(lang:RateLang,ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];

/** Calendar labels only: the prepared counts and their denominators stay unchanged. */
export function airportMonthLabel(month:string,lang:RateLang){
 return new Intl.DateTimeFormat(locales[lang],{month:lang==='en'?'short':'numeric',timeZone:'UTC'}).format(new Date(month+'-01T00:00:00Z'));
}

export function airportMonthPeriodLabel(data:AirportFlightMonth|undefined,month:string,lang:RateLang){
 // Stored flight scans have completion evidence, not official monthly actuals.
 const label=comparisonBasisLabel({month,includedDays:data?.includedDays??[],through:data?.through,
  excludedDays:data?.excludedDays.map(row=>row.day),expectedDays:data?.eligibleDays,provenance:'collected'},lang);
 const coverage=data?.includedDays.length&&data.includedDays.length!==data.eligibleDays
  ?` (${data.includedDays.length}/${data.eligibleDays}${t(lang,'일',' days','天','日')})`:'';
 return label+coverage;
}

export function airportMonthComparisonBasis(current:AirportFlightMonth,previous:AirportFlightMonth|undefined,previousMonth:string,lang:RateLang){
 return `${airportMonthPeriodLabel(previous,previousMonth,lang)} / ${airportMonthPeriodLabel(current,current.month,lang)}`;
}
