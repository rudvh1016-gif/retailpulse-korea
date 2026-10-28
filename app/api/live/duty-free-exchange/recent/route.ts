import {getDb} from '../../../../../db';
import {readDutyFreeRecent} from '../../../../../lib/duty-free-recent-store';
import {nextKstExchangeMidnight} from '../../../../../lib/duty-free-exchange';
export const dynamic='force-dynamic';
export async function GET(){const now=new Date();try{const db=await getDb(),data=await readDutyFreeRecent(db.$client,now);const ttl=Math.max(0,Math.min(300,Math.floor((nextKstExchangeMidnight(now.getTime())-now.getTime())/1000)));return Response.json(data,{headers:{'cache-control':ttl?`public, max-age=${Math.min(60,ttl)}, s-maxage=${ttl}`:'no-store'}});}catch{return Response.json({error:'STORAGE_UNAVAILABLE'},{status:503,headers:{'cache-control':'no-store'}});}}
