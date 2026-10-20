import {CONTENT_API_ROBOTS_TAG} from '../../../../lib/crawl-policy';
import {readJapanNumericUpdate} from '../../../../lib/customs-allowance-numeric';
import snapshot from '../../../../data/airport-focus-preview/arrival-allowances.json';
import {getDb} from '../../../../db';
import {readAllowanceObservations,allowanceStatusProjection} from '../../../../lib/customs-allowance-runtime';
export const dynamic='force-dynamic';
export async function allowanceStatusResponse(db:Pick<D1Database,'prepare'>|null,now=new Date()){
 try{return Response.json({...allowanceStatusProjection(db?await readAllowanceObservations(db):[],now),japan:db?await readJapanNumericUpdate(db,snapshot.countries.find(country=>country.id==='JP')!):null},{headers:{'x-robots-tag':CONTENT_API_ROBOTS_TAG,'cache-control':'public, max-age=300','x-content-type-options':'nosniff'}});}
 catch{return Response.json({status:'UNAVAILABLE',cadenceHours:24,automaticLegalInterpretation:false,countries:[]},{headers:{'x-robots-tag':CONTENT_API_ROBOTS_TAG,'cache-control':'no-store'}});}
}
/** Bounded stored read only; no legal scraping or DB writes in visitor requests. */
export async function GET(){try{return allowanceStatusResponse((await getDb()).$client);}catch{return allowanceStatusResponse(null);}}
