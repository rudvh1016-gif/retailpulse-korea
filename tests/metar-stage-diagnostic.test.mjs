import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {stagedHttpsTransport} from '../scripts/diagnose-rksi-metar-once.mjs';
import {probeRksiOnce} from '../scripts/probe-rksi-metar-once.mjs';
const fixtureKey='diagnostic-fixture-not-credential';
function mockRequest(body,{failPhase=null}={}){
 return (url,options,callback)=>{assert.equal(url.searchParams.get('icao'),'RKSI');assert.equal(options.rejectUnauthorized,true);assert.equal(options.agent,false);
  const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{
    const socket=new EventEmitter();socket.authorized=true;req.emit('socket',socket);
    socket.emit('lookup',null,'not-recorded',4);if(failPhase==='TCP'){req.emit('error',Object.assign(Error(fixtureKey),{code:'ECONNREFUSED'}));return;}
    socket.emit('connect');if(failPhase==='TLS'){req.emit('error',Object.assign(Error(fixtureKey),{code:'CERT_HAS_EXPIRED'}));return;}
    socket.emit('secureConnect');const response=Readable.from([Buffer.from(JSON.stringify(body))]);response.statusCode=200;response.headers={'content-type':'application/json'};callback(response);
  });return req;};
}
const body={response:{header:{resultCode:'00'},body:{pageNo:1,numOfRows:100,totalCount:1,items:{item:[{msgText:'METAR RKSI 061300Z 18008KT CAVOK 19/12 Q1016=','om:phenomenonTime':'2026-10-06T13:00:00Z'}]}}}};
test('additional mode uses thirty-second total bound and records safe transport milestones',async()=>{const t=stagedHttpsTransport({requestImpl:mockRequest(body)});const p=await probeRksiOnce({serviceKey:fixtureKey,fetchImpl:t.fetchImpl,timeoutMs:30000});assert.equal(p.status,'VERIFIED_CONTRACT');assert.equal(p.timeoutMs,30000);assert.equal(p.requestCount,1);assert.deepEqual(t.stages.events.map(e=>e.phase),['DNS','TCP','TLS','HTTP_HEADERS','RESPONSE_BODY','COMPLETE']);assert.equal(JSON.stringify(t.stages).includes(fixtureKey),false);assert.equal(JSON.stringify(t.stages).includes('not-recorded'),false);});
test('TCP and certificate errors retain only stage and allowlisted code',async()=>{for(const phase of['TCP','TLS']){const t=stagedHttpsTransport({requestImpl:mockRequest(null,{failPhase:phase})});const p=await probeRksiOnce({serviceKey:fixtureKey,fetchImpl:t.fetchImpl,timeoutMs:30000});assert.equal(p.requestCount,1);assert.equal(p.status,'REQUEST_FAILED');assert.equal(t.stages.phase,phase);assert.equal(t.stages.errorCode,phase==='TCP'?'ECONNREFUSED':'CERT_HAS_EXPIRED');assert.equal(JSON.stringify({p,stages:t.stages}).includes(fixtureKey),false);}});
test('unapproved deadlines fail before any request',async()=>{let calls=0;await assert.rejects(probeRksiOnce({serviceKey:fixtureKey,timeoutMs:60000,fetchImpl:async()=>{calls++;}}));assert.equal(calls,0);});
