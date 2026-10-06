import {pathToFileURL} from 'node:url';
import {inspectRksiMetarItem} from './parse-rksi-metar-item.mjs';

const ENDPOINT='https://apis.data.go.kr/1360000/AmmIwxxmService/getMetar';
const LIMIT=1_048_576,TIMEOUT=10_000;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)?x:null;
const code=x=>typeof x==='string'&&/^\d{2}$/.test(x)?x:null;
const integer=x=>/^[0-9]+$/.test(String(x))&&Number.isSafeInteger(Number(x))?Number(x):null;

/** One fixed official request. Returns allowlisted metadata, never payload, URL or exceptions. */
export async function probeRksiOnce({serviceKey,fetchImpl=globalThis.fetch,timeoutMs=TIMEOUT}) {
  if(![10_000,30_000].includes(timeoutMs))throw Error('Unsupported bounded diagnostic deadline');
  const result={source:'RKSI_METAR_CONTRACT_CHECK',station:'RKSI',requestCount:0,timeoutMs,maxBodyBytes:LIMIT,status:'UNVERIFIED',httpStatus:null,providerCode:null};
  if(typeof serviceKey!=='string'||!serviceKey.trim()||serviceKey.length>4096)return{...result,status:'CREDENTIAL_NOT_CONFIGURED'};
  let key=serviceKey.trim();
  try{if(/%[0-9a-f]{2}/i.test(key))key=decodeURIComponent(key);}catch{return{...result,status:'INVALID_CREDENTIAL_FORMAT'};}
  const url=new URL(ENDPOINT);
  for(const[k,v]of Object.entries({ServiceKey:key,pageNo:'1',numOfRows:'100',dataType:'JSON',icao:'RKSI'}))url.searchParams.set(k,v);
  try{
    result.requestCount=1;
    const response=await fetchImpl(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
    result.httpStatus=response.status;
    const reader=response.body?.getReader();
    if(!reader)return{...result,status:'EMPTY_RESPONSE'};
    let bytes=0;const chunks=[];
    try{
      const declared=response.headers.get('content-length');
      if(declared!==null&&integer(declared)>LIMIT){await reader.cancel();return{...result,status:'BODY_LIMIT_EXCEEDED'};}
      while(true){const{done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
        if(bytes>LIMIT){await reader.cancel();return{...result,status:'BODY_LIMIT_EXCEEDED'};}chunks.push(value);}
    }finally{reader.releaseLock();}
    result.responseBytes=bytes;
    const text=Buffer.concat(chunks).toString('utf8');let payload;
    try{payload=JSON.parse(text);}catch{
      result.providerCode=code(text.match(/<(?:\w+:)?(?:returnReasonCode|resultCode)\b[^>]*>\s*(\d{2})\s*<\//)?.[1]);
      return{...result,status:[401,403].includes(response.status)||['20','21','30','31'].includes(result.providerCode)?'AUTH_BLOCKED':'NON_JSON_RESPONSE',format:text.trimStart().startsWith('<')?'XML':'UNRECOGNIZED'};
    }
    const envelope=object(payload)?.response,header=object(object(envelope)?.header),body=object(object(envelope)?.body);
    result.providerCode=code(header?.resultCode??object(object(object(payload)?.OpenAPI_ServiceResponse)?.cmmMsgHeader)?.returnReasonCode);
    if([401,403].includes(response.status)||['20','21','30','31'].includes(result.providerCode))return{...result,status:'AUTH_BLOCKED',format:'JSON'};
    if(response.status!==200||result.providerCode!=='00')return{...result,status:response.status===429||['22','23'].includes(result.providerCode)?'RATE_LIMITED':'PROVIDER_ERROR',format:'JSON'};
    const total=integer(body?.totalCount),page=integer(body?.pageNo),rows=integer(body?.numOfRows),raw=object(body?.items)?.item;
    const items=Array.isArray(raw)?raw:object(raw)||typeof raw==='string'?[raw]:[];
    if(items.length>100)return{...result,status:'SHAPE_UNVERIFIED',format:'JSON',receivedCount:items.length};
    const decoded=items.map((item,index)=>inspectRksiMetarItem(item,index));
    const matches=decoded.filter(item=>item.observation?.station==='RKSI');
    const observedTimes=[...new Set(matches.map(item=>item.observation.observedAt))];
    const complete=page===1&&rows!==null&&rows>=1&&rows<=100&&total!==null&&total<=rows&&items.length===total;
    const status=complete&&total===0?'NO_DATA':complete&&matches.length>0&&matches.length===items.length?'VERIFIED_CONTRACT':'SHAPE_UNVERIFIED';
    const shape=decoded.map(item=>{const metadata={...item};delete metadata.observation;return metadata;});
    return{...result,status,format:'JSON',totalCount:total,receivedCount:items.length,matchedStationCount:matches.length,observationTimes:observedTimes,shape,observations:matches.map(item=>item.observation)};
  }catch(error){return{...result,status:['AbortError','TimeoutError'].includes(error?.name)?'REQUEST_TIMEOUT':'REQUEST_FAILED'};}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const authorized=process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&process.env.METAR_CONTRACT_ONCE==='1';
  const summary=authorized?await probeRksiOnce({serviceKey:process.env.DATA_GO_KR_SERVICE_KEY}):{source:'RKSI_METAR_CONTRACT_CHECK',status:'SERVER_ONCE_MODE_REQUIRED',requestCount:0};
  console.log(JSON.stringify(summary));process.exitCode=['VERIFIED_CONTRACT','NO_DATA'].includes(summary.status)?0:1;
}
