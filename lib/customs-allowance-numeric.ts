import {sha256} from './hash';
export type JapanValues={liquorBottles:number;liquorBottleMl:number;cigarettes:number;perfumeOunces:number};
type Store=Pick<D1Database,'prepare'|'batch'>;
type Row={jurisdiction:string;source_id:string;source_sha256:string;template_sha256:string;dataset_hash:string;values_json:string;updated_at:string;changed_at:string|null;previous_values_json:string|null};
export function validJapanValues(value:unknown):value is JapanValues{
 if(!value||typeof value!=='object')return false;const v=value as JapanValues;
 return Object.keys(v).sort().join(',')==='cigarettes,liquorBottleMl,liquorBottles,perfumeOunces'&&Number.isInteger(v.liquorBottles)&&v.liquorBottles>=1&&v.liquorBottles<=20&&Number.isInteger(v.liquorBottleMl)&&v.liquorBottleMl>=1&&v.liquorBottleMl<=5000&&Number.isInteger(v.cigarettes)&&v.cigarettes>=1&&v.cigarettes<=1000&&Number.isFinite(v.perfumeOunces)&&v.perfumeOunces>=0.1&&v.perfumeOunces<=20;
}
const serialize=(v:JapanValues)=>JSON.stringify({liquorBottles:v.liquorBottles,liquorBottleMl:v.liquorBottleMl,cigarettes:v.cigarettes,perfumeOunces:v.perfumeOunces});
export async function storeJapanNumericUpdate(db:Store,candidate:{templateSha256:string;values:JapanValues},source:{id:string;baseline:{numericTemplateSha256:string;numericValues:JapanValues}},sourceHash:string,checkedAt:string,datasetHash:string){
 if(source.id!=='JP-01'||candidate.templateSha256!==source.baseline.numericTemplateSha256||!validJapanValues(candidate.values)||!validJapanValues(source.baseline.numericValues)||!Number.isFinite(Date.parse(checkedAt))||!/^[a-f0-9]{64}$/.test(datasetHash)||!/^[a-f0-9]{64}$/.test(sourceHash))throw Error('CUSTOMS_NUMERIC_UNREVIEWED');
 const old=await db.prepare("SELECT * FROM customs_allowance_numeric_current WHERE jurisdiction='JP'").first<Row>();
 const json=serialize(candidate.values),previous=old?.values_json??serialize(source.baseline.numericValues);
 if(old&&(old.values_json===json&&old.dataset_hash===datasetHash||Date.parse(old.updated_at)>=Date.parse(checkedAt)))return 0;
 const changed=previous!==json,changedAt=changed?checkedAt:null;
 const values=[sourceHash,candidate.templateSha256,datasetHash,json,checkedAt,changedAt,changed?previous:null];
 const stmt=old?db.prepare("UPDATE customs_allowance_numeric_current SET source_sha256=?,template_sha256=?,dataset_hash=?,values_json=?,updated_at=?,changed_at=?,previous_values_json=? WHERE jurisdiction='JP' AND values_json=? AND updated_at=?").bind(...values,old.values_json,old.updated_at):db.prepare("INSERT INTO customs_allowance_numeric_current(jurisdiction,source_id,source_sha256,template_sha256,dataset_hash,values_json,updated_at,changed_at,previous_values_json) VALUES ('JP','JP-01',?,?,?,?,?,?,?) ON CONFLICT(jurisdiction) DO NOTHING").bind(...values);
 const result=(await db.batch([stmt]))[0];if(!result.success||!Number.isSafeInteger(result.meta?.changes))throw Error('CUSTOMS_NUMERIC_WRITE_UNMEASURED');return Number(result.meta!.changes);
}
export async function readJapanNumericUpdate(db:Pick<D1Database,'prepare'>,country:Record<string,unknown>){
 const row=await db.prepare("SELECT * FROM customs_allowance_numeric_current WHERE jurisdiction='JP'").first<Row>();if(!row)return null;
 const fields=['id','scope','conditions','results','guidance','procedures','notes','sources','effectiveDate','effectiveLabel'];
 const datasetHash=await sha256(Object.fromEntries(fields.filter(key=>Object.prototype.hasOwnProperty.call(country,key)).map(key=>[key,country[key]])));
 if(row.dataset_hash!==datasetHash)return null;
 try{const values:unknown=JSON.parse(row.values_json),previous:unknown=row.previous_values_json?JSON.parse(row.previous_values_json):null;
 if(!validJapanValues(values)||previous&&!validJapanValues(previous))return null;
 return {id:'JP',values,sourceUrl:'https://www.customs.go.jp/kaigairyoko/menzei.htm',updatedAt:row.updated_at,changedAt:row.changed_at,previous,effectiveDate:null};}catch{return null;}
}
