export const isRevision=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
export function htmlRevision(html){
 const values={};
 for(const tag of html.match(/<meta\b[^>]*>/gi)??[]){
  const attrs=Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)].map(match=>[match[1].toLowerCase(),match[2]]));
  if(attrs.name==='koretail-build-sha'||attrs.name==='koretail-build-dirty'){
   if(attrs.name in values)throw Error('Duplicate build metadata; revision is ambiguous.');
   values[attrs.name]=attrs.content;
  }
 }
 return {sha:values['koretail-build-sha']??null,dirty:values['koretail-build-dirty']==='false'?false:null};
}
export function verifyRevision(expected,api,html){
 if(!isRevision(expected))throw Error('Expected deployed SHA is missing or invalid.');
 for(const [surface,value] of [['API',api],['HTML',html]]){
  if(value?.sha!==expected)throw Error(`${surface} build SHA does not match the deployed revision.`);
  if(value?.dirty!==false)throw Error(`${surface} build is dirty or unverified.`);
 }
 return {expected,apiSha:api.sha,htmlSha:html.sha,revisionVerified:true};
}
export function operationalEvidence(httpStatus,health){
 const sources=Array.isArray(health?.sources)?health.sources.map(row=>({sourceId:row.sourceId??null,status:row.status??null,lastRetrievedAt:row.lastRetrievedAt??null})):[];
 const knownGood=new Set(['LIVE','OK','SUCCESS','HEALTHY']);
 const unhealthy=new Set(['STALE','PARTIAL','ERROR','FAILED','FAILURE','UNAVAILABLE','DEGRADED']);
 let state='UNVERIFIED';
 if(httpStatus!==200||health?.database!=='ok')state='DEGRADED';
 else if(sources.some(row=>unhealthy.has(String(row.status).toUpperCase())))state='DEGRADED';
 else if(sources.length&&sources.every(row=>knownGood.has(String(row.status).toUpperCase())&&typeof row.lastRetrievedAt==='string'&&Number.isFinite(Date.parse(row.lastRetrievedAt))))state='REPORTED_OK_NOT_INDEPENDENTLY_VERIFIED';
 return {state,httpStatus,database:health?.database??'unknown',sources,fullRecoveryVerified:false};
}
export async function inspectPublicRevision(origin,expected,fetcher=fetch){
 if(!isRevision(expected))throw Error('Expected deployed SHA is missing or invalid.');
 const get=path=>fetcher(new URL(path,origin),{cache:'no-store',redirect:'error',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(20000)});
 const [apiResponse,htmlResponse]=await Promise.all([get(`/api/build?revision_check=${expected}`),get(`/ko?revision_check=${expected}`)]);
 if(!apiResponse.ok||!htmlResponse.ok)throw Error('Public build API or HTML is unavailable; deployment revision is unverified.');
 const revision=verifyRevision(expected,await apiResponse.json(),htmlRevision(await htmlResponse.text()));
 let operation;
 try{const response=await get('/api/health');operation=operationalEvidence(response.status,await response.json());}catch{operation=operationalEvidence(null,null);}
 return {at:new Date().toISOString(),...revision,operation};
}
