import {getDb} from '../../../../db';
import {missingAirportMetarSnapshot,readAirportMetarSnapshot} from '../../../../lib/airport-metar-store';
export const dynamic='force-dynamic';
export async function airportWeatherResponse(db:Pick<D1Database,'prepare'>|null,now=new Date()){
  let snapshot;
  try{snapshot=db?await readAirportMetarSnapshot(db,now):missingAirportMetarSnapshot(now);}
  catch{snapshot=missingAirportMetarSnapshot(now);}
  return Response.json(snapshot,{headers:{'cache-control':snapshot.cacheControl,'x-content-type-options':'nosniff'}});
}
/** Only stored RKSI observations, no key, provider request, migration or write. */
export async function GET(){
  let client:Pick<D1Database,'prepare'>|null=null;
  try{client=(await getDb()).$client;}catch{ /* An unprepared source stays unavailable. */ }
  return airportWeatherResponse(client);
}
