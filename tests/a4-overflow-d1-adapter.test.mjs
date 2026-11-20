import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {createA4D1Stores} from '../lib/a4-overflow-d1-adapter';
import {A4_GENERATION_SCHEMA,A4_POINTER_SCHEMA,publishA4Generation,readA4Generation} from '../lib/a4-overflow-publication';

test('native local D1 bindings isolate complete generations and roll back primary pointer on batch failure', async()=>{
 const script='export default { fetch(){ return new Response("not an application"); } }';
 const mf=new Miniflare({workers:[{config:{
  name:'a4-local',compatibilityDate:'2026-05-22',
  manifest:{mainModule:'index.js',modules:{'index.js':{type:'esm',contents:script}}},
  env:{PRIMARY:{type:'d1',id:'local-primary'},A4_OVERFLOW:{type:'d1',id:'local-overflow'}},
 }}]});
 try {
 const primary=await mf.getD1Database('PRIMARY'), overflow=await mf.getD1Database('A4_OVERFLOW');
 await primary.prepare(A4_POINTER_SCHEMA.trim().replace(/;$/,'')).run();
 // D1 exec is newline-oriented; prepare each complete CREATE statement.
 for (const sql of A4_GENERATION_SCHEMA.trim().split(/(?<=\);| END;)\s*\n(?=CREATE)/)) await overflow.prepare(sql.trim().replace(/;$/,'')).run();
 await primary.prepare('CREATE TABLE evidence(digest TEXT PRIMARY KEY NOT NULL)').run();
 const stores=createA4D1Stores({primary,overflow,preparePrimaryEvidence:(db,p)=>
  [db.prepare('INSERT INTO evidence SELECT ? WHERE changes()=1').bind(p.digest)]});
 const capture=(at)=>({terminal:'T1',rows:[{terminal:'T1',sourceId:'INCHEON_DEPARTURE_CONGESTION',zone:'1',observedAt:at}]});
 const first=capture('2026-11-19T08:05:00Z');
 const next=capture('2026-11-19T08:06:00Z');
 assert.equal(await publishA4Generation(first,stores),'published');
 assert.equal(await primary.prepare('SELECT count(*) n FROM evidence').first('n'),1);
 assert.deepEqual(await readA4Generation('T1',stores),{state:'ok',rows:first.rows});
 const broken=createA4D1Stores({primary,overflow,preparePrimaryEvidence:(db)=>
  [db.prepare('INSERT INTO evidence SELECT NULL WHERE changes()=1')]});
 await assert.rejects(publishA4Generation(next,broken),/unverified_publication/);
 assert.deepEqual(await readA4Generation('T1',stores),{state:'ok',rows:first.rows});
 assert.equal(await overflow.prepare('SELECT count(*) n FROM a4_generation').first('n'),2);
 assert.equal(await publishA4Generation(next,stores),'published');
 assert.equal(await primary.prepare('SELECT count(*) n FROM evidence').first('n'),2);
 assert.deepEqual(await readA4Generation('T1',stores),{state:'ok',rows:next.rows});
 assert.throws(()=>createA4D1Stores({primary,overflow:primary}),/distinct_bindings/);
 } finally {await mf.dispose();}
});
