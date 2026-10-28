import type {Lang} from '../app/retailpulse-data';
/** Copy only. Callers must establish whether this is the selected day's prior month. */
export function collectedDayComparisonCopy(lang:Lang,previousMonth=false){
 return previousMonth?{
  ko:'지난달 자료가 확보된 날의 하루 평균과 비교',
  en:'Compared with the daily average of last month’s available dates',
  zh:'与上月有资料日期的每日平均值比较',
  ja:'先月のデータがある日の日平均と比較',
 }[lang]:{
  ko:'자료가 확보된 날의 하루 평균과 비교',
  en:'Compared with the daily average of dates with available data',
  zh:'与有资料日期的每日平均值比较',
  ja:'データがある日の日平均と比較',
 }[lang];
}
