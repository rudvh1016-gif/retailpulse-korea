const DAY_MS=86400000;
const sum=xs=>xs.reduce((a,b)=>a+b,0);
const mean=xs=>xs.length?sum(xs)/xs.length:null;
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
export const shift=(s,n)=>new Date(Date.parse(s+'T00:00:00Z')+n*DAY_MS).toISOString().slice(0,10);
const weekday=s=>(new Date(s+'T00:00:00Z').getUTCDay()+6)%7;
const validProfile=p=>p?.complete===true&&validDate(p.day)&&Number.isSafeInteger(p.total)&&p.total>=0&&Array.isArray(p.hours)&&p.hours.length===24&&p.hours.every(x=>Number.isSafeInteger(x)&&x>=0)&&sum(p.hours)===p.total;

export function normalize(raw){
  const records=Array.isArray(raw?.history)?raw.history:[];
  const counts=new Map();
  for(const r of records)counts.set(r?.T1?.day,(counts.get(r?.T1?.day)||0)+1);
  const days=records.filter(r=>validProfile(r?.T1)&&validProfile(r?.T2)&&r.T1.day===r.T2.day&&counts.get(r.T1.day)===1).map(r=>({date:r.T1.day,T1:r.T1.total,T2:r.T2.total,h1:[...r.T1.hours],h2:[...r.T2.hours]})).sort((a,b)=>a.date.localeCompare(b.date));
  return {days,excluded:records.length-days.length};
}
export function rate(current,previous){return Number.isFinite(current)&&Number.isFinite(previous)&&previous>0?100*(current-previous)/previous:null;}
export function hourlyShares(hours){
  if(!Array.isArray(hours)||hours.length!==24||!hours.every(x=>Number.isFinite(x)&&x>=0)||sum(hours)<=0)return null;
  const total=sum(hours);return hours.map(value=>value/total*100);
}
const scoped=(day,scope)=>scope==='T1'?{total:day.T1,hours:day.h1}:scope==='T2'?{total:day.T2,hours:day.h2}:{total:day.T1+day.T2,hours:day.h1.map((v,i)=>v+day.h2[i])};
function periodSummary(rows,scope){
  return {dates:rows.map(d=>d.date),total:mean(rows.map(d=>scoped(d,scope).total)),hours:Array.from({length:24},(_,i)=>mean(rows.map(d=>scoped(d,scope).hours[i]))),T1:mean(rows.map(d=>d.T1)),T2:mean(rows.map(d=>d.T2)),mix:terminalMix(rows)};
}
export function comparePeriods(days,scope='ALL',span=7){
  if(![7,14].includes(span)||!['ALL','T1','T2'].includes(scope))throw Error('Invalid comparison options');
  const end=days.at(-1)?.date;
  if(!end)return {n:0,span,available:false,excludedDates:[]};
  const start=shift(end,1-span),priorEnd=shift(start,-1),priorStart=shift(start,-span);
  const byDate=new Map(days.map(d=>[d.date,d])); const current=[],previous=[],excludedDates=[];
  for(let i=0;i<span;i++){const date=shift(start,i),a=byDate.get(date),b=byDate.get(shift(date,-span));if(a&&b){current.push(a);previous.push(b);}else excludedDates.push(date);}
  const a=periodSummary(current,scope),b=periodSummary(previous,scope);
  return {n:current.length,span,start,end,priorStart,priorEnd,current:a,previous:b,change:rate(a.total,b.total),available:current.length>0,excludedDates};
}
export function compareMonths(days,scope='ALL',previousMonth,currentMonth){
  const validMonth=month=>typeof month==='string'&&/^\d{4}-\d{2}$/.test(month)&&validDate(month+'-01');
  if(!['ALL','T1','T2'].includes(scope)||[previousMonth,currentMonth].some(month=>month!==undefined&&!validMonth(month)))throw Error('Invalid month comparison options');
  // Reuse normalization so partial hourly profiles and duplicate dates never enter a month.
  const ordered=normalize({history:(Array.isArray(days)?days:[]).map(day=>({
    T1:{day:day?.date,total:day?.T1,hours:day?.h1,complete:true},
    T2:{day:day?.date,total:day?.T2,hours:day?.h2,complete:true}
  }))}).days;
  const months=[...new Set(ordered.map(day=>day.date.slice(0,7)))];
  currentMonth??=months.at(-1)??null;
  if(previousMonth===undefined){
    previousMonth=months.filter(month=>currentMonth&&month<currentMonth).at(-1)??null;
    if(!previousMonth&&currentMonth){const date=new Date(currentMonth+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()-1);previousMonth=date.toISOString().slice(0,7);}
  }
  const current=ordered.filter(day=>day.date.slice(0,7)===currentMonth),previous=ordered.filter(day=>day.date.slice(0,7)===previousMonth);
  const coverage=(month,rows)=>{
    let expectedDays=0;
    if(month){const date=new Date(month+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+1,0);expectedDays=date.getUTCDate();}
    return {month,days:rows.length,expectedDays,first:rows[0]?.date??null,last:rows.at(-1)?.date??null,complete:expectedDays>0&&rows.length===expectedDays};
  };
  const a=periodSummary(current,scope),b=periodSummary(previous,scope),currentCoverage=coverage(currentMonth,current),previousCoverage=coverage(previousMonth,previous);
  const bands=compareBands(b.hours,a.hours);
  const stableDelta=value=>value==null?null:Math.abs(value)<1e-10?0:value;
  const morningDelta=stableDelta(bands[1]?.shareChange),eveningDelta=stableDelta(bands[3]?.shareChange);
  // Only gaps inside observed coverage are excluded dates; future calendar days are not missing records.
  const gaps=rows=>{
    if(!rows.length)return [];
    const dates=new Set(rows.map(row=>row.date)),span=(Date.parse(rows.at(-1).date)-Date.parse(rows[0].date))/DAY_MS+1;
    return Array.from({length:span},(_,i)=>shift(rows[0].date,i)).filter(date=>!dates.has(date));
  };
  return {comparison:'month',n:current.length,span:currentCoverage.expectedDays,start:currentCoverage.first,end:currentCoverage.last,priorStart:previousCoverage.first,priorEnd:previousCoverage.last,
    current:a,previous:b,change:rate(a.total,b.total),available:current.length>0&&previous.length>0,excludedDates:[...new Set([...gaps(previous),...gaps(current)])].sort(),
    sampleSizes:{previous:previous.length,current:current.length},coverage:{previous:previousCoverage,current:currentCoverage},bands,
    monthShift:{morningDelta,eveningDelta,morningDownEveningUp:morningDelta!==null&&eveningDelta!==null&&morningDelta<0&&eveningDelta>0}};
}
export function compareDays(days,scope='ALL',previousDate,currentDate){
  if(!['ALL','T1','T2'].includes(scope)||!validDate(previousDate)||!validDate(currentDate))throw Error('Invalid day comparison options');
  const byDate=new Map(days.map(d=>[d.date,d]));
  const previous=byDate.get(previousDate),current=byDate.get(currentDate),available=Boolean(previous&&current);
  // A missing side excludes the pair, just as in comparePeriods.
  const a=periodSummary(available?[current]:[],scope),b=periodSummary(available?[previous]:[],scope);
  return {n:available?1:0,span:1,start:currentDate,end:currentDate,priorStart:previousDate,priorEnd:previousDate,current:a,previous:b,change:rate(a.total,b.total),available,excludedDates:[...new Set([previousDate,currentDate].filter(date=>!byDate.has(date)))]};
}
export function findSimilarDay(days,scope='ALL',currentDate){
  if(!['ALL','T1','T2'].includes(scope)||!validDate(currentDate))throw Error('Invalid similar-day options');
  const current=days.find(d=>d.date===currentDate);
  if(!current)return null;
  const profile=scoped(current,scope),shares=hourlyShares(profile.hours);
  const candidates=days.filter(d=>d.date<currentDate).map(day=>{
    const previous=scoped(day,scope),previousShares=hourlyShares(previous.hours);
    return {date:day.date,total:previous.total,currentTotal:profile.total,difference:Math.abs(previous.total-profile.total),distributionDifference:shares&&previousShares?sum(shares.map((value,i)=>Math.abs(value-previousShares[i]))):null};
  });
  candidates.sort((a,b)=>a.difference-b.difference||(b.distributionDifference??-1)-(a.distributionDifference??-1)||b.date.localeCompare(a.date));
  return candidates[0]??null;
}
export function compareBands(previousHours,currentHours){
  const valid=hours=>Array.isArray(hours)&&hours.length===24&&hours.every(value=>Number.isFinite(value)&&value>=0)&&Number.isFinite(sum(hours));
  if(!valid(previousHours)||!valid(currentHours))return [];
  const previousTotal=sum(previousHours),currentTotal=sum(currentHours);
  return [0,6,12,18].map(start=>{
    const end=start+6,previous=sum(previousHours.slice(start,end)),current=sum(currentHours.slice(start,end));
    const previousShare=previousTotal>0?previous/previousTotal*100:null,currentShare=currentTotal>0?current/currentTotal*100:null;
    return {start,end,previous,current,previousShare,currentShare,shareChange:previousShare!==null&&currentShare!==null?currentShare-previousShare:null};
  });
}
export function peakWindow(hours,size=3){
  if(!Array.isArray(hours)||hours.length!==24||!hours.every(x=>Number.isFinite(x)&&x>=0)||!Number.isInteger(size)||size<1||size>24||sum(hours)<=0)return null;
  let start=0,total=-Infinity,ties=0;
  for(let i=0;i<=24-size;i++){const count=sum(hours.slice(i,i+size));if(count>total+1e-9){start=i;total=count;ties=1;}else if(Math.abs(count-total)<1e-9)ties++;}
  return {start,end:start+size,total,share:total/sum(hours),ties};
}
export function terminalMix(rows){
  const t1=sum(rows.map(d=>d.T1)),t2=sum(rows.map(d=>d.T2)),total=t1+t2;
  return {T1:total>0?t1/total:null,T2:total>0?t2/total:null};
}
export function weekdayProfile(days,scope='ALL',weeks=4){
  if(![1,2,4,6].includes(weeks)||!['ALL','T1','T2'].includes(scope))throw Error('Invalid weekday options');
  const end=days.at(-1)?.date;
  if(!end)return {available:false,completeWeeks:0,bins:[]};
  const byDate=new Map(days.map(d=>[d.date,d]));const included=[];
  for(let w=0;w<weeks;w++){const dates=Array.from({length:7},(_,i)=>shift(end,-7*w-i));if(dates.every(d=>byDate.has(d)))included.push(...dates.map(d=>byDate.get(d)));}
  const bins=Array.from({length:7},(_,i)=>{const rows=included.filter(d=>weekday(d.date)===i).map(d=>({date:d.date,value:scoped(d,scope).total}));return {day:i,n:rows.length,mean:mean(rows.map(d=>d.value)),min:rows.length?Math.min(...rows.map(d=>d.value)):null,max:rows.length?Math.max(...rows.map(d=>d.value)):null,rows};});
  const weekdayMean=mean(bins.slice(0,5).map(d=>d.mean).filter(Number.isFinite)),weekendMean=mean(bins.slice(5).map(d=>d.mean).filter(Number.isFinite));
  return {available:included.length>0,completeWeeks:included.length/7,requestedWeeks:weeks,start:shift(end,1-weeks*7),end,bins,weekdayMean,weekendMean,change:rate(weekendMean,weekdayMean)};
}
export const HOLIDAY_EVENTS=Object.freeze({
  CN:Object.freeze({start:'2026-10-01',end:'2026-10-07',beforeStart:'2026-09-24'}),
  // Japan's official calendar lists September 21, 22 and 23 as holidays.
  // https://eco.mtk.nao.ac.jp/koyomi/yoko/2026/rekiyou261.html
  JP:Object.freeze({start:'2026-09-21',end:'2026-09-23',beforeStart:'2026-09-14'})
});
export function holidayComparison(rows,country='CN',config=HOLIDAY_EVENTS[country]??HOLIDAY_EVENTS.CN){
  const {start,end,beforeStart}=config??{};
  if(!validDate(start)||!validDate(end)||!validDate(beforeStart))throw Error('Invalid holiday dates');
  const span=(Date.parse(end)-Date.parse(start))/DAY_MS+1,offset=(Date.parse(start)-Date.parse(beforeStart))/DAY_MS;
  // Pair the same weekdays, with a separate earlier period of equal length.
  if(span<1||span>366||offset<span||offset%7!==0)throw Error('Invalid holiday comparison ranges');
  const beforeEnd=shift(beforeStart,span-1);
  const selected=(Array.isArray(rows)?rows:[]).filter(r=>r?.country===country);
  const dates=new Map(); const duplicate=new Set();for(const r of selected){if(dates.has(r.date))duplicate.add(r.date);dates.set(r.date,r);}
  const value=date=>{const r=dates.get(date);return !duplicate.has(date)&&r?.complete===true&&Number.isSafeInteger(r.value)&&r.value>=0?r.value:null;};
  const points=Array.from({length:span},(_,i)=>{const date=shift(start,i),beforeDate=shift(beforeStart,i);return {date,beforeDate,event:value(date),before:value(beforeDate)};});
  const paired=points.filter(p=>p.event!==null&&p.before!==null),beforeMean=mean(paired.map(p=>p.before)),eventMean=mean(paired.map(p=>p.event));
  return {country,start,end,beforeStart,beforeEnd,span,points,n:paired.length,beforeMean,eventMean,change:rate(eventMean,beforeMean),available:paired.length>0,excludedDates:points.filter(p=>p.event===null||p.before===null).map(p=>p.date)};
}

