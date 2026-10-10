'use client';
import {useState} from 'react';
import type {Lang,Terminal} from './retailpulse-data';
import {airportTaxRefundLocations,taxRefundEvidence,taxRefundVisuals,type TaxTerminal,type TaxSource} from '../lib/airport-tax-refund-guide';
import {taxRefundCopy} from './airport-tax-refund-copy';
import {DepartureChoiceGroup} from './departure-choice-group';
import {departureChoiceCopy} from './departure-choice-copy';
import {PassengerGuideImage} from './passenger-guide-image';

export function AirportTaxRefundGuide({lang,terminal,fixedTerminal=false}:{lang:Lang;terminal:Terminal|'CONCOURSE';fixedTerminal?:boolean}) {
 const [open,setOpen]=useState(false);const c=taxRefundCopy[lang]??taxRefundCopy.en;
 return <details className="airport-tax-refund" data-testid="tax-refund-guide" onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary>{c.title}</summary>{open&&<TaxRefundBody key={terminal} lang={lang} terminal={terminal} fixedTerminal={fixedTerminal}/>}
 </details>;
}
function TaxRefundBody({lang,terminal,fixedTerminal=false}:{lang:Lang;terminal:Terminal|'CONCOURSE';fixedTerminal?:boolean}) {
 const [selected,setSelected]=useState<TaxTerminal>(terminal==='all'?'T1':terminal);
 const [phase,setPhase]=useState<'BEFORE_SECURITY'|'AFTER_SECURITY'>('BEFORE_SECURITY');
 const [baggage,setBaggage]=useState<'CHECKED'|'CARRY'>('CHECKED');const c=taxRefundCopy[lang]??taxRefundCopy.en;
 const sourceName=(source:TaxSource)=>({CUSTOMS:c.customs,AIRPORT_GUIDE:c.airportGuide,AIRPORT_FACILITIES:c.facilities,KTO:c.kto})[source];
 const short=departureChoiceCopy(lang);
 const rows=airportTaxRefundLocations.filter(row=>row.terminal===selected&&row.securitySide===phase);
 const image=(asset:string)=><img src={asset} alt="" width={taxRefundVisuals.width} height={taxRefundVisuals.height} loading="lazy" decoding="async"/>;
 return <div className="tax-refund-body" data-terminal={selected}>
  <p>{c.intro}</p>
  {fixedTerminal?<p>{c.terminal} · <strong>{selected==='CONCOURSE'?c.concourse:selected}</strong></p>:<DepartureChoiceGroup label={c.terminal} value={selected} testId="tax-terminal" onChange={setSelected} options={(['T1','T2','CONCOURSE'] as const).map(value=>({value,label:value==='CONCOURSE'?c.concourse:value}))} href={taxRefundEvidence.AIRPORT_GUIDE.officialUrl} linkLabel={c.airportGuide}/>}
  <div className="tax-refund-procedure">
   <section data-step="PREPARE">{image(taxRefundVisuals.prepare)}<h3>{c.prepare}</h3><p>{c.documents}</p></section>
   <section data-step="KIOSK_REGISTRATION"><PassengerGuideImage asset="refund_register"/><h3>{c.register}</h3><p>{c.registration}</p></section>
   <section className="tax-refund-inspection" data-step="CONDITIONAL_INSPECTION">{image(taxRefundVisuals.inspect)}<h3>{c.inspection}</h3>
    <DepartureChoiceGroup label={short.goodsBag} value={baggage} testId="tax-goods-bag" onChange={setBaggage} options={(['CHECKED','CARRY'] as const).map(value=>({value,label:value==='CHECKED'?c.checked:c.carry}))} description={short.packing} href={taxRefundEvidence.CUSTOMS.officialUrl} linkLabel={c.customs}/>
    <p data-testid="tax-baggage-note" role="status">{baggage==='CHECKED'?c.checkedNote:c.carryNote}</p>
   </section>
   <p className="tax-refund-security" data-testid="tax-security-step">{c.security}</p>
   <section data-step="REFUND_COLLECTION"><PassengerGuideImage asset="refund_receive"/><h3>{c.refund}</h3><p>{c.refundNote}</p></section>
  </div>
  <p className="prep-note">{c.concept}</p><h3>{c.where}</h3>
  <DepartureChoiceGroup label={c.where} value={phase} testId="tax-phase" onChange={setPhase} options={(['BEFORE_SECURITY','AFTER_SECURITY'] as const).map(value=>({value,label:value==='BEFORE_SECURITY'?c.before:c.after}))} href={taxRefundEvidence.AIRPORT_GUIDE.officialUrl} linkLabel={c.airportGuide}/>
  <div className="tax-refund-locations" data-testid="tax-locations" data-phase={phase}>
   {selected==='T2'&&phase==='AFTER_SECURITY'?<><p role="note" data-testid="tax-t2-conflict">{c.conflict}</p><details><summary>{c.sourceDetails}</summary>{rows.map(row=><p key={row.source} data-source={row.source}>{sourceName(row.source)} · {row.source==='AIRPORT_GUIDE'?c.across:`${c.gate} ${row.points.join(', ')}`} · {c.desk}: {row.deskHours??c.unknownHours} · {c.kiosk}: {row.kioskHours??c.unknownHours} <a href={taxRefundEvidence[row.source].officialUrl} target="_blank" rel="noreferrer">↗ {sourceName(row.source)}</a></p>)}</details></>
   :rows.length?rows.map(row=><p key={row.source} data-source={row.source}>{row.location==='CENTRAL_PHARMACY'?c.pharmacy:`${row.location==='CHECK_IN'?c.checkin:c.gate} ${row.points.join(', ')}`} · {row.deskHours&&<>{c.desk} {row.conflicting?c.unknownHours:row.deskHours} · </>}{c.kiosk} {row.kioskHours??c.unknownHours} <a href={taxRefundEvidence[row.source].officialUrl} target="_blank" rel="noreferrer">↗ {sourceName(row.source)}</a></p>):<p>{c.noneBefore}</p>}
  </div>
  <p className="prep-note">{c.hoursNote}</p>
  <details><summary>{c.eligibility}</summary><p>{c.eligibilityNote}</p><p>{c.immediate}</p><a href={taxRefundEvidence.CUSTOMS.officialUrl} target="_blank" rel="noreferrer">{c.customs}</a> · <a href={taxRefundEvidence.KTO.officialUrl} target="_blank" rel="noreferrer">{c.kto}</a></details>
  <details><summary>{c.sources}</summary><p>{c.checkedAt}: <time dateTime="2026-10-04">2026-10-04</time> · {c.updated}</p>{(Object.keys(taxRefundEvidence) as TaxSource[]).map(source=><p key={source}><a href={taxRefundEvidence[source].officialUrl} target="_blank" rel="noreferrer">{sourceName(source)}</a></p>)}</details>
 </div>;
}
