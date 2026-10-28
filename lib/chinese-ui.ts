import type {Lang} from '../app/retailpulse-data';
import holidayTranslations from './brief-holiday-translations.json';
import translations from './chinese-ui.json';

// Presentation-only lookup. Canonical Korean source fields and join keys remain unchanged.
// Numbered placeholders preserve the original value, date, unit and precision.
const patterns=Object.entries(translations).filter(([key])=>key.includes('{'))
 .sort(([a],[b])=>b.replace(/\{\d+\}/g,'').length-a.replace(/\{\d+\}/g,'').length)
 .map(([key,value])=>({pattern:new RegExp('^'+key.split(/\{\d+\}/).map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('([\\s\\S]*?)')+'$'),value}));
export function chineseText<T>(lang:Lang,value:T):T {
 if(lang!=='zh'||typeof value!=='string')return value;
 const dictionary=translations as Record<string,string>;
 const exact=dictionary[value]??(holidayTranslations as Record<string,{zh:string}>)[value]?.zh;
 if(exact!==undefined)return exact as T;
 const trimmed=value.trim();
 if(trimmed!==value){const translated=chineseText(lang,trimmed);if(translated!==trimmed)return value.replace(trimmed,translated) as T;}
 // Card excerpts remove a final sentence mark; reuse the full reviewed translation.
 if(dictionary[value+'.'])return dictionary[value+'.'].replace(/[。.]$/,'') as T;
 if(/\([금토일월화수목]\)/.test(value)&&/^[\d/()~年月日一二三四五六周\s금토일월화수목–-]+$/.test(value))return value.replace(/\(([금토일월화수목])\)/g,(_,day)=>`(周${dictionary[day]})`) as T;
 for(const {pattern,value:template} of patterns){const match=value.match(pattern);if(match){const translated=template.replace(/\{(\d+)\}/g,(_,index)=>String(chineseText(lang,match[Number(index)+1])));if(!/[\uac00-\ud7a3]/.test(translated))return translated as T;}}
 return value;
}