// Independent date ranges: no padding, no forced pairing, no assumption of equal duration
export function validateRanges(r){
 if(!r||!['aStart','aEnd','bStart','bEnd'].every(k=>validDate(r[k])))return '네 날짜를 모두 입력해 주세요';
 for(const side of ['a','b']){const span=(Date.parse(r[side+'End'])-Date.parse(r[side+'Start']))/DAY_MS+1;if(span<1)return '시작일은 종료일보다 늦을 수 없습니다';if(span>366)return '한 기간은 최대 366일까지 선택할 수 있습니다';}
 return '';
}
function rangeCoverage(start,end,dates){
 const expected=(Date.parse(end)-Date.parse(start))/DAY_MS+1,known=new Set(dates);
 const missing=Array.from({length:expected},(_,i)=>shift(start,i)).filter(d=>!known.has(d));
 return {start,end,expected,days:dates.length,dates,missing,complete:dates.length===expected};
}
export function compareRanges(days,scope,r){
 const error=validateRanges(r);if(error)return {available:false,error};
 if(!['ALL','T1','T2'].includes(scope))throw Error('Invalid scope');
 const counts=new Map();for(const d of days)counts.set(d.date,(counts.get(d.date)||0)+1);
 const valid=days.filter(d=>validDate(d.date)&&counts.get(d.date)===1);
 const a=valid.filter(d=>d.date>=r.aStart&&d.date<=r.aEnd),b=valid.filter(d=>d.date>=r.bStart&&d.date<=r.bEnd);
 const previous=periodSummary(a,scope),current=periodSummary(b,scope);
 const coverage={previous:rangeCoverage(r.aStart,r.aEnd,previous.dates),current:rangeCoverage(r.bStart,r.bEnd,current.dates)};
 const overlap=previous.dates.filter(d=>new Set(current.dates).has(d));
 return {available:!!(a.length&&b.length),error:'',previous,current,coverage,overlap,ranges:{...r},change:rate(current.total,previous.total),bands:compareBands(previous.hours,current.hours)};
}
export function weekdayRange(days,scope,start,end){
 const rows=days.filter(d=>d.date>=start&&d.date<=end);
 const bins=Array.from({length:7},(_,i)=>{const list=rows.filter(d=>weekday(d.date)===i).map(d=>({date:d.date,value:scoped(d,scope).total}));return {day:i,n:list.length,mean:mean(list.map(d=>d.value)),rows:list};});
 const work=rows.filter(d=>weekday(d.date)<5),weekend=rows.filter(d=>weekday(d.date)>=5);
 const weekdayMean=mean(work.map(d=>scoped(d,scope).total)),weekendMean=mean(weekend.map(d=>scoped(d,scope).total));
 return {bins,weekdayMean,weekendMean,weekdayN:work.length,weekendN:weekend.length,change:rate(weekendMean,weekdayMean)};
}
export function compareWeekdayRanges(days,scope,r){
 const base=compareRanges(days,scope,r);if(base.error)return base;
 const included=new Set([...base.previous.dates,...base.current.dates]),clean=days.filter(d=>included.has(d.date));
 return {...base,weekdays:{previous:weekdayRange(clean,scope,r.aStart,r.aEnd),current:weekdayRange(clean,scope,r.bStart,r.bEnd)}};
}
export function compareCountryRanges(rows,country,r){
 const error=validateRanges(r);if(error)return {available:false,error};
 const selected=(rows??[]).filter(x=>x.country===country&&(!x.scope||x.scope==='ALL'));
 const counts=new Map();for(const x of selected)counts.set(x.date,(counts.get(x.date)||0)+1);
 const clean=selected.filter(x=>validDate(x.date)&&counts.get(x.date)===1&&x.complete===true&&Number.isSafeInteger(x.value)&&x.value>=0);
 const summary=(start,end)=>{const list=clean.filter(x=>x.date>=start&&x.date<=end).sort((a,b)=>a.date.localeCompare(b.date));return {dates:list.map(x=>x.date),rows:list,total:mean(list.map(x=>x.value)),sum:list.length?sum(list.map(x=>x.value)):null};};
 const previous=summary(r.aStart,r.aEnd),current=summary(r.bStart,r.bEnd);
 return {available:!!(previous.dates.length&&current.dates.length),error:'',country,ranges:{...r},previous,current,change:rate(current.total,previous.total),coverage:{previous:rangeCoverage(r.aStart,r.aEnd,previous.dates),current:rangeCoverage(r.bStart,r.bEnd,current.dates)},overlap:previous.dates.filter(d=>current.dates.includes(d))};
}
export function rankCountryRanges(rows,r){
 return [...new Set((rows??[]).map(x=>x.country))].map(country=>compareCountryRanges(rows,country,r)).filter(m=>m.available).map(m=>({...m,delta:m.current.total-m.previous.total})).sort((a,b)=>b.delta-a.delta||a.country.localeCompare(b.country));
}
