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
 const result:ReferenceChangeNotice[]=[];
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
   const country=String(source.country),baseline=clock(source.lastVerifiedAt)?source.lastVerifiedAt:'none';
   result.push({id:`calendar:${country}:review:${source.reason}:${baseline}`,topic:'calendar',country,reviewRequired:true,title:`${names[country]} 공휴일 변경 검토 중`,body:baseline==='none'?'공식 자료에서 검토가 필요한 내용을 확인했어요. 변경을 확정하지 않았으며 새 일정은 아직 반영하지 않았습니다.':'공식 자료에서 검토가 필요한 내용을 확인했어요. 일정 변경은 아직 확정하지 않았으며 마지막 검증값을 유지합니다.',checkedAt:source.checkedAt,timeLabel:'최근 확인'});
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
   const country=String(item.country);
   result.push({id:`allowance:${item.sourceId}:review:${item.baselineHash}`,topic:'allowance',country,reviewRequired:true,title:`${names[country]??country} 반입 면세 원문 검토 중`,body:'공식 원문의 변경을 감지했지만 면세 규정이 바뀌었다고 확정한 것은 아닙니다. 마지막 검토값을 유지하며 적용 조건을 확인 중이에요.',checkedAt:item.checkedAt,timeLabel:'최근 확인'});
  }
 }
 // Pending source review takes precedence over an older published value notice.
 const pending=new Set(result.filter(item=>item.reviewRequired).map(item=>`${item.topic}:${item.country}`));
 return [...new Map(result.filter(item=>item.reviewRequired||!pending.has(`${item.topic}:${item.country}`)).map(item=>[item.id,item])).values()].sort((a,b)=>Number(b.reviewRequired)-Number(a.reviewRequired)||b.checkedAt.localeCompare(a.checkedAt)||a.id.localeCompare(b.id)).slice(0,6);
}
