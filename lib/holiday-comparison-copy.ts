import { HOLIDAY_SOURCES, isPublished, localHolidayName, officialDaysOn, type HolidayCountry } from './holiday-calendar';
type Lang = 'ko' | 'en' | 'zh' | 'ja';
export function holidayDateStatus(date: string, country: HolidayCountry, lang: Lang): string {
  const countryName = {CN:{ko:'중국',en:'China',zh:'中国',ja:'中国'},JP:{ko:'일본',en:'Japan',zh:'日本',ja:'日本'}}[country][lang];
  if (!isPublished(country,date)) return `${countryName} ${ {ko:'공휴일 확인 불가',en:'holiday status unavailable',zh:'假日状态无法确认',ja:'祝日未確認'}[lang]}`;
  const days=officialDaysOn(date,[country]);
  if (!days.length) return `${countryName} ${ {ko:'공휴일 아님',en:'not a public holiday',zh:'非公共假日',ja:'祝日ではない'}[lang]}`;
  return days.map(day=>`${countryName} ${localHolidayName(day.name,lang,country)}${day.kind==='WORKING_DAY' ? ` · ${{ko:'조정 근무일(공휴일 아님)',en:'adjusted working day (not a holiday)',zh:'调休工作日（非假日）',ja:'振替出勤日（祝日ではない）'}[lang]}` : day.kind==='SUBSTITUTE' ? ` · ${{ko:'대체휴일',en:'substitute holiday',zh:'补休假日',ja:'振替休日'}[lang]}` : day.kind==='CITIZENS_HOLIDAY' ? ` · ${{ko:'국민휴일',en:"citizens' holiday",zh:'国民休息日',ja:'国民の休日'}[lang]}` : ''}`).join(' / ');
}
export function holidayComparisonCopy(current: string, previous: string, lang: Lang): string {
  const countries=(['CN','JP'] as const).filter(country=>holidayDateStatus(current,country,lang)!==holidayDateStatus(previous,country,lang));
  const selected={ko:'선택일',en:'Selected date',zh:'所选日期',ja:'選択日'}[lang];
  const compared={ko:'비교일',en:'Compared date',zh:'比较日期',ja:'比較日'}[lang];
  const list=countries.length?countries:(['CN','JP'] as const);
  return list.map(country=>`${selected} ${current}: ${holidayDateStatus(current,country,lang)} / ${compared} ${previous}: ${holidayDateStatus(previous,country,lang)}`).join('; ');
}
export const holidayComparisonSources = (['CN','JP'] as const).map(country=>({country,url:HOLIDAY_SOURCES[country].url,checkedOn:HOLIDAY_SOURCES[country].checkedOn}));
