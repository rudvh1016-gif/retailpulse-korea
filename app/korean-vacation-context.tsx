import {chineseText} from '../lib/chinese-ui';
import type {Lang} from './retailpulse-data';
import {KOREAN_VACATION_CAUTION,koreanSchoolVacations,type KoreanVacationQuery} from '../lib/korean-school-vacations';

export function KoreanVacationContext({lang='ko',...query}:KoreanVacationQuery & {lang?:Lang}){
 const items=koreanSchoolVacations(query);
 if(!items.length)return null;
 return <div className="focus-source focus-korean-vacation">
  <p><b>{chineseText(lang,"초등학교 방학기간 참고")}</b></p>
  {items.map(item=><p key={`${item.eventId}-${item.month}`}>{chineseText(lang,query.day?`${query.day} 해당`:`${item.month}${item.relation==='previous'?'(직전 월)':''} 겹침`)}{chineseText(lang," · 개별 학교 예시")}<br/>{chineseText(lang,"한국 ")}{chineseText(lang,item.name)} {chineseText(lang,item.start)}–{chineseText(lang,item.end)} · <a href={item.sourceURL} target="_blank" rel="noreferrer">{chineseText(lang,"학교 공식 일정 ↗")}</a><br/>{chineseText(lang,"확인 ")}{chineseText(lang,item.verifiedAt)}{chineseText(lang," · 학교별 일정 상이")}</p>)}
  <p>{chineseText(lang,KOREAN_VACATION_CAUTION)}</p>
 </div>;
}
