import {getDb} from '../../../../../db';
import {dutyFreeHistoryRange} from '../../../../../lib/duty-free-dated-history';
import {readDutyFreeDatedHistory} from '../../../../../lib/duty-free-dated-history-store';
import {nextKstExchangeMidnight} from '../../../../../lib/duty-free-exchange';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const now=new Date(),params=new URL(request.url).searchParams,input={start:params.get('start'),end:params.get('end')};
 try{dutyFreeHistoryRange(input,now);}catch{return Response.json({error:'INVALID_RANGE'},{status:400,headers:{'cache-control':'no-store'}});}
 try{const db=await getDb(),data=await readDutyFreeDatedHistory(db.$client,input,now);const ttl=Math.max(0,Math.min(300,Math.floor((nextKstExchangeMidnight(now.getTime())-now.getTime())/1000)));
  return Response.json(data,{headers:{'cache-control':ttl?`public, max-age=${Math.min(60,ttl)}, s-maxage=${ttl}`:'no-store'}});
 }catch{return Response.json({error:'STORAGE_UNAVAILABLE'},{status:503,headers:{'cache-control':'no-store'}});}
}
