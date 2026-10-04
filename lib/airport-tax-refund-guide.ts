/** Reviewed public guidance, not a live queue, geolocation or eligibility decision. */
export type TaxTerminal='T1'|'T2'|'CONCOURSE';
export type TaxSource='CUSTOMS'|'AIRPORT_GUIDE'|'AIRPORT_FACILITIES'|'KTO';
export const taxRefundEvidence={
 CUSTOMS:{officialUrl:'https://customs.go.kr/incheon_airport/cm/cntnts/cntntsView.do?cntntsId=6688&mi=12547',sourceUpdatedOn:null,checkedAt:'2026-10-04T17:26:19Z'},
 AIRPORT_GUIDE:{officialUrl:'https://www.airport.kr/ap_ko/898/subview.do',sourceUpdatedOn:null,checkedAt:'2026-10-04T17:26:19Z'},
 AIRPORT_FACILITIES:{officialUrl:'https://www.airport.kr/ap_en/1546/subview.do',sourceUpdatedOn:null,checkedAt:'2026-10-04T01:56:01Z'},
 KTO:{officialUrl:'https://english.visitkorea.or.kr/svc/contents/contentsView.do?menuSn=489&vcontsId=248765',sourceUpdatedOn:null,checkedAt:'2026-10-04T01:56:01Z'},
} as const;
export interface AirportTaxRefundLocation {
 terminal:TaxTerminal;process:'KIOSK_REGISTRATION'|'REFUND_COLLECTION';
 securitySide:'BEFORE_SECURITY'|'AFTER_SECURITY';
 location:'CHECK_IN'|'GATES'|'CENTRAL_PHARMACY';points:readonly string[];
 source:TaxSource;deskHours:string|null;kioskHours:string|null;conflicting:boolean;
}
export const airportTaxRefundLocations:readonly AirportTaxRefundLocation[]=[
 {terminal:'T1',process:'KIOSK_REGISTRATION',securitySide:'BEFORE_SECURITY',location:'CHECK_IN',points:['B','D','J','L'],source:'AIRPORT_FACILITIES',deskHours:null,kioskHours:'24h',conflicting:false},
 {terminal:'T1',process:'REFUND_COLLECTION',securitySide:'AFTER_SECURITY',location:'GATES',points:['28'],source:'AIRPORT_GUIDE',deskHours:'07:00–22:00',kioskHours:'24h',conflicting:true},
 {terminal:'T2',process:'KIOSK_REGISTRATION',securitySide:'BEFORE_SECURITY',location:'CHECK_IN',points:['F','G'],source:'AIRPORT_FACILITIES',deskHours:null,kioskHours:'24h',conflicting:false},
 {terminal:'T2',process:'REFUND_COLLECTION',securitySide:'AFTER_SECURITY',location:'GATES',points:['253','250'],source:'AIRPORT_GUIDE',deskHours:'07:00–21:30',kioskHours:'24h',conflicting:true},
 {terminal:'T2',process:'REFUND_COLLECTION',securitySide:'AFTER_SECURITY',location:'GATES',points:['249','270'],source:'AIRPORT_FACILITIES',deskHours:null,kioskHours:null,conflicting:true},
 {terminal:'T2',process:'REFUND_COLLECTION',securitySide:'AFTER_SECURITY',location:'GATES',points:['225','249','274'],source:'KTO',deskHours:'07:30–21:30',kioskHours:'24h',conflicting:true},
 {terminal:'CONCOURSE',process:'REFUND_COLLECTION',securitySide:'AFTER_SECURITY',location:'CENTRAL_PHARMACY',points:[],source:'AIRPORT_GUIDE',deskHours:null,kioskHours:'24h',conflicting:false},
];
// Versioned, swappable illustrations explain procedure, never airport positions.
export const taxRefundVisuals={version:'v2',width:1200,height:760,conceptOnly:true,officialLocationOverlay:false,
 prepare:'/tax-refund/v2/PREPARE.webp',register:'/tax-refund/v2/KIOSK_REGISTRATION.webp',inspect:'/tax-refund/v2/CONDITIONAL_INSPECTION.webp',refund:'/tax-refund/v2/REFUND_COUNTER.webp'} as const;
