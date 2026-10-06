import type {FlowPoint} from '../lib/demand-presentation';
import profile from './population-range-material-profile.json';

/** Data-free Blender lighting follows the exact live min/max silhouette.
 * Every strip is inside its source range; material never adds geometric depth,
 * changes timestamps or connects independent flowSegments. */
export function PopulationRangeMaterial({segment,x,y}:{segment:FlowPoint[];x:(time:number)=>number;y:(value:number)=>number}){
 if(segment.length<2||segment.every(point=>point.populationMin===point.populationMax))return null;
 const edge=(fraction:number)=>segment.map(point=>[x(point.time),y(point.populationMax)+(y(point.populationMin)-y(point.populationMax))*fraction]);
 return <g className="population-range-material" data-source-kind={segment[0].kind} aria-hidden="true">
  {profile.colors.map((color,index)=><polygon key={index} fill={color}
   points={[...edge(index/profile.colors.length),...edge((index+1)/profile.colors.length).reverse()].map(point=>point.join(',')).join(' ')}/>)}
 </g>;
}
