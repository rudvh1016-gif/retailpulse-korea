import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { overlayRows, promoteSnapshot } from '../lib/archive-overlay.ts';
import { recoveryEvidence } from '../lib/storage-recovery.ts';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const paths={
 T1:Array.from({length:6},(_,i)=>['E','W'].map(side=>`DG${i+1}_${side}`)).flat(),
 T2:['DG1','DG2'].flatMap(gate=>['A','B','C','D'].map(side=>`${gate}_${side}`)),
 SEOUL:['myeongdong','hongdae','seongsu','itaewon'],
 WEATHER:['myeongdong','hongdae','seongsu','itaewon'],
 A5:['T1','T2'].flatMap(t=>['departure','arrival'].flatMap(d=>Array.from({length:24},(_,h)=>`${t}:${d}:${h}`))),
};
for(const [source,expected] of Object.entries(paths))test(`${source}: incomplete, full, capacity, recover twice, public mismatch and rollback preserve archive`,async()=>{
 const archive=new DatabaseSync(':memory:'),active=new DatabaseSync(':memory:');
 const schema='CREATE TABLE snapshots(source TEXT PRIMARY KEY,payload TEXT NOT NULL);';
 archive.exec(schema);active.exec(schema);
 const at='2026-11-16T23:00:00.000Z',oldAt='2026-11-16T19:00:00.000Z',now=Date.parse(at)+60000;
 const old=expected.map(key=>({key,issuedAt:oldAt,value:1})),fresh=expected.map(key=>({key,issuedAt:at,value:2}));
 archive.prepare('INSERT INTO snapshots VALUES (?,?)').run(source,JSON.stringify(old));
 archive.exec('PRAGMA query_only=ON');
 const archiveHash=()=>createHash('sha256').update(archive.prepare('SELECT payload FROM snapshots').get().payload).digest('hex');
 const originalHash=archiveHash();
 let full=false,broken=false;
 const read=()=>JSON.parse((active.prepare('SELECT payload FROM snapshots WHERE source=?').get(source)
   ??archive.prepare('SELECT payload FROM snapshots WHERE source=?').get(source)).payload);
 const persist=async rows=>{active.exec('BEGIN IMMEDIATE');try{
  active.prepare('INSERT INTO snapshots VALUES (?,?) ON CONFLICT(source) DO UPDATE SET payload=excluded.payload').run(source,JSON.stringify(rows));
  if(full||broken)throw Error(full?'D1_HTTP_400_7500_EXCEEDED_MAXIMUM_DB_SIZE':'manifest failure');
  active.exec('COMMIT');
 }catch(e){active.exec('ROLLBACK');throw e;}};
 const promote=rows=>promoteSnapshot({expected,rows,now,maxAgeMs:180000,persist});
 assert.equal(await promote(fresh.slice(1)),'PARTIAL_DATA');assert.deepEqual(read(),old);
 full=true;assert.equal(await promote(fresh),'PERSISTENCE_FAILED');assert.deepEqual(read(),old);
 full=false;assert.equal(await promote(fresh),'PROMOTED');assert.deepEqual(read(),fresh);
 const proof={now,expectedKeys:expected,stored:fresh.map(r=>({key:r.key,at:r.issuedAt})),published:fresh.map(r=>({key:r.key,at:r.issuedAt})),maxAgeMs:180000,successfulRuns:1,storageBlocked:false};
 assert.equal(recoveryEvidence(proof),'RECOVERY_PENDING');
 assert.equal(await promote(fresh),'PROMOTED');
 assert.equal(recoveryEvidence({...proof,successfulRuns:2}),'RECOVERED');
 assert.equal(recoveryEvidence({...proof,published:proof.published.slice(1),successfulRuns:2}),'PARTIAL_DATA');
 broken=true;assert.equal(await promote(fresh.map(r=>({...r,value:3}))),'PERSISTENCE_FAILED');assert.deepEqual(read(),fresh);
 assert.equal(await promote(fresh.map((r,i)=>i?{...r,issuedAt:oldAt}:r)),'INVALID_PAYLOAD');
 // Reversible READ-ONLY rollback. Keep active data; do not resume writes to full archive.
 assert.deepEqual(JSON.parse(archive.prepare('SELECT payload FROM snapshots').get().payload),old);
 assert.equal(archiveHash(),originalHash);
 assert.throws(()=>archive.prepare('INSERT INTO snapshots VALUES (?,?)').run('bad','[]'),/readonly/);
 archive.close();active.close();
});

test('62-day context, 7/28-day and monthly history union retains archive and resolves overlap once',()=>{
 const archive=Array.from({length:62},(_,day)=>({id:`day:${day}`,value:day}));
 const active=[{id:'day:61',value:100},{id:'day:62',value:200}];
 const merged=overlayRows(archive,active,row=>row.id);
 assert.equal(merged.length,63);assert.equal(merged.find(r=>r.id==='day:61').value,100);
 for(const day of [0,7,28,31,61])assert.ok(merged.some(r=>r.id===`day:${day}`));
 assert.equal(archive[61].value,61);
 assert.throws(()=>overlayRows(archive,active,row=>row.id,(a,b)=>a.value===b.value),/immutable_overlay_conflict/);
 assert.throws(()=>overlayRows(archive,[active[0],active[0]],row=>row.id),/duplicate_active/);
});

test('metadata-only branch exits before SQL and stays on existing manual diagnostic',()=>{
 const script=readFileSync('scripts/measure-production-storage.ts','utf8');
 const branch=script.indexOf('if (process.env.RPK_STORAGE_METADATA_ONLY');
 assert.ok(branch>script.indexOf('const accountDatabases'));
 assert.ok(script.indexOf('process.exit(0)',branch)<script.indexOf('const sizeProbe'));
 assert.doesNotMatch(readFileSync('.github/workflows/measure-read-budget.yml','utf8'),/schedule:/);
});

test('metadata diagnostic executes exactly two REST GETs and prints no identifiers or token',()=>{
 const program=`let calls=0;globalThis.fetch=async(url,init)=>{calls++;if(init?.method&&init.method!=='GET')throw Error('non_get');if(calls>2)throw Error('extra_request');return new Response(JSON.stringify({success:true,result:calls===1?{file_size:524288000,num_tables:60,created_at:'2026-08-27'}:[{name:'private-name',uuid:'private-id',file_size:524288000}]}));};await import('./scripts/measure-production-storage.ts');`;
 const output=execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',program],{encoding:'utf8',env:{...process.env,CLOUDFLARE_D1_WRITE_TOKEN:'synthetic-secret-never-print',RPK_STORAGE_METADATA_ONLY:'true'}});
 const report=JSON.parse(output);assert.equal(report.sqlRequests,0);assert.equal(report.rowsRead,0);
 assert.equal(report.officialDatabase.fileSizeBytes,524288000);assert.equal(report.accountDatabases.databases,1);
 assert.doesNotMatch(output,/private-name|private-id|synthetic-secret/);
});
