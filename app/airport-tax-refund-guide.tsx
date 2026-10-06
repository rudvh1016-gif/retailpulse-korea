'use client';
import {useState} from 'react';
import type {Lang,Terminal} from './retailpulse-data';
import {airportTaxRefundLocations,taxRefundEvidence,taxRefundVisuals,type TaxTerminal,type TaxSource} from '../lib/airport-tax-refund-guide';
import {taxRefundCopy} from './airport-tax-refund-copy';
import {PassengerGuideImage} from './passenger-guide-image';

export function AirportTaxRefundGuide({lang,terminal}:{lang:Lang;terminal:Terminal|'CONCOURSE'}) {
 const [open,setOpen]=useState(false);const c=taxRefundCopy[lang]??taxRefundCopy.en;
 return <details className="airport-tax-refund" data-testid="tax-refund-guide" onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary>{c.title}</summary>{open&&<TaxRefundBody key={terminal} lang={lang} terminal={terminal}/>}
 </details>;
}
function TaxRefundBody({lang,terminal}:{lang:Lang;terminal:Terminal|'CONCOURSE'}) {
 const [selected,setSelected]=useState<TaxTerminal>(terminal==='all'?'T1':terminal);
 const [phase,setPhase]=useState<'BEFORE_SECURITY'|'AFTER_SECURITY'>('BEFORE_SECURITY');
 const [baggage,setBaggage]=useState<'CHECKED'|'CARRY'>('CHECKED');const c=taxRefundCopy[lang]??taxRefundCopy.en;
 const sourceName=(source:TaxSource)=>({CUSTOMS:c.customs,AIRPORT_GUIDE:c.airportGuide,AIRPORT_FACILITIES:c.facilities,KTO:c.kto})[source];
 const rows=airportTaxRefundLocations.filter(row=>row.terminal===selected&&row.securitySide===phase);
 const image=(asset:string)=><img src={asset} alt="" width={taxRefundVisuals.width} height={taxRefundVisuals.height} loading="lazy" decoding="async"/>;
 return <div className="tax-refund-body" data-terminal={selected}>
  <p>{c.intro}</p>
  <label>{c.terminal} <select value={selected} onChange={event=>setSelected(event.target.value as TaxTerminal)}><option value="T1">T1</option><option value="T2">T2</option><option value="CONCOURSE">{c.concourse}</option></select></label>
  <div className="tax-refund-procedure">
   <section data-step="PREPARE">{image(taxRefundVisuals.prepare)}<h3>{c.prepare}</h3><p>{c.documents}</p></section>
   <section data-step="KIOSK_REGISTRATION"><PassengerGuideImage asset="refund_register"/><h3>{c.register}</h3><p>{c.registration}</p></section>
   <section className="tax-refund-inspection" data-step="CONDITIONAL_INSPECTION">{image(taxRefundVisuals.inspect)}<h3>{c.inspection}</h3>
    <div className="tax-refund-tabs">{(['CHECKED','CARRY'] as const).map(item=><button key={item} aria-pressed={baggage===item} onClick={()=>setBaggage(item)}>{item==='CHECKED'?c.checked:c.carry}</button>)}</div>
    <p data-testid="tax-baggage-note">{baggage==='CHECKED'?c.checkedNote:c.carryNote}</p>
   </section>
   <p className="tax-refund-security" data-testid="tax-security-step">{c.security}</p>
   <section data-step="REFUND_COLLECTION"><PassengerGuideImage asset="refund_receive"/><h3>{c.refund}</h3><p>{c.refundNote}</p></section>
  </div>
  <p className="prep-note">{c.concept}</p><h3>{c.where}</h3>
  <div className="tax-refund-tabs">{(['BEFORE_SECURITY','AFTER_SECURITY'] as const).map(item=><button key={item} aria-pressed={phase===item} onClick={()=>setPhase(item)}>{item==='BEFORE_SECURITY'?c.before:c.after}</button>)}</div>
  <div className="tax-refund-locations" data-testid="tax-locations" data-phase={phase}>
   {selected==='T2'&&phase==='AFTER_SECURITY'?<><p role="note" data-testid="tax-t2-conflict">{c.conflict}</p><details><summary>{c.sourceDetails}</summary>{rows.map(row=><p key={row.source} data-source={row.source}>{sourceName(row.source)} · {row.source==='AIRPORT_GUIDE'?c.across:`${c.gate} ${row.points.join(', ')}`} · {c.desk}: {row.deskHours??c.unknownHours} · {c.kiosk}: {row.kioskHours??c.unknownHours} <a href={taxRefundEvidence[row.source].officialUrl} target="_blank" rel="noreferrer">↗ {sourceName(row.source)}</a></p>)}</details></>
   :rows.length?rows.map(row=><p key={row.source} data-source={row.source}>{row.location==='CENTRAL_PHARMACY'?c.pharmacy:`${row.location==='CHECK_IN'?c.checkin:c.gate} ${row.points.join(', ')}`} · {row.deskHours&&<>{c.desk} {row.conflicting?c.unknownHours:row.deskHours} · </>}{c.kiosk} {row.kioskHours??c.unknownHours} <a href={taxRefundEvidence[row.source].officialUrl} target="_blank" rel="noreferrer">↗ {sourceName(row.source)}</a></p>):<p>{c.noneBefore}</p>}
  </div>
  <p className="prep-note">{c.hoursNote}</p>
  <details><summary>{c.eligibility}</summary><p>{c.eligibilityNote}</p><p>{c.immediate}</p><a href={taxRefundEvidence.CUSTOMS.officialUrl} target="_blank" rel="noreferrer">{c.customs}</a> · <a href={taxRefundEvidence.KTO.officialUrl} target="_blank" rel="noreferrer">{c.kto}</a></details>
  <details><summary>{c.sources}</summary><p>{c.checkedAt}: <time dateTime="2026-10-04">2026-10-04</time> · {c.updated}</p>{(Object.keys(taxRefundEvidence) as TaxSource[]).map(source=><p key={source}><a href={taxRefundEvidence[source].officialUrl} target="_blank" rel="noreferrer">{sourceName(source)}</a></p>)}</details>
 </div>;
}
