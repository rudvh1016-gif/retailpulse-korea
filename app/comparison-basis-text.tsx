import {classifyComparisonBasis,comparisonBasisLabel,type ComparisonBasis} from '../lib/comparison-basis';
import type {Lang} from './retailpulse-data';

/** Exact included dates, never an inferred MTD from the number of collected days. */
export function ComparisonBasisText({data,lang}:{data:ComparisonBasis;lang:Lang}){
 const basis=classifyComparisonBasis(data),label=comparisonBasisLabel(data,lang);
 const dates=[...new Set(data.includedDays)].sort();
 if(basis.kind==='unavailable'||basis.kind==='closed'||!dates.length)return <>{label}</>;
 const short=(day:string)=>`${Number(day.slice(5,7))}/${Number(day.slice(8))}`;
 const range=dates[0]===dates.at(-1)?short(dates[0]):`${short(dates[0])}–${short(dates.at(-1)!)}`;
 const continuous=Date.parse(dates.at(-1)!)-Date.parse(dates[0])===(dates.length-1)*86400000;
 const count=({ko:`수집 ${dates.length}일`,en:`${dates.length} collected days`,zh:`已采集${dates.length}天`,ja:`収集${dates.length}日`})[lang];
 const period=basis.kind==='mtd'?`${short(basis.cutoff!)} MTD`:basis.kind==='full-collected'?range:`${range} (${continuous?count:({ko:`중 ${count}`,en:count,zh:count,ja:count})[lang]})`;
 const prefix=basis.kind==='mtd'?label.split('MTD ')[0]+'MTD ':`${data.month}${lang==='ko'?'월':lang==='zh'||lang==='ja'?'月':''} `;
 return <><strong className="comparison-period">{period}</strong>{' '}{label.slice(prefix.length)}</>;
}
