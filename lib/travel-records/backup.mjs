import {LIMITS,exactKeys,fail,fields,isUUID,isoValue,fingerprint,mergePlan} from './model.mjs';
import {photoForBackup,photoFromBackup} from './photos.mjs';
export const FORMAT='koretail.travel.backup';
export async function exportBackup(rows){const records=[];for(const r of rows){const {id,date,from,to,memo,createdAt,updatedAt}=r;records.push({id,date,from,to,memo,createdAt,updatedAt,photo:await photoForBackup(r.photo)});}const result=new Blob([JSON.stringify({format:FORMAT,version:1,exportedAt:new Date().toISOString(),records},null,2)],{type:'application/json'});if(result.size>LIMITS.backup)fail('LIMIT','백업 파일 한도를 넘었어요.');return result;}
export async function parseBackup(file,signal){
  const cancelled=()=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');};cancelled();
  if(!file?.size || file.size>LIMITS.backup)fail('LIMIT','JSON 백업은 32MB 이하 파일만 불러올 수 있어요.');
  let value;try{const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());value=JSON.parse(text);}catch{fail('FORMAT','올바른 UTF-8 JSON 백업 파일이 아니에요.');}cancelled();
  exactKeys(value,['format','version','exportedAt','records'],'백업');if(value.format!==FORMAT||value.version!==1)fail('VERSION','지원하지 않는 백업 종류 또는 버전이에요.');isoValue(value.exportedAt);
  if(!Array.isArray(value.records)||value.records.length>LIMITS.records)fail('LIMIT','백업 기록은 최대 300개여야 해요.');
  const ids=new Set(),records=[];let photos=0;
  for(const item of value.records){
    cancelled();exactKeys(item,['id','date','from','to','memo','createdAt','updatedAt','photo'],'여행 기록');if(!isUUID(item.id)||ids.has(item.id))fail('FORMAT','백업 기록 ID가 올바르지 않거나 중복돼요.');ids.add(item.id);
    const clean=fields(item);if(Object.keys(clean).some(k=>clean[k]!==item[k]))fail('FORMAT','백업 기록의 문구 형식을 확인해 주세요.');
    const createdAt=isoValue(item.createdAt),updatedAt=isoValue(item.updatedAt);if(updatedAt<createdAt)fail('FORMAT','백업 기록 시간이 올바르지 않아요.');
    const photo=await photoFromBackup(item.photo);photos+=photo?.blob.size||0;if(photos>LIMITS.totalPhotos)fail('LIMIT','백업 사진 합계는 16MB까지예요.');
    const r={id:item.id,...clean,createdAt,updatedAt,photo,revision:1};r.fingerprint=await fingerprint(r);records.push(r);
  }cancelled();return records;
}
export async function previewImport(store,records){const plan=mergePlan(await store.list(),records);return {added:plan.add.length,sameId:plan.sameId,duplicates:plan.duplicates};}
