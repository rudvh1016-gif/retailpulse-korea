'use client';
import {useEffect,useState} from 'react';
import snapshot from '../data/airport-focus-preview/arrival-allowances.json';
type JapanNumbers={liquorBottles:number;liquorBottleMl:number;cigarettes:number;perfumeOunces:number};
type JapanUpdate={values:JapanNumbers;previous?:JapanNumbers|null;updatedAt:string;changedAt:string|null;sourceUrl:string};
type CheckStatus={japan?:JapanUpdate|null;status:string;countries:Array<{id:string;state:string;lastCheckedAt:string;nextCheckAt:string}>};
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
 const [checks,setChecks]=useState<CheckStatus|null>(null);
 useEffect(()=>{const controller=new AbortController();fetch('/api/airport/allowance-status',{signal:controller.signal}).then(response=>response.ok?response.json():null).then(value=>{if(value&&Array.isArray(value.countries))setChecks(value);}).catch(()=>{});return()=>controller.abort();},[]);
 const [countryId,setCountryId]=useState(''),[answers,setAnswers]=useState<Record<string,string>>({});
 const original=data.countries.find(item=>item.id===countryId);
 const country=original?.id==='JP'&&checks?.japan?applyJapanValues(original,checks.japan):original;
 const check=checks?.countries.find(item=>item.id===countryId);
 const checkLabel=check?({NUMERIC_VERIFIED:'일본 주류·궐련·향수 수치 자동 확인 · 그 외 조건은 검토본 기준',SOURCE_UNCHANGED:'공식 원문 변경 없음 · 법령 전체 현행성 보장 아님',REVIEW_REQUIRED:'공식 원문 변경 확인 중 · 마지막 검토값 유지',CHECK_UNAVAILABLE:'자동 확인 불가 · 마지막 검토값 유지',BASELINE_REQUIRED:'원문 기준본 검토 필요 · 마지막 검토값 유지',STALE:'자동 확인 지연 · 마지막 검토값 유지'}[check.state]??'확인 상태 점검 중'):'자동 확인 기록 대기 · 아래 원문 확인일 기준';
 const matches=(when:Conditions)=>Object.entries(when).every(([key,values])=>values.includes(answers[key]));
 const visibleConditions=country?.conditions.filter(condition=>!condition.when||matches(condition.when))??[];
 const complete=!!country&&visibleConditions.every(condition=>!!answers[condition.id]);
 const result=complete?country.results.find(item=>matches(item.when)):undefined;
 return <section className="arrival-allowances" id="arrival-allowances" aria-labelledby="arrival-allowances-title">
  <div className="focus-section-heading"><div><h2 id="arrival-allowances-title">도착국 반입 면세한도</h2><p>구매 한도가 아닌, 도착지 입국 시 적용되는 기준입니다.</p></div></div>
  <label className="arrival-filter">도착 국가·지역<select aria-label="도착 국가·지역" value={countryId} onChange={event=>{setCountryId(event.target.value);setAnswers({});}}><option value="">선택하세요</option>{data.countries.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
  {country&&<>
   {country.id==='JP'&&checks?.japan?.changedAt&&<p className="focus-source" role="status">[공지] 일본 세관 현행 안내 수치 업데이트: {japanChangeText(checks.japan)}. 확인 {checks.japan.changedAt.slice(0,10)} · 시행일은 원문에서 별도 확인하세요.</p>}
   <p className="arrival-scope">{country.scope}</p><p className="focus-source" role={check?.state==='REVIEW_REQUIRED'?'status':undefined}>{checkLabel}{check?` · 최근 자동 확인 ${check.lastCheckedAt.slice(0,10)}`:''}</p>
   <div className="arrival-filters">{visibleConditions.map(condition=><label className="arrival-filter" key={condition.id}>{condition.label}<select aria-label={condition.label} value={answers[condition.id]??''} onChange={event=>setAnswers({...answers,[condition.id]:event.target.value})}><option value="">선택하세요</option>{condition.options.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label>)}</div>
   {!complete?<p className="arrival-empty">여행자 조건을 선택하면 해당 기준을 확인할 수 있습니다.</p>:result?<div className="arrival-result" aria-live="polite"><h3>{result.label}</h3><h4>패션·명품 등 일반물품 기준</h4><dl>{result.facts.filter(fact=>!['주류','담배','향수'].includes(fact.label)).map(fact=><div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl><details className="arrival-category"><summary>화장품·향수</summary><p>화장품은 위 일반물품 기준과 적용 조건을 함께 확인하세요.</p><dl>{result.facts.filter(fact=>fact.label==='향수').map(fact=><div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>{!result.facts.some(fact=>fact.label==='향수')&&<p>이 안내에는 향수 별도 수량을 확인한 항목이 없습니다. 세관 원문을 확인하세요.</p>}</details><details className="arrival-category"><summary>주류·담배</summary><dl>{result.facts.filter(fact=>['주류','담배'].includes(fact.label)).map(fact=><div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl></details>{result.notes.length>0&&<details className="arrival-category"><summary>적용 조건·품목별 주의사항</summary><ul>{result.notes.map(note=><li key={note}>{note}</li>)}</ul></details>}</div>:<p className="arrival-empty" aria-live="polite">이 조건은 기본 한도를 그대로 적용할 수 없습니다. 아래 세관 원문에서 별도 기준을 확인하세요.</p>}
   <details className="arrival-source"><summary>주의사항 · 공식 근거</summary><ul>{country.notes.map(note=><li key={note}>{note}</li>)}</ul><p>원문 확인 {country.checkedAt} · {country.effectiveLabel}</p>{country.sources.map(source=><a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a>)}</details>
  </>}
  <p className="arrival-disclaimer">1인 일반 여행자 참고정보입니다. 판매용·특수 여행자와 금지·제한품은 별도이며, 최종 판단은 도착지 세관이 합니다.</p>
  <small className="focus-source">{checks?.status==='STORED'?'하루 1회 공식 원문 자동 확인 · 접근 가능한 출처부터 적용. 일본의 검증된 수치 항목만 자동 갱신하며, 조건·형식 변경은 검토 후 반영합니다. 시행일은 임의로 확정하지 않습니다.':'공식 자료 확인본 · 자동 확인 기록 대기. 마지막 원문 확인일과 국가별 확인 상태를 확인하세요.'}</small>
 </section>;
}

function applyJapanValues(original:Country,update:JapanUpdate):Country{
 const v=update.values;
 if(!v||![v.liquorBottles,v.liquorBottleMl,v.cigarettes,v.perfumeOunces].every(value=>typeof value==='number'&&Number.isFinite(value)&&value>0))return original;
 return {...original,results:original.results.map(result=>({...result,facts:result.facts.map(fact=>{
  if(fact.label==='주류'&&result.when.age?.includes('adult'))return {...fact,value:`${v.liquorBottleMl}mL 기준 ${v.liquorBottles}병`};
  if(fact.label==='담배'&&result.when.age?.includes('adult'))return {...fact,value:`궐련만 ${v.cigarettes}개비. 다른 종류·혼합은 별도 환산.`};
  if(fact.label==='향수')return {...fact,value:`${v.perfumeOunces}온스, 약 ${Number((v.perfumeOunces*28).toFixed(2))}mL. 오드콜로뉴·오드투알레트 제외.`};
  return fact;
 }),notes:result.notes.map(note=>note==='술은 병 크기와 무관하게 3병이라는 뜻이 아닙니다. 휴대품·별송품은 합산합니다.'?`술은 병 크기와 무관하게 ${v.liquorBottles}병이라는 뜻이 아닙니다. 휴대품·별송품은 합산합니다.`:note)}))};
}

function japanChangeText(update:JapanUpdate){
 const before=update.previous,after=update.values;if(!before)return '검증된 수치 항목';
 const changes:string[]=[];
 if(before.liquorBottles!==after.liquorBottles||before.liquorBottleMl!==after.liquorBottleMl)changes.push(`주류 ${before.liquorBottleMl}mL 기준 ${before.liquorBottles}병 → ${after.liquorBottleMl}mL 기준 ${after.liquorBottles}병`);
 if(before.cigarettes!==after.cigarettes)changes.push(`궐련 ${before.cigarettes} → ${after.cigarettes}개비`);
 if(before.perfumeOunces!==after.perfumeOunces)changes.push(`향수 ${before.perfumeOunces} → ${after.perfumeOunces}온스`);
 return changes.join(' · ')||'검증된 수치 항목';
}
