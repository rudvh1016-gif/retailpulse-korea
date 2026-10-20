import test from 'node:test';import assert from 'node:assert/strict';
import {SqliteD1} from './helpers/operational-sqlite.mjs';
import {extractJapanNumericTemplate,parseJapanNumericUpdate} from '../lib/customs-japan-parser.mjs';
import {storeJapanNumericUpdate,readJapanNumericUpdate} from '../lib/customs-allowance-numeric.ts';
import {allowanceSemanticHash} from '../lib/customs-allowance-check.mjs';
const body='<html><body><!--contents start--><p>Fixture only. Age20. Conditions unchanged.</p><table><tr><th colspan="2">酒類</th> <td>3本</td><td>1本760mlのもの。</td></tr><tr><th>「紙巻たばこ」のみの場合</th> <td>200本</td></tr><tr><th colspan="2">香水</th> <td>2オンス</td></tr></table></div><!--contents end--></body></html>';
const parsed=extractJapanNumericTemplate(body),source={id:'JP-01',numericParser:'jp-allowance-v1',baseline:{numericTemplateSha256:parsed.templateSha256,numericValues:parsed.values}};
const country={id:'JP',scope:'Fixture only',conditions:[],results:[],notes:[],sources:[]},datasetHash=allowanceSemanticHash(country),sourceHash='a'.repeat(64);
test('exact reviewed template updates numeric scalars only; ages, conditions, units, scope, dates and structure fail closed',()=>{
 assert.deepEqual(parseJapanNumericUpdate(source,body).values,{liquorBottles:3,liquorBottleMl:760,cigarettes:200,perfumeOunces:2});
 assert.equal(parseJapanNumericUpdate(source,body.replace('<td>2オンス','<td>3オンス')).values.perfumeOunces,3);
 for(const [before,after] of [['Age20','Age18'],['Conditions unchanged','New exceptions'],['760ml','760L'],['<td>3本','<td>0本'],['Fixture only','Applies from 2027-01-01'],['香水','Other item'],['</table>','<tr>new rule</tr></table>']])assert.equal(parseJapanNumericUpdate(source,body.replace(before,after)),null);
});
test('numeric canonical state is changed-only with reviewed dataset identity; only actual changes create notice',async()=>{
 const db=new SqliteD1();assert.equal(await storeJapanNumericUpdate(db,parsed,source,sourceHash,'2026-10-20T00:00:00Z',datasetHash),1);
 let read=await readJapanNumericUpdate(db,country);assert.equal(read.changedAt,null);assert.equal(read.values.perfumeOunces,2);
 assert.equal(await storeJapanNumericUpdate(db,parsed,source,sourceHash,'2026-10-21T00:00:00Z',datasetHash),0);
 const changed=parseJapanNumericUpdate(source,body.replace('<td>2オンス','<td>3オンス'));
 assert.equal(await storeJapanNumericUpdate(db,changed,source,'b'.repeat(64),'2026-10-22T00:00:00Z',datasetHash),1);
 read=await readJapanNumericUpdate(db,country);assert.equal(read.values.perfumeOunces,3);assert.equal(read.previous.perfumeOunces,2);assert.equal(read.changedAt,'2026-10-22T00:00:00Z');assert.equal(read.effectiveDate,null);
 assert.equal(await storeJapanNumericUpdate(db,parsed,source,sourceHash,'2026-10-21T00:00:00Z',datasetHash),0);
 assert.equal(await readJapanNumericUpdate(db,{...country,scope:'Newer manual review'}),null);
 await assert.rejects(storeJapanNumericUpdate(db,{...changed,templateSha256:'wrong'},source,sourceHash,'2026-10-23T00:00:00Z',datasetHash),/UNREVIEWED/);db.raw.close();
});
test('official-template response flows through collector, SQLite and public projection; changed conditions are withheld',async()=>{
 const {collectAllowanceObservations}=await import('../scripts/collect-customs-allowances.ts');
 const {readAllowanceObservations}=await import('../lib/customs-allowance-runtime.ts');
 const url='https://www.customs.go.jp/fixture',c={id:'JP',scope:'Fixture only',checkedAt:'2026-10-20',conditions:[{id:'age',options:[{id:'adult'}]}],results:[{when:{age:['adult']},facts:[{label:'Perfume',value:'2 ounces'}]}],sources:[{url}]};
 const manifest={version:1,automaticCollectionEnabled:false,publicationEnabled:false,policy:{maxRequests:24,maxBytes:1048576,timeoutMs:15000,minIntervalHours:24},allowedHosts:['www.customs.go.jp'],sources:[{...source,jurisdiction:'JP',label:'Fixture',url,format:'html',monitoringRole:'priority_candidate',accessReview:{url,automatedReadAllowed:true,evidenceUrl:'https://www.customs.go.jp/robots.txt',reviewedAt:'2026-10-20',minIntervalHours:24},baseline:{...source.baseline,url,sha256:sourceHash,reviewedAt:'2026-10-20',datasetSemanticHash:allowanceSemanticHash(c)}}]};
 const db=new SqliteD1(),options={activation:true,manifest,dataset:{countries:[c]},fetchImpl:async()=>new Response(body.replace('<td>2オンス','<td>3オンス'),{headers:{'content-type':'text/html'}}),now:()=>new Date('2026-10-20T00:00:00Z')};
 const run=await collectAllowanceObservations(db,options);assert.equal(run.numericCanonicalRowsWritten,1);assert.equal((await readAllowanceObservations(db))[0].state,'NUMERIC_TEMPLATE_VERIFIED');assert.equal((await readJapanNumericUpdate(db,c)).values.perfumeOunces,3);
 await collectAllowanceObservations(db,{...options,now:()=>new Date('2026-10-21T00:00:00Z'),fetchImpl:async()=>new Response(body.replace('Age20','Age18'),{headers:{'content-type':'text/html'}})});assert.equal((await readAllowanceObservations(db))[0].state,'SOURCE_CHANGED_REVIEW_REQUIRED');assert.equal((await readJapanNumericUpdate(db,c)).values.perfumeOunces,3);db.raw.close();
});
