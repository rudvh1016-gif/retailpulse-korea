/** Small, deterministic UI projection of already-stored collector results.
 * No upstream requests, legal interpretation, publication or clock reads. */
export interface ReferenceChangeNotice {
 id:string; topic:'calendar'|'allowance'; country:string; reviewRequired:boolean;
 title:string; body:string; checkedAt:string; timeLabel:'반영 확인'|'최근 확인';
}
const names:Record<string,string>={JP:'일본',US:'미국',TW:'대만',SG:'싱가포르',CN:'중국',KR:'한국',VN:'베트남',TH:'태국',PH:'필리핀',AU:'호주',HK:'홍콩',MY:'말레이시아'};
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const clock=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value));
const hash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const list=(value:unknown)=>Array.isArray(value)?value.slice(0,24):[];
/** Timestamp-only polls never enter an identity. New API fields are optional so
 * old deployments / absent tables simply produce no invented notices. */
export function referenceChangeNotices(calendar:unknown,allowance:unknown):ReferenceChangeNotice[]{
 const result:ReferenceChangeNotice[]=[],pending=new Set<string>();
 if(object(calendar)){
  const sources=list(calendar.sources).filter(object);
  for(const change of list(calendar.changes)){
   if(!object(change)||!['JP','US'].includes(String(change.country))||!hash(change.id)||!clock(change.changedAt))continue;
   const country=String(change.country);
   if(!sources.some(source=>source.country===country&&source.status==='VERIFIED'))continue;
   result.push({id:`calendar:${country}:${change.id}`,topic:'calendar',country,reviewRequired:false,title:`${names[country]} 공휴일 일정 반영`,body:country==='JP'?'일본 공식 공휴일 일정의 변경을 반영했어요. 해당 날짜와 출처를 확인하세요.':'미국 연방공무원 관측 휴일 일정의 변경을 반영했어요. 모든 사업장·학교의 휴일은 아닙니다.',checkedAt:change.changedAt,timeLabel:'반영 확인'});
  }
  for(const source of sources){
   if(!['JP','US'].includes(String(source.country))||source.status!=='REVIEW_REQUIRED'||!clock(source.checkedAt)||typeof source.reason!=='string'||!/^[A-Z0-9_]{1,80}$/.test(source.reason))continue;
   pending.add(`calendar:${String(source.country)}`);
  }
 }
 if(object(allowance)){
  const japan=allowance.japan;
  const japanVerified=list(allowance.countries).some(country=>object(country)&&country.id==='JP'&&['NUMERIC_VERIFIED','SOURCE_UNCHANGED'].includes(String(country.state)));
  if(japanVerified&&object(japan)&&clock(japan.changedAt)&&object(japan.previous)&&object(japan.values)){
   const keys=['liquorBottles','liquorBottleMl','cigarettes','perfumeOunces'],before=japan.previous,after=japan.values;
   const valid=[before,after].every(values=>keys.every(key=>typeof values[key]==='number'&&Number.isFinite(values[key])&&Number(values[key])>0));
   if(valid&&keys.some(key=>before[key]!==after[key])){
    const signature=keys.map(key=>`${before[key]}>${after[key]}`).join('|');
    result.push({id:`allowance:JP:${japan.changedAt}:${signature}`,topic:'allowance',country:'JP',reviewRequired:false,title:'일본 반입 면세 수치 반영',body:'일본 세관의 주류·궐련·향수 중 검증된 수치 변경을 반영했어요. 적용 조건과 이전·새 수치를 확인하세요. 시행일은 원문에서 별도로 확인해야 합니다.',checkedAt:japan.changedAt,timeLabel:'반영 확인'});
   }
  }
  for(const item of list(allowance.reviewNotices)){
   if(!object(item)||typeof item.sourceId!=='string'||!/^([A-Z]{2})-\d{2}$/.test(item.sourceId)||item.country!==item.sourceId.slice(0,2)||!hash(item.sourceHash)||!hash(item.baselineHash)||!clock(item.checkedAt))continue;
   pending.add(`allowance:${String(item.country)}`);
  }
 }
 // Review evidence stays in source status/detail, never in public update notices.
 // It still suppresses older confirmed notices so pending rules cannot look current.
 return [...new Map(result.filter(item=>!pending.has(`${item.topic}:${item.country}`)).map(item=>[item.id,item])).values()].sort((a,b)=>b.checkedAt.localeCompare(a.checkedAt)||a.id.localeCompare(b.id)).slice(0,6);
}
