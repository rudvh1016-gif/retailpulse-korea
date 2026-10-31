import chinese from './zh.json' with {type:'json'};
import english from './en.json' with {type:'json'};
import holidayNames from '../brief-holiday-translations.json' with {type:'json'};

// Exact, reviewed presentation literals only. Never rewrite stored records, URLs,
// country codes, selectors, arithmetic or generated numeric values.
export function createPeriodTranslator(lang){
 return value=>typeof value==='string'&&['zh','en'].includes(lang)?((lang==='en'?english:chinese)[value]??value):value;
}
const additionalHolidayNames={
 '독립기념일 대체휴일':'独立日补休','콜럼버스 데이':'哥伦布日',
 '흥왕 기념일 대체휴일':'雄王纪念日补休','국경일 추가 휴일':'国庆节额外假日',
 '새해 조정 휴일':'元旦调休假期','춘절 조정 연휴':'春节调休假期',
 '청명절 연휴':'清明节假期','노동절 조정 연휴':'劳动节调休假期',
 '단오절 연휴':'端午节假期','국경절·중추절 조정 연휴':'国庆节及中秋节调休假期',
 '중추절 연휴':'中秋节假期','국경절 조정 연휴':'国庆节调休假期'
};
export function localizeHolidayName(lang,value){
 if(lang==='en')return holidayNames[value]?.en??value;
 if(lang!=='zh'||!/[\uac00-\ud7a3]/.test(value))return value;
 // Unknown future provider names remain explicitly labelled originals, rather
 // than inventing a translation or changing their official holiday identity.
 return additionalHolidayNames[value]??holidayNames[value]?.zh??`${value}（韩文原文）`;
}
