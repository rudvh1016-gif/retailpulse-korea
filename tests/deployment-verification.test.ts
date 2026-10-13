import test from 'node:test';import assert from 'node:assert/strict';
import {parseBuildRevision} from '../lib/build-revision';
import {htmlRevision,verifyRevision,operationalEvidence,inspectPublicRevision} from '../lib/deployment-verification.mjs';
const sha='a'.repeat(40),old='b'.repeat(40),clean={sha,dirty:false};
const html=`<html><head><meta content="${sha}" name="koretail-build-sha"><meta name='koretail-build-dirty' content='false'></head></html>`;
test('matching clean API and HTML identifies exactly the expected revision',()=>{
 assert.deepEqual(htmlRevision(html),clean);assert.equal(verifyRevision(sha,clean,htmlRevision(html)).revisionVerified,true);
 assert.deepEqual(parseBuildRevision(JSON.stringify(clean)),clean);
});
test('old HTTP200, mismatching screen, dirty or unknown build never verify',()=>{
 for(const [api,screen] of [[{sha:old,dirty:false},clean],[clean,{sha:old,dirty:false}],[{sha,dirty:true},clean],[clean,{sha,dirty:null}],[{},{}]])assert.throws(()=>verifyRevision(sha,api,screen));
 assert.throws(()=>verifyRevision('unknown',clean,clean));
 assert.throws(()=>htmlRevision(html+`<meta name="koretail-build-sha" content="${old}">`));
 for(const raw of [undefined,'bad',JSON.stringify({sha:[sha],dirty:false}),JSON.stringify({sha,dirty:'false'})])assert.deepEqual(parseBuildRevision(raw),{sha:null,dirty:null});
});
test('successful workflow with stale last-good weather is still degraded, never full recovery',()=>{
 // Incident 38391976274: the job succeeded after PARTIAL 1/4 grids, sourceHealth STALE.
 const evidence=operationalEvidence(200,{database:'ok',sources:[{sourceId:'weather',status:'STALE',lastRetrievedAt:'2026-10-13T00:00:00Z'}]});
 assert.equal(evidence.state,'DEGRADED');assert.equal(evidence.fullRecoveryVerified,false);
 assert.equal(operationalEvidence(200,{database:'ok',sources:[]}).state,'UNVERIFIED');
 assert.equal(operationalEvidence(503,{database:'unavailable'}).state,'DEGRADED');
 assert.equal(operationalEvidence(200,{database:'ok',sources:[{sourceId:'weather',status:'SUCCESS',lastRetrievedAt:'2026-10-13T00:00:00Z'}]}).state,'REPORTED_OK_NOT_INDEPENDENTLY_VERIFIED');
});
test('public check uses only site build, HTML and health; operation failure is separate',async()=>{
 const paths:string[]=[];
 const result=await inspectPublicRevision('https://koretaildata.com',sha,async(input:Parameters<typeof fetch>[0])=>{const url=new URL(input instanceof Request?input.url:String(input));
  paths.push(url.pathname);
  if(url.pathname==='/api/build')return Response.json(clean);
  if(url.pathname==='/ko')return new Response(html);
  return Response.json({database:'ok',sources:[{sourceId:'weather',status:'PARTIAL'}]});
 });
 assert.deepEqual(paths,['/api/build','/ko','/api/health']);assert.equal(result.revisionVerified,true);assert.equal(result.operation.state,'DEGRADED');
});
test('public mismatch fails without provider requests or retries',async()=>{
 const paths:string[]=[];
 await assert.rejects(()=>inspectPublicRevision('https://koretaildata.com',sha,async(input:Parameters<typeof fetch>[0])=>{const url=new URL(input instanceof Request?input.url:String(input));paths.push(url.pathname);return url.pathname==='/api/build'?Response.json({sha:old,dirty:false}):new Response(html);}),/does not match/);
 assert.deepEqual(paths,['/api/build','/ko']);
});
