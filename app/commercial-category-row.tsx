'use client';
import {useId,useState} from 'react';
import type {Lang} from './retailpulse-data';
import type {CategoryActivity} from '../lib/seoul-context';
import {commercialActivityContext} from '../lib/commercial-context';
import {commercialPrismRange,publishedPaymentCount,type CommercialChartAxes,type CommercialChartMetric} from '../lib/commercial-category-chart';
import {commercialCategoryIcons,commercialCategoryFallback} from './commercial-category-icons';

export const commercialLocales={ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'} as const;
export function CommercialCategoryRow({row,lang,metric,axes}:{row:CategoryActivity;lang:Lang;metric:CommercialChartMetric;axes:CommercialChartAxes}) {
 const patternId=`commercial-range-${useId()}`;
 const [failedIcon,setFailedIcon]=useState<string|null>(null);
 const missing=({ko:'미제공',en:'Not supplied',zh:'未提供',ja:'未提供'})[lang];
 const number=new Intl.NumberFormat(commercialLocales[lang]);
 const won=new Intl.NumberFormat(commercialLocales[lang],{style:'currency',currency:'KRW',maximumFractionDigits:0});
 const bound=(value:number|null)=>value!==null&&Number.isFinite(value)&&value>=0?won.format(value):missing;
 const invalidRange=row.amountMin!==null&&row.amountMax!==null&&row.amountMax<row.amountMin;
 const amount=invalidRange||row.amountMin===null&&row.amountMax===null?missing:`${bound(row.amountMin)} ~ ${bound(row.amountMax)}`;
 const count=publishedPaymentCount(row.payments);
 const countLabel=({ko:'결제',en:'Payments',zh:'支付',ja:'決済'})[lang];
 const amountLabel=({ko:'금액 범위',en:'Amount range',zh:'金额范围',ja:'金額範囲'})[lang];
 const countValue=count===null?missing:`${number.format(count)}${({ko:'건',en:'',zh:'笔',ja:'件'})[lang]}`;
 const grade=commercialActivityContext(row.level??'',lang)??row.level??missing;
 const geometry=commercialPrismRange(row,metric,axes);
 const icon=commercialCategoryIcons[row.category]??commercialCategoryFallback;
 const upper=geometry?.upper??0,lower=geometry?.lower??0;
 return <li className="context-category-visual" data-category={row.category}>
  <span className="commercial-category-icon" data-category-icon-key={row.category} aria-hidden="true">
   {icon&&failedIcon!==icon.src?<img src={icon.src} width={icon.width} height={icon.height} alt="" loading="lazy" decoding="async" onError={()=>setFailedIcon(icon.src)}/>:
    <svg viewBox="0 0 48 48" focusable="false"><path d="M8 20h32v20H8zM6 20l4-12h28l4 12M16 20v20M30 27h6v6h-6M6 20c0 4 6 4 6 0 0 4 6 4 6 0 0 4 6 4 6 0 0 4 6 4 6 0 0 4 6 4 6 0 0 4 6 4 6 0"/></svg>}
  </span>
  <div className="commercial-category-copy">
   <div className="commercial-category-heading"><strong>{row.category}</strong><span>{grade}</span></div>
   <small className="commercial-category-values"><span>{amountLabel} <b>{amount}</b></span><span>{countLabel} <b>{countValue}</b></span></small>
   {geometry?<svg className="commercial-value-prism" viewBox="0 0 110 24" preserveAspectRatio="none" aria-hidden="true" focusable="false" data-metric={metric} data-lower={lower} data-upper={upper} data-zero={geometry.zero}>
    <defs><pattern id={patternId} width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" className="commercial-prism-uncertainty"/><path d="M-1 4L4-1M3 5L5 3" className="commercial-prism-hatch"/></pattern></defs>
    <path className="commercial-prism-axis" d="M0 22H100M0 20V24M100 20V24"/>
    {upper>0&&<>
     <path className="commercial-prism-top" d={`M0 10L4 6H${upper+4}L${upper} 10Z`}/>
     <rect className="commercial-prism-front" y="10" width={lower} height="10"/>
     {upper>lower&&<rect x={lower} y="10" width={upper-lower} height="10" fill={`url(#${patternId})`}/>}
     <path className="commercial-prism-side" d={`M${upper} 10L${upper+4} 6V16L${upper} 20Z`}/>
     <path className="commercial-prism-end" d={`M${upper} 10V20`}/>
    </>}
   </svg>:<small className="commercial-chart-unavailable">{({ko:'이 항목의 차트 수치 미제공',en:'Chart value not supplied for this category',zh:'未提供此行业的图表数值',ja:'この業種のグラフ値は未提供'})[lang]}</small>}
  </div>
 </li>;
}
