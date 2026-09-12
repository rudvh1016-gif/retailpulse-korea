'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { availableInterests, buildPersonalBrief, locations, days, briefingDate, toggleChoice, recommendedPreferences, roles, terminals, type PersonalPreferences } from '../lib/personal-briefing';
import { pc, type PersonalLang } from '../lib/personal-copy';
import { setAnalyticsConsent, trackPersonalEvent } from '../lib/personal-analytics';
import { rememberFeedback, savePersonalPreferences, useFeedback, usePersonalPreferences } from './personal-preferences';
import { AirportAtAGlance, AreaCurrentBrief, LiveLoadMessage, dateNavText, useLiveSummary } from './live-signals';

function terminalName(value: PersonalPreferences['terminal'],lang:PersonalLang) {return value === 'T1'||value==='T2'?value:pc(value,lang);}
function referenceTime(value:string,lang:PersonalLang) {
  const date=new Date(value);
  return Number.isFinite(date.getTime())?`${new Intl.DateTimeFormat(lang==='zh'?'zh-CN':lang,{timeZone:'Asia/Seoul',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(date)}`:value;
}
function AnalyticsChoice({value,onChange,lang}:{value:boolean;onChange:(value:boolean)=>void;lang:PersonalLang}) {
  return <div className="personal-consent"><label><input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)}/>{pc('analytics',lang)}</label><p>{pc('analyticsNote',lang)}</p></div>;
}
function Setup({lang,initial,onCancel,onDone}:{lang:PersonalLang;initial:PersonalPreferences|null;onCancel:()=>void;onDone:()=>void}) {
  const [p,setP] = useState(initial ?? recommendedPreferences('tourist'));
  const [step,setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const started = useRef(false);
  useEffect(()=>{if(step>0) heading.current?.focus();},[step]);
  function consent(value:boolean) {
    setP({...p,analytics:value});setAnalyticsConsent(value);
    if(value&&!started.current) {trackPersonalEvent('onboarding_started',{language:lang});started.current=true;}
  }
  function advance() {
    const params={...p,language:lang};
    trackPersonalEvent((['role_selected','location_selected','interests_selected','briefing_preference_selected'] as const)[step],params);
    if(step<3) setStep(step+1);
    else {savePersonalPreferences(p);trackPersonalEvent('onboarding_completed',params);onDone();}
  }
  const selectedLocations=p.selectedLocations??[p.location];
  const selectedTerminals=p.selectedTerminals??[p.terminal];
  const selectedDays=p.selectedDays??[p.day];
  const available=[...new Set(selectedLocations.flatMap(availableInterests))];
  function changeLocation(location:PersonalPreferences['location']) {
    const values=toggleChoice(selectedLocations,location);
    const allowed=[...new Set(values.flatMap(availableInterests))];
    const added=values.filter(v=>!selectedLocations.includes(v)).flatMap(v=>recommendedPreferences(p.role,v).interests);
    const interests=[...new Set([...p.interests,...added])].filter(i=>allowed.includes(i));
    setP({...p,location:values[0],selectedLocations:values,interests:interests.length?interests:recommendedPreferences(p.role,values[0]).interests});
  }
  function changeTerminal(terminal:PersonalPreferences['terminal']) {
    const values=terminal==='all'?['all'] as const:selectedTerminals.includes('all')?[terminal]:toggleChoice(selectedTerminals,terminal);
    setP({...p,terminal:values[0],selectedTerminals:[...values]});
  }
  const titles=['role','location','interests','preference'] as const;
  return <section className="personal-sheet personal-setup" data-testid="personal-onboarding" aria-labelledby="personal-setup-title">
    <p className="personal-kicker">KORETAIL · {step+1} / 4</p>
    <h2 ref={heading} tabIndex={-1} id="personal-setup-title">{pc(titles[step],lang)}</h2>
    <div className="personal-progress" aria-hidden="true">{titles.map((title,i)=><span key={title} className={i<=step?'complete':''}/>)}</div>
    {step===0&&<><p>{pc('promise',lang)}</p><div className="personal-options">{roles.map(role=><button type="button" key={role} aria-pressed={p.role===role} data-role={role} onClick={()=>setP({...p,role,day:p.selectedDays?p.day:recommendedPreferences(role).day,interests:[...new Set(selectedLocations.flatMap(v=>recommendedPreferences(role,v).interests))]})}><strong>{pc(role,lang)}</strong><span>{pc(`${role}Note`,lang)}</span></button>)}</div><AnalyticsChoice value={p.analytics} onChange={consent} lang={lang}/></>}
    {step===1&&<><p>{pc('multiple',lang)}</p><div className="personal-options">{locations.map(location=><button key={location} data-location={location} aria-pressed={selectedLocations.includes(location)} onClick={()=>changeLocation(location)}>{pc(location,lang)}</button>)}</div>{selectedLocations.includes('airport')&&<div className="personal-inline" aria-label={pc('airport',lang)}>{terminals.map(terminal=><button key={terminal} aria-pressed={selectedTerminals.includes(terminal)} onClick={()=>changeTerminal(terminal)}>{terminalName(terminal,lang)}</button>)}</div>}</>}
    {step===2&&<><p>{pc('selectedOnly',lang)}</p><div className="personal-options">{available.map(interest=><label key={interest}><input type="checkbox" checked={p.interests.includes(interest)} onChange={e=>setP({...p,interests:e.target.checked?[...p.interests,interest]:p.interests.filter(i=>i!==interest)})}/>{pc(interest,lang)}</label>)}</div></>}
    {step===3&&<><p>{pc('multiple',lang)}</p><div className="personal-options">{days.map(day=><button key={day} data-day={day} aria-pressed={selectedDays.includes(day)} onClick={()=>{const values=toggleChoice(selectedDays,day);setP({...p,day:values[0],selectedDays:values});}}>{pc(day,lang)}</button>)}</div><p>{pc('remembered',lang)}</p><p className="personal-note">{pc('storageNote',lang)}</p></>}
    <div className="personal-actions">{step>0&&<button onClick={()=>setStep(step-1)}>{pc('back',lang)}</button>}{<button onClick={onCancel}>{pc('cancel',lang)}</button>}<button className="personal-primary" disabled={step===2&&!p.interests.length} onClick={advance}>{pc(step===3?'finish':'next',lang)}</button></div>
  </section>;
}
function Feedback({p,date,lang}:{p:PersonalPreferences;date:string;lang:PersonalLang}) {
  const base=`${date}:${p.role}:${p.location}:${p.location==='airport'?p.terminal:'all'}`;
  const helpful=useFeedback(`${base}:helpful`);
  const work=useFeedback(`${base}:work`);
  function vote(question:'helpful'|'work',value:'yes'|'no') {
    if(rememberFeedback(`${base}:${question}`,value)) trackPersonalEvent(question==='helpful'?(value==='yes'?'briefing_helpful_yes':'briefing_helpful_no'):(value==='yes'?'briefing_used_for_work_yes':'briefing_used_for_work_no'),{...p,language:lang});
  }
  return <div className="personal-feedback"><p>{pc('helpful',lang)}</p><div className="personal-inline">{(['yes','no'] as const).map(value=><button key={value} disabled={Boolean(helpful)} aria-pressed={helpful===value} onClick={()=>vote('helpful',value)}>{pc(value,lang)}</button>)}</div>{p.role==='manager'&&<><p>{pc('work',lang)}</p><div className="personal-inline">{(['yes','no'] as const).map(value=><button key={value} disabled={Boolean(work)} aria-pressed={work===value} onClick={()=>vote('work',value)}>{pc(value==='yes'?'workYes':'workNo',lang)}</button>)}</div></>}{(helpful||work)&&<small role="status">{pc('thanks',lang)}</small>}</div>;
}
function Briefing({p,lang}:{p:PersonalPreferences;lang:PersonalLang}) {
  const today=useLiveSummary();
  const date=today?.todayKst ? briefingDate(today.todayKst,p.day) : null;
  const summary=useLiveSummary(p.day!=='today'?date:null);
  const {cards,actions}=buildPersonalBrief(summary,p,date??'',lang);
  const viewed=useRef('');
  const identity=JSON.stringify([date,p.role,p.location,p.terminal,p.day,p.interests,lang]);
  useEffect(()=>{
    if(date&&summary?.serviceDateKst===date&&viewed.current!==identity){viewed.current=identity;trackPersonalEvent('briefing_viewed',{...p,language:lang});}
  },[date,summary,identity,p,lang]);
  const title=p.day==='yesterday'?'yesterday':p.role==='manager'?(p.day==='today'?'managerToday':'managerTomorrow'):p.role==='guide'?(p.day==='today'?'guideToday':'guideTomorrow'):p.day;
  const href=`/${lang}/${p.location}`;
  return <section className="personal-sheet" data-testid="personal-briefing" aria-labelledby="personal-title"><p className="personal-kicker">KORETAIL · {pc(p.role,lang)}</p><h2 id="personal-title">{pc(title,lang)}</h2><p className="personal-place">{pc(p.location,lang)}{p.location==='airport'?` ${terminalName(p.terminal,lang)}`:''} · {date ?? '…'}</p><small className="personal-timezone">{pc('timeBasis',lang)}</small><p>{pc(p.day==='yesterday'?'pastNote':`${p.role}Promise`,lang)}</p>
    {p.day==='yesterday'&&p.location!=='airport'&&<p className="personal-note">{pc('pastSeoulNote',lang)}</p>}
    {!p.interests.length?<p>{pc('noLocalInterests',lang)}</p>:!date||!summary?<LiveLoadMessage loading={today===undefined||summary===undefined} lang={lang}/>:<>
      {p.location==='airport'&&p.terminal!=='CONCOURSE'&&(p.interests.includes('passengers')||p.interests.includes('crowding'))&&summary.mode==='live-summary'&&summary.serviceDateKst===date&&summary.airport?.serviceDateKst===date
        ? <AirportAtAGlance summary={summary} lang={lang} terminal={p.terminal} showPassengers={p.interests.includes('passengers')} showCrowding={p.interests.includes('crowding')} showFlights={p.interests.includes('flights')}/>
        : p.location!=='airport'&&p.interests.includes('passengers')&&p.interests.includes('crowding')
          ? <AreaCurrentBrief lang={lang} area={p.location} date={p.day==='today'?null:date}/>
          : null}
      <div className="personal-facts">{p.interests.map(interest=>{const card=cards.find(c=>c.interest===interest);return <article key={interest} data-interest={interest}><h3>{card?.label??pc(interest,lang)}</h3><strong>{card?.value??'—'}</strong>{card?.details?.map(line=><div className="personal-fact-detail" key={line}>{line}</div>)}<p>{card?.note??(interest==='flights'?pc('flightsMissing',lang):interest==='airlines'?pc('airlinesMissing',lang):p.terminal==='CONCOURSE'&&interest==='passengers'?pc('concourseNote',lang):pc('missing',lang))}</p>{card?.at&&<small>{referenceTime(card.at,lang)}</small>}{interest==='guidance'&&<a href={`/${lang}/tourism-desk/${p.location}`}>{pc('details',lang)}</a>}</article>;})}</div>
      {actions.length>0&&<div className="personal-preparation"><h3>{pc('prepare',lang)}</h3><ul>{actions.map(action=><li key={action}>{action}</li>)}</ul></div>}
      <a className="personal-detail-link" href={href}>{pc('details',lang)} → {pc(p.location,lang)}</a><Feedback p={p} date={date} lang={lang}/>
    </>}
  </section>;
}
function SelectedBriefing({p,lang}:{p:PersonalPreferences;lang:PersonalLang}) {
  const [location,setLocation]=useState(p.location);
  const [day,setDay]=useState(p.day);
  const [terminal,setTerminal]=useState(p.terminal);
  const places=p.selectedLocations??[p.location], dates=p.selectedDays??[p.day], scopes=p.selectedTerminals??[p.terminal];
  const place=places.includes(location)?location:p.location, date=dates.includes(day)?day:p.day, scope=scopes.includes(terminal)?terminal:p.terminal;
  const available=p.interests.filter(i=>availableInterests(place).includes(i));
  return <><nav className="personal-switches" aria-label={pc('switchBriefing',lang)}>
    <p>{pc('switchBriefing',lang)}</p>
    <div className="personal-inline">{places.map(v=><button key={v} data-view-location={v} aria-pressed={place===v} onClick={()=>setLocation(v)}>{pc(v,lang)}</button>)}</div>
    {place==='airport'&&<div className="personal-inline">{scopes.map(v=><button key={v} data-view-terminal={v} aria-pressed={scope===v} onClick={()=>setTerminal(v)}>{terminalName(v,lang)}</button>)}</div>}
    <div className="date-nav-shortcuts personal-day-switches" role="group" aria-label={pc('preference',lang)}>{days.filter(v=>dates.includes(v)).map(v=><button key={v} data-view-day={v} aria-pressed={date===v} onClick={()=>setDay(v)}>{dateNavText[v][lang]}</button>)}</div>
  </nav><Briefing p={{...p,location:place,day:date,terminal:scope,interests:available}} lang={lang}/></>;
}
export default function PersonalHome({lang,children,openRequest=0}:{lang:PersonalLang;children:ReactNode;openRequest?:number}) {
  const {ready,preferences:p,storageFailed}=usePersonalPreferences();
  const [editing,setEditing]=useState(false);
  const [publicOpen,setPublicOpen]=useState(false);
  const panel=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!openRequest||!ready)return;
    const timer=window.setTimeout(()=>{setPublicOpen(false);panel.current?.scrollIntoView({block:"start",behavior:"instant"});},0);
    return()=>window.clearTimeout(timer);
  },[openRequest,ready]);
  useEffect(()=>{if(ready)setAnalyticsConsent(p?.analytics??false);},[ready,p?.analytics]);
  if(!ready)return <div className="personal-loading"><header className="personal-heading"><h1>{pc('myBriefing',lang)}</h1></header><LiveLoadMessage loading lang={lang}/></div>;
  return <>
    <div ref={panel} className="personal-home">
    <header className="personal-heading"><h1>{pc('myBriefing',lang)}</h1>{p&&!editing&&<button onClick={()=>setEditing(true)}>{pc('edit',lang)}</button>}</header>
    {(!p||editing)?<Setup lang={lang} initial={p} onCancel={()=>{setEditing(false);setAnalyticsConsent(p?.analytics??false);}} onDone={()=>setEditing(false)}/>:<SelectedBriefing key={JSON.stringify(p)} p={p} lang={lang}/>}
    {storageFailed&&<p role="status">{pc('storageError',lang)}</p>}
    {p&&!editing&&<details className="personal-settings"><summary>{pc('settings',lang)}</summary><p>{pc(p.role,lang)} · {(p.selectedLocations??[p.location]).map(v=>pc(v,lang)).join(' · ')} · {(p.selectedTerminals??[p.terminal]).map(v=>terminalName(v,lang)).join(' · ')} · {(p.selectedDays??[p.day]).map(v=>pc(v,lang)).join(' · ')}</p><p>{p.interests.map(i=>pc(i,lang)).join(' · ')}</p><p>{pc('remembered',lang)}</p><p>{pc('storageNote',lang)}</p><div className="personal-inline"><button onClick={()=>{savePersonalPreferences(null);setAnalyticsConsent(false);}}>{pc('reset',lang)}</button></div><AnalyticsChoice lang={lang} value={p.analytics} onChange={value=>{savePersonalPreferences({...p,analytics:value});setAnalyticsConsent(value);}}/><p>{pc('install',lang)}</p><p>{pc('push',lang)}</p><small>{pc('pushNote',lang)}</small></details>}
    </div>
    <details className="personal-existing" open={publicOpen} onToggle={event=>setPublicOpen(event.currentTarget.open)}><summary>{pc('existing',lang)}</summary>{publicOpen&&children}</details>
  </>;
}
