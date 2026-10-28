import {dutyFreeSources,shiftExchangeDate} from '../lib/duty-free-exchange';
export function recentFxFixture(end='2026-10-21',rates:(number|null)[]=[1400.25,1401.12,null,1402.34,1403.56,1404.78,1332.1]){
 const days=rates.map((krwPerUsd,i)=>({date:shiftExchangeDate(end,i-6)!,krwPerUsd,verifiedAt:krwPerUsd===null?null:`${shiftExchangeDate(end,i-6)}T01:00:00Z`,dateEvidence:krwPerUsd===null?null:'CURRENT_WIDGET'}));
 return {vendor:'shilla',currency:'USD',scope:'INTERNET_SHOP',sourceUrl:dutyFreeSources.shilla,asOfDateKst:end,generatedAt:`${end}T02:00:00Z`,start:days[0].date,end,expectedDays:7,observedDays:days.filter(d=>d.krwPerUsd!==null).length,missingDates:days.filter(d=>d.krwPerUsd===null).map(d=>d.date),fullDayApplicabilityVerified:false,days};
}
