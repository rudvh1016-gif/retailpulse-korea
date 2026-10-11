import type {AirportFlightMonth} from './airport-monthly-flights';
import type {RateLang} from './change-rate';

const locales={ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'};
const t=(lang:RateLang,ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];

/** Calendar labels only: the prepared counts and their denominators stay unchanged. */
export function airportMonthLabel(month:string,lang:RateLang){
 return new Intl.DateTimeFormat(locales[lang],{month:lang==='en'?'short':'numeric',timeZone:'UTC'}).format(new Date(month+'-01T00:00:00Z'));
}

export function airportMonthPeriodLabel(data:AirportFlightMonth|undefined,month:string,lang:RateLang){
 const label=airportMonthLabel(month,lang);
 if(!data?.includedDays.length)return `${label} ${t(lang,'자료 없음','no data','无资料','資料なし')}`;
 const last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
 const expected=data.through?.startsWith(month+'-')?Number(data.through.slice(8,10)):0;
 const included=new Set(data.includedDays);
 const allDates=expected>0&&data.eligibleDays===expected&&included.size===expected&&data.excludedDays.length===0
  &&Array.from({length:expected},(_,index)=>`${month}-${String(index+1).padStart(2,'0')}`).every(day=>included.has(day));
 const closed=data.through===last;
 const status=closed?(allDates?t(lang,'마감','full month','全月','月末まで'):t(lang,'일부','partial','部分','一部')):'MTD';
 const mean=t(lang,'일평균','mean/day','日均','1日平均');
 const coverage=allDates?'':` (${data.includedDays.length}/${data.eligibleDays}${t(lang,'일',' days','天','日')})`;
 const cutoff=!closed&&data.through?new Intl.DateTimeFormat(locales[lang],{month:'numeric',day:'numeric',timeZone:'UTC'}).formatToParts(new Date(data.through+'T00:00:00Z')).filter(part=>part.type==='month'||part.type==='day').map(part=>part.value).join('/'):null;
 return `${label} ${status} ${mean}${coverage}${cutoff?` · ${t(lang,`${cutoff}까지`,`through ${cutoff}`,`截至${cutoff}`,`${cutoff}まで`)}`:''}`;
}

export function airportMonthComparisonBasis(current:AirportFlightMonth,previous:AirportFlightMonth|undefined,previousMonth:string,lang:RateLang){
 const beforeYear=previousMonth.slice(0,4),currentYear=current.month.slice(0,4);
 const years=beforeYear===currentYear?currentYear:`${beforeYear} / ${currentYear}`;
 return `${years} · ${airportMonthPeriodLabel(previous,previousMonth,lang)} / ${airportMonthPeriodLabel(current,current.month,lang)}`;
}
