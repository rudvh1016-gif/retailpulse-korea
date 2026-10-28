import test from 'node:test';
import assert from 'node:assert/strict';
import { FLIGHTS_TTL_MS, loadFlights } from '../app/flights-client';

test('a pre-collection response expires, focus refreshes, parallel views share requests, and dates stay independent', async () => {
  const originalFetch=globalThis.fetch, originalNow=Date.now;
  let now=1000, reads=0;
  const resolvers:Array<(response:Response)=>void>=[];
  Date.now=()=>now;
  globalThis.fetch=async (_url, options)=>{
    reads++;
    assert.equal(options?.cache,'no-cache');
    return new Promise<Response>(resolve=>resolvers.push(resolve));
  };
  const reply=(date:string,gate:string|null)=>new Response(JSON.stringify({mode:'live-flights',serviceDateKst:date,
    flights:[{terminal:'T2',gate}],retrievedAt:'2026-10-07T00:00:00Z'}));
  try {
    const date='2026-10-08', next='2026-10-09';
    const first=loadFlights(date);
    assert.equal(loadFlights(date),first);
    resolvers.shift()!(reply(date,null));
    assert.equal((await first).status,'OK');
    now+=FLIGHTS_TTL_MS-1;
    await loadFlights(date);
    assert.equal(reads,1,'a new terminal view reuses the fresh same-date response');
    now++;
    const refreshed=loadFlights(date);
    assert.equal(loadFlights(date,true),refreshed);
    resolvers.shift()!(reply(date,'215'));
    const value=await refreshed;
    assert.equal(value.status==='OK'&&value.payload.flights[0].gate,'215','later stored gates replace the midnight schedule');
    now+=6000;
    const focus=loadFlights(date,true);
    assert.equal(loadFlights(date,true),focus);
    const other=loadFlights(next);
    resolvers.pop()!(reply(next,'291'));
    await other;
    resolvers.shift()!(reply(date,'252'));
    await focus;
    const nextValue=await loadFlights(next);
    assert.equal(nextValue.status==='OK'&&nextValue.payload.serviceDateKst,next,'late previous-date responses cannot replace a new date');
    assert.equal(reads,4);
  } finally { globalThis.fetch=originalFetch; Date.now=originalNow; }
});

test('failure and a wrong-date response are retryable, never confirmed empty flights',async()=>{
  const originalFetch=globalThis.fetch;
  let reads=0;
  globalThis.fetch=async()=>{
    reads++;
    if(reads===1)throw new Error('offline');
    return new Response(JSON.stringify({mode:'live-flights',serviceDateKst:reads===2?'2026-10-10':'2026-10-11',flights:[]}));
  };
  try {
    assert.equal((await loadFlights('2026-10-11')).status,'FAILED');
    assert.equal((await loadFlights('2026-10-11')).status,'FAILED');
    assert.equal((await loadFlights('2026-10-11')).status,'OK');
    assert.equal(reads,3);
  } finally {globalThis.fetch=originalFetch;}
});

test('a held next-day flight cache is bypassed at KST midnight, with no extra same-day stream',async()=>{
 const originalFetch=globalThis.fetch,originalNow=Date.now;let now=Date.parse('2026-10-09T14:59:59Z');const urls:string[]=[];
 Date.now=()=>now;globalThis.fetch=async url=>{urls.push(String(url));return new Response(JSON.stringify({mode:'live-flights',serviceDateKst:'2026-10-10',basis:urls.length===1?'OFFICIAL_DEPARTURE_SCHEDULE':'COLLECTED_FLIGHT_RECORDS',flights:[]}));};
 try{const before=await loadFlights('2026-10-10');assert.equal(before.status==='OK'&&before.payload.basis,'OFFICIAL_DEPARTURE_SCHEDULE');await loadFlights('2026-10-10');assert.equal(urls.length,1);now+=2000;const after=await loadFlights('2026-10-10');assert.equal(after.status==='OK'&&after.payload.basis,'COLLECTED_FLIGHT_RECORDS');assert.equal(urls.length,2);assert.ok(urls[0].includes('_day=2026-10-09'));assert.ok(urls[1].includes('_day=2026-10-10'));}finally{globalThis.fetch=originalFetch;Date.now=originalNow;}
});

test('an interrupted 200 body retries once, coalesces callers and preserves exact date',async()=>{
 const saved=globalThis.fetch;let reads=0;const urls:string[]=[];
 globalThis.fetch=async url=>{urls.push(String(url));reads++;if(reads===1)return new Response(new ReadableStream({start(controller){controller.error(new TypeError('terminated body'));}}));return Response.json({mode:'live-flights',serviceDateKst:'2026-11-01',flights:[{gate:'215'}]});};
 try{const a=loadFlights('2026-11-01'),b=loadFlights('2026-11-01');assert.equal(a,b);const result=await a;assert.equal(result.status,'OK');assert.equal(result.status==='OK'&&result.payload.flights[0].gate,'215');assert.equal(reads,2);assert.equal(urls[0],urls[1]);await loadFlights('2026-11-01');assert.equal(reads,2);}finally{globalThis.fetch=saved;}
});
test('repeated transport failure stays FAILED and HTTP/invalid JSON never trigger transport retries',async()=>{
 const saved=globalThis.fetch;try{
  let reads=0;globalThis.fetch=async()=>{reads++;throw new DOMException('timed out','TimeoutError');};assert.equal((await loadFlights('2026-11-02')).status,'FAILED');assert.equal(reads,2);
  reads=0;globalThis.fetch=async()=>{reads++;return new Response('{}',{status:503});};assert.equal((await loadFlights('2026-11-03')).status,'FAILED');assert.equal(reads,1);
  reads=0;globalThis.fetch=async()=>{reads++;return new Response('invalid');};assert.equal((await loadFlights('2026-11-04')).status,'FAILED');assert.equal(reads,1);
 }finally{globalThis.fetch=saved;}
});
