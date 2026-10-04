import type {FlowPoint} from '../lib/demand-presentation';

/** Constant 4px material depth behind the original front-face interval.
 * Call once per existing flowSegments output so gaps and source kinds stay separate.
 */
export function PopulationRangeMaterial({segment,x,y}:{segment:FlowPoint[];x:(time:number)=>number;y:(value:number)=>number}){
 const depth={x:4,y:-4};
 const last=segment.at(-1);
 if(!last||segment.every(point=>point.populationMin===0&&point.populationMax===0))return null;
 const upper=segment.map(point=>[x(point.time),y(point.populationMax)]);
 const top=upper.concat([...upper].reverse().map(([px,py])=>[px+depth.x,py+depth.y]));
 const end=[[x(last.time),y(last.populationMax)],[x(last.time)+depth.x,y(last.populationMax)+depth.y],[x(last.time)+depth.x,y(last.populationMin)+depth.y],[x(last.time),y(last.populationMin)]];
 return <g className="population-range-material" data-source-kind={last.kind} aria-hidden="true">
  {segment.length>1&&<polygon className="population-material-top" points={top.map(point=>point.join(',')).join(' ')}/>}
  {last.populationMax>last.populationMin&&<polygon className="population-material-end" points={end.map(point=>point.join(',')).join(' ')}/>}
 </g>;
}
