import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAirportFlight } from '../lib/source-adapters';
import { boardingAreaOf, unverifiedReasonOf } from '../lib/airport-sides';
import { readDepartureSchedule } from '../lib/departure-schedule';
const raw={flightId:'OZ101',scheduleDateTime:'202610040815',airportCode:'NRT'};
const at='2026-10-03T00:24:12Z';
test('official A1 P02 survives normalization without an assigned gate',async()=>{
  for(const field of ['terminalId','terminalid','terminal','terminalNo']){
    const r=await normalizeAirportFlight({...raw,[field]:' P02 '},'departure',at);
    assert.equal(r.terminal,'CONCOURSE');assert.equal(r.gate,null);assert.equal(boardingAreaOf(r),'CONCOURSE');assert.equal(unverifiedReasonOf('CONCOURSE',r.gate),'NO_GATE');
  }
});
test('terminal normalization retains physical identity and never infers unknown or cargo codes',async()=>{
  const known=await normalizeAirportFlight({...raw,terminalid:'P02'},'departure',at);
  for(const code of [undefined,'','P99','C01','C02','C03']){
    const r=await normalizeAirportFlight({...raw,terminalid:code},'departure',at);
    assert.equal(r.terminal,null);assert.equal(r.physicalFlightId,known.physicalFlightId);
  }
});
test('held departure schedule reader preserves explicitly evidenced concourse scope',async()=>{
  const r=await normalizeAirportFlight({...raw,terminalid:'P02'},'departure',at);
  const rows=readDepartureSchedule({retrievedAt:at,payload:JSON.stringify([{physicalFlightId:r.physicalFlightId,terminal:r.terminal,operatingFlight:r.flightNumber,scheduledTime:'08:15',gate:r.gate}])},'2026-10-04');
  assert.equal(rows.length,1);assert.equal(rows[0].terminal,'CONCOURSE');assert.equal(boardingAreaOf(rows[0]),'CONCOURSE');
});
