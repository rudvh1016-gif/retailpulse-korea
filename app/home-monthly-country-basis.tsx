import type {Lang} from './retailpulse-data';
import type {HomeMonthlySelection} from '../lib/home-monthly-countries';

export default function HomeMonthlyCountryBasis({selection,lang='ko'}:{selection?:HomeMonthlySelection;lang?:Lang}){
 const t=(ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];
 if(!selection?.month||!selection.rows.length)return <p className="focus-monthly-selection-basis" role="status">{t('순위를 정할 공식 월 자료를 확인하고 있습니다.','Checking official monthly data for the ranking.','正在确认用于排名的官方月度资料。','順位を決める公式月次資料を確認しています。')}</p>;
 const [year,month]=selection.month.split('-');
 const period=t(`${year}년 ${Number(month)}월`,`${selection.month}`,`${year}年${Number(month)}月`,`${year}年${Number(month)}月`);
 const size=selection.rows.length;
 return <div className="focus-monthly-selection-basis" data-month={selection.month}>
  <p>
  {period} · {t('공항 전체','Airport-wide','全机场','空港全体')} · {t(`확인된 출발 여객 상위 ${size}개국·지역`,`Top ${size} countries/regions by confirmed departing passengers`,`已确认出发旅客前${size}个国家及地区`,`確認済み出発旅客数上位${size}か国・地域`)}</p>
  <details className="focus-monthly-calculation">
   <summary>{t('집계 기준','Ranking basis','统计依据','集計基準')}</summary>
   <p>{t('확인된 자료 내 출발 여객 수 순','Ranked by departing passenger counts within confirmed records','按已确认资料内的出发旅客人数排序','確認できた資料内の出発旅客数順')}
  {selection.fallback&&<><br/>{t(`요청 ${selection.requestedMonth} 대신 최신 보유 공개월 실적`,`Latest stored published month available for the ${selection.requestedMonth} request`,`使用请求月份${selection.requestedMonth}之前已保存的最新已公开官方月度实绩`,`${selection.requestedMonth}の指定に対し保存済みの最新公表月の公式実績`)}</>}
  {selection.excludedRows>0&&<><br/>{t('값·국가·지역 확인이 어려운 행은 순위에서 제외','Unconfirmed counts or country/region identities are excluded','无法确认数值或国家及地区的记录不参与排名','値や国・地域を確認できない行は順位から除外')}</>}
  {selection.cutoffTie&&<><br/>{t('3위 동률은 국가·지역 코드 순으로 3곳 표시','At the third-place tie, show three in country/region-code order','第三名并列时按国家及地区代码顺序显示三个','3位同数の場合は国・地域コード順で3件を表示')}</>}
   </p>
  </details>
 </div>;
}
