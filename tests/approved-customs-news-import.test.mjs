import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SqliteD1} from './helpers/operational-sqlite.mjs';
import {APPROVED_NEWS_IMPORT as scope,approvedNewsInputs,importApprovedNews,requireApprovedImportContext} from '../scripts/approved-customs-news-import.ts';
const sql=readFileSync('drizzle/0026_official_news.sql'),data=readFileSync('data/approved-news/customs-2026-10-10.json');
const empty=()=>{const db=new SqliteD1(':memory:',false);db.raw.exec('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY, name TEXT UNIQUE, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)');return db;};
const writes=db=>db.calls.filter(sql=>/^(?:CREATE|INSERT|UPDATE|DELETE|DROP|ALTER)/i.test(sql.trim()));

test('approved importer creates only SQL0026 and exactly two real records, repeat writes zero',async()=>{
 const db=empty();try{
  const first=await importApprovedNews(db,scope.databaseId,sql,data);
  assert.equal(first.schemaChanges,5);assert.equal(first.migrationMarkers,1);assert.equal(first.currentChanges,2);assert.equal(first.revisionChanges,0);assert.equal(first.payloadBytes,4952);assert.equal(first.readbackCount,2);assert.equal(first.providerRequests,0);assert.equal(first.automaticCollection,false);
  db.calls.length=0;const replay=await importApprovedNews(db,scope.databaseId,sql,data);
  assert.equal(replay.schemaChanges,0);assert.equal(replay.currentChanges,0);assert.equal(replay.revisionChanges,0);assert.deepEqual(writes(db),[]);
  assert.equal(db.raw.prepare('SELECT count(*) AS n FROM official_news_revision').get().n,0);
 }finally{db.raw.close();}
});
test('wrong target or changed approved bytes stop before any query or write',async()=>{
 const db=empty();try{
  await assert.rejects(importApprovedNews(db,'another-database',sql,data),/WRONG_DATABASE/);
  await assert.rejects(importApprovedNews(db,scope.databaseId,Buffer.from('CREATE TABLE anything(x)'),data),/APPROVED_BYTES_CHANGED/);
  assert.throws(()=>approvedNewsInputs(sql,Buffer.from('[]')),/APPROVED_BYTES_CHANGED/);assert.deepEqual(db.calls,[]);
 }finally{db.raw.close();}
});
test('partial or drifted news schema preserves existing data and stops without writes',async()=>{
 for(const full of [false,true]){const db=empty();try{
  if(full){db.raw.exec(sql.toString());db.raw.exec('ALTER TABLE official_news_current ADD COLUMN owner_extra TEXT');}
  else db.raw.exec('CREATE TABLE official_news_current(owner_data TEXT)');
  await assert.rejects(importApprovedNews(db,scope.databaseId,sql,data),full?/SCHEMA_DRIFT/:/PARTIAL_SCHEMA/);assert.deepEqual(writes(db),[]);
 }finally{db.raw.close();}}
});
test('an existing different record is never overwritten or archived by the approved import',async()=>{
 const db=empty();try{
  await importApprovedNews(db,scope.databaseId,sql,data);
  db.raw.prepare('UPDATE official_news_current SET semantic_hash=? WHERE source_id=?').run('owner-change','10174903');db.calls.length=0;
  await assert.rejects(importApprovedNews(db,scope.databaseId,sql,data),/CONTENT_CONFLICT/);assert.deepEqual(writes(db),[]);
  assert.equal(db.raw.prepare('SELECT semantic_hash FROM official_news_current WHERE source_id=?').get('10174903').semantic_hash,'owner-change');
 }finally{db.raw.close();}
});
test('missing migration history stops instead of creating unrelated operational tables',async()=>{
 const db=new SqliteD1(':memory:',false);try{await assert.rejects(importApprovedNews(db,scope.databaseId,sql,data),/HISTORY_MISSING/);assert.deepEqual(writes(db),[]);}finally{db.raw.close();}
});
test('only the existing manual workflow and exact IMPORT mode can reach credentials',()=>{
 const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'rudvh1016-gif/retailpulse-korea',GITHUB_WORKFLOW_REF:'rudvh1016-gif/retailpulse-korea/.github/workflows/import-oneshot.yml@refs/heads/test',RPK_ONESHOT_CONFIRM:'IMPORT',RPK_ONESHOT_SOURCES:scope.mode,CLOUDFLARE_D1_WRITE_TOKEN:'fixture-only'};
 requireApprovedImportContext(env);
 for(const override of [{GITHUB_EVENT_NAME:'schedule'},{RPK_ONESHOT_CONFIRM:'PROBE'},{RPK_ONESHOT_SOURCES:'weather'},{GITHUB_REPOSITORY:'other/repo'},{GITHUB_WORKFLOW_REF:'other/workflow.yml@main'},{CLOUDFLARE_D1_WRITE_TOKEN:''}])assert.throws(()=>requireApprovedImportContext({...env,...override}));
});
