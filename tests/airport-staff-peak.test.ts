import test from 'node:test';
import assert from 'node:assert/strict';
import {staffDeparturePeak} from '../lib/airport-staff-peak';
const flight=(hour:number,building='T1')=>({scheduledAt:`2026-10-20T${String(hour).padStart(2,'0')}:15:00+09:00`,building});
test('staff summary reports scheduled-flight peak with terminal and tie truth',()=>{
 const result=staffDeparturePeak('2026-10-20',[flight(7),flight(7),flight(7,'T2'),flight(18,'T2')]);
 assert.equal(result?.hour,7);assert.equal(result?.flights,3);assert.deepEqual(result?.leaders,[{building:'T1',count:2}]);assert.equal(result?.tiedHours,1);
 const tie=staffDeparturePeak('2026-10-20',[flight(7),flight(7,'T2'),flight(18),flight(18)]);
 assert.equal(tie?.tiedHours,2);assert.equal(tie?.leaders.length,2);
});
test('unknown buildings and absent data never invent a terminal or zero peak',()=>{
 assert.equal(staffDeparturePeak('2026-10-20',null),null);assert.equal(staffDeparturePeak('2026-10-20',[]),null);
 assert.equal(staffDeparturePeak('2026-10-21',[flight(7)]),null);
 assert.deepEqual(staffDeparturePeak('2026-10-20',[flight(7),flight(7,'UNKNOWN')])?.leaders,[]);
});
