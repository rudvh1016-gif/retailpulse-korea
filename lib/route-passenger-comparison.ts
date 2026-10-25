import type {AirportStatsMonth,AirportStatsRow} from './airport-monthly-stats-read';
export function passengerMonthDays(month:string){if(!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month))return null;return new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).getUTCDate();}
/** Compare independently selected months, joining by published labels, never filling absent countries with zero. */
export function compareRoutePassengerMonths(selected:AirportStatsMonth|null|undefined,baseline:AirportStatsMonth|null|undefined){
 const left=new Map((selected?.rows??[]).filter(row=>!row.aggregate).map(row=>[row.label,row]));
 const right=new Map((baseline?.rows??[]).filter(row=>!row.aggregate).map(row=>[row.label,row]));
 const selectedDays=selected?passengerMonthDays(selected.month):null,baselineDays=baseline?passengerMonthDays(baseline.month):null;
 return [...new Set([...left.keys(),...right.keys()])].map(label=>{
  const current=left.get(label),previous=right.get(label),selectedTotal=current?.departures??null,baselineTotal=previous?.departures??null;
  const selectedMean=selectedTotal!==null&&selectedDays?selectedTotal/selectedDays:null,baselineMean=baselineTotal!==null&&baselineDays?baselineTotal/baselineDays:null;
  return {label,row:(current??previous) as AirportStatsRow,selectedTotal,baselineTotal,selectedMean,baselineMean,percent:selectedMean!==null&&baselineMean!==null&&baselineMean>0?(selectedMean-baselineMean)/baselineMean*100:null};
 }).filter(row=>row.selectedTotal!==null||row.baselineTotal!==null).sort((a,b)=>(b.selectedTotal??-1)-(a.selectedTotal??-1)||(b.baselineTotal??-1)-(a.baselineTotal??-1)||a.label.localeCompare(b.label,'ko'));
}
