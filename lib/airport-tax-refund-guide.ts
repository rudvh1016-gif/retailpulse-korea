/** Pending official review: structure only, no unverified passenger instructions. */
export interface AirportTaxRefundEvidence {
 officialUrl:string;
 sourceUpdatedOn:string|null;
 checkedAt:string;
}
export interface AirportTaxRefundLocation {
 terminal:'T1'|'T2';
 process:'CUSTOMS_EXPORT_CONFIRMATION'|'REFUND_COLLECTION';
 securitySide:'BEFORE_SECURITY'|'AFTER_SECURITY';
 location:string;
 operatingHours:string|null;
 evidence:AirportTaxRefundEvidence;
}
export interface AirportTaxRefundStep {
 process:'CUSTOMS_EXPORT_CONFIRMATION'|'REFUND_COLLECTION';
 baggage:'CHECKED_BAGGAGE'|'CARRY_ON'|'EITHER';
 securitySide:'BEFORE_SECURITY'|'AFTER_SECURITY';
 instruction:string;
 evidence:AirportTaxRefundEvidence;
}
export interface AirportTaxRefundGuide {
 terminal:'T1'|'T2';
 locations:readonly AirportTaxRefundLocation[];
 steps:readonly AirportTaxRefundStep[];
 eligibility:{instruction:string;evidence:AirportTaxRefundEvidence}|null;
 visual:{asset:string;conceptOnly:true;officialLocationOverlay:false}|null;
}
// Keep passenger UI absent until official locations, procedure and evidence arrive.
export const airportTaxRefundGuides:readonly AirportTaxRefundGuide[]=[];
