import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudflareD1RestDatabase } from '../lib/d1-rest.ts';
import { decideCongestionRetry, shouldRetryForecast, shouldRetryWeather } from '../lib/congestion-retry.ts';
import { capacitySignal, recoveryEvidence, storageTrend, notificationTransition } from '../lib/storage-recovery.ts';

test('7500 latches writes only on this adapter, allows bounded reads and another database', async()=>{
 let calls=0;
 const full=async()=>{calls++;return new Response(JSON.stringify({success:false,errors:[{code:7500,message:'Exceeded maximum DB size.'}]}),{status:400});};
 const db=new CloudflareD1RestDatabase('account','full','test',full);
 await assert.rejects(db.prepare('INSERT INTO example VALUES (?)').bind(1).run(),/7500/);
 assert.equal(db.storageWriteBlocked(),true);
 await assert.rejects(db.prepare('INSERT INTO example VALUES (?)').bind(2).run(),/d1_storage_capacity_blocked/);
 assert.equal(calls,1,'no repeated write request');
 await assert.rejects(db.prepare('SELECT 1').all(),/7500/);
 assert.equal(calls,2,'reads are still attempted');
 const other=new CloudflareD1RestDatabase('account','other','test',async()=>new Response(JSON.stringify({success:true,result:[{success:true,results:[],meta:{rows_read:0,rows_written:1}}]})));
 assert.equal(other.storageWriteBlocked(),false);
 await other.prepare('INSERT INTO example VALUES (1)').run();
});

test('code 7500 is permanent even in a 5xx envelope; no HTTP retry', async()=>{
 let calls=0;
 const db=new CloudflareD1RestDatabase('account','full','test',async()=>{calls++;return new Response(JSON.stringify({success:false,errors:[{code:7500,message:'Exceeded maximum DB size.'}]}),{status:503});});
 await assert.rejects(db.prepare('INSERT INTO example VALUES (1)').run(),/7500/);
 assert.equal(calls,1);
});

test('capacity never earns fresh runner; independent network failure still does',()=>{
 const failure='failureClass=VALIDATION causeCode=D1_HTTP_400_7500_EXCEEDED_MAXIMUM_DB_SIZE attempts=1';
 const line=(source,detail)=>JSON.stringify({source,status:'ERROR',detail});
 assert.deepEqual(decideCongestionRetry(line('airport_congestion',failure)+'\n'+line('airport_congestion_t2','failureClass=NETWORK causeCode=UND_ERR_CONNECT_TIMEOUT')).sources,['airport_congestion_t2']);
 assert.equal(shouldRetryForecast(line('airport_passenger_forecast',failure)),false);
 assert.equal(shouldRetryWeather(line('weather',failure)),false);
 assert.equal(capacitySignal(failure),'CAPACITY_EXHAUSTED');
 assert.equal(capacitySignal('failureClass=HTTP httpStatus=500'),'UNKNOWN');
});

test('fresh complete sequential collection plus public match is required, never health badge',()=>{
 const now=Date.parse('2026-11-17T00:00:00Z');
 const proof={now,expectedKeys:['T1','T2'],stored:[{key:'T1',at:new Date(now-60000).toISOString()},{key:'T2',at:new Date(now-60000).toISOString()}],published:[{key:'T1',at:new Date(now-60000).toISOString()},{key:'T2',at:new Date(now-60000).toISOString()}],maxAgeMs:30*60000,successfulRuns:2,storageBlocked:false};
 assert.equal(recoveryEvidence(proof),'RECOVERED');
 assert.equal(recoveryEvidence({...proof,successfulRuns:1}),'RECOVERY_PENDING');
 assert.equal(recoveryEvidence({...proof,storageBlocked:true}),'PERSISTENCE_FAILED');
 assert.equal(recoveryEvidence({...proof,published:proof.published.slice(0,1)}),'PARTIAL_DATA');
 assert.equal(recoveryEvidence({...proof,stored:proof.stored.map(r=>({...r,at:'2026-11-16T00:00:00Z'}))}),'STALE');
 assert.equal(recoveryEvidence({...proof,published:proof.published.map(r=>({...r,at:'2026-11-17T00:00:00Z'}))}),'PUBLICATION_MISMATCH');
 assert.equal(recoveryEvidence({...proof,stored:[proof.stored[0],proof.stored[0]]}),'PARTIAL_DATA');
 assert.equal(recoveryEvidence({...proof,stored:proof.stored.map(r=>({...r,at:'invalid'}))}),'STALE');
});

test('official byte trend shares 70/85/95 rules and rejects estimates, missing or reversed evidence',()=>{
 const points=[{at:'2026-11-15T00:00:00Z',bytes:300},{at:'2026-11-16T00:00:00Z',bytes:350}];
 assert.equal(storageTrend(points,500).level,'NOTICE');
 assert.equal(storageTrend(points,500).bytesPerDay,50);
 assert.equal(storageTrend([],500).level,'UNKNOWN');
 assert.equal(storageTrend([{...points[0],bytes:-1}],500).level,'UNKNOWN');
 assert.equal(storageTrend([...points].reverse(),500).bytesPerDay,null);
 assert.equal(storageTrend([{...points[1],bytes:425}],500).level,'PROTECT');
 assert.equal(storageTrend([{...points[1],bytes:475}],500).level,'EMERGENCY');
});

test('notification suppression keyed by resource and state; recovery reopens next incident',()=>{
 const prior={'db:storage':'EMERGENCY','T1:freshness':'STALE'};
 assert.equal(notificationTransition(prior,'db:storage','EMERGENCY').notify,false);
 assert.equal(notificationTransition(prior,'T2:freshness','STALE').notify,true);
 const recovered=notificationTransition(prior,'db:storage','NORMAL');
 assert.equal(recovered.notify,true);
 assert.equal(notificationTransition(recovered.next,'db:storage','EMERGENCY').notify,true);
});

test('7500 query constraint failure does not latch storage or suppress later writes',async()=>{
 let calls=0;
 const db=new CloudflareD1RestDatabase('account','db','test',async()=>{calls++;return calls===1
  ?new Response(JSON.stringify({success:false,errors:[{code:7500,message:'UNIQUE constraint failed: airport_forecast_versions.id'}]}),{status:400})
  :new Response(JSON.stringify({success:true,result:[{success:true,meta:{rows_read:0,rows_written:1}}]}));});
 await assert.rejects(db.prepare('INSERT INTO example VALUES (1)').run(),/7500/);
 assert.equal(db.storageWriteBlocked(),false);
 assert.equal(capacitySignal('D1_HTTP_400_7500_UNIQUE_CONSTRAINT_FAILED'),'UNKNOWN');
 await db.prepare('INSERT INTO example VALUES (2)').run();assert.equal(calls,2);
});
