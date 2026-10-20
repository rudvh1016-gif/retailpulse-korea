'use client';
import {useEffect,useState} from 'react';
import snapshot from '../data/airport-focus-preview/arrival-allowances.json';
type Conditions=Record<string,string[]>;
type Country={id:string;name:string;scope:string;checkedAt:string;effectiveLabel:string;conditions:Array<{id:string;label:string;when?:Conditions;options:Array<{id:string;label:string}>}>;results:Array<{when:Conditions;label:string;facts:Array<{label:string;value:string}>;notes:string[]}>;notes:string[];sources:Array<{label:string;url:string}>};
const data=snapshot as {countries:Country[]};
import './arrival-allowances-preview.css';
/** Official-source review snapshot. No automatic legal interpretation or live AI calls. */
export default function ArrivalAllowancesPreview({scrollOnMount=false}:{scrollOnMount?:boolean}){
 useEffect(()=>{
  let active=true,armed=false,frame=0,timer:ReturnType<typeof setTimeout>|undefined;
  const targeted=()=>scrollOnMount||window.location.hash==='#arrival-allowances';
  const align=()=>{if(!active||!armed||!targeted())return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(armed)document.getElementById('arrival-allowances')?.scrollIntoView({block:'start',behavior:'instant'});});};
  const observer=new ResizeObserver(align);
  const stop=()=>{armed=false;cancelAnimationFrame(frame);clearTimeout(timer);observer.disconnect();};
  const arm=()=>{stop();if(!targeted())return;armed=true;observer.observe(document.body);align();timer=setTimeout(stop,10000);};
  arm();void document.fonts.ready.then(align);
  window.addEventListener('hashchange',arm);window.addEventListener('popstate',arm);window.addEventListener('pageshow',arm);
  for(const event of ['wheel','touchstart','pointerdown','keydown'])window.addEventListener(event,stop,{passive:true});
  return()=>{active=false;stop();window.removeEventListener('hashchange',arm);window.removeEventListener('popstate',arm);window.removeEventListener('pageshow',arm);for(const event of ['wheel','touchstart','pointerdown','keydown'])window.removeEventListener(event,stop);};
 },[scrollOnMount]);
 const [countryId,setCountryId]=useState(''),[answers,setAnswers]=useState<Record<string,string>>({});
 const country=data.countries.find(item=>item.id===countryId);
 const matches=(when:Conditions)=>Object.entries(when).every(([key,values])=>values.includes(answers[key]));
 const visibleConditions=country?.conditions.filter(condition=>!condition.when||matches(condition.when))??[];
 const complete=!!country&&visibleConditions.every(condition=>!!answers[condition.id]);
 const result=complete?country.results.find(item=>matches(item.when)):undefined;
 return <section className="arrival-allowances" id="arrival-allowances" aria-labelledby="arrival-allowances-title">
  <div className="focus-section-heading"><div><h2 id="arrival-allowances-title">도착국 반입 면세한도</h2><p>구매 한도가 아닌, 도착지 입국 시 적용되는 기준입니다.</p></div></div>
  <label className="arrival-filter">도착 국가·지역<select aria-label="도착 국가·지역" value={countryId} onChange={event=>{setCountryId(event.target.value);setAnswers({});}}><option value="">선택하세요</option>{data.countries.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
  {country&&<>
   <p className="arrival-scope">{country.scope}</p>
   <div className="arrival-filters">{visibleConditions.map(condition=><label className="arrival-filter" key={condition.id}>{condition.label}<select aria-label={condition.label} value={answers[condition.id]??''} onChange={event=>setAnswers({...answers,[condition.id]:event.target.value})}><option value="">선택하세요</option>{condition.options.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label>)}</div>
   {!complete?<p className="arrival-empty">여행자 조건을 선택하면 해당 기준을 확인할 수 있습니다.</p>:result?<div className="arrival-result" aria-live="polite"><h3>{result.label}</h3><dl>{result.facts.map(fact=><div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>{result.notes.length>0&&<ul>{result.notes.map(note=><li key={note}>{note}</li>)}</ul>}</div>:<p className="arrival-empty" aria-live="polite">이 조건은 기본 한도를 그대로 적용할 수 없습니다. 아래 세관 원문에서 별도 기준을 확인하세요.</p>}
   <details className="arrival-source"><summary>주의사항 · 공식 근거</summary><ul>{country.notes.map(note=><li key={note}>{note}</li>)}</ul><p>원문 확인 {country.checkedAt} · {country.effectiveLabel}</p>{country.sources.map(source=><a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a>)}</details>
  </>}
  <p className="arrival-disclaimer">1인 일반 여행자 참고정보입니다. 판매용·특수 여행자와 금지·제한품은 별도이며, 최종 판단은 도착지 세관이 합니다.</p>
  <small className="focus-source">공식 자료 확인본 · 자동 업데이트 미연결. 초기 안내 등록이며, 규정이 바뀌었다는 공지가 아닙니다.</small>
 </section>;
}
