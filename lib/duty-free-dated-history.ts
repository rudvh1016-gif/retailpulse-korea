import {kstExchangeDate,shiftExchangeDate} from './duty-free-exchange';
export const DUTY_FREE_HISTORY_START='2026-09-01';
export const DUTY_FREE_HISTORY_MAX_DAYS=185;
export function dutyFreeHistoryRange(input:{start?:string|null;end?:string|null},now:Date){
 const today=kstExchangeDate(now.getTime());if(!today)throw Error('INVALID_DATE');
 const start=input.start??DUTY_FREE_HISTORY_START,end=input.end??today;
 const valid=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&shiftExchangeDate(date,0)===date&&Number.isFinite(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;
 if(!valid(start)||!valid(end)||start<DUTY_FREE_HISTORY_START||start>end||end>today)throw Error('INVALID_RANGE');
 const expectedDays=1+(Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000;
 if(expectedDays>DUTY_FREE_HISTORY_MAX_DAYS)throw Error('RANGE_TOO_LONG');
 return {start,end,today,expectedDays};
}
export type DutyFreeDatedDay={date:string;krwPerUsd:number;kind:'STORED_OBSERVATION'|'ARCHIVED_OBSERVATION';verifiedAt:string;dateEvidence:string;archiveSources?:{capturedAt:string;sourceUrl:string;archiveUrl:string;sha256:string;dateEvidence:string}[]};
export type DutyFreeDatedHistory={vendor:'shilla';currency:'USD';scope:'INTERNET_SHOP';sourceUrl:string;asOfDateKst:string;generatedAt:string;start:string;end:string;expectedDays:number;observedDays:number;missingDates:string[];status:'COMPLETE'|'PARTIAL'|'MISSING';fullDayApplicabilityVerified:false;days:DutyFreeDatedDay[]};
