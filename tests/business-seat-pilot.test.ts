import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {buildBusinessSeatPilot, physicalPilotKey, type PilotFlight, type PilotLayout, type PilotAssignment} from '../lib/business-seat-pilot';

// Entirely synthetic edge cases; never counted as actual pilot evidence.
const at = '2026-10-22T05:00:00Z';
const source = {url:'https://www.koreanair.com/fixture', checkedAt:at, publishedAt:'2026-10-22'};
const flight: PilotFlight = {direction:'departure',serviceDate:'2026-10-22',scheduledTime:'11:05',operatingFlight:'KE917',marketingFlight:'KE917',operator:'KE',destination:'ZRH',destinationCity:'Zurich',terminal:'T2',gate:'231',aircraftSubtype:'B787-10',aircraftRegNo:'HL-FIXTURE',status:'scheduled',evidenceKind:'DATED_FLIGHT_RECORD',source};
const layout: PilotLayout = {id:'test-325',operator:'KE',aircraftSubtype:'B787-10',totalSeats:325,businessSeats:36,firstSeats:0,premiumEconomySeats:0,confidence:'OFFICIAL_CONFIGURATION',source};
const assignment: PilotAssignment = {scope:'DATED_FLIGHT_CONFIGURATION',physicalKey:physicalPilotKey(flight),flightSourceCheckedAt:at,aircraftRegNo:flight.aircraftRegNo,layoutId:layout.id,validFrom:'2026-10-22',validThrough:'2026-10-22',source};

test('model alone and tail alone never become a verified configuration, even with one catalog entry', () => {
  for (const row of [flight,{...flight,aircraftRegNo:null}]) {
    const result = buildBusinessSeatPilot([row],[layout],[],at);
    assert.equal(result.rows[0].businessSeatsVerified,null);
    assert.equal(result.summary.verifiedBusinessSeatSubtotal,null);
    assert.equal(result.summary.completeCapacityCoverage,false);
    assert.deepEqual(result.rows[0].catalogueCandidateRange,{min:36,max:36});
  }
});
test('explicit dated config deduplicates marketing flight and keeps missing observations out of subtotal', () => {
  const unknown = {...flight,operatingFlight:'KE999',marketingFlight:'KE999',aircraftSubtype:null};
  const result = buildBusinessSeatPilot([flight,{...flight,marketingFlight:'DL9917'},unknown],[layout],[assignment],at);
  assert.equal(result.summary.physicalFlights,2); assert.equal(result.summary.duplicateMarketingRows,1);
  assert.equal(result.summary.verifiedPhysicalFlights,1); assert.equal(result.summary.verifiedBusinessSeatSubtotal,36);
  assert.equal(result.summary.unknownConfigurationFlights,1); assert.equal(result.summary.completeCapacityCoverage,false);
});
test('schedule, expired, conflicting, cancelled and unmatched assignment evidence cannot become verified supply', () => {
  const cases: [PilotFlight[], PilotAssignment[]][] = [
    [[{...flight,evidenceKind:'PUBLISHED_SCHEDULE'}],[{...assignment,scope:'PUBLISHED_SCHEDULE'}]],
    [[flight],[{...assignment,validFrom:'2026-10-21',validThrough:'2026-10-21'}]],
    [[{...flight,aircraftRegNo:'HL-SWAP'}],[assignment]],
    [[{...flight,source:{...source,checkedAt:'2026-10-22T04:59:00Z'}}],[assignment]],
    [[flight,{...flight,marketingFlight:'DL9917',aircraftRegNo:'HL-OTHER'}],[assignment]],
    [[{...flight,status:'cancelled'}],[assignment]],
    [[flight],[{...assignment,scope:'DATED_TAIL_CONFIGURATION',aircraftRegNo:'HL-OTHER'}]],
    [[flight],[assignment,{...assignment,layoutId:'other'}]],
  ];
  for(const [flights,assignments] of cases) assert.equal(buildBusinessSeatPilot(flights,[layout],assignments,at).summary.verifiedBusinessSeatSubtotal,null);
});
test('unknown cabin count prevents range; premium economy and first are not included as business', () => {
  const result=buildBusinessSeatPilot([flight],[{...layout,businessSeats:null,firstSeats:8,premiumEconomySeats:40,confidence:'CABIN_COUNT_UNCONFIRMED'}],[assignment],at);
  assert.equal(result.rows[0].catalogueCandidateRange,null); assert.equal(result.rows[0].businessSeatsVerified,null);
  assert.equal(result.rows[0].layoutId,layout.id); assert.equal(result.rows[0].confidence,'DATED_CONFIGURATION_COUNT_UNCONFIRMED');
  assert.ok(result.rows[0].missingFields.includes('businessSeatCount')); assert.ok(!result.rows[0].missingFields.includes('datedFlightConfiguration'));
});
test('saved real-source dataset is only three published schedule rows, not the target actual pilot', () => {
  const input=JSON.parse(readFileSync('data/business-seat-pilot/official-schedule-input.json','utf8'));
  const result=buildBusinessSeatPilot(input.flights,input.layouts,input.assignments,input.asOf);
  assert.equal(result.summary.datedFlightRecords,0); assert.equal(result.summary.actualPilotTargetMet,false);
  assert.equal(result.summary.verifiedBusinessSeatSubtotal,null);
  assert.deepEqual(result.rows.map(r=>r.businessSeatsPublishedSchedule),[36,36,36]);
  assert.deepEqual(result.rows.map(r=>new Date(r.serviceDate+'T12:00:00Z').getUTCDay()),[2,4,6]);
  assert.deepEqual(result,JSON.parse(readFileSync('data/business-seat-pilot/readout.json','utf8')));
});

