import type {Lang} from '../app/retailpulse-data';
import type {BriefHoliday} from './holiday-flight-brief';
import {returnPlanningText} from './holiday-flight-brief';
import translations from './brief-holiday-translations.json';

/** Presentation only: preserve Korean copy and canonical country keys used for joins. */
export function briefText(lang:Lang,ko:string,en:string,zh:string){return lang==='en'?en:lang==='zh'?zh:ko;}
export function briefCountryName(country:string,label:string,lang:Lang){
 if(lang!=='en'&&lang!=='zh')return label;
 const code=label==='괌'?'GU':label==='사이판'?'MP':country;
 if(label==='하와이')return lang==='en'?'Hawaii':'夏威夷';
 if(label==='사이판')return lang==='en'?'Saipan':'塞班岛';
 if(!/^[A-Z]{2}$/.test(code))return label;
 return new Intl.DisplayNames([lang==='zh'?'zh-CN':'en'],{type:'region'}).of(code)??label;
}
export function briefHolidayText(value:string,lang:Lang){
 if(lang!=='en'&&lang!=='zh')return value;
 // Unknown source wording remains intact; never invent a holiday or widen its scope.
 return (translations as Record<string,{en:string;zh:string}>)[value]?.[lang]??value;
}
export function briefHoliday(event:BriefHoliday,lang:Lang){return {
 name:briefHolidayText(event.name,lang),
 country:briefCountryName(event.country,event.countryLabel,lang),
 scope:briefHolidayText(event.scope,lang),
 meaning:briefHolidayText(event.meaning_ko||event.scope,lang),
};}
export function briefReturnText(event:BriefHoliday,lang:Lang){
 if(lang!=='en'&&lang!=='zh')return returnPlanningText(event);
 const label=briefHoliday(event,lang),end=`${Number(event.end.slice(5,7))}/${Number(event.end.slice(8))}`;
 return lang==='en'?`${end}: ${label.name} ends · Return planning: check Incheon → ${label.country} departures`:`${end} ${label.name}结束 · 返程准备：确认仁川→${label.country}出发航班`;
}
