import {getDb} from '../../../../db';
import {kstDayOf,isValidKstDay} from '../../../../lib/kst';
import {previousFlightMonth,readPassengerReferenceMonth} from '../../../../lib/passenger-reference-month';
export const dynamic='force-dynamic';
const TTL=1800_000;
// Isolate cache supplements the explicit Cloudflare cache. At most 12 prior
// months; no raw histories retained. One same-month in-flight read per isolate.
const memory=new Map<string,{at:number;body:string}>(),pending=new Map<string,Promise<string>>();
export async function GET(request:Request){
 const today=kstDayOf(new Date().toISOString()),month=new URL(request.url).searchParams.get('month')??previousFlightMonth(today.slice(0,7));
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!isValidKstDay(month+'-01')||month>=today.slice(0,7))return Response.json({status:'INVALID_SELECTION',month,data:null},{status:400});
 const headers={'content-type':'application/json','cache-control':'public, max-age=300, s-maxage=1800','x-robots-tag':'noindex'};
 const cached=memory.get(month);if(cached&&Date.now()-cached.at<TTL)return new Response(cached.body,{headers});
 const cache=typeof caches==='undefined'?undefined:(caches as CacheStorage & {default?:Cache}).default;
 const key=new Request(new URL(`/api/live/passenger-reference?month=${month}`,request.url));
 try{
  const hit=await cache?.match(key).catch(()=>undefined);
  // Cache API responses have immutable headers. The framework adds Vary and
  // security headers after this route returns, so give it a mutable copy.
  if(hit)return new Response(hit.body,{status:hit.status,statusText:hit.statusText,headers:hit.headers});
  let read=pending.get(month);
  if(!read){read=(async()=>{const data=await readPassengerReferenceMonth((await getDb()).$client,month);return JSON.stringify({status:'READY',month,data,checkedAt:new Date().toISOString()});})();pending.set(month,read);}
  const body=await read;memory.set(month,{at:Date.now(),body});if(memory.size>12)memory.delete(memory.keys().next().value!);
  const response=new Response(body,{headers});if(cache)await cache.put(key,response.clone()).catch(()=>{});return response;
 }catch{return Response.json({status:'UNAVAILABLE',month,data:null},{status:503,headers:{'cache-control':'no-store','x-robots-tag':'noindex'}});}
 finally{pending.delete(month);}
}
