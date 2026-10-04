import sides from '../config/airport-sides.v1.json';
import positions from '../config/airport-gate-positions.v1.json';
import type {GateSide} from './airport-sides';

export type RegisteredBuilding='T1'|'T2'|'CONCOURSE';
export function gateIntervals(gates:readonly string[]):string {
  const sorted=[...new Set(gates.map(Number).filter(Number.isInteger))].sort((a,b)=>a-b);
  const runs:string[]=[];
  for(let i=0;i<sorted.length;i++) {
    const first=sorted[i];let last=first;
    while(i+1<sorted.length&&sorted[i+1]===last+1)last=sorted[++i];
    runs.push(first===last?String(first):`${first}–${last}`);
  }
  return runs.join(', ');
}
export function registeredGateRegions(building:RegisteredBuilding) {
  const known=sides.gates.filter(g=>g.area===building);
  const keys=[...new Set([...Object.keys(positions.buildings[building].gates),...known.map(g=>g.gate)])];
  return keys.map(gate=>{
    const entry=known.find(g=>g.gate===gate);
    return {building,gate,side:(entry?.side??'UNVERIFIED') as GateSide,basis:entry?.basis??null,evidence:entry?.evidence??null};
  }).sort((a,b)=>Number(a.gate)-Number(b.gate));
}
