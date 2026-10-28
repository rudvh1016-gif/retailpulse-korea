import {readApprovedNoticeChecks,projectApprovedNoticeChecks} from '../../../../lib/approved-notice-runtime';
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
  const event={id,country,scope,name,kind,start,end,status,sourceURL,verifiedAt,notes,...('makeupWorkdays' in row?{makeupWorkdays:row.makeupWorkdays}:{}),...('dateKind' in row?{dateKind:row.dateKind}:{}),region:'region' in row?row.region:undefined} as CalendarEvent;
  const old=merged.get(key(event));merged.set(key(event),{...event,id:old?.id??id});
 }
 return [...merged.values()];
}
const manualCalendarReview={checkedOn:reviewed.checkedOn,automaticCollectionEnabled:false,coverage:reviewed.coverage};
function withCoverage(projected:ReturnType<typeof projectOfficialCalendars>){
 // Only explicitly complete national annual arrangements support a negative claim.
 // Sparse reviewed events (or a source error) never prove a date is a nonholiday.
 const manual=reviewed.coverage.filter(c=>c.scope==='national_adjusted_rest_intervals'&&c.completeFor).flatMap(c=>c.years.map(year=>({country:c.country,year,scope:'national',verifiedAt:reviewed.checkedOn})));
 const automatic=projected.calendarReplacementScopes.filter(c=>c.scope==='national'&&projected.sources.some(s=>s.country===c.country&&s.status==='VERIFIED')).map(c=>({...c,verifiedAt:projected.sources.find(s=>s.country===c.country)!.lastVerifiedAt!.slice(0,10)}));
 return {...projected,calendarCoverage:[...manual,...automatic]};
}
export async function officialCalendarResponse(db:Pick<D1Database,'prepare'>|null,now=new Date()){
 let sourceChecks=projectApprovedNoticeChecks([],false);
 if(db){try{sourceChecks=projectApprovedNoticeChecks(await readApprovedNoticeChecks(db));}catch{/* Notice metadata failure must not suppress last-good calendars. */}}
 try{return Response.json({...withCoverage(projectOfficialCalendars(db?await readOfficialCalendars(db):[],seedEvents(),now)),manualCalendarReview,sourceChecks},{headers:{'x-robots-tag':CONTENT_API_ROBOTS_TAG,'cache-control':'public, max-age=300','x-content-type-options':'nosniff'}});}
 catch{return Response.json({...withCoverage(projectOfficialCalendars([],seedEvents(),now)),status:'UNAVAILABLE',manualCalendarReview,sourceChecks},{headers:{'x-robots-tag':CONTENT_API_ROBOTS_TAG,'cache-control':'no-store'}});}
}
/** No provider calls or writes in visitor requests. */
export async function GET(){try{return officialCalendarResponse((await getDb()).$client);}catch{return officialCalendarResponse(null);}}
