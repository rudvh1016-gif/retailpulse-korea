import {getDb} from '../../../../db';
import {readAirportPassengerComparison} from '../../../../lib/airport-monthly-stats-read';
import {CONTENT_API_ROBOTS_TAG} from '../../../../lib/crawl-policy';
export const dynamic='force-dynamic';
export async function airportPassengerComparisonResponse(request:Request,read:(selected:string,baseline:string)=>ReturnType<typeof readAirportPassengerComparison>){
 const query=new URL(request.url).searchParams,selectedMonth=query.get('selected')??'',baselineMonth=query.get('baseline')??'';
 const headers={'x-robots-tag':CONTENT_API_ROBOTS_TAG,'cache-control':'no-store','x-content-type-options':'nosniff'};
 if(![selectedMonth,baselineMonth].every(month=>/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month)))return Response.json({status:'INVALID_SELECTION'},{status:400,headers});
 try{const result=await read(selectedMonth,baselineMonth);return Response.json({status:result.selected&&result.baseline?'READY':result.selected||result.baseline?'PARTIAL':'MISSING',...result},{headers});}
 catch{return Response.json({status:'UNAVAILABLE',selectedMonth,baselineMonth,selected:null,baseline:null,availableMonths:[]},{headers});}
}
/** Existing stored rows only. A visitor cannot trigger a collector/provider call. */
export async function GET(request:Request){return airportPassengerComparisonResponse(request,async(selected,baseline)=>readAirportPassengerComparison((await getDb()).$client,selected,baseline));}
