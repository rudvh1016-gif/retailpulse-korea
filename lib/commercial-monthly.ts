import type {CategoryActivity,SeoulContext} from './seoul-context';
export const COMMERCIAL_MONTH_VERSION=1;
export type CommercialHour=[key:string,readings:number,paymentN:number,paymentSum:number,amountN:number,amountMinSum:number,amountMaxSum:number];
export interface CommercialMonthCategory {
 category:string;group:string;firstAt:string;lastAt:string;readings:number;duplicates:number;
 unavailablePayments:number;absentReadings:number;zeroReadings:number;
 hours:CommercialHour[];observedHours:number;
 comparison:{matchedHours:number;matchedDays:number;currentMean:number|null;previousMean:number|null;changePercent:number|null;
  currentAmount:[number,number]|null;previousAmount:[number,number]|null};
}
export interface CommercialMonth {
 version:number;month:string;previousMonth:string;completedDays:number;throughDate:string|null;
 firstAt:string|null;lastAt:string|null;uniqueClocks:number;categories:CommercialMonthCategory[];
}
export interface CommercialContextRow {observed_at:string;payload:string}
export function previousCommercialMonth(month:string){return new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7))-2,1)).toISOString().slice(0,7);}
const validCount=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
const validAmount=(c:CategoryActivity)=>typeof c.amountMin==='number'&&typeof c.amountMax==='number'
 &&Number.isFinite(c.amountMin)&&Number.isFinite(c.amountMax)&&c.amountMin>=0&&c.amountMax>=c.amountMin;
const noComparison=()=>({matchedHours:0,matchedDays:0,currentMean:null,previousMean:null,changePercent:null,currentAmount:null,previousAmount:null});
/** Latest stored version wins for area + source commercial clock + exact category.
 * Every bin is a mean of observed 10-minute windows, never a monthly sales sum.
 * Missing category entries and unpublished values remain missing; a published zero is valid.
 */
export function buildCommercialMonth(rows:ReadonlyArray<CommercialContextRow>,month:string,throughDate:string):CommercialMonth{
 const clocks=new Set<string>(),entries=new Map<string,{at:string;c:CategoryActivity;duplicates:number}>();
 for(const row of [...rows].sort((a,b)=>a.observed_at.localeCompare(b.observed_at))){
  let context:SeoulContext;try{context=JSON.parse(row.payload) as SeoulContext;}catch{continue;}
  const at=context.commercialAt;
  if(!at||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/.test(at)||at.slice(0,7)!==month||at.slice(0,10)>throughDate)continue;
  clocks.add(at);for(const c of context.categories??[]){if(!c.category)continue;const key=at+'|'+c.category;
   entries.set(key,{at,c,duplicates:(entries.get(key)?.duplicates??-1)+1});}
 }
 const grouped=new Map<string,Array<{at:string;c:CategoryActivity;duplicates:number}>>();
 for(const value of entries.values()){const list=grouped.get(value.c.category)??[];list.push(value);grouped.set(value.c.category,list);}
 const times=[...clocks].sort();
 const completedDays=throughDate.slice(0,7)<month?0:throughDate.slice(0,7)>month?new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate():Number(throughDate.slice(8));
 const categories=[...grouped.entries()].sort(([a],[b])=>a.localeCompare(b,'ko')).map(([category,values])=>{
  const bins=new Map<string,CommercialHour>();let unavailablePayments=0,zeroReadings=0;
  for(const {at,c} of values){const key=at.slice(8,13),bin=bins.get(key)??[key,0,0,0,0,0,0];bin[1]++;
   if(validCount(c.payments)){bin[2]++;bin[3]+=c.payments;if(c.payments===0)zeroReadings++;}else unavailablePayments++;
   if(validAmount(c)){bin[4]++;bin[5]+=c.amountMin!;bin[6]+=c.amountMax!;}bins.set(key,bin);}
  const at=values.map(value=>value.at).sort();return {category,group:values[0].c.group,firstAt:at[0],lastAt:at.at(-1)!,
   readings:values.length,duplicates:values.reduce((n,value)=>n+value.duplicates,0),unavailablePayments,
   absentReadings:clocks.size-values.length,zeroReadings,hours:[...bins.values()].sort(([a],[b])=>a.localeCompare(b)),observedHours:bins.size,comparison:noComparison()};
 });
 return {version:COMMERCIAL_MONTH_VERSION,month,previousMonth:previousCommercialMonth(month),completedDays,
  throughDate:completedDays?`${month}-${String(completedDays).padStart(2,'0')}`:null,firstAt:times[0]??null,lastAt:times.at(-1)??null,uniqueClocks:clocks.size,categories};
}
/** Equal weight per matched calendar-day/hour. Amount ranges use their own matched non-null bins. */
export function compareCommercialMonths(current:CommercialMonth,previous:CommercialMonth|null):CommercialMonth{
 if(!previous||previous.month!==current.previousMonth)return current;
 return {...current,categories:current.categories.map(category=>{
  const older=previous.categories.find(row=>row.category===category.category),old=new Map(older?.hours.map(hour=>[hour[0],hour]));
  const matched=category.hours.filter(hour=>Number(hour[0].slice(0,2))<=current.completedDays&&hour[2]>0&&(old.get(hour[0])?.[2]??0)>0);
  const mean=(offset:number)=>matched.length?matched.reduce((sum,hour)=>{const value=offset?old.get(hour[0])!:hour;return sum+value[3]/value[2];},0)/matched.length:null;
  const currentMean=mean(0),previousMean=mean(1);
  const amounts=category.hours.filter(hour=>Number(hour[0].slice(0,2))<=current.completedDays&&hour[4]>0&&(old.get(hour[0])?.[4]??0)>0);
  const range=(older:boolean):[number,number]|null=>amounts.length?([5,6] as const).map(index=>amounts.reduce((sum,hour)=>{const value=older?old.get(hour[0])!:hour;return sum+value[index]/value[4];},0)/amounts.length) as [number,number]:null;
  return {...category,comparison:{matchedHours:matched.length,matchedDays:new Set(matched.map(hour=>hour[0].slice(0,2))).size,currentMean,previousMean,
   changePercent:currentMean!==null&&previousMean!==null&&previousMean>0?(currentMean/previousMean-1)*100:null,
   currentAmount:range(false),previousAmount:range(true)}};
 })};
}
/** Public payload contains compact results only, never hourly inventories. */
export function publicCommercialMonth(month:CommercialMonth){return {...month,categories:month.categories.map(({hours,...category})=>{void hours;return category;})};}
