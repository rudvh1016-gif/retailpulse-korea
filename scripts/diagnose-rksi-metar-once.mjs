import {request as httpsRequest} from 'node:https';
import {Readable} from 'node:stream';
import {pathToFileURL} from 'node:url';
import {probeRksiOnce} from './probe-rksi-metar-once.mjs';

const allowedCodes=new Set(['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH','ABORT_ERR','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID','UNABLE_TO_GET_ISSUER_CERT_LOCALLY']);

/** The same single GET, with only event stages/timing retained. No raw socket/key/URL logging. */
export function stagedHttpsTransport({requestImpl=httpsRequest}={}){
  const stages={phase:'NOT_STARTED',deadline:false,errorCode:null,events:[]};
  const started=performance.now(),mark=(phase,extra={})=>{stages.phase=phase;stages.events.push({phase,elapsedMs:Math.round(performance.now()-started),...extra});};
  const fetchImpl=(url,options)=>new Promise((resolve,reject)=>{
    if(url.origin!=='https://apis.data.go.kr'||url.pathname!=='/1360000/AmmIwxxmService/getMetar'||options.method!=='GET')return reject(Error('Fixed endpoint required'));
    mark('DNS');
    const onAbort=()=>{stages.deadline=true;};options.signal.addEventListener('abort',onAbort,{once:true});
    let req;
    try{req=requestImpl(url,{method:'GET',agent:false,rejectUnauthorized:true,signal:options.signal},response=>{
      mark('RESPONSE_BODY',{httpStatus:response.statusCode});
      response.once('end',()=>{mark('COMPLETE');options.signal.removeEventListener('abort',onAbort);});
      response.once('error',error=>{stages.errorCode=allowedCodes.has(error?.code)?error.code:'OTHER_NETWORK_ERROR';options.signal.removeEventListener('abort',onAbort);});
      const headers={};for(const key of['content-length','content-type'])if(typeof response.headers[key]==='string')headers[key]=response.headers[key];
      try{if([204,205,304].includes(response.statusCode)){response.resume();resolve(new Response(null,{status:response.statusCode,headers}));}
        else resolve(new Response(Readable.toWeb(response),{status:response.statusCode,headers}));}
      catch(error){response.destroy();options.signal.removeEventListener('abort',onAbort);reject(error);}
    });}catch(error){options.signal.removeEventListener('abort',onAbort);stages.errorCode=allowedCodes.has(error?.code)?error.code:'OTHER_NETWORK_ERROR';return reject(error);}
    req.once('socket',socket=>{
      socket.once('lookup',(error,_address,family)=>{if(error){stages.errorCode=allowedCodes.has(error.code)?error.code:'OTHER_NETWORK_ERROR';return;}mark('TCP',{dnsResolved:true,family:[4,6].includes(family)?family:null});});
      socket.once('connect',()=>mark('TLS',{tcpConnected:true}));
      socket.once('secureConnect',()=>mark('HTTP_HEADERS',{tlsVerified:socket.authorized===true}));
    });
    req.once('error',error=>{stages.errorCode=allowedCodes.has(error?.code)?error.code:'OTHER_NETWORK_ERROR';options.signal.removeEventListener('abort',onAbort);reject(error);});
    req.end();
  });
  return{stages,fetchImpl};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const authorized=process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&process.env.METAR_DIAGNOSTIC_ADDITIONAL_ONCE==='1';
  let summary={source:'RKSI_METAR_DIAGNOSTIC_CHECK',requestCount:0,status:'SERVER_ADDITIONAL_ONCE_MODE_REQUIRED'};
  if(authorized){const transport=stagedHttpsTransport();summary={...await probeRksiOnce({serviceKey:process.env.DATA_GO_KR_SERVICE_KEY,fetchImpl:transport.fetchImpl,timeoutMs:30_000}),source:'RKSI_METAR_DIAGNOSTIC_CHECK',transport:transport.stages};if(transport.stages.deadline&&summary.status==='REQUEST_FAILED')summary.status='REQUEST_TIMEOUT';}
  console.log(JSON.stringify(summary));process.exitCode=['VERIFIED_CONTRACT','NO_DATA'].includes(summary.status)?0:1;
}
