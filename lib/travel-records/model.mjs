export const LIMITS = Object.freeze({records:300, sourcePhoto:5*1024**2, photo:2*1024**2, totalPhotos:16*1024**2, backup:32*1024**2, pixels:20_000_000, edge:1600});
export class TravelError extends Error { constructor(code,message){super(message);this.name='TravelError';this.code=code;} }
export function fail(code,message){throw new TravelError(code,message);}
export function exactKeys(value,keys,label){
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).length!==keys.length || Object.keys(value).some(k=>!keys.includes(k))) fail('FORMAT',`${label} 형식을 확인해 주세요.`);
}
export function cleanText(value,max,label){
  if(typeof value!=='string' || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u202a-\u202e\u2066-\u2069]/u.test(value)) fail('TEXT',`${label}에 사용할 수 없는 문자가 있어요.`);
  const text=value.normalize('NFC').trim().replace(/\s+/gu,' ');
  if(!text || [...text].length>max) fail('TEXT',`${label}은 1–${max}자로 입력해 주세요.`);
  return text;
}
export function dateValue(value){
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value<'1900-01-01' || value>'2199-12-31') fail('DATE','여행 날짜는 1900–2199년의 실제 날짜로 입력해 주세요.');
  const d=new Date(value+'T00:00:00Z');
  if(!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10)!==value) fail('DATE','실제 달력에 있는 날짜로 입력해 주세요.');
  return value;
}
export function fields(input){return {date:dateValue(input.date),from:cleanText(input.from,60,'출발 공항'),to:cleanText(input.to,60,'도착 공항'),memo:cleanText(input.memo,80,'한 줄 메모')};}
export function isUUID(s){return typeof s==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);}
export function isoValue(s){if(typeof s!=='string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString()!==s) fail('FORMAT','백업의 시간 형식이 올바르지 않아요.');return s;}
export async function sha256(data){const bytes= data instanceof Blob ? await data.arrayBuffer() : typeof data==='string' ? new TextEncoder().encode(data) : data;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
export async function fingerprint(r){return sha256(JSON.stringify([r.date,r.from.toLocaleLowerCase('en'),r.to.toLocaleLowerCase('en'),r.memo,r.photo?.sha256||'']));}
export async function makeRecord(input,photo=null,previous=null){
  const now=new Date().toISOString(),createdAt=previous?.createdAt||now;
  const r={...fields(input),id:previous?.id||crypto.randomUUID(),photo,createdAt,updatedAt:new Date(Math.max(Date.now(),Date.parse(previous?.updatedAt||createdAt))).toISOString(),revision:typeof previous?.revision==='string'?crypto.randomUUID():(previous?.revision||0)+1};
  r.fingerprint=await fingerprint(r);return r;
}
export function mergePlan(existing,incoming){
  const ids=new Set(existing.map(r=>r.id)),prints=new Set(existing.map(r=>r.fingerprint));const add=[];let sameId=0,duplicates=0;
  for(const r of incoming){if(ids.has(r.id)){sameId++;continue;}if(prints.has(r.fingerprint)){duplicates++;continue;}ids.add(r.id);prints.add(r.fingerprint);add.push(r);}
  if(existing.length+add.length>LIMITS.records) fail('LIMIT',`이 기기에는 최대 ${LIMITS.records}개 기록을 보관할 수 있어요.`);
  if([...existing,...add].reduce((n,r)=>n+(r.photo?.blob.size||0),0)>LIMITS.totalPhotos) fail('LIMIT','사진 합계는 16MB까지 보관할 수 있어요.');
  return {add,sameId,duplicates};
}
export function errorText(e){if(e?.name==='QuotaExceededError')return '기기 저장 공간이 부족해요. 입력은 유지됩니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.';if(e?.name==='AbortError')return '작업을 취소했어요. 기존 기록은 그대로예요.';if(e?.name==='ConstraintError')return '같은 내용의 기록이 이미 있어요. 기존 기록을 열어 주세요.';return e instanceof TravelError?e.message:'기기 저장 또는 파일 처리를 완료하지 못했어요. 기존 기록은 그대로이며, 다시 시도할 수 있어요.';}
