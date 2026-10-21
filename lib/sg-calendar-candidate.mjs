/** Official MOM dataset only. No network, publication or verification side effects. */
import {createHash} from 'node:crypto';
export const SG_DATASET_ID='d_8ef23381f9417e4d4254ee8b4dcdb176';
export const SG_CALENDAR_SOURCE=Object.freeze({
 url:`https://data.gov.sg/api/action/datastore_search?resource_id=${SG_DATASET_ID}&limit=1000`,
 datasetURL:`https://data.gov.sg/datasets/${SG_DATASET_ID}/view`,
 licenceURL:'https://data.gov.sg/open-data-licence',
 attribution:'Singapore Public Holidays (consolidated), Ministry of Manpower, data.gov.sg — Singapore Open Data Licence 1.0',
});
const names=Object.freeze({"New Year's Day":'새해 첫날','Chinese New Year':'춘절','Good Friday':'성금요일','Labour Day':'노동절','Vesak Day':'베삭 데이','Hari Raya Puasa':'하리 라야 푸아사','Hari Raya Haji':'하리 라야 하지','National Day':'국경절','Deepavali':'디파발리','Christmas Day':'크리스마스','Polling Day':'선거일'});
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const sha=value=>createHash('sha256').update(value).digest('hex');
const review=reason=>{throw Error(`SG_${reason}_REVIEW_REQUIRED`);};
const keys=(value,expected)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...expected].sort().join('|');
/** Caller must retain last-good on every error. Future published years are accepted
 * only under this exact schema and reviewed vocabulary; no astronomical guesses. */
export function parseSingaporeCalendar(bytes,observedAt){
 if(!Number.isFinite(Date.parse(observedAt)))review('CLOCK');
 if(!(bytes instanceof Uint8Array)||bytes.byteLength>1048576)review('BODY_SIZE');
 let doc;try{doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,''));}catch{review('JSON');}
 if(!keys(doc,['success','result'])||doc.success!==true)review('ENVELOPE');
 const r=doc.result;
 if(!keys(r,['resource_id','fields','records','_links','total','limit'])||r.resource_id!==SG_DATASET_ID||r.limit!==1000)review('SCHEMA');
 if(JSON.stringify(r.fields)!==JSON.stringify([{type:'text',id:'date'},{type:'text',id:'day'},{type:'text',id:'holiday'},{type:'int4',id:'_id'}]))review('FIELDS');
 if(!Array.isArray(r.records)||!Number.isInteger(r.total)||r.total<11||r.total>1000||r.records.length!==r.total)review('INCOMPLETE_PAGE');
 // A next link exists even on the final page. Never follow source-provided URLs.
 if(!keys(r._links,['start','next'])||typeof r._links.start!=='string'||typeof r._links.next!=='string')review('LINK_SCHEMA');
 const ids=new Set(),dates=new Set();
 const events=r.records.map(row=>{
  if(!keys(row,['_id','date','day','holiday'])||!Number.isInteger(row._id)||row._id<1||ids.has(row._id))review('ROW');ids.add(row._id);
  if(typeof row.date!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(row.date))review('DATE');
  const d=new Date(`${row.date}T00:00:00Z`);
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==row.date||weekdays[d.getUTCDay()]!==row.day)review('DATE_WEEKDAY');
  if(dates.has(row.date))review('DATE_CONFLICT');dates.add(row.date);
  if(typeof row.holiday!=='string')review('NAME');
  const normalized=row.holiday.replaceAll('’',"'"),observed=normalized.endsWith(' (Observed)'),base=observed?normalized.slice(0,-11):normalized;
  if(!Object.hasOwn(names,base)||(observed&&base==='Polling Day'))review('UNKNOWN_NAME');
  return {id:`SG-${sha(`${row.date}|${normalized}`).slice(0,16)}`,country:'SG',scope:observed?'institutional':'national',...(observed?{region:'원래 공휴일이 본인의 휴무일인 경우에만 적용되는 대체휴일'}:{}),kind:'public_holiday',name:`${names[base]}${observed?' 대체휴일':''}`,originalName:row.holiday,start:row.date,end:row.date,sourceURL:SG_CALENDAR_SOURCE.datasetURL,status:'candidate',verifiedAt:null,observedAt,baseName:base,isObserved:observed};
 });
 for(const event of events.filter(e=>e.isObserved)){
  const base=events.find(e=>!e.isObserved&&e.baseName===event.baseName&&new Date(e.start+'T00:00:00Z').getUTCDay()===0&&[1,2].some(days=>Date.parse(event.start)-Date.parse(e.start)===days*86400000));
  if(!base||new Date(base.start+'T00:00:00Z').getUTCDay()!==0)review('OBSERVED_RELATION');
 }
 const current=Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric'}).format(new Date(observedAt)));
 const selected=events.filter(e=>[current-1,current,current+1].includes(Number(e.start.slice(0,4))));
 const years=[...new Set(selected.map(e=>Number(e.start.slice(0,4))))].sort();
 if(!years.includes(current))review('CURRENT_YEAR_MISSING');
 for(const year of years){const rows=selected.filter(e=>e.start.startsWith(`${year}-`));
  if(rows.length<11||rows.length>20)review('YEAR_COUNT');
  for(const name of Object.keys(names).filter(n=>n!=='Polling Day')){
   const count=rows.filter(e=>e.baseName===name&&!e.isObserved).length;
   if(count!==(name==='Chinese New Year'?2:1))review('YEAR_COVERAGE');
  }
 }
 return {events:selected.map(({baseName,isObserved,...e})=>{void baseName;void isObserved;return e;}),years,sourceHash:sha(bytes),sourceURL:SG_CALENDAR_SOURCE.datasetURL,attribution:SG_CALENDAR_SOURCE.attribution,licenceURL:SG_CALENDAR_SOURCE.licenceURL,observedAt,verifiedAt:null,publicationEnabled:false,requiresReview:true};
}
