import {getDb} from '../../../../db';
import {projectOfficialCalendars,readOfficialCalendars} from '../../../../lib/official-calendar-runtime';
import type {CalendarEvent} from '../../../../lib/calendar-context.mjs';
import calendar from '../../../../data/airport-focus-preview/calendar-context.json';
import reviewed from '../../../../data/official-calendar/priority-country-multiyear.json';
import {CONTENT_API_ROBOTS_TAG} from '../../../../lib/crawl-policy';
export const dynamic='force-dynamic';
function seedEvents():CalendarEvent[]{
 const seed=calendar.events.map(event=>({...event,region:event.region??undefined})) as CalendarEvent[];
 const key=(event:CalendarEvent)=>[event.country,event.kind,event.scope,event.region??'',event.start,event.end].join('|');
 const merged=new Map(seed.map(event=>[key(event),event]));
 for(const row of reviewed.events){
  // Evidence tables stay server-only. The existing API receives only display facts.
  const {id,country,scope,name,kind,start,end,status,sourceURL,verifiedAt,notes}=row;
  const event={id,country,scope,name,kind,start,end,status,sourceURL,verifiedAt,notes,region:'region' in row?row.region:undefined} as CalendarEvent;
  const old=merged.get(key(event));merged.set(key(event),{...event,id:old?.id??id});
 }
 return [...merged.values()];
}
const manualCalendarReview={checkedOn:reviewed.checkedOn,automaticCollectionEnabled:false,coverage:reviewed.coverage};
export async function officialCalendarResponse(db:Pick<D1Database,'prepare'>|null,now=new Date()){
 try{return Response.json({...projectOfficialCalendars(db?await readOfficialCalendars(db):[],seedEvents(),now),manualCalendarReview},{headers:{'x-robots-tag':CONTENT_API_ROBOTS_TAG,'cache-control':'public, max-age=300','x-content-type-options':'nosniff'}});}
 catch{return Response.json({...projectOfficialCalendars([],seedEvents(),now),status:'UNAVAILABLE',manualCalendarReview},{headers:{'x-robots-tag':CONTENT_API_ROBOTS_TAG,'cache-control':'no-store'}});}
}
/** No provider calls or writes in visitor requests. */
export async function GET(){try{return officialCalendarResponse((await getDb()).$client);}catch{return officialCalendarResponse(null);}}
