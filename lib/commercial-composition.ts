import type { CategoryActivity } from './seoul-context';
import { publishedPaymentCount } from './commercial-category-chart';

export const compositionColors = ['#79a9c9','#a69ab9','#92b4a6','#c2ced0','#81adbf','#99afb5','#a2b1ca','#c7aca6','#b6d0db','#afb1cb','#d0c0cb'];
/** One provider classification and one observation. Never turn grades or money into shares. */
export function commercialComposition(rows: CategoryActivity[]) {
 const keys=new Set<string>();
 const invalid=rows.some(row=>{const key=`${row.group}\0${row.category}`;const duplicate=keys.has(key);keys.add(key);return duplicate||!row.group||!row.category||/^(전체|합계|총계|total|all)$/i.test(row.category.trim());});
 const sorted=rows.map((row,index)=>({row,index,count:publishedPaymentCount(row.payments)})).sort((a,b)=>(b.count??-1)-(a.count??-1)||a.index-b.index);
 const missing=sorted.filter(row=>row.count===null).length;
 const total=sorted.reduce((sum,row)=>sum+(row.count??0),0);
 const complete=!!rows.length&&!invalid&&!missing&&Number.isSafeInteger(total);
 let cursor=0;
 const segments=sorted.map((item,index)=>{const ratio=complete&&total>0?item.count!/total:null;const start=cursor;cursor+=ratio??0;return {...item,key:`${item.row.group}\0${item.row.category}\0${item.index}`,ratio,start,end:cursor,color:compositionColors[index%compositionColors.length]};});
 return {segments,total,missing,complete,invalid,status:invalid?'invalid':!complete?'missing':total===0?'zero':'valid'} as const;
}
export function compositionRingPath(start:number,end:number,outer=121,inner=77) {
 if(end<=start)return '';
 const point=(fraction:number,r:number)=>[150+Math.sin(fraction*Math.PI*2)*r,150-Math.cos(fraction*Math.PI*2)*r];
 const middle=(start+end)/2,[a,b,c,d,e,f]=[point(start,outer),point(middle,outer),point(end,outer),point(end,inner),point(middle,inner),point(start,inner)];
 return `M ${a} A ${outer} ${outer} 0 0 1 ${b} A ${outer} ${outer} 0 0 1 ${c} L ${d} A ${inner} ${inner} 0 0 0 ${e} A ${inner} ${inner} 0 0 0 ${f} Z`;
}
