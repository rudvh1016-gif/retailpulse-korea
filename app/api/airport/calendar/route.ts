import {getDb} from '../../../../db';
import {projectOfficialCalendars,readOfficialCalendars} from '../../../../lib/official-calendar-runtime';
import type {CalendarEvent} from '../../../../lib/calendar-context.mjs';
import calendar from '../../../../data/airport-focus-preview/calendar-context.json';
export const dynamic='force-dynamic';
function seedEvents():CalendarEvent[]{return calendar.events.map(event=>({...event,region:event.region??undefined})) as CalendarEvent[];}
export async function officialCalendarResponse(db:Pick<D1Database,'prepare'>|null,now=new Date()){
 try{return Response.json(projectOfficialCalendars(db?await readOfficialCalendars(db):[],seedEvents(),now),{headers:{'cache-control':'public, max-age=300','x-content-type-options':'nosniff'}});}
 catch{return Response.json({...projectOfficialCalendars([],seedEvents(),now),status:'UNAVAILABLE'},{headers:{'cache-control':'no-store'}});}
}
/** No provider calls or writes in visitor requests. */
export async function GET(){try{return officialCalendarResponse((await getDb()).$client);}catch{return officialCalendarResponse(null);}}
