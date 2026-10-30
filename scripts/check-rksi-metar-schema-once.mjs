import {pathToFileURL} from 'node:url';
import {probeRksiOnce} from './probe-rksi-metar-once.mjs';
import {stagedHttpsTransport} from './diagnose-rksi-metar-once.mjs';

/** Manual, separately authorized schema confirmation. One GET; no retries or persistence. */
export async function checkRksiSchemaOnce({eventName,onceFlag,serviceKey,transportFactory=stagedHttpsTransport}) {
  if(eventName!=='workflow_dispatch'||onceFlag!=='1')return{source:'RKSI_METAR_SCHEMA_CHECK',requestCount:0,status:'SERVER_SCHEMA_ONCE_MODE_REQUIRED'};
  const transport=transportFactory();
  const summary={...await probeRksiOnce({serviceKey,fetchImpl:transport.fetchImpl,timeoutMs:30_000}),source:'RKSI_METAR_SCHEMA_CHECK',transport:transport.stages};
  if(transport.stages.deadline&&summary.status==='REQUEST_FAILED')summary.status='REQUEST_TIMEOUT';
  return summary;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const summary=await checkRksiSchemaOnce({eventName:process.env.GITHUB_EVENT_NAME,onceFlag:process.env.METAR_SCHEMA_ONCE,serviceKey:process.env.DATA_GO_KR_SERVICE_KEY});
  console.log(JSON.stringify(summary));process.exitCode=['VERIFIED_CONTRACT','NO_DATA'].includes(summary.status)?0:1;
}
