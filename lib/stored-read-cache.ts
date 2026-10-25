/** Bounded browser read cache: coalesce requests, expire fulfilled values and retain last-good by the same key. */
export function createStoredReadCache<T>(load:(key:string)=>Promise<T>,now:()=>number=Date.now,ttl=300_000,capacity=24){
 const entries=new Map<string,{value?:T;pending?:Promise<{value:T;failed:boolean}>;expires:number;failed:boolean}>();
 const read=(key:string):Promise<{value:T;failed:boolean}>=>{
  let entry=entries.get(key);
  if(entry?.pending)return entry.pending;
  if(entry&&entry.expires>now()){if(entry.value!==undefined)return Promise.resolve({value:entry.value,failed:entry.failed});return Promise.reject(Error('STORED_READ_COOLDOWN'));}
  if(!entry){
   while(entries.size>=capacity){const oldest=[...entries].find(([,value])=>!value.pending)?.[0];if(!oldest)return Promise.reject(Error('STORED_READ_BUSY'));entries.delete(oldest);}
   entry={expires:0,failed:false};entries.set(key,entry);
  }
  const target=entry;
  const pending=load(key).then(value=>{target.value=value;target.failed=false;target.expires=now()+ttl;return {value,failed:false};},()=>{target.failed=true;target.expires=now()+60_000;if(target.value!==undefined)return {value:target.value,failed:true};throw Error('STORED_READ_UNAVAILABLE');}).finally(()=>{target.pending=undefined;});
  target.pending=pending;
  // Keep pending reads and evict the oldest idle keys, without unbounded month retention.
  while(entries.size>capacity){const oldest=[...entries].find(([old,value])=>old!==key&&!value.pending)?.[0];if(!oldest)break;entries.delete(oldest);}
  return pending;
 };
 return {read,size:()=>entries.size};
}
