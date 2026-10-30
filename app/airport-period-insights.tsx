'use client';
import {useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore,type ReactNode,type KeyboardEvent} from 'react';
import dynamic from 'next/dynamic';
import type {Lang} from './retailpulse-data';
import {AIRPORT_PERIOD_VERSION} from '../lib/airport-period-version';
import './airport-period-insights.css';
const CountryFlights=dynamic(()=>import('./airport-country-flights'));
// The default tab is selected from browser URL state. Mount it after hydration
// so a server placeholder cannot be replaced while readers interact with it.
const CountryZones=dynamic(()=>import('./airport-country-zones'),{ssr:false});
const tabs=[['overview','공항한눈에'],['rhythm','언제 몰렸나요?'],['weekday','항공편 주말이 더 많나요?'],['terminal','어느 터미널이 달라졌나요?'],['holiday','연휴에는 늘었나요?']] as const;
type View='rhythm'|'weekday'|'terminal'|'holiday'|'country';
type Ranges={aStart:string;aEnd:string;bStart:string;bEnd:string};
const keys=['aStart','aEnd','bStart','bEnd'] as const;
function validRanges(value:unknown):value is Ranges {return !!value&&typeof value==='object'&&keys.every(k=>typeof (value as Ranges)[k]==='string'&&/^\d{4}-\d{2}-\d{2}$/.test((value as Ranges)[k]));}
const subscribe=(callback:()=>void)=>{window.addEventListener('popstate',callback);window.addEventListener('koretail:analysis-nav',callback);return()=>{window.removeEventListener('popstate',callback);window.removeEventListener('koretail:analysis-nav',callback);};};
function useQuery(){return new URLSearchParams(useSyncExternalStore(subscribe,()=>window.location.search,()=>''));}
function navigate(key:string,value:string){const url=new URL(location.href);if((key==='insight'&&value==='overview')||(key==='mode'&&value==='zones'))url.searchParams.delete(key);else url.searchParams.set(key,value);history.pushState(null,'',url);window.dispatchEvent(new Event('koretail:analysis-nav'));}
function tabKeys(e:KeyboardEvent<HTMLButtonElement>,index:number,length:number,select:(index:number)=>void){if(e.ctrlKey||e.metaKey||e.altKey)return;const next=e.key==='ArrowRight'?(index+1)%length:e.key==='ArrowLeft'?(index+length-1)%length:e.key==='Home'?0:e.key==='End'?length-1:null;if(next!==null){e.preventDefault();select(next);const buttons=e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]');buttons?.[next].focus();}}
function PeriodFrame({view,date}:{view:View;date?:string|null}){
 const frame=useRef<HTMLIFrameElement>(null),params=useQuery(),ranges=Object.fromEntries(keys.map(k=>[k,params.get(k)]));
 const current=useRef({view,ranges});useEffect(()=>{current.current={view,ranges};});
 const srcParams=new URLSearchParams({view,v:AIRPORT_PERIOD_VERSION});if(date)srcParams.set('date',date);if(validRanges(ranges))keys.forEach(k=>srcParams.set(k,ranges[k]));
 // Keep the same frame across analysis tabs; the child stores each view's chosen ranges.
 const [initial]=useState(()=>srcParams.toString());
 useEffect(()=>{
  const send=()=>frame.current?.contentWindow?.postMessage({type:'koretail-insights-view',view:current.current.view,...(validRanges(current.current.ranges)?{ranges:current.current.ranges}:{})},location.origin);
  const receive=(e:MessageEvent)=>{
   if(e.source!==frame.current?.contentWindow||e.origin!==location.origin||!e.data)return;
   if(e.data.type==='koretail-insights-ready')send();
   if(e.data.type==='koretail-insights-height'&&Number.isFinite(e.data.height)&&frame.current)frame.current.style.height=Math.max(300,Math.min(20000,e.data.height+4))+'px';
   if(e.data.type==='koretail-insights-state'&&e.data.view===current.current.view&&validRanges(e.data.ranges)){const url=new URL(location.href);keys.forEach(k=>url.searchParams.set(k,e.data.ranges[k]));history.replaceState(null,'',url);}
   if(e.data.type==='koretail-open-country-flights'&&validRanges(e.data.ranges)){const q=new URLSearchParams({mode:'flights',...e.data.ranges});if(date)q.set('date',date);location.assign('/ko/airport-countries?'+q);}
  };
  window.addEventListener('message',receive);send();return()=>window.removeEventListener('message',receive);
 },[date]);
 const rangeKey=keys.map(k=>params.get(k)??'').join('/');
 useEffect(()=>{const values=Object.fromEntries(keys.map((k,i)=>[k,rangeKey.split('/')[i]]));frame.current?.contentWindow?.postMessage({type:'koretail-insights-view',view,...(validRanges(values)?{ranges:values}:{})},location.origin);},[view,rangeKey]);
 return <iframe ref={frame} title={view==='country'?'국가별 항공편 기간 비교':'공항 항공편 기간 비교'} src={'/airport-period/frame.html?'+initial} className="airport-period-frame"/>;
}
function revealFocusedGlanceTab(strip:HTMLDivElement|null){const active=document.activeElement;if(active instanceof HTMLElement&&active.getAttribute('role')==='tab'&&strip?.contains(active))active.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});}
function GlanceTabNavigation({view}:{view:string}){
 const strip=useRef<HTMLDivElement>(null),previousButton=useRef<HTMLButtonElement>(null),nextButton=useRef<HTMLButtonElement>(null);
 const [edges,setEdges]=useState({overflow:false,previous:false,next:false});
 const pendingFocus=useRef<'previous'|'next'|null>(null),keyboardNavigation=useRef(false);
 useLayoutEffect(()=>{
  const button=pendingFocus.current==='previous'?previousButton.current:pendingFocus.current==='next'?nextButton.current:null;button?.focus({preventScroll:true});pendingFocus.current=null;
  // A newly visible previous arrow narrows the rail after native focus scrolling.
  if(keyboardNavigation.current)revealFocusedGlanceTab(strip.current);
 },[edges]);
 useEffect(()=>{
  const element=strip.current;if(!element)return;
  const measure=()=>{const overflow=element.scrollWidth>element.clientWidth+1,previous=element.scrollLeft>1,next=element.scrollLeft+element.clientWidth<element.scrollWidth-1;if(!previous&&document.activeElement===previousButton.current)pendingFocus.current='next';if(!next&&previous&&document.activeElement===nextButton.current)pendingFocus.current='previous';setEdges(old=>old.overflow===overflow&&old.previous===previous&&old.next===next?old:{overflow,previous,next});};
  const observer=new ResizeObserver(measure);observer.observe(element);element.querySelectorAll('[role=tab]').forEach(tab=>observer.observe(tab));
  element.addEventListener('scroll',measure,{passive:true});measure();
  return()=>{observer.disconnect();element.removeEventListener('scroll',measure);};
 },[]);
 const scroll=(direction:number)=>{keyboardNavigation.current=false;const element=strip.current;if(element)element.scrollBy({left:direction*Math.max(120,element.clientWidth*.8),behavior:'instant'});};
 return <div className="airport-insight-tab-nav" onPointerDownCapture={()=>{keyboardNavigation.current=false;}} onWheelCapture={()=>{keyboardNavigation.current=false;}}>
  {edges.overflow&&edges.previous&&<button type="button" ref={previousButton} className="airport-insight-scroll" aria-label="이전 메뉴 보기" aria-controls="airport-glance-tabs" onClick={()=>scroll(-1)}><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="m12 4-6 6 6 6"/></svg></button>}
  <div ref={strip} id="airport-glance-tabs" className="airport-insight-tabs" role="tablist" aria-label="공항 한눈에 보기 선택">{tabs.map(([key,label],i)=><button key={key} id={'airport-insight-tab-'+key} role="tab" aria-selected={view===key} aria-controls={key==='overview'?'airport-insight-overview':'airport-insight-analysis'} tabIndex={view===key?0:-1} onClick={()=>navigate('insight',key)} onKeyDown={e=>{const keyboard=!e.ctrlKey&&!e.metaKey&&!e.altKey&&['ArrowRight','ArrowLeft','Home','End'].includes(e.key);keyboardNavigation.current=keyboard;tabKeys(e,i,tabs.length,n=>navigate('insight',tabs[n][0]));if(keyboard)revealFocusedGlanceTab(strip.current);}}>{label}</button>)}</div>
  {edges.overflow&&<button type="button" ref={nextButton} className="airport-insight-scroll" aria-label="다음 메뉴 보기" aria-controls="airport-glance-tabs" disabled={!edges.next} onClick={()=>scroll(1)}><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="m8 4 6 6-6 6"/></svg></button>}
 </div>;
}
function KoreanGlance({children,date}:{children:ReactNode;date?:string|null}){
 const query=useQuery(),raw=query.get('insight'),view=tabs.some(([key])=>key===raw)?raw!:'overview';
 return <section className="airport-insight-shell" aria-label="인천공항 한눈에"><div className="glance-heading"><h1 data-heading="page"><span className="heading-marker" aria-hidden="true"/>인천공항 한눈에</h1></div>
  <GlanceTabNavigation view={view}/>
  <div id="airport-insight-overview" role="tabpanel" aria-labelledby="airport-insight-tab-overview" hidden={view!=='overview'}>{children}</div>
  {view!=='overview'&&<div id="airport-insight-analysis" role="tabpanel" aria-labelledby={'airport-insight-tab-'+view}><PeriodFrame key={date??'today'} date={date} view={view as View}/></div>}
 </section>;
}
export function AirportGlanceInsights({lang,...props}:{lang:Lang;children:ReactNode;date?:string|null}){return lang==='ko'?<KoreanGlance {...props}/>:props.children;}
function KoreanCountries({children,date}:{children:ReactNode;date?:string|null}){
 const query=useQuery(),mode=query.get('mode')==='flights'?'flights':query.get('mode')==='passengers'?'passengers':'zones',monthly=query.get('period')==='monthly';
 const labels=[['zones','국가별 출발 구역'],['passengers','국가별 출국 여객'],['flights','국가별 항공편']] as const;
 return <section className="airport-insight-shell airport-country-insights"><h1 data-heading="page"><span className="heading-marker" aria-hidden="true"/>국가별 흐름</h1>
  <div role="tablist" className="airport-insight-tabs country-tabs" aria-label="국가별 흐름 보기 선택">{labels.map(([id,label],i)=><button key={id} id={'country-flow-tab-'+id} role="tab" tabIndex={mode===id?0:-1} aria-selected={mode===id} aria-controls={'country-flow-'+id} onClick={()=>navigate('mode',id)} onKeyDown={e=>tabKeys(e,i,labels.length,n=>navigate('mode',labels[n][0]))}>{label}</button>)}</div>
  <p className="airport-period-basis">{mode==='passengers'?'공항 전체 공식 월 실적 · 명':mode==='flights'?'터미널별 출발편 비교 · 편/일':'터미널별 국가·구역 출발편'}<br/>노선의 목적지 국가 기준 · 승객 국적 아님</p>
  <div id="country-flow-passengers" role="tabpanel" aria-labelledby="country-flow-tab-passengers" hidden={mode!=='passengers'}>{children}</div>
  {mode==='flights'&&<div id="country-flow-flights" role="tabpanel" aria-labelledby="country-flow-tab-flights"><div className="airport-period-modes" role="group" aria-label="항공편 비교 방식"><button aria-pressed={!monthly} onClick={()=>navigate('period','custom')}>기간 직접 비교</button><button aria-pressed={monthly} onClick={()=>navigate('period','monthly')}>터미널별 월 집계</button></div>{monthly?<CountryFlights lang="ko" date={date??null}/>:<PeriodFrame key={date??'today'} view="country" date={date}/>}</div>}
  {mode==='zones'&&<div id="country-flow-zones" role="tabpanel" aria-labelledby="country-flow-tab-zones"><CountryZones date={date} initialScope={query.get('building')}/></div>}
 </section>;
}
export function AirportCountryInsights({lang,...props}:{lang:Lang;children:ReactNode;date?:string|null}){return lang==='ko'?<KoreanCountries {...props}/>:props.children;}
