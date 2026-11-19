import type {A1TodayFetchResult} from './airport-today';
import {dailyFlightProfile} from './airport-day-profile';
import {AIRPORT_SIDES_VERSION} from './airport-sides';
import {isValidKstDay,kstDayOf} from './kst';

const MAX_CURRENT_FLIGHTS=1200;
const MAX_CURRENT_BYTES=500_000;
const KST_TIME=/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?\+09:00$/;
const statusValues=new Set(['scheduled','on_time','delayed','cancelled','unknown']);

/** Use only canonical records from the finished all-page A1 scan, not accumulated raw rows. */
export function prepareA1CurrentSnapshot(scan:Pick<A1TodayFetchResult,'targetDate'|'records'|'trackedToday'>){
 const day=scan.targetDate;
 if(!isValidKstDay(day)||!Number.isSafeInteger(scan.trackedToday)||scan.trackedToday<1||scan.trackedToday>MAX_CURRENT_FLIGHTS)return null;
 const sameDay=scan.records.filter(row=>row.scheduledAt.slice(0,10)===day);
 if(sameDay.length!==scan.trackedToday)return null;
 const retrievedAt=sameDay[0].retrievedAt;
 if(!Number.isFinite(Date.parse(retrievedAt))||kstDayOf(retrievedAt)!==day)return null;
 const ids=new Set<string>();
 for(const row of sameDay){
  if(row.sourceId!=='INCHEON_FLIGHT_DETAIL'||row.direction!=='departure'||row.retrievedAt!==retrievedAt
   ||!row.flightNumber||!/^[0-9a-f]{64}$/.test(row.physicalFlightId)||ids.has(row.physicalFlightId)
   ||!KST_TIME.test(row.scheduledAt)||!statusValues.has(row.status)
   ||(row.terminal!==null&&!['T1','T2','CONCOURSE'].includes(row.terminal)))return null;
  ids.add(row.physicalFlightId);
 }
 const flights=sameDay.map(({physicalFlightId,flightNumber,airlineCode,airportCode,direction,terminal,gate,checkinCounter,aircraftSubtype,aircraftRegNo,status,scheduledAt,retrievedAt})=>
  ({physicalFlightId,flightNumber,airlineCode,airportCode,direction,terminal,gate,checkinCounter,aircraftSubtype,aircraftRegNo,status,scheduledAt,retrievedAt}))
  .sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt)||a.physicalFlightId.localeCompare(b.physicalFlightId));
 const profile=dailyFlightProfile(flights,day,false);
 const snapshot={version:1 as const,day,retrievedAt,trackedToday:scan.trackedToday,profile,flights};
 return new TextEncoder().encode(JSON.stringify(snapshot)).byteLength<=MAX_CURRENT_BYTES?snapshot:null;
}

/** Compact evidence retained only in the existing successful collector row. */
export async function a1CardEvidence(scan:Pick<A1TodayFetchResult,'targetDate'|'records'|'trackedToday'>){
 const exact=prepareA1CurrentSnapshot(scan);
 if(!exact)return null;
 const {profile}=exact;
 const bytes=new TextEncoder().encode(JSON.stringify(exact.flights));
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 return `; glance-v1 ${profile.sidesVersion} ${profile.T1.total},${profile.CONCOURSE.total},${profile.T2.total},${profile.unknownBuilding},${profile.cancelled} ${digest}`;
}

export function readA1CardEvidence(detail:string,expected:number){
 const marker=/; glance-v1 ([a-z0-9.-]{1,70}) (\d{1,4}),(\d{1,4}),(\d{1,4}),(\d{1,4}),(\d{1,4}) [a-f0-9]{64}$/.exec(detail);
 if(detail.length>500||!marker||marker[1]!==AIRPORT_SIDES_VERSION)return null;
 const [T1,CONCOURSE,T2,unknown,cancelled]=marker.slice(2,7).map(Number),all=T1+CONCOURSE+T2+unknown;
 return all+cancelled===expected?{all,T1,CONCOURSE,T2}:null;
}
