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
export function briefReturnText(event:BriefHoliday,lang:Lang,compact=false){
 if(compact){
  const country=briefCountryName(event.country,event.countryLabel,lang),end=`${Number(event.end.slice(5,7))}/${Number(event.end.slice(8))}`;
  const code=event.countryLabel==='괌'?'GU':event.countryLabel==='사이판'?'MP':event.country;
  const japaneseCountry=event.countryLabel==='하와이'?'ハワイ':event.countryLabel==='사이판'?'サイパン':/^[A-Z]{2}$/.test(code)?new Intl.DisplayNames(['ja'],{type:'region'}).of(code)??country:country;
  return lang==='en'?`${end}: holiday ends · Return planning: check Incheon → ${country} departures`:lang==='zh'?`${end}假期结束 · 返程准备：确认仁川→${country}出发航班`:lang==='ja'?`${end} 祝日終了 · 帰国準備：仁川→${japaneseCountry}の出発便を確認`:`${end} 휴일 종료 · 귀국 준비: 인천→${country} 출발편 확인`;
 }
 if(lang!=='en'&&lang!=='zh')return returnPlanningText(event);
 const label=briefHoliday(event,lang),end=`${Number(event.end.slice(5,7))}/${Number(event.end.slice(8))}`;
 return lang==='en'?`${end}: ${label.name} ends · Return planning: check Incheon → ${label.country} departures`:`${end} ${label.name}结束 · 返程准备：确认仁川→${label.country}出发航班`;
}
