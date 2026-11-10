/** Offline data gate. Never calls a provider, changes data, or assumes an empty
 * week proves no holidays. Review facts are independent of the generated seed. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isExactDate} from '../lib/calendar-context.mjs';

const contract=JSON.parse(readFileSync(new URL('../tests/fixtures/next-week-reviewed-coverage.json',import.meta.url),'utf8'));
const projectionKeys=['id','country','countryLabel','name','start','end','dateLabel_ko','type','isRepresentative','conditional','scope','sourceURL','region','reviewValidUntil'];
function index(data,label){
 assert.ok(Array.isArray(data?.events),`${label}_EVENTS_INVALID`);
 const rows=new Map();
 for(const event of data.events){
  assert.ok(typeof event.id==='string'&&event.id,`${label}_ID_INVALID`);
  assert.ok(!rows.has(event.id),`DUPLICATE_ID ${label} ${event.id}`);
  rows.set(event.id,event);
 }
 return rows;
}
export function checkNextWeekCalendar(source,summary){
 const full=index(source,'SOURCE'),projected=index(summary,'PROJECTION');
 assert.equal(contract.schemaVersion,1,'REVIEW_CONTRACT_INVALID');
 assert.ok(isExactDate(contract.reviewedAsOf)&&contract.windows.length>0,'REVIEW_CONTRACT_INVALID');
 for(const window of contract.windows){
  assert.ok(isExactDate(window.start)&&isExactDate(window.end)&&window.start<=window.end&&window.expected.length>0,'REVIEW_WINDOW_INVALID');
  for(const expected of window.expected){
   const original=full.get(expected.id),projection=projected.get(expected.id);
   assert.ok(original,`SOURCE_MISSING ${expected.id}`);
   assert.ok(projection,`PROJECTION_MISSING ${expected.id}`);
   const {reviewedOn,...facts}=expected;
   for(const [key,value] of Object.entries(facts)){
    assert.deepEqual(original[key],value,`REVIEWED_FACT_MISMATCH source ${expected.id}.${key}`);
    assert.deepEqual(projection[key],value,`REVIEWED_FACT_MISMATCH projection ${expected.id}.${key}`);
   }
   assert.equal(original.status,'OFFICIAL_DATE_CONFIRMED',`REVIEW_MISSING ${expected.id}`);
   assert.ok(isExactDate(original.checkedAt?.slice(0,10))&&isExactDate(projection.verifiedAt),`REVIEW_MISSING ${expected.id}`);
   assert.ok(original.checkedAt.slice(0,10)<=contract.reviewedAsOf&&projection.verifiedAt<=contract.reviewedAsOf,`REVIEW_NOT_AVAILABLE ${expected.id}`);
   assert.equal(original.checkedAt.slice(0,10),reviewedOn,`REVIEW_DATE_MISMATCH source ${expected.id}`);
   assert.equal(projection.verifiedAt,reviewedOn,`REVIEW_DATE_MISMATCH projection ${expected.id}`);
   assert.ok(!projection.reviewValidUntil||projection.reviewValidUntil>=contract.reviewedAsOf,`REVIEW_EXPIRED ${expected.id}`);
   assert.ok(expected.start<=window.end&&expected.end>=window.start,`REVIEW_WINDOW_MISMATCH ${expected.id}`);
  }
 }
 // Audit every source row, independently of the UI's two-country ranking cap.
 // Reviewed history may add summary-only entries; it must not replace a source ID.
 for(const [id,event] of full){
  const projection=projected.get(id);
  assert.ok(projection,`PROJECTION_MISSING ${id}`);
  for(const key of projectionKeys)assert.deepEqual(projection[key],event[key],`PROJECTION_DRIFT ${id}.${key}`);
  assert.equal(projection.verifiedAt,event.status==='OFFICIAL_DATE_CONFIRMED'?event.checkedAt?.slice(0,10):undefined,`PROJECTION_DRIFT ${id}.verifiedAt`);
  assert.equal(projection.calendarScope,event.calendarScope??(event.region?'regional':event.country==='US'?'institutional':'national'),`PROJECTION_DRIFT ${id}.calendarScope`);
 }
 return {status:'PASS',sourceRows:full.size,reviewedAsOf:contract.reviewedAsOf,
  reviewedWindows:contract.windows.map(({start,end,expected})=>({start,end,countries:expected.map(event=>event.country)})),
  annualCompleteness:'NOT_ESTABLISHED'};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{
  const root=resolve(process.argv[2]??'.');
  const read=name=>JSON.parse(readFileSync(resolve(root,`data/airport-focus-preview/${name}.json`),'utf8'));
  console.log(JSON.stringify(checkNextWeekCalendar(read('holidays'),read('holidays-summary'))));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
