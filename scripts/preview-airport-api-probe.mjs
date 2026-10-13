// Owner-authorized one-time preview probe. No scheduler, database writes or retries.
import {buildDataGoKrUrl,redactDataGoKrSecrets,summarizeDataGoKrResponse} from '../lib/data-go-kr.mjs';
const key=process.env.DATA_GO_KR_SERVICE_KEY?.trim()??'';
const country='https://apis.data.go.kr/B551177/AviationStatsByCountry/';
const timeline='https://apis.data.go.kr/B551177/AviationStatsByTimeline/';
const regular='https://apis.data.go.kr/B551177/StatusOfPaxFltSched/getPaxFltSchedDeparturesDeOdp';
const allowed=new Set(['region','country','arrPassenger','depPassenger','passenger','arrFlight','depFlight','flights','time','airline','airport','airportcode','flightid','masterflightid','codeshare','season','firstdate','lastdate','st','monday','tuesday','wednesday','thursday','friday','saturday','sunday']);
let requests=0,quotaBlocked=false;const deniedServices=new Set();
function emit(value){console.log('API_PREVIEW '+redactDataGoKrSecrets(JSON.stringify(value),key));}
async function probe(id,endpoint,params){
 const service=new URL(endpoint).pathname.split('/').slice(0,-1).join('/');
 if(quotaBlocked||deniedServices.has(service)){emit({id,status:'SKIPPED_AFTER_DENIAL_OR_QUOTA'});return null;}
 if(!key||requests>=9){emit({id,status:!key?'AUTH_NOT_CONFIGURED':'REQUEST_BOUND_REACHED'});return null;}
 requests++;const at=new Date().toISOString();
 try{
  const response=await fetch(buildDataGoKrUrl(endpoint,key,params),{headers:{accept:'application/json'},signal:AbortSignal.timeout(20000),redirect:'error'});
  const text=await response.text();let payload=null;try{payload=JSON.parse(text);}catch{}
  const meta=summarizeDataGoKrResponse({status:response.status,payload,textSnippet:null},'00',key);
  emit({id,at,params,...meta});
  if(response.status===429||['22','23'].includes(meta.officialResultCode))quotaBlocked=true;
  if([401,403].includes(response.status)||['20','29','30','31'].includes(meta.officialResultCode))deniedServices.add(service);
  if(meta.authStatus!=='PASS')return null;
  const body=payload.response.body,raw=body.items?.item??body.items;
  const rows=(Array.isArray(raw)?raw:raw&&typeof raw==='object'?[raw]:[]).map(row=>Object.fromEntries(Object.entries(row).filter(([field,value])=>allowed.has(field)&&['string','number'].includes(typeof value)).map(([field,value])=>[field,typeof value==='string'?value.slice(0,120):value])));
  for(const row of rows)emit({id,row});return {rows,total:Number(body.totalCount),params};
 }catch{emit({id,at,status:'REQUEST_FAILED_NO_RETRY'});return null;}
}
// Two complete calendar months, never a partial current-month daily mean.
for(const [kind,operation] of [['passengers','getTotalNumberOfPassenger'],['flights','getTotalNumberOfFlight']]){
 const current=await probe(`country-${kind}-202609`,country+operation,{from_month:'202609',to_month:'202609',type:'json'});
 if(current)await probe(`country-${kind}-202608`,country+operation,{from_month:'202608',to_month:'202608',type:'json'});
}
await probe('timeline-passengers-202609',timeline+'getTotalNumberOfPassenger',{from_month:'202609',to_month:'202609',type:'json'});
// The published departure contract calls airport required. Blank/all is tested,
// never assumed. Failure is not relabelled as an all-route result.
const first=await probe('regular-all-page-1',regular,{pageNo:'1',numOfRows:'1000',type:'json',airport:'',lang:'K'});
let received=first?.rows.length??0,complete=false;
if(first){
 for(let page=2;Number.isSafeInteger(first.total)&&received<first.total&&page<=3;page++){
  const next=await probe(`regular-all-page-${page}`,regular,{...first.params,pageNo:String(page)});if(!next)break;received+=next.rows.length;
 }
 complete=Number.isSafeInteger(first.total)&&first.total>0&&received===first.total;
}
emit({summary:true,requestCount:requests,maximumRequests:9,regularAllRoutesComplete:complete,regularRecords:received,regularReportedTotal:first?.total??null,persistence:false,newAccessSettings:false});
