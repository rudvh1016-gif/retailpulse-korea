import type {SideCounts} from '../lib/airport-sides';
import type {Lang} from './retailpulse-data';
import {sidesCopy} from '../lib/airport-sides-copy';
const order=['WEST','CENTER','EAST','UNVERIFIED'] as const;
/** Decorative geometry uses the same raw flight counts as the adjacent DOM labels. */
export function GateDistributionBar({counts,maximum=counts.total}:{counts:SideCounts;maximum?:number}){
 const starts={WEST:0,CENTER:counts.WEST,EAST:counts.WEST+counts.CENTER,UNVERIFIED:counts.WEST+counts.CENTER+counts.EAST};const denominator=Math.max(maximum,counts.total,1);
 return <svg className="gate-distribution-bar" viewBox="0 0 100 5" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect width="100" height="5" className="gate-bar-track"/>{order.map(side=>{return <rect key={side} data-side={side} x={starts[side]/denominator*100} y="0" width={counts[side]/denominator*100} height="5"/>;})}</svg>;
}
export function GateDistributionLegend({lang}:{lang:Lang}){
 return <div className="gate-distribution-legend">{order.map(side=><span key={side}><i data-side={side} aria-hidden="true"/>{sidesCopy.side[side][lang]}</span>)}</div>;
}
