export type DepartureRoute='T1'|'T2'|'T1_CONCOURSE'|'UNKNOWN';
export type DepartureChoice='YES'|'NO'|'UNKNOWN';
export interface DeparturePreparationInput {route:DepartureRoute;checkedBaggage:DepartureChoice;taxRefund:DepartureChoice;dutyFreePickup:DepartureChoice;}
export type DepartureStepId='CONFIRM'|'CHECK_IN'|'CHECK_IN_TAX'|'CHECKED_CUSTOMS'|'BAG_DROP'|'SECURITY'|'IMMIGRATION'|'REFUND'|'PICKUP'|'GATE';
export interface DeparturePreparationStep {id:DepartureStepId;phase:'BEFORE_SECURITY'|'SECURITY'|'AFTER_SECURITY';conditional:boolean;source:'AIRPORT'|'CUSTOMS'|'REFUND'|'DUTY_FREE';}
export const departurePreparationEvidence={
 AIRPORT:{url:'https://www.airport.kr/ap_en/1413/subview.do',checkedAt:'2026-10-04',sourceUpdatedOn:null},
 CUSTOMS:{url:'https://www.customs.go.kr/incheon_airport/cm/cntnts/cntntsView.do?cntntsId=6688&mi=12546',checkedAt:'2026-10-04',sourceUpdatedOn:null},
 REFUND:{url:'https://www.airport.kr/ap_en/1425/subview.do',checkedAt:'2026-10-04',sourceUpdatedOn:null},
 DUTY_FREE:{url:'https://www.airport.kr/ap_en/1531/subview.do',checkedAt:'2026-10-04',sourceUpdatedOn:null},
} as const;
/** International departure general case only. No estimated times or eligibility inference. */
export function departurePreparation(input:DeparturePreparationInput) {
 const steps:DeparturePreparationStep[]=[{id:'CONFIRM',phase:'BEFORE_SECURITY',conditional:false,source:'AIRPORT'}];
 if(input.route==='UNKNOWN')return {supported:false,steps,unknown:[] as (keyof DeparturePreparationInput)[]};
 const unknown=(['checkedBaggage','taxRefund','dutyFreePickup'] as const).filter(key=>input[key]==='UNKNOWN');
 steps.push({id:input.taxRefund==='YES'?'CHECK_IN_TAX':'CHECK_IN',phase:'BEFORE_SECURITY',conditional:false,source:input.taxRefund==='YES'?'REFUND':'AIRPORT'});
 // Having a checked bag does NOT establish where the refund goods are packed.
 if(input.taxRefund==='YES'&&input.checkedBaggage!=='NO')steps.push({id:'CHECKED_CUSTOMS',phase:'BEFORE_SECURITY',conditional:true,source:'CUSTOMS'});
 if(input.checkedBaggage==='YES')steps.push({id:'BAG_DROP',phase:'BEFORE_SECURITY',conditional:false,source:'AIRPORT'});
 steps.push({id:'SECURITY',phase:'SECURITY',conditional:false,source:'AIRPORT'},{id:'IMMIGRATION',phase:'SECURITY',conditional:false,source:'AIRPORT'});
 if(input.taxRefund==='YES')steps.push({id:'REFUND',phase:'AFTER_SECURITY',conditional:false,source:'REFUND'});
 if(input.dutyFreePickup==='YES')steps.push({id:'PICKUP',phase:'AFTER_SECURITY',conditional:false,source:'DUTY_FREE'});
 steps.push({id:'GATE',phase:'AFTER_SECURITY',conditional:false,source:'AIRPORT'});
 return {supported:true,steps,unknown};
}
