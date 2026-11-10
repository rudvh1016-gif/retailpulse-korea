import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const load=name=>JSON.parse(readFileSync(`data/airport-focus-preview/${name}.json`,'utf8'));
const id='MX-all-2026-11-16-major';
const run=(root=process.cwd())=>spawnSync(process.execPath,['scripts/check-next-week-calendar.mjs',root],{encoding:'utf8'});
function corrupted(change){
 const root=mkdtempSync(join(tmpdir(),'next-week-contract-'));
 try{
  const data={source:load('holidays'),summary:load('holidays-summary')};change(data);
  mkdirSync(join(root,'data/airport-focus-preview'),{recursive:true});
  for(const [key,name] of [['source','holidays'],['summary','holidays-summary']])writeFileSync(join(root,`data/airport-focus-preview/${name}.json`),JSON.stringify(data[key]));
  return run(root);
 }finally{rmSync(root,{recursive:true,force:true});}
}

test('offline next-week data gate passes the real source and projection with an explicit limited review scope',()=>{
 const result=run();assert.equal(result.status,0,result.stderr);
 const report=JSON.parse(result.stdout);
 assert.equal(report.status,'PASS');assert.equal(report.sourceRows,load('holidays').events.length);
 assert.deepEqual(report.reviewedWindows,[{start:'2026-11-16',end:'2026-11-22',countries:['MX','CZ']}]);
 assert.equal(report.annualCompleteness,'NOT_ESTABLISHED');
});

const missing=(data,key)=>{data[key].events=data[key].events.filter(event=>event.id!==id);};
for(const [name,change,diagnostic] of [
 ['source-only deletion',d=>missing(d,'source'),'SOURCE_MISSING'],
 ['projection-only deletion',d=>missing(d,'summary'),'PROJECTION_MISSING'],
 ['both-file deletion',d=>{missing(d,'source');missing(d,'summary');},'SOURCE_MISSING'],
 ['both-file date displacement',d=>{for(const key of ['source','summary'])Object.assign(d[key].events.find(e=>e.id===id),{start:'2026-11-23',end:'2026-11-23'});},'REVIEWED_FACT_MISMATCH'],
 ['holiday period expansion',d=>{for(const key of ['source','summary'])d[key].events.find(e=>e.id===id).end='2026-11-20';},'REVIEWED_FACT_MISMATCH'],
 ['legal scope expansion',d=>{for(const key of ['source','summary'])d[key].events.find(e=>e.id===id).scope='전 국민 연속 휴무';},'REVIEWED_FACT_MISMATCH'],
 ['missing official source',d=>{for(const key of ['source','summary'])delete d[key].events.find(e=>e.id===id).sourceURL;},'REVIEWED_FACT_MISMATCH'],
 ['missing verification',d=>{delete d.source.events.find(e=>e.id===id).checkedAt;delete d.summary.events.find(e=>e.id===id).verifiedAt;},'REVIEW_MISSING'],
 ['future verification',d=>{d.source.events.find(e=>e.id===id).checkedAt='2026-11-11T00:00:00Z';d.summary.events.find(e=>e.id===id).verifiedAt='2026-11-11';},'REVIEW_NOT_AVAILABLE'],
 ['backdated verification',d=>{d.source.events.find(e=>e.id===id).checkedAt='2026-10-01T00:00:00Z';d.summary.events.find(e=>e.id===id).verifiedAt='2026-10-01';},'REVIEW_DATE_MISMATCH'],
 ['conditional replacement',d=>{for(const key of ['source','summary'])d[key].events.find(e=>e.id===id).conditional=true;},'REVIEWED_FACT_MISMATCH'],
 ['duplicate event identity',d=>d.summary.events.push({...d.summary.events.find(e=>e.id===id)}),'DUPLICATE_ID'],
 ['unrelated source projection drift',d=>{d.summary.events.find(e=>e.id!==id).end='2027-12-31';},'PROJECTION_DRIFT'],
])test(`offline gate exits nonzero for ${name}`,()=>{
 const result=corrupted(change);
 assert.equal(result.status,1,result.stdout+result.stderr);
 assert.match(result.stderr,new RegExp(diagnostic));
 assert.doesNotMatch(result.stdout,/"status":\s*"PASS"/);
});
