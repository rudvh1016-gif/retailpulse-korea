import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare} from './helpers/miniflare.mjs';
import {D1AdmissionAuthority} from '../lib/d1-admission-authority.ts';
import {executeWithAuthority} from '../scripts/authoritative-admission.ts';
import {COMPLETE_SQL,CLAIM_SQL} from '../lib/admission-contract.ts';
const scope={databaseId:'active',epoch:'epoch-1',source:'airport_congestion',commit:'a'.repeat(40)};
async function fixture(t){const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("local")}}',compatibilityDate:'2026-05-22',d1Databases:['ACTIVE']});t.after(()=>mf.dispose());const db=await mf.getD1Database('ACTIVE');await db.prepare(readFileSync('config/recovery/admission-schema.sql','utf8')).run();await db.prepare('CREATE TABLE writes(id TEXT)').run();await db.prepare("INSERT INTO admission VALUES(?,?,?,?,?,'READY',NULL,NULL)").bind(scope.databaseId,scope.epoch,scope.source,scope.commit,Date.now()+600000).run();return db;}
function faulty(db,sql,after=false){
 return {prepare(query){
  const statement=db.prepare(query);
  return {bind(...values){
   return {async run(){
    if(query===sql){if(after)await statement.bind(...values).run();throw Error('local_lost_ack');}
    return statement.bind(...values).run();
   }};
  }};
 }};
}
test('local Workerd: twelve concurrent D1 consumers permit exactly one actual target write',async t=>{const db=await fixture(t);const outputs=await Promise.allSettled(Array.from({length:12},(_,i)=>executeWithAuthority({enabled:true,authority:new D1AdmissionAuthority(db),scope,requestId:i<6?'same-slot':'different-'+i},async()=>{await db.prepare('INSERT INTO writes VALUES(?)').bind(String(i)).run();return {status:'SUCCESS'};})));assert.equal(outputs.filter(o=>o.status==='fulfilled').length,1);assert.equal(await db.prepare('SELECT count(*) n FROM writes').first('n'),1);assert.equal(await db.prepare('SELECT state FROM admission').first('state'),'DONE');});
test('local Workerd: committed claim with lost reply never calls work; retry and epoch bypass denied',async t=>{const db=await fixture(t);let writes=0;await assert.rejects(()=>executeWithAuthority({enabled:true,authority:new D1AdmissionAuthority(faulty(db,CLAIM_SQL,true)),scope,requestId:'lost'},async()=>{writes++;return {status:'SUCCESS'};}));const good=new D1AdmissionAuthority(db);await assert.rejects(()=>good.acquire(scope,'retry'));await assert.rejects(()=>good.acquire({...scope,epoch:'new-epoch'},'bypass'));assert.equal(writes,0);assert.equal(await db.prepare('SELECT state FROM admission').first('state'),'INFLIGHT');});
test('local Workerd: write succeeded, completion store fails; durable consumed state blocks replacement',async t=>{const db=await fixture(t);await assert.rejects(()=>executeWithAuthority({enabled:true,authority:new D1AdmissionAuthority(faulty(db,COMPLETE_SQL)),scope,requestId:'lost-completion'},async()=>{await db.prepare("INSERT INTO writes VALUES('one')").run();return {status:'SUCCESS'};}));await assert.rejects(()=>new D1AdmissionAuthority(db).acquire(scope,'replacement'));assert.equal(await db.prepare('SELECT count(*) n FROM writes').first('n'),1);assert.equal(await db.prepare('SELECT state FROM admission').first('state'),'INFLIGHT');});
test('local Workerd: missing changes metadata fails closed even after claim committed',async t=>{const db=await fixture(t);let writes=0;const withoutMeta={prepare(sql){return {bind(...v){return {async run(){const result=await db.prepare(sql).bind(...v).run();return {...result,meta:undefined};}};}};}};await assert.rejects(()=>executeWithAuthority({enabled:true,authority:new D1AdmissionAuthority(withoutMeta),scope,requestId:'missing-meta'},async()=>{writes++;return {status:'SUCCESS'};}));assert.equal(writes,0);assert.equal(await db.prepare('SELECT state FROM admission').first('state'),'INFLIGHT');await assert.rejects(()=>new D1AdmissionAuthority(db).acquire(scope,'retry'));});
