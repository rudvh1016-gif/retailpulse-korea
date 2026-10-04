'use client';
import {useState} from 'react';
import type {Lang} from './retailpulse-data';
import {departurePreparation,departurePreparationEvidence,type DeparturePreparationInput,type DepartureStepId,type DepartureRoute,type DepartureChoice} from '../lib/airport-departure-preparation';
import {departurePreparationCopy} from './airport-departure-preparation-copy';
import {AirportTaxRefundGuide} from './airport-tax-refund-guide';

export function AirportDeparturePreparation({lang}:{lang:Lang}) {
 const [open,setOpen]=useState(false),[input,setInput]=useState<DeparturePreparationInput>({route:'UNKNOWN',checkedBaggage:'UNKNOWN',taxRefund:'UNKNOWN',dutyFreePickup:'UNKNOWN'});
 const c=departurePreparationCopy[lang],plan=departurePreparation(input);
 const update=(key:keyof DeparturePreparationInput,value:DepartureRoute|DepartureChoice)=>setInput(current=>({...current,[key]:value}));
 const stepText:Record<DepartureStepId,string>={CONFIRM:c.confirm,CHECK_IN:c.checkin,CHECK_IN_TAX:c.checkinTax,CHECKED_CUSTOMS:c.checkedCustoms,BAG_DROP:c.drop,SECURITY:c.securityStep,IMMIGRATION:c.immigration,REFUND:c.refund,PICKUP:c.pickupStep,GATE:c.gate};
 return <details id="airport-departure-preparation" className="airport-departure-preparation" data-testid="departure-preparation" onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary>{c.title}</summary>{open&&<div className="departure-preparation-body">
   <p className="prep-note">{c.scope}</p><p>{c.intro}</p>
   <div className="departure-preparation-inputs"><label>{c.route}<select value={input.route} data-testid="prep-route" onChange={event=>update('route',event.target.value as DepartureRoute)}><option value="UNKNOWN">{c.unknown}</option><option value="T1">{c.t1}</option><option value="T2">{c.t2}</option><option value="T1_CONCOURSE">{c.concourse}</option></select></label>
    {(['checkedBaggage','taxRefund','dutyFreePickup'] as const).map(key=><label key={key}>{({checkedBaggage:c.baggage,taxRefund:c.tax,dutyFreePickup:c.pickup})[key]}<select value={input[key]} data-testid={`prep-${key}`} onChange={event=>update(key,event.target.value as DepartureChoice)}><option value="UNKNOWN">{c.unknown}</option><option value="YES">{c.yes}</option><option value="NO">{c.no}</option></select></label>)}
   </div>
   {!plan.supported?<p data-testid="prep-unknown-route">{c.unknownRoute} <a href={departurePreparationEvidence.AIRPORT.url} target="_blank" rel="noreferrer">{c.official}</a></p>:<>
    {plan.unknown.length>0&&<p data-testid="prep-unknown-choices">{c.unknownNote}</p>}
    {input.route==='T1_CONCOURSE'&&<p data-testid="prep-concourse-note">{c.concourseNote}</p>}
    <div className="departure-preparation-plan" data-testid="prep-plan">
     {(['BEFORE_SECURITY','SECURITY','AFTER_SECURITY'] as const).map(phase=><section key={phase} data-phase={phase}><h3>{({BEFORE_SECURITY:c.before,SECURITY:c.security,AFTER_SECURITY:c.after})[phase]}</h3><ol>{plan.steps.filter(step=>step.phase===phase).map(step=><li key={step.id} data-step={step.id} data-conditional={step.conditional||undefined}><p>{stepText[step.id]}</p><a href={departurePreparationEvidence[step.source].url} target="_blank" rel="noreferrer">{c.official} ↗</a></li>)}</ol></section>)}
    </div>
    {input.taxRefund==='YES'&&<><p className="departure-customs-directed" data-testid="prep-carry-customs">{c.carryNote}</p><AirportTaxRefundGuide lang={lang} terminal={input.route==='T2'?'T2':input.route==='T1_CONCOURSE'?'CONCOURSE':'T1'}/></>}
   </>}
   <p className="prep-note" data-testid="prep-limits">{c.limits}</p><p className="prep-note">{c.checked}</p>
  </div>}
 </details>;
}
