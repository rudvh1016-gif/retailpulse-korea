import {LIMITS,fail,mergePlan} from './model.mjs';
// One device-local store shared by all locales. Production has no lab/seed mode.
export function databaseName(){return 'koretail-travel-local-v1';}
export async function openStore(name=databaseName()){
  if(!globalThis.indexedDB)fail('STORAGE','이 브라우저에서는 기기 저장을 사용할 수 없어요.');
  const db=await new Promise((resolve,reject)=>{const req=indexedDB.open(name,1);req.onupgradeneeded=()=>{const s=req.result.createObjectStore('records',{keyPath:'id'});s.createIndex('fingerprint','fingerprint',{unique:true});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('Storage blocked'));});
  db.onversionchange=()=>db.close();
  function transaction(mode,work,signal){return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException('Cancelled','AbortError'));return;}
    let tx,result,problem;try{tx=db.transaction('records',mode);}catch(e){reject(e);return;}
    const abort=()=>{try{tx.abort();}catch{}};signal?.addEventListener('abort',abort,{once:true});
    tx.oncomplete=()=>{signal?.removeEventListener('abort',abort);resolve(result);};tx.onabort=()=>{signal?.removeEventListener('abort',abort);reject(problem||tx.error||new DOMException('Cancelled','AbortError'));};tx.onerror=()=>{};
    const stop=e=>{problem=e;abort();};
    try{work(tx.objectStore('records'),r=>{result=r;},stop);}catch(e){stop(e);}
  });}
  const list=()=>transaction('readonly',(s,done)=>{const q=s.getAll();q.onsuccess=()=>done(q.result.sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)));});
  const get=id=>transaction('readonly',(s,done)=>{const q=s.get(id);q.onsuccess=()=>done(q.result||null);});
  const save=(r,expectedRevision=null)=>transaction('readwrite',(s,done,stop)=>{
    const q=s.getAll();q.onsuccess=()=>{try{
      const rows=q.result,old=rows.find(x=>x.id===r.id);
      if(expectedRevision===null&&old)fail('CONFLICT','같은 기록이 이미 있어요.');
      if(expectedRevision!==null&&(!old||old.revision!==expectedRevision))fail('CONFLICT','다른 창에서 이 기록이 바뀌었어요. 입력을 복사해 두고 기록을 다시 열어 주세요.');
      if(rows.some(x=>x.id!==r.id&&x.fingerprint===r.fingerprint))fail('DUPLICATE','같은 내용의 기록이 이미 있어요.');
      if(!old&&rows.length>=LIMITS.records)fail('LIMIT','기록은 최대 300개까지 보관할 수 있어요.');
      if(rows.reduce((n,x)=>n+(x.id===r.id?0:x.photo?.blob.size||0),r.photo?.blob.size||0)>LIMITS.totalPhotos)fail('LIMIT','사진 합계는 16MB까지 보관할 수 있어요.');
      const write=old?s.put(r):s.add(r);write.onsuccess=()=>done(r);
    }catch(e){stop(e);}};
  });
  // Backup v1 does not carry revisions. A fresh token prevents a pre-deletion
  // editor from matching a restored record whose parsed revision is 1 again.
  const importRecords=(records,signal)=>transaction('readwrite',(s,done,stop)=>{const q=s.getAll();q.onsuccess=()=>{try{const plan=mergePlan(q.result,records);for(const r of plan.add)s.add({...r,revision:crypto.randomUUID()});done({added:plan.add.length,sameId:plan.sameId,duplicates:plan.duplicates});}catch(e){stop(e);}};},signal);
  const remove=(id,expectedRevision)=>transaction('readwrite',(s,done,stop)=>{
    const q=s.get(id);q.onsuccess=()=>{try{
      const old=q.result;
      if(!old||old.revision!==expectedRevision)fail('CONFLICT','다른 창에서 이 기록이 바뀌었어요. 기록을 다시 열어 주세요.');
      const write=s.delete(id);write.onsuccess=()=>done(old);
    }catch(e){stop(e);}};
  });
  return {name,list,get,save,remove,importRecords,close:()=>db.close()};
}
