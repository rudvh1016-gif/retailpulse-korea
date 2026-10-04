import test from 'node:test';
import assert from 'node:assert/strict';
import {gateIntervals,registeredGateRegions} from '../lib/airport-gate-regions';
import sides from '../config/airport-sides.v1.json';
import positions from '../config/airport-gate-positions.v1.json';

test('gate ranges preserve every gap, singleton and unsorted duplicate',()=>{
 assert.equal(gateIntervals(['291','280','278','279','230','232','230']), '230, 232, 278–280, 291');
 assert.equal(gateIntervals([]),'');
});
for(const building of ['T1','T2','CONCOURSE'] as const) test(`${building} registered evidence preserves the complete config and coordinate union`,()=>{
 const rows=registeredGateRegions(building);
 const expected=[...new Set([...Object.keys(positions.buildings[building].gates),...sides.gates.filter(g=>g.area===building).map(g=>g.gate)])].sort((a,b)=>Number(a)-Number(b));
 assert.deepEqual(rows.map(g=>g.gate),expected);
 for(const row of rows){const source=sides.gates.find(g=>g.area===building&&g.gate===row.gate);assert.equal(row.side,source?.side??'UNVERIFIED');assert.equal(row.basis,source?.basis??null);assert.equal(row.evidence,source?.evidence??null);}
});
test('291 is an evidenced calculated-map exception, never an official-text designation',()=>{
 const gate=registeredGateRegions('T2').find(g=>g.gate==='291');assert.equal(gate?.side,'EAST');assert.equal(gate?.basis,'OFFICIAL_MAP_MIDPOINT');
});
