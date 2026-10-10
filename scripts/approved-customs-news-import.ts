/** Owner-approved, immutable two-record import. No provider, scheduler or delete. */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolveProductionDatabaseConfig} from './production-database';
import {CloudflareD1RestDatabase} from '../lib/d1-rest';
import {mayPublishNews,type OfficialNews} from '../lib/airport-customs-news';
import {officialNewsSemanticHash,storeOfficialNews,validStoredNews} from '../lib/airport-customs-news-store';

export const APPROVED_NEWS_IMPORT={
 mode:'official_news_20261010',approval:'Sentinel_a7f4c552f68c8191b25f8344346f6c1a',
 databaseId:'a86b7e71-ddd8-4677-a65d-aa11490c578c',migration:'0026_official_news.sql',
 migrationSha256:'34699a06080e4bf449aecf85065d6fad48a084766e49bf786dc4d5119ac6b924',
 recordsSha256:'992e01561d5a835c7b3188c7deef68bff3627fcd2c5a956650bd0ce7457aafc6',
 sourceIds:['10174903','10168489'],
} as const;
const schemaNames=['official_news_current','official_news_public_idx','official_news_revision','official_news_current_capacity','official_news_revision_capacity'];
const digest=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const normalize=(sql:string)=>sql.trim().replace(/;$/,'').replace(/\s+/g,' ');
type Database=Pick<D1Database,'prepare'|'batch'>;

export function approvedNewsInputs(migration:Uint8Array,records:Uint8Array){
 if(digest(migration)!==APPROVED_NEWS_IMPORT.migrationSha256||digest(records)!==APPROVED_NEWS_IMPORT.recordsSha256)throw Error('NEWS_APPROVED_BYTES_CHANGED');
 const items:unknown=JSON.parse(Buffer.from(records).toString('utf8'));
 if(!Array.isArray(items)||items.length!==2||items.some((item,i)=>!validStoredNews(item)||item.source!=='customs'||item.sourceId!==APPROVED_NEWS_IMPORT.sourceIds[i]||!mayPublishNews(item)))throw Error('NEWS_APPROVED_IDENTITIES_CHANGED');
 const text=Buffer.from(migration).toString('utf8');
 // A trigger contains semicolons; split only at top-level CREATE statements.
 const offsets=[...text.matchAll(/^CREATE (?:TABLE|INDEX|TRIGGER) /gm)].map(match=>match.index!);
 if(offsets.length!==5)throw Error('NEWS_APPROVED_SCHEMA_CHANGED');
 const statements=offsets.map((offset,i)=>text.slice(offset,offsets[i+1]??text.length).trim());
 return {items:items as OfficialNews[],statements};
}

export async function importApprovedNews(db:Database,databaseId:string,migration:Uint8Array,records:Uint8Array){
 if(databaseId!==APPROVED_NEWS_IMPORT.databaseId)throw Error('NEWS_WRONG_DATABASE');
 const {items,statements}=approvedNewsInputs(migration,records);
 const existing=await db.prepare(`SELECT name,sql FROM sqlite_master WHERE name IN (?,?,?,?,?,?)`).bind(...schemaNames,'d1_migrations').all<{name:string;sql:string}>();
 if(!existing.success||!existing.results)throw Error('NEWS_SCHEMA_READ_FAILED');
 const objects=new Map(existing.results.map(row=>[row.name,row.sql]));
 if(!objects.has('d1_migrations'))throw Error('NEWS_MIGRATION_HISTORY_MISSING');
 const present=schemaNames.filter(name=>objects.has(name));
 if(present.length!==0&&present.length!==5)throw Error('NEWS_PARTIAL_SCHEMA');
 if(present.length&&schemaNames.some((name,i)=>normalize(objects.get(name)!)!==normalize(statements[i])))throw Error('NEWS_SCHEMA_DRIFT');
 const marker=await db.prepare('SELECT name FROM d1_migrations WHERE name=? LIMIT 1').bind(APPROVED_NEWS_IMPORT.migration).first();
 if(marker&&!present.length)throw Error('NEWS_MIGRATION_HISTORY_DRIFT');
 const expectedHashes=await Promise.all(items.map(officialNewsSemanticHash));
 const before=present.length?await db.batch(items.map(item=>db.prepare('SELECT semantic_hash,payload FROM official_news_current WHERE source=? AND source_id=?').bind(item.source,item.sourceId))):items.map(()=>({success:true,results:[]}));
 if(before.some(result=>!result.success))throw Error('NEWS_EXISTING_READ_FAILED');
 const missing=items.filter((_,i)=>!before[i].results?.length);
 for(let i=0;i<items.length;i++){
  const row=before[i].results?.[0] as {semantic_hash:string;payload:string}|undefined;
  if(row&&(row.semantic_hash!==expectedHashes[i]||await officialNewsSemanticHash(JSON.parse(row.payload))!==expectedHashes[i]))throw Error('NEWS_EXISTING_CONTENT_CONFLICT');
 }
 const counts=present.length?await db.batch([
  db.prepare('SELECT COUNT(*) AS n FROM (SELECT 1 FROM official_news_current LIMIT 201)'),
  db.prepare('SELECT COUNT(*) AS n FROM (SELECT 1 FROM official_news_revision LIMIT 401)'),
 ]):[{success:true,results:[{n:0}]},{success:true,results:[{n:0}]}];
 const currentCount=Number((counts[0].results?.[0] as {n:number}|undefined)?.n),revisionCount=Number((counts[1].results?.[0] as {n:number}|undefined)?.n);
 if(counts.some(result=>!result.success)||!Number.isSafeInteger(currentCount)||!Number.isSafeInteger(revisionCount)||currentCount+missing.length>200||revisionCount>400)throw Error('NEWS_STORAGE_CAPACITY');
 let schemaChanges=0,migrationMarkers=0;
 if(!present.length||!marker){
  const ddl=present.length?[]:statements.map(sql=>db.prepare(sql));
  if(!marker)ddl.push(db.prepare('INSERT INTO d1_migrations(name) VALUES (?)').bind(APPROVED_NEWS_IMPORT.migration));
  const results=await db.batch(ddl);
  if(results.some(result=>!result.success))throw Error('NEWS_SCHEMA_WRITE_FAILED');
  schemaChanges=present.length?0:5;migrationMarkers=marker?0:1;
 }
 const changes=await storeOfficialNews(db,missing);
 if(changes.currentChanges!==missing.length||changes.revisionChanges!==0)throw Error('NEWS_WRITE_OUTCOME_RECONCILE_REQUIRED');
 const readback=await db.batch(items.map(item=>db.prepare('SELECT semantic_hash,length(CAST(payload AS BLOB)) AS bytes,may_publish FROM official_news_current WHERE source=? AND source_id=?').bind(item.source,item.sourceId)));
 const rows=readback.map(result=>result.results?.[0] as {semantic_hash:string;bytes:number;may_publish:number}|undefined);
 if(readback.some(result=>!result.success)||rows.some((row,i)=>!row||row.semantic_hash!==expectedHashes[i]||row.may_publish!==1))throw Error('NEWS_READBACK_FAILED');
 return {approval:APPROVED_NEWS_IMPORT.approval,sourceIds:APPROVED_NEWS_IMPORT.sourceIds,schemaChanges,migrationMarkers,...changes,readbackCount:rows.length,payloadBytes:rows.reduce((n,row)=>n+row!.bytes,0),currentCountBefore:currentCount,revisionCountBefore:revisionCount,providerRequests:0,automaticCollection:false};
}

