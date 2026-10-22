import {storeJapanNumericUpdate,type JapanValues} from '../lib/customs-allowance-numeric';
import {arrivalVerifiedDate} from '../lib/arrival-review-date';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {validateManifest,validatePreviewDataset,allowanceSemanticHash,checkSource} from '../lib/customs-allowance-check.mjs';
import {readAllowanceObservations,storeAllowanceObservation,type AllowanceObservation} from '../lib/customs-allowance-runtime';
import {CloudflareD1RestDatabase} from '../lib/d1-rest';
import {resolveProductionDatabaseConfig} from './production-database';
type Store=Pick<D1Database,'prepare'|'batch'>;
/** Once per existing daily job. Per-source persisted due time also guards manual repeats. */
export async function collectAllowanceObservations(db:Store,{activation=false,now=()=>new Date(),fetchImpl=fetch,manifest:givenManifest,dataset:givenDataset}:{activation?:boolean;now?:()=>Date;fetchImpl?:typeof fetch;manifest?:unknown;dataset?:unknown}={}){
 if(!activation)return {state:'DORMANT',requests:0,writes:0,checked:0,skipped:0};
 const manifest=validateManifest(givenManifest??JSON.parse(await readFile(new URL('../config/customs-allowance-sources.json',import.meta.url),'utf8')));
 const dataset=givenDataset??JSON.parse(await readFile(new URL('../data/airport-focus-preview/arrival-allowances.json',import.meta.url),'utf8'));
 const errors=validatePreviewDataset(dataset,manifest);if(errors.length)throw Error('CUSTOMS_ALLOWANCE_DATASET_INVALID');
 const countries=(dataset as {countries:Array<{id:string;checkedAt?:string;verifiedAt?:string}>}).countries;
 const previous=await readAllowanceObservations(db),budget={requests:0};let writes=0,checked=0,skipped=0,numericCanonicalRowsWritten=0;const states:string[]=[];
 const selected=manifest.sources.filter((source:{monitoringRole?:string})=>source.monitoringRole==='priority_candidate');
 if(selected.length>24)throw Error('CUSTOMS_ALLOWANCE_SOURCE_LIMIT');
 for(const source of selected){
  const old=previous.find(row=>row.source_id===source.id)??null;
  // A changed reviewed baseline/dataset is checked promptly; otherwise never before the due time.
  const country=countries.find(country=>country.id===source.jurisdiction)!;
  const semanticHash=allowanceSemanticHash(country),at=now();
  if(old&&old.source_url===source.url&&old.last_good_hash===semanticHash&&Date.parse(old.next_check_at)>at.getTime()){skipped++;continue;}
  const observation=await checkSource(source,manifest,{fetchImpl,now:()=>at,budget,lastGood:{semanticHash,verifiedAt:arrivalVerifiedDate(country)}}) as AllowanceObservation & {numericCandidate?:{templateSha256:string;values:JapanValues}|null};
  if(source.id==='JP-01'&&observation.numericCandidate&&observation.sourceSha256&&source.baseline?.datasetSemanticHash===semanticHash){
   numericCanonicalRowsWritten+=await storeJapanNumericUpdate(db,observation.numericCandidate,source,observation.sourceSha256,observation.checkedAt,semanticHash);
   observation.state='NUMERIC_TEMPLATE_VERIFIED';
  }
  const interval=Math.max(24,manifest.policy.minIntervalHours,source.accessReview?.minIntervalHours??24);
  const next=new Date(at.getTime()+interval*3600000).toISOString();
  writes+=await storeAllowanceObservation(db,observation,next,old);checked++;states.push(observation.state);
 }
 return {state:states.some(state=>!['UNCHANGED_SOURCE','NUMERIC_TEMPLATE_VERIFIED'].includes(state))?'REVIEW_REQUIRED':checked?'CHECKED':'NOT_DUE',requests:budget.requests,writes,checked,skipped,numericCanonicalRowsWritten};
}
async function main(){
 if(process.env.RPK_CUSTOMS_ALLOWANCE_CHECK_ENABLED!=='true'){console.log(JSON.stringify({source:'CUSTOMS_ALLOWANCES',state:'DORMANT',requests:0,writes:0}));return;}
 if(process.env.ENABLE_PRODUCTION_COLLECTOR!=='true')throw Error('production_collector_not_enabled');
 if(!process.env.CLOUDFLARE_D1_WRITE_TOKEN?.trim())throw Error('missing_dedicated_d1_write_token');
 const {accountId,databaseId,apiToken}=resolveProductionDatabaseConfig('production'),db=new CloudflareD1RestDatabase(accountId,databaseId,apiToken);
 try{console.log(JSON.stringify({source:'CUSTOMS_ALLOWANCES',...await collectAllowanceObservations(db as unknown as Store,{activation:true})}));}
 finally{console.log(JSON.stringify({source:'CUSTOMS_ALLOWANCES',d1Usage:db.usageSnapshot()}));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error(JSON.stringify({source:'CUSTOMS_ALLOWANCES',state:'FAILED',reason:'CHECK_FAILED_LAST_GOOD_PRESERVED'}));process.exitCode=1;});
