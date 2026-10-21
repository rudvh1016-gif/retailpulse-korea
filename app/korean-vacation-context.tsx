import {KOREAN_VACATION_CAUTION,koreanSchoolVacations,type KoreanVacationQuery} from '../lib/korean-school-vacations';

export function KoreanVacationContext(query:KoreanVacationQuery){
 const items=koreanSchoolVacations(query);
 if(!items.length)return null;
 return <div className="focus-source focus-korean-vacation">
  <p><b>한국 학교 방학 일정 예시</b></p>
  {items.map(item=><p key={`${item.eventId}-${item.month}`}>{query.day?`${query.day} 해당`:`${item.month}${item.relation==='previous'?'(직전 월)':''} 겹침`} · {item.region}<br/>{item.name} {item.start}–{item.end} · <a href={item.sourceURL} target="_blank" rel="noreferrer">학교 공식 일정 ↗</a><br/>확인 {item.verifiedAt} · 해당 학교에만 적용</p>)}
  <p>{KOREAN_VACATION_CAUTION}</p>
 </div>;
}
