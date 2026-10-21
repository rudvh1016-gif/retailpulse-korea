import {isValidKstDay} from './kst';
import type {AirportStatsMonth,AirportStatsRow} from './airport-monthly-stats-read';

export interface HomeMonthlyCountry {code:string;label:string;departures:number}
export interface HomeMonthlySelection {
 month:string|null;requestedMonth:string|null;rows:HomeMonthlyCountry[];
 /** The stored API has no whole-dataset completeness guarantee: never claim a global ranking. */
 scope:'CONFIRMED_ROWS';excludedRows:number;cutoffTie:boolean;fallback:boolean;
}
const validMonth=(value:string|undefined|null):value is string=>Boolean(value&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value));
const count=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const excludedLabel=/^(?:TOTAL|SUBTOTAL|OTHER|OTHERS|UNKNOWN|ALL|합계|총계|소계|계|전체|기타|미상|미분류|미확인)$/i;
let countryCodes:Map<string,string>|undefined;
/** Resolve all named ISO-style regions, not just the twelve display priorities or available flag assets. */
function codeFor(label:string){
 if(!countryCodes){
  countryCodes=new Map();
  const names=['ko','en'].map(lang=>new Intl.DisplayNames([lang],{type:'region'}));
  const nonCountries=new Set(['EU','UN','ZZ','XA','XB','QO']);
  for(let a=65;a<=90;a++)for(let b=65;b<=90;b++){
   const code=String.fromCharCode(a,b);if(nonCountries.has(code)||new Intl.Locale(`und-${code}`).region!==code)continue;
   for(const name of names){const value=name.of(code);if(value&&value!==code)countryCodes.set(value,code);}
  }
  // Exact provider spellings in the captured 15095071 rows, not inferred group totals.
  for(const [label,code] of [['호주','AU'],['홍콩','HK'],['마카오','MO'],['키르기즈스탄','KG']])countryCodes.set(label,code);
 }
 return countryCodes.get(label);
}
const ignored=(row:AirportStatsRow)=>row.aggregate||excludedLabel.test(row.label.trim());
/** One completed official month, every returned row, no previous-month eligibility condition. */
export function selectHomeMonthlyCountries(current:AirportStatsMonth|undefined,requestedMonth:string|null,asOf:string):HomeMonthlySelection{
 const result:HomeMonthlySelection={month:null,requestedMonth:validMonth(requestedMonth)?requestedMonth:null,rows:[],scope:'CONFIRMED_ROWS',excludedRows:0,cutoffTie:false,fallback:false};
 const todayMonth=asOf.slice(0,7),retrievedAt=current?Date.parse(current.retrievedAt):NaN;
 const endOfDay=Date.parse(`${asOf}T00:00:00+09:00`)+86_400_000;
 if(!current||!Array.isArray(current.rows)||current.operationId!=='ROUTE_COUNTRY_PASSENGERS'||!validMonth(current.month)||!validMonth(requestedMonth)||!isValidKstDay(asOf)||current.month>requestedMonth||current.month>=todayMonth||!Number.isFinite(retrievedAt)||retrievedAt>=endOfDay)return result;
 const [year,month]=current.month.split('-').map(Number);
 if(retrievedAt<Date.UTC(year,month,1)-9*3_600_000)return result;
 result.month=current.month;result.fallback=current.month!==requestedMonth;
 const candidates=current.rows.filter(row=>!ignored(row));
 const codes=candidates.map(row=>codeFor(row.label.trim()));
 const frequency=new Map<string,number>();for(const code of codes)if(code)frequency.set(code,(frequency.get(code)??0)+1);
 const rows=candidates.flatMap((row,index)=>{
  const code=codes[index];
  if(!code||frequency.get(code)!==1||!count(row.departures)){result.excludedRows++;return [];}
  return [{code,label:row.label,departures:row.departures}];
 }).sort((a,b)=>b.departures-a.departures||(a.code<b.code?-1:a.code>b.code?1:0));
 result.cutoffTie=rows.length>3&&rows[2].departures===rows[3].departures;
 result.rows=rows.slice(0,3);return result;
}
export function homeMonthlyCountryTrends(selection:HomeMonthlySelection,months:readonly AirportStatsMonth[]){
 if(!selection.month)return [];
 const [year,month]=selection.month.split('-').map(Number);
 const expected=Array.from({length:6},(_,index)=>{const value=new Date(Date.UTC(year,month-6+index,1));return value.toISOString().slice(0,7);});
 return selection.rows.map(row=>({code:row.code,label:row.label,points:expected.map(month=>{
  if(month===selection.month)return {month,departures:row.departures};
  const matches=months.filter(item=>item.operationId==='ROUTE_COUNTRY_PASSENGERS'&&item.month===month).flatMap(item=>item.rows.filter(item=>!ignored(item)&&item.label===row.label));
  return {month,departures:matches.length===1&&count(matches[0].departures)?matches[0].departures:null};
 })}));
}
