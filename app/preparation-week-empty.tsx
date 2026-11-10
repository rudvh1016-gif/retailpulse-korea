import type {Lang} from './retailpulse-data';

/** A sparse reviewed list is not a pending request or proof of no holidays. */
export function PreparationWeekEmpty({lang='ko'}:{lang?:Lang}){
 const copy={
  ko:['이 기간에 등록된 대표 일정이 없습니다.','모든 국가의 휴일이 없다는 뜻은 아닙니다.'],
  en:['No representative dates are listed for this period.','This does not mean there are no holidays in any country.'],
  zh:['此期间暂无已收录的代表性日程。','这不代表所有国家都没有假日。'],
  ja:['この期間に登録された主な日程はありません。','すべての国に祝日がないという意味ではありません。'],
 }[lang];
 return <><span className="focus-event-row">{copy[0]}</span><small className="focus-event-row">{copy[1]}</small></>;
}