export function requireApprovedImportContext(env:NodeJS.ProcessEnv){
 if(env.RPK_ONESHOT_CONFIRM!=='IMPORT'||env.RPK_ONESHOT_SOURCES!==APPROVED_NEWS_IMPORT.mode||env.GITHUB_ACTIONS!=='true'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_REPOSITORY!=='rudvh1016-gif/retailpulse-korea'||!env.GITHUB_WORKFLOW_REF?.startsWith('rudvh1016-gif/retailpulse-korea/.github/workflows/import-oneshot.yml@'))throw Error('NEWS_APPROVED_MANUAL_CONTEXT_REQUIRED');
 if(!env.CLOUDFLARE_D1_WRITE_TOKEN?.trim())throw Error('NEWS_EXISTING_WRITE_TOKEN_REQUIRED');
}

export async function approvedImportMain(){
 requireApprovedImportContext(process.env);
 const migration=readFileSync(new URL('../drizzle/0026_official_news.sql',import.meta.url)),records=readFileSync(new URL('../data/approved-news/customs-2026-10-10.json',import.meta.url));
 approvedNewsInputs(migration,records); // Immutable scope checked before credentials or networking.
 const {accountId,databaseId,apiToken}=resolveProductionDatabaseConfig('production');
 if(databaseId!==APPROVED_NEWS_IMPORT.databaseId)throw Error('NEWS_WRONG_DATABASE');
 // Do not retry mutation requests after an ambiguous outcome. Reconcile read-only.
 let requests=0;
 const once:typeof fetch=async(input,init)=>{
  if(!String(input).startsWith(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${databaseId}/`))throw Error('NEWS_NON_D1_REQUEST');
  requests++;const response=await fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`NEWS_D1_HTTP_${response.status}_RECONCILE_REQUIRED`);
  return response;
 };
 const db=new CloudflareD1RestDatabase(accountId,databaseId,apiToken,once);
 const sizeBefore=await db.prepare('SELECT 1 AS news_preflight').all();
 if(!sizeBefore.success||!Number.isSafeInteger(sizeBefore.meta?.size_after)||sizeBefore.meta!.size_after!<0||sizeBefore.meta!.size_after!>=350_000_000)throw Error('NEWS_STORAGE_SIZE_UNMEASURED_OR_70_PERCENT_GUARD');
 const result=await importApprovedNews(db as unknown as Database,databaseId,migration,records);
 const sizeAfter=await db.prepare('SELECT 1 AS news_readback').all();
 console.log(JSON.stringify({...result,completedAt:new Date().toISOString(),databaseId,d1HttpRequests:requests,queryUsage:db.usageSnapshot(),databaseBytesBefore:sizeBefore.meta?.size_after??null,databaseBytesAfter:sizeAfter.meta?.size_after??null,databaseSizeDeltaIsNewsOnly:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await approvedImportMain();