test('unrecognized runtime evidence, invalid dates and impossible counts fail closed',()=>{
  assert.throws(()=>buildBusinessSeatPilot([{...flight,serviceDate:'2026-02-30'}],[layout],[],at),/identity/);
  assert.throws(()=>buildBusinessSeatPilot([flight],[{...layout,businessSeats:999}],[],at),/counts/);
  assert.throws(()=>buildBusinessSeatPilot([flight],[{...layout,businessSeats:200,firstSeats:200}],[],at),/counts/);
  assert.throws(()=>buildBusinessSeatPilot([flight],[layout],[{...assignment,scope:'MODEL_ONLY' as PilotAssignment['scope']}],at),/scope/);
});

test('three airport codes do not count as three cities',()=>{
  const rows=Array.from({length:30},(_,i)=>({...flight,operatingFlight:`KE${100+i}`,marketingFlight:`KE${100+i}`,serviceDate:`2026-10-${20+i%3}`,destination:['NRT','HND','SIN'][i%3],destinationCity:['Tokyo','Tokyo','Singapore'][i%3]}));
  const result=buildBusinessSeatPilot(rows,[layout],[],at);
  assert.equal(result.summary.datedFlightRecords,30); assert.equal(result.summary.serviceDates.length,3);
  assert.deepEqual(result.summary.cities,['Singapore','Tokyo']); assert.equal(result.summary.actualPilotTargetMet,false);
});


test('actual pilot denominator excludes cancelled, invalid-source, future and conflicting observations',()=>{
 const rows=Array.from({length:30},(_,i)=>({...flight,operatingFlight:`KE${100+i}`,marketingFlight:`KE${100+i}`,serviceDate:`2026-10-${20+i%3}`,destination:['NRT','HKG','SIN'][i%3],destinationCity:['Tokyo','Hong Kong','Singapore'][i%3]}));
 const valid=buildBusinessSeatPilot(rows,[layout],[],at);
 assert.equal(valid.summary.actualPilotTargetMet,true);assert.equal(valid.summary.datedFlightRecords,30);
 assert.equal(valid.summary.completeCapacityCoverage,false);assert.equal(valid.summary.verifiedBusinessSeatSubtotal,null);
 const transforms: ((row:PilotFlight)=>PilotFlight)[]=[
  row=>({...row,status:'cancelled'}),
  row=>({...row,source:{...source,url:'http://www.koreanair.com/fixture'}}),
  row=>({...row,source:{...source,checkedAt:'2026-10-23T05:00:00Z'}}),
  row=>({...row,source:{...source,checkedAt:'invalid'}}),
  row=>({...row,source:{...source,publishedAt:'2026-10-23'}}),
  row=>({...row,serviceDate:'2026-10-23'}),
  row=>({...row,evidenceKind:'PUBLISHED_SCHEDULE'}),
 ];
 const invalidSets=transforms.map(transform=>rows.map(transform));
 invalidSets.push(rows.flatMap(row=>[row,{...row,marketingFlight:'DL9917',aircraftRegNo:'HL-CONFLICT'}]));
 for(const invalid of invalidSets) {
  const result=buildBusinessSeatPilot(invalid,[layout],[],at);
  assert.equal(result.summary.actualPilotTargetMet,false);assert.equal(result.summary.datedFlightRecords,0);
  assert.deepEqual(result.summary.serviceDates,[]);assert.deepEqual(result.summary.cities,[]);
  assert.equal(result.summary.unknownConfigurationFlights,0);assert.equal(result.summary.completeCapacityCoverage,false);
  assert.equal(result.summary.verifiedBusinessSeatSubtotal,null);assert.ok(result.rows.every(row=>!row.eligibleForActualPilot));
 }
 const mixed=buildBusinessSeatPilot([rows[0],...rows.slice(1).map(transforms[0])],[layout],[],at);
 assert.equal(mixed.summary.datedFlightRecords,1);assert.equal(mixed.summary.excludedDatedFlightRecords,29);
 assert.deepEqual(mixed.summary.serviceDates,['2026-10-20']);assert.deepEqual(mixed.summary.cities,['Tokyo']);
 assert.equal(mixed.summary.unknownConfigurationFlights,1);assert.equal(mixed.summary.actualPilotTargetMet,false);
});


test('observation eligibility uses explicit asOf and zoned source instants, never the system clock',()=>{
 const input=[{...flight,source:{...source,checkedAt:'2026-10-22T14:00:00+09:00'}}];
 assert.equal(buildBusinessSeatPilot(input,[layout],[],at).summary.datedFlightRecords,1);
 assert.equal(buildBusinessSeatPilot(input,[layout],[],'2026-10-22T04:59:59.999Z').summary.datedFlightRecords,0);
 assert.equal(buildBusinessSeatPilot([{...flight,source:{...source,checkedAt:'2026-10-22T05:00:00'}}],[layout],[],at).summary.datedFlightRecords,0);
 assert.throws(()=>buildBusinessSeatPilot([flight],[layout],[],'2026-10-22T05:00:00'),/pilot_input_bound/);
 const originalNow=Date.now;
 try {
  Date.now=()=>0;
  const earlyClock=buildBusinessSeatPilot(input,[layout],[],at);
  Date.now=()=>Date.parse('2099-01-01T00:00:00Z');
  assert.deepEqual(buildBusinessSeatPilot(input,[layout],[],at),earlyClock);
 } finally { Date.now=originalNow; }
 assert.doesNotMatch(readFileSync('lib/business-seat-pilot.ts','utf8'),/Date\.now|new Date\(\)/);
});
