'use client';
import {AirportMonthlyFlights} from './airport-monthly-flights';
import {AirportRouteCountryPassengers} from './airport-route-country-passengers';
import {useMemo} from 'react';
import {usePresentationClock} from './area-demand-card';
import type {Lang} from './retailpulse-data';
import {LiveLoadMessage,useLiveSummary} from './live-signals';
import {useFlights} from './flights-client';
import {departureMap} from '../lib/airport-departure-map';
import {shiftKstDay} from '../lib/kst';
import {AirportFlightBrowser} from './airport-flight-browser';
import {AirportConceptModel} from './airport-concept-model';
import {AirportZoneCountries} from './airport-zone-countries';
import {airportModelScope} from '../lib/airport-model-scope';
const text={
 ko:{unsupported:'탑승동의 별도 승객 예보·출국장 대기는 제공되지 않습니다. T1 값을 탑승동 값으로 대신 표시하지 않습니다.',basis:'공식 터미널 코드 P02 또는 확인된 탑승동 게이트로 분류한 물리적 출발편입니다. 편수는 사람 수가 아닙니다.',schedule:'공식 출발 예정편',records:'수집된 출발편 기록',search:'항공편·목적지 검색',all:'전체 목록',failed:'항공편 자료를 불러오지 못했습니다.',partial:'일부 항공편만 반환되어 전체 편수·비중을 계산할 수 없습니다.',empty:'확인된 탑승동 출발편이 없습니다. 건물 미정 편은 탑승동에 배분하지 않습니다.'},
 en:{unsupported:'Separate concourse passenger forecasts and departure-hall waits are unavailable. T1 figures are not substituted.',basis:'Physical departures classified by official P02 terminal code or an evidenced concourse gate. Flights are not people.',schedule:'Official scheduled departures',records:'Collected departure records',search:'Search flight or destination',all:'Full list',failed:'Flight records could not be loaded.',partial:'Partial flight records: complete counts and shares cannot be established.',empty:'No confirmed concourse departures. Flights with unknown buildings are not allocated to the concourse.'},
 zh:{unsupported:'不提供登机楼独立旅客预测或出境等候。不会以T1数值替代。',basis:'依据官方P02代码或已确认登机楼登机口分类的物理出发航班。班次不是人数。',schedule:'官方计划出发航班',records:'已采集出发记录',search:'搜索航班或目的地',all:'全部列表',failed:'无法加载航班记录。',partial:'仅返回部分航班，无法计算完整班次和占比。',empty:'没有已确认的登机楼出发航班。建筑未定航班不分配到登机楼。'},
 ja:{unsupported:'搭乗棟単独の旅客予想・出国場待ちは提供されません。T1の値で代用しません。',basis:'公式P02コードまたは確認済み搭乗棟ゲートで分類した物理的出発便。便数は人数ではありません。',schedule:'公式出発予定便',records:'収集された出発記録',search:'便・目的地を検索',all:'全件一覧',failed:'便記録を読み込めませんでした。',partial:'便の一部のみ返却され、全体の便数・比率を算出できません。',empty:'確認済みの搭乗棟出発便はありません。建物未定便を搭乗棟に配分しません。'},
};
const unavailable={ko:'이 날짜의 출발편 자료를 확보하지 못했습니다. 확인된 0편이 아닙니다.',en:'Departure data for this date is unavailable. This is not a confirmed zero.',zh:'未获取该日期的出发航班资料，不是已确认的零班。',ja:'この日の出発便データは未取得です。確認済みの0便ではありません。'};
export function AirportConcourse({lang,date}:{lang:Lang;date:string|null}) {
 const summary=useLiveSummary(date);const serviceDate=date??summary?.serviceDateKst??null;const loaded=useFlights(serviceDate,'CONCOURSE');
 const now=usePresentationClock(summary?.generatedAt??new Date(0).toISOString());
 const today=summary?.dayRelation==='TODAY'&&serviceDate===summary?.todayKst&&serviceDate===new Date(now+9*3_600_000).toISOString().slice(0,10);
 const map=useMemo(()=>serviceDate&&loaded?.status==='OK'?departureMap({date:serviceDate,nextDate:shiftKstDay(serviceDate,1),terminal:'T1',buildingScope:'CONCOURSE',window:{startMin:0,endMin:1440},rows:loaded.payload.flights}):null,[serviceDate,loaded]);
 const c=text[lang];

 return <section id="airport-concourse" data-testid="airport-concourse" className="airport-concourse">
  <h2 className="airport-model-scope" data-testid="airport-model-scope" data-terminal="CONCOURSE">{airportModelScope('CONCOURSE',lang)}</h2>
  {serviceDate&&<AirportRouteCountryPassengers lang={lang} month={serviceDate.slice(0,7)} terminal="CONCOURSE"/>}
  {!loaded?<LiveLoadMessage loading lang={lang}/>:loaded.status==='FAILED'?<p role="status">{c.failed}</p>:loaded.payload.truncated?<p role="status">{c.partial}</p>:!loaded.payload.retrievedAt&&loaded.payload.flights.length===0?<p role="status">{unavailable[lang]}</p>:map&&<>
   <p>{loaded.payload.basis==='OFFICIAL_DEPARTURE_SCHEDULE'?c.schedule:c.records}: <strong data-testid="concourse-flight-count">{map.flights.length}</strong> · {serviceDate} KST</p>
   <AirportConceptModel map={map} lang={lang}/>
   {lang!=='ko'&&lang!=='zh'&&<AirportZoneCountries map={map} lang={lang} basis={c.basis} date={serviceDate!} isToday={today}/>}
   {!map.flights.length&&<p>{c.empty}</p>}
   <AirportFlightBrowser flights={map.flights} lang={lang} testId="concourse-flight-list"/>
   <p className="prep-note">{loaded.payload.retrievedAt??'—'} · <a href="https://www.airport.kr" target="_blank" rel="noreferrer">Incheon Airport</a></p>
  </>}
  {serviceDate&&<AirportMonthlyFlights lang={lang} terminal="CONCOURSE" date={serviceDate} showCountryRanking={lang!=='ko'&&lang!=='zh'}/>}
  {(lang==='ko'||lang==='zh')&&serviceDate&&<p><a href={`/${lang}/airport-countries?mode=zones&date=${encodeURIComponent(serviceDate)}&building=CONCOURSE`}>{lang==='zh'?'查看各国出发区域 ↗':'국가별 출발 구역 보기 ↗'}</a></p>}
  <p className="prep-note" data-testid="concourse-transfer-note">{{ko:'탑승동 이용객도 T1에서 체크인·출국수속 후 이동합니다. 항공편은 탑승구 기준으로 본관과 분리하며, T1 대기·공식 여객 통계는 수속장·공식 터미널 기준입니다.',en:'Concourse passengers check in and complete departure formalities at T1 before moving to the concourse. Flights are split by boarding building; T1 waits and official passenger statistics retain their departure-hall and official terminal scope.',zh:'登机楼旅客也在T1办理值机和出境手续后前往登机楼。航班按登机建筑分开；T1等候和官方旅客统计保留出境大厅与官方航站楼口径。',ja:'搭乗棟の利用客もT1でチェックイン・出国手続き後に移動します。便は搭乗建物別に分け、T1の待ち時間・公式旅客統計は出国場・公式ターミナルの範囲を維持します。'}[lang]}</p>
  <p className="prep-note" data-testid="concourse-unsupported">{{ko:'탑승동 승객 예보·검색대 대기 미제공',en:'Concourse passenger forecast and security wait unavailable',zh:'登机楼旅客预测和安检等待未提供',ja:'搭乗棟の旅客予測・保安待ちは未提供'}[lang]}</p>
  <details className="prep-evidence"><summary>{{ko:'제공 범위',en:'Data coverage',zh:'提供范围',ja:'提供範囲'}[lang]}</summary><p className="prep-note">{c.unsupported}</p></details>
 </section>;
}
