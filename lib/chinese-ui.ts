import type {Lang} from '../app/retailpulse-data';
import holidayTranslations from './brief-holiday-translations.json' with {type:'json'};
import translations from './chinese-ui.json' with {type:'json'};
import english from './english-ui.json' with {type:'json'};

// Presentation-only lookup. Canonical Korean source fields and join keys remain unchanged.
// Numbered placeholders preserve the original value, date, unit and precision.
const makePatterns=(dictionary:Record<string,string>)=>Object.entries(dictionary).filter(([key])=>key.includes('{'))
 .sort(([a],[b])=>b.replace(/\{\d+\}/g,'').length-a.replace(/\{\d+\}/g,'').length)
 .map(([key,value])=>({pattern:new RegExp('^'+key.split(/\{\d+\}/).map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('([\\s\\S]*?)')+'$'),value}));
const patterns=makePatterns(translations),englishPatterns=makePatterns(english);
export function chineseText<T>(lang:Lang,value:T):T {
 if((lang!=='zh'&&lang!=='en')||typeof value!=='string')return value;
 const dictionary=(lang==='en'?english:translations) as Record<string,string>;
 const exact=dictionary[value]??(holidayTranslations as Record<string,{zh:string;en:string}>)[value]?.[lang];
 if(exact!==undefined)return exact as T;
 const trimmed=value.trim();
 if(trimmed!==value){const translated=chineseText(lang,trimmed);if(translated!==trimmed)return value.replace(trimmed,translated) as T;}
 // Card excerpts remove a final sentence mark; reuse the full reviewed translation.
 if(dictionary[value+'.'])return dictionary[value+'.'].replace(/[。.]$/,'') as T;
 if(lang==='en'&&value.startsWith('· '))return ('· '+chineseText(lang,value.slice(2))) as T;
 if(lang==='en'&&/^\d{1,2}월$/.test(value))return new Intl.DateTimeFormat('en',{month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(2026,parseInt(value)-1))) as T;
 if(lang==='en'&&/^\d[\d,]*명$/.test(value))return `${value.slice(0,-1)} people` as T;
 if(lang==='en'&&/^\d+(?:\.\d+)?만$/.test(value))return new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:2}).format(parseFloat(value)*10000) as T;
 if(lang==='en'&&/^\d{1,2}월 여객 수 확인$/.test(value))return `Show ${chineseText(lang,value.split('월')[0]+'월')} passenger count` as T;
 if(lang==='en'&&/^\d{4}년 \d{1,2}월$/.test(value)){const [year,month]=value.match(/\d+/g)!;return new Intl.DateTimeFormat('en',{year:'numeric',month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(Number(year),Number(month)-1))) as T;}
 if(lang==='zh'&&/\([금토일월화수목]\)/.test(value)&&/^[\d/()~年月日一二三四五六周\s금토일월화수목–-]+$/.test(value))return value.replace(/\(([금토일월화수목])\)/g,(_,day)=>`(周${dictionary[day]})`) as T;
 for(const {pattern,value:template} of lang==='en'?englishPatterns:patterns){const match=value.match(pattern);if(match){const translated=template.replace(/\{(\d+)\}/g,(_,index)=>String(chineseText(lang,match[Number(index)+1])));if(!/[\uac00-\ud7a3]/.test(translated))return translated as T;}}
 if(lang==='en'&&value.includes(' · '))return value.split(' · ').map(part=>chineseText(lang,part)).join(' · ') as T;
 return value;
}
