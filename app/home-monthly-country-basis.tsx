import type {Lang} from './retailpulse-data';
import type {HomeMonthlySelection} from '../lib/home-monthly-countries';

export default function HomeMonthlyCountryBasis({selection,lang='ko'}:{selection?:HomeMonthlySelection;lang?:Lang}){
 const t=(ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];
 if(!selection?.month||!selection.rows.length)return <p className="focus-monthly-selection-basis" role="status">{t('순위를 정할 공식 월 자료를 확인하고 있습니다.','Checking official monthly data for the ranking.','正在确认用于排名的官方月度资料。','順位を決める公式月次資料を確認しています。')}</p>;
 const [year,month]=selection.month.split('-');
 const period=t(`${year}년 ${Number(month)}월 기준`,`${selection.month} results`,`${year}年${Number(month)}月基准`,`${year}年${Number(month)}月基準`);
 const size=selection.rows.length;
 return <p className="focus-monthly-selection-basis" data-month={selection.month}>
  {period} · {t('공항 전체 · 출발 여객 수 순','Airport-wide · departing passenger count order','全机场 · 按出发旅客人数排序','空港全体・出発旅客数順')}<br/>
  {t(`확인된 자료 내 출발 여객 상위 ${size}개 국가·지역`,`Top ${size} route countries/regions by departing passengers within confirmed records`,`已确认资料内出发旅客最多的${size}个航线国家及地区`,`確認できた資料内の出発旅客数上位${size}の国・地域`)}
  {selection.fallback&&<><br/>{t(`요청 ${selection.requestedMonth} 대신 최신 보유 공개월 실적`,`Latest stored published month available for the ${selection.requestedMonth} request`,`使用请求月份${selection.requestedMonth}之前已保存的最新已公开官方月度实绩`,`${selection.requestedMonth}の指定に対し保存済みの最新公表月の公式実績`)}</>}
  {selection.excludedRows>0&&<><br/>{t('값·국가·지역 확인이 어려운 행은 순위에서 제외','Unconfirmed counts or country/region identities are excluded','无法确认数值或国家及地区的记录不参与排名','値や国・地域を確認できない行は順位から除外')}</>}
  {selection.cutoffTie&&<><br/>{t('3위 동률은 국가·지역 코드 순으로 3곳 표시','At the third-place tie, show three in country/region-code order','第三名并列时按国家及地区代码顺序显示三个','3位同数の場合は国・地域コード順で3件を表示')}</>}
 </p>;
}
