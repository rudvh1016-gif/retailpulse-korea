'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { availableInterests, buildPersonalBrief, locations, nextDay, recommendedPreferences, roles, terminals, type PersonalPreferences } from '../lib/personal-briefing';
import { pc, type PersonalLang } from '../lib/personal-copy';
import { setAnalyticsConsent, trackPersonalEvent } from '../lib/personal-analytics';
import { rememberFeedback, savePersonalPreferences, useFeedback, usePersonalPreferences } from './personal-preferences';
import { LiveLoadMessage, useLiveSummary } from './live-signals';

function terminalName(value: PersonalPreferences['terminal'],lang:PersonalLang) {return value === 'T1'||value==='T2'?value:pc(value,lang);}
function referenceTime(value:string,lang:PersonalLang) {
  const date=new Date(value);
  return Number.isFinite(date.getTime())?`${new Intl.DateTimeFormat(lang==='zh'?'zh-CN':lang,{timeZone:'Asia/Seoul',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(date)} KST`:value;
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
  const titles=['role','location','interests','preference'] as const;
  return <section className="personal-sheet personal-setup" data-testid="personal-onboarding" aria-labelledby="personal-setup-title">
    <p className="personal-kicker">KORETAIL · {step+1} / 4</p>
    <h2 ref={heading} tabIndex={-1} id="personal-setup-title">{pc(titles[step],lang)}</h2>
    <div className="personal-progress" aria-hidden="true">{titles.map((title,i)=><span key={title} className={i<=step?'complete':''}/>)}</div>
    {step===0&&<><p>{pc('promise',lang)}</p><div className="personal-options">{roles.map(role=><button type="button" key={role} aria-pressed={p.role===role} data-role={role} onClick={()=>setP({...recommendedPreferences(role,p.location),terminal:p.terminal,analytics:p.analytics})}><strong>{pc(role,lang)}</strong><span>{pc(`${role}Note`,lang)}</span></button>)}</div><AnalyticsChoice value={p.analytics} onChange={consent} lang={lang}/></>}
    {step===1&&<><div className="personal-options">{locations.map(location=><button key={location} data-location={location} aria-pressed={p.location===location} onClick={()=>setP({...recommendedPreferences(p.role,location),terminal:p.terminal,analytics:p.analytics,day:p.day})}>{pc(location,lang)}</button>)}</div>{p.location==='airport'&&<div className="personal-inline" aria-label={pc('airport',lang)}>{terminals.map(terminal=><button key={terminal} aria-pressed={p.terminal===terminal} onClick={()=>setP({...p,terminal})}>{terminalName(terminal,lang)}</button>)}</div>}</>}
    {step===2&&<><p>{pc('selectedOnly',lang)}</p><div className="personal-options">{availableInterests(p.location).map(interest=><label key={interest}><input type="checkbox" checked={p.interests.includes(interest)} onChange={e=>setP({...p,interests:e.target.checked?[...p.interests,interest]:p.interests.filter(i=>i!==interest)})}/>{pc(interest,lang)}</label>)}</div></>}
    {step===3&&<><p>{pc(`${p.role}Promise`,lang)}</p><div className="personal-options">{(['today','tomorrow'] as const).map(day=><button key={day} data-day={day} aria-pressed={p.day===day} onClick={()=>setP({...p,day})}>{pc(day,lang)}</button>)}</div><p>{pc('remembered',lang)}</p><p className="personal-note">{pc('storageNote',lang)}</p></>}
    <div className="personal-actions">{step>0&&<button onClick={()=>setStep(step-1)}>{pc('back',lang)}</button>}{initial&&<button onClick={onCancel}>{pc('cancel',lang)}</button>}<button className="personal-primary" disabled={step===2&&!p.interests.length} onClick={advance}>{pc(step===3?'finish':'next',lang)}</button></div>
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
  const date=today?.todayKst ? (p.day==='tomorrow'?nextDay(today.todayKst):today.todayKst) : null;
  const summary=useLiveSummary(p.day==='tomorrow'?date:null);
  const {cards,actions}=buildPersonalBrief(summary,p,date??'',lang);
  const viewed=useRef('');
  const identity=JSON.stringify([date,p.role,p.location,p.terminal,p.day,p.interests,lang]);
  useEffect(()=>{
    if(date&&summary?.serviceDateKst===date&&viewed.current!==identity){viewed.current=identity;trackPersonalEvent('briefing_viewed',{...p,language:lang});}
  },[date,summary,identity,p,lang]);
  const title=p.role==='manager'?(p.day==='today'?'managerToday':'managerTomorrow'):p.role==='guide'?(p.day==='today'?'guideToday':'guideTomorrow'):p.day;
  const href=`/${lang}/${p.location}`;
  return <section className="personal-sheet" data-testid="personal-briefing" aria-labelledby="personal-title"><p className="personal-kicker">KORETAIL · {pc(p.role,lang)}</p><h2 id="personal-title">{pc(title,lang)}</h2><p className="personal-place">{pc(p.location,lang)}{p.location==='airport'?` ${terminalName(p.terminal,lang)}`:''} · {date ?? '…'} · KST</p><p>{pc(`${p.role}Promise`,lang)}</p>
    {!date||!summary?<LiveLoadMessage loading={today===undefined||summary===undefined} lang={lang}/>:<>
      <p className="personal-summary">{cards.find(c=>c.interest!=='guidance')?`${cards.find(c=>c.interest!=='guidance')!.label} · ${cards.find(c=>c.interest!=='guidance')!.value}`:pc('empty',lang)}</p>
      <div className="personal-facts">{p.interests.map(interest=>{const card=cards.find(c=>c.interest===interest);return <article key={interest}><h3>{card?.label??pc(interest,lang)}</h3><strong>{card?.value??'—'}</strong><p>{card?.note??(p.terminal==='CONCOURSE'&&interest==='passengers'?pc('concourseNote',lang):pc('missing',lang))}</p>{card?.at&&<small>{referenceTime(card.at,lang)}</small>}{interest==='guidance'&&<a href={`/${lang}/tourism-desk/${p.location}`}>{pc('details',lang)}</a>}</article>;})}</div>
      {actions.length>0&&<div className="personal-preparation"><h3>{pc('prepare',lang)}</h3><ul>{actions.map(action=><li key={action}>{action}</li>)}</ul></div>}
      <a className="personal-detail-link" href={href}>{pc('details',lang)} → {pc(p.location,lang)}</a><Feedback p={p} date={date} lang={lang}/>
    </>}
  </section>;
}
export default function PersonalHome({lang,children}:{lang:PersonalLang;children:ReactNode}) {
  const {ready,preferences:p,storageFailed}=usePersonalPreferences();
  const [editing,setEditing]=useState(false);
  useEffect(()=>{if(ready)setAnalyticsConsent(p?.analytics??false);},[ready,p?.analytics]);
  if(!ready)return <>{children}</>;
  return <div className="personal-home">
    {(!p||editing)?<Setup lang={lang} initial={p} onCancel={()=>{setEditing(false);setAnalyticsConsent(p?.analytics??false);}} onDone={()=>setEditing(false)}/>:<Briefing p={p} lang={lang}/>}
    {storageFailed&&<p role="status">{pc('storageError',lang)}</p>}
    {p&&!editing&&<details className="personal-settings"><summary>{pc('settings',lang)}</summary><p>{pc(p.role,lang)} · {pc(p.location,lang)} {p.location==='airport'?terminalName(p.terminal,lang):''} · {pc(p.day,lang)}</p><p>{p.interests.map(i=>pc(i,lang)).join(' · ')}</p><p>{pc('remembered',lang)}</p><p>{pc('storageNote',lang)}</p><div className="personal-inline"><button onClick={()=>setEditing(true)}>{pc('edit',lang)}</button><button onClick={()=>{savePersonalPreferences(null);setAnalyticsConsent(false);}}>{pc('reset',lang)}</button></div><AnalyticsChoice lang={lang} value={p.analytics} onChange={value=>{savePersonalPreferences({...p,analytics:value});setAnalyticsConsent(value);}}/><p>{pc('install',lang)}</p><p>{pc('push',lang)}</p><small>{pc('pushNote',lang)}</small></details>}
    {p?<details className="personal-existing"><summary>{pc('existing',lang)}</summary>{children}</details>:children}
  </div>;
}
