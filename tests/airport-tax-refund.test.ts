import test from 'node:test';import assert from 'node:assert/strict';
import {airportTaxRefundLocations,taxRefundEvidence,taxRefundVisuals} from '../lib/airport-tax-refund-guide';
test('T2 conflicting official positions remain source-specific without a chosen coordinate',()=>{
 const rows=airportTaxRefundLocations.filter(r=>r.terminal==='T2'&&r.securitySide==='AFTER_SECURITY');
 assert.deepEqual(rows.map(r=>[r.source,r.points,r.deskHours]),[['AIRPORT_GUIDE',['253','250'],'07:00–21:30'],['AIRPORT_FACILITIES',['249','270'],null],['KTO',['225','249','274'],'07:30–21:30']]);
 assert.ok(rows.every(r=>r.conflicting&&!('coordinates' in r)));
});
test('registration kiosk hours never imply customs staffing and concourse has no fabricated gate',()=>{
 const before=airportTaxRefundLocations.filter(r=>r.securitySide==='BEFORE_SECURITY');
 assert.ok(before.every(r=>r.process==='KIOSK_REGISTRATION'&&r.deskHours===null));
 const concourse=airportTaxRefundLocations.filter(r=>r.terminal==='CONCOURSE');
 assert.equal(concourse.length,1);assert.deepEqual(concourse[0].points,[]);assert.equal(concourse[0].securitySide,'AFTER_SECURITY');
 assert.equal(taxRefundVisuals.conceptOnly,true);assert.equal(taxRefundVisuals.officialLocationOverlay,false);
 assert.ok(Object.values(taxRefundEvidence).every(e=>e.sourceUpdatedOn===null&&e.checkedAt.startsWith('2026-10-04')));
});
