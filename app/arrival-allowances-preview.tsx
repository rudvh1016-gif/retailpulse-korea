'use client';
import {useEffect,useState} from 'react';
import {ArrivalReviewedOverview} from './arrival-reviewed-overview';
import {arrivalManualReviewLabel,arrivalReviewSentence} from '../lib/arrival-review-date';
import {evaluateArrival,updateArrivalAnswer,arrivalCheckSummary,arrivalCheckExplanation,type ArrivalCountry,type ArrivalCheck} from '../lib/arrival-allowance-guidance';
import snapshot from '../data/airport-focus-preview/arrival-allowances.json';
import {arrivalCountryActions,arrivalResultNotes,arrivalAlcoholNotes} from '../lib/arrival-country-actions';
type JapanNumbers={liquorBottles:number;liquorBottleMl:number;cigarettes:number;perfumeOunces:number};
type JapanUpdate={values:JapanNumbers;previous?:JapanNumbers|null;updatedAt:string;changedAt:string|null;sourceUrl:string};
type CheckStatus={japan?:JapanUpdate|null;status:string;countries:ArrivalCheck[]};
type Country=ArrivalCountry;
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
 const evaluation=country?evaluateArrival(country,answers):undefined;
 const visibleConditions=evaluation?.visible??[];
 const {complete,result,guidance}=evaluation??{};
 const actions=country&&result?arrivalCountryActions(country.id,answers):undefined;
 const resultNotes=country&&result?arrivalResultNotes(country.id,answers,result.notes):[];
 const alcoholNotes=country&&result?arrivalAlcoholNotes(country.id,result.notes):[];
 return <section className="arrival-allowances" id="arrival-allowances" lang="ko" aria-labelledby="arrival-allowances-title">
  <div className="focus-section-heading"><div><h2 data-heading="section" id="arrival-allowances-title"><span className="heading-marker" aria-hidden="true"/>도착국 반입 면세한도</h2><p>구매 한도가 아닌, 도착지 입국 시 적용되는 기준입니다.</p></div></div>
  <label className="arrival-filter">도착 국가·지역<select aria-label="도착 국가·지역" value={countryId} onChange={event=>{setCountryId(event.target.value);setAnswers({});}}><option value="">선택하세요</option>{data.countries.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
  {!country&&<ArrivalReviewedOverview countries={data.countries}/>}
  {country&&<>
   {country.id==='JP'&&checks?.japan?.changedAt&&<p className="focus-source" role="status">[공지] 일본 세관 현행 안내 수치 업데이트: {japanChangeText(checks.japan)}. 확인 {checks.japan.changedAt.slice(0,10)} · 시행일은 원문에서 별도 확인하세요.</p>}
   <p className="arrival-scope">{country.scope}</p><small className="focus-source arrival-review-date">{arrivalManualReviewLabel(country)}<span className="arrival-check-status" role={check?.state==='REVIEW_REQUIRED'?'status':undefined}> · {arrivalCheckSummary(check)}</span></small>
   <div className="arrival-filters">{visibleConditions.map(condition=><label className="arrival-filter" key={condition.id}>{condition.label}<select aria-label={condition.label} value={answers[condition.id]??''} onChange={event=>setAnswers(previous=>updateArrivalAnswer(country,previous,condition.id,event.target.value))}><option value="">선택하세요</option>{condition.options.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label>)}</div>
   {!complete?<p className="arrival-empty">여행자 조건을 선택하면 해당 기준을 확인할 수 있습니다.</p>:result?<div className="arrival-result" aria-live="polite"><h3>{result.label}</h3>{result.summary&&!actions&&<p>{result.summary}</p>}<h4>패션·명품 등 일반물품 기준</h4>{actions?.scope&&<p>{actions.scope}</p>}<dl>{result.facts.filter(fact=>!['주류','담배','향수'].includes(fact.label)).map(fact=><div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>{actions&&<div className="arrival-next-actions"><p><strong>{country.id==='JP'?'신고·초과 시':'초과 시'}</strong> {actions.action}</p><p><strong>주의</strong> {actions.caution}</p></div>}<details className="arrival-category"><summary>화장품·향수</summary><p>화장품은 위 일반물품 기준과 적용 조건을 함께 확인하세요.</p><dl>{result.facts.filter(fact=>fact.label==='향수').map(fact=><div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>{!result.facts.some(fact=>fact.label==='향수')&&<p>이 안내에는 향수 별도 수량을 확인한 항목이 없습니다. 세관 원문을 확인하세요.</p>}</details><details className="arrival-category"><summary>주류·담배</summary>{alcoholNotes.map(note=><p key={note}>{note}</p>)}<dl>{result.facts.filter(fact=>['주류','담배'].includes(fact.label)).map(fact=><div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl></details>{resultNotes.length>0&&<details className="arrival-category"><summary>적용 조건·품목별 주의사항</summary><ul>{resultNotes.map(note=><li key={note}>{note}</li>)}</ul></details>}</div>:guidance?<div className="arrival-result arrival-condition-guidance" aria-live="polite"><h3>{guidance.title}</h3><p>{guidance.reason}</p><p>{guidance.nextStep}</p>{Boolean(guidance.details?.length||guidance.sourceUrls?.length)&&<details className="arrival-category"><summary>조건 상세 · 공식 근거</summary>{Boolean(guidance.details?.length)&&<ul>{guidance.details?.map(detail=><li key={detail}>{detail}</li>)}</ul>}{guidance.sourceUrls?.map(url=><a className="arrival-guidance-link" key={url} href={url} target="_blank" rel="noreferrer">{country.sources.find(source=>source.url===url)?.label??'해당 조건의 공식 근거'} ↗</a>)}</details>}</div>:null}
   {complete&&country.procedures&&<div className="arrival-procedures">{!guidance&&<p>{country.procedures.summary}</p>}<details className="arrival-category"><summary>한도 초과 · 신고 · 보관·재반출 절차</summary>{guidance&&<p>{country.procedures.summary}</p>}{country.procedures.sections.map(section=><div key={section.title}><h4>{section.title}</h4><ul>{section.notes.map(note=><li key={note}>{note}</li>)}</ul></div>)}{country.procedures.sourceUrls.map(url=><a className="arrival-guidance-link" key={url} href={url} target="_blank" rel="noreferrer">{country.sources.find(source=>source.url===url)?.label??'공식 절차 근거'} ↗</a>)}</details></div>}
   <details className="arrival-source"><summary>공식 근거 · 확인 상태 · 주의사항</summary><p>{arrivalReviewSentence(country)} · {country.effectiveLabel}</p>{country.reviewScope&&<p>{country.reviewScope}</p>}<p>{arrivalCheckExplanation(check)}</p>{check&&<><p>{check.accessReviewRequired?'최근 자동 상태 점검':'최근 자동 확인 시도'} {check.lastCheckedAt.slice(0,10)} · {arrivalCheckSummary(check)}</p><p>마지막 자동 성공 확인: {check.lastSuccessfulCheckAt?.slice(0,10)??'현재 저장 기록으로 확인할 수 없음'}</p></>}<ul>{country.notes.map(note=><li key={note}>{note}</li>)}</ul>{[...country.sources,...(country.reviewReferences??[])].map(source=><a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a>)}</details>
  </>}
  <p className="arrival-disclaimer">1인 일반 여행자 참고정보입니다. 판매용·특수 여행자와 금지·제한품은 별도이며, 최종 판단은 도착지 세관이 합니다.</p>
  <small className="focus-source">{checks?.status==='STORED'?'하루 1회 공식 원문 자동 확인 · 접근 가능한 출처부터 적용. 일본의 검증된 수치 항목만 자동 갱신하며, 조건·형식 변경은 검토 후 반영합니다. 시행일은 임의로 확정하지 않습니다.':'아직 자동 확인 기록이 없어요. 국가를 선택하면 공식 자료를 검토한 날짜와 확인 상태를 볼 수 있어요.'}</small>
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
