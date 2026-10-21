import {KOREAN_VACATION_CAUTION,koreanSchoolVacations,type KoreanVacationQuery} from '../lib/korean-school-vacations';

export function KoreanVacationContext(query:KoreanVacationQuery){
 const items=koreanSchoolVacations(query);
 if(!items.length)return null;
 return <div className="focus-source focus-korean-vacation">
  <p><b>초등학교 방학기간 참고</b></p>
  {items.map(item=><p key={`${item.eventId}-${item.month}`}>{query.day?`${query.day} 해당`:`${item.month}${item.relation==='previous'?'(직전 월)':''} 겹침`} · 개별 학교 예시<br/>한국 {item.name} {item.start}–{item.end} · <a href={item.sourceURL} target="_blank" rel="noreferrer">학교 공식 일정 ↗</a><br/>확인 {item.verifiedAt} · 학교별 일정 상이</p>)}
  <p>{KOREAN_VACATION_CAUTION}</p>
 </div>;
}
