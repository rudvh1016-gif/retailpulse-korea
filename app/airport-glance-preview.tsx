'use client';
import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {deviceAirportScope,saveAirportScope} from '../lib/airport-scope-preference';
import {useChoiceMotion} from './use-choice-motion';
import type {Lang} from './retailpulse-data';
import {useLiveSummary} from './live-summary';
import {loadFlights,useFlights} from './flights-client';
import {primePreparedMonth,usePreparedMonth} from './use-prepared-month';
import {usePresentationClock} from './presentation-clock';
import {ChangeRate} from './change-rate';
import {dailyChangeText,glanceComparableCountries,glanceCountryDeclines,glanceDestinationIncrease,glanceFutureWindow,glanceFlights,glanceDayComparison,glanceCountryRanking,glanceLongestWait,glanceUpcoming,sameDailyChange,type GlanceScope} from '../lib/airport-glance';
import {mainBuildingMonth} from '../lib/airport-monthly-building';
import {previousFlightMonth,type AirportMonthlyRollups} from '../lib/airport-monthly-flights';
import {selectedZoneShares} from '../lib/airport-zone-shares';
import {kstDayOf} from '../lib/kst';
import {passengerReferenceSum,transferForecastTotal} from '../lib/passenger-reference-sum';
import {passengerCopy as passengerReferenceCopy} from '../lib/passenger-copy';
import {friendlyCheckpointName} from '../lib/airport-today-summary';
import './airport-glance-preview.css';
interface MonthReply{status:string;month:string;data:AirportMonthlyRollups|null;calculatedAt:string|null}
/** On a page that opens on the glance, the two reads the glance makes once the summary names the day
 * (that day's flights and its month records) start while the page's scripts are still arriving,
 * instead of after hydration. The day is the page's ?date= or else the device's KST day, which is
 * the day the undated summary names; if the summary names another day the hooks simply ask for that
 * one as before. Both reads go through the hooks' own loaders, so nothing from them is shown unless
 * the summary names the same day, and the API calls are the ones the hooks would have made. */
function startGlanceReads(){
 const [,locale,slug,...rest]=window.location.pathname.split('/');
 if(!['ko','en','zh','ja'].includes(locale)||rest.length>0||(slug&&slug!=='airport-glance'))return;
 const requested=new URLSearchParams(window.location.search).get('date');
 const day=requested&&/^\d{4}-\d{2}-\d{2}$/.test(requested)?requested:kstDayOf(new Date(Date.now()).toISOString());
 void loadFlights(day);
 primePreparedMonth(`/api/live/airport-months?month=${encodeURIComponent(day.slice(0,7))}`);
}
if(typeof window!=='undefined')startGlanceReads();
const copy={
 ko:{title:'인천공항 한눈에',detail:'공항 상세',preview:'공개 반영 전 미리보기',all:'전체',today:'오늘',date:'날짜',total:'선택일 출발편',now:'현재 시간대',unit:'편',hourly:'시간대별 출발편',country:'목적지 국가별 출발편 신장률',basis:'실제 포함일 일평균 기준 · 하루 평균 증감 편수 순 · 비교 불가 제외',previous:'전월',current:'선택월',change:'증감',ready:'출국 준비',readyNote:'수속·수하물·보안검색 안내',news:'관세·면세 뉴스',newsNote:'공식 출처와 발표 시각 확인',loading:'자료 확인 중…',missing:'확인 가능한 자료가 없습니다.',partial:'일부 기록입니다. 전체 합계로 표시하지 않습니다.',art:'승인된 공항 그림 연결 대기',concept:'개념도 · 공식 좌표 아님',west:'서편',center:'중앙',east:'동편',unknown:'위치 미확인',concourse:'탑승동',selected:'선택 시간',collected:'항공편 자료 수집',monthTime:'월별 집계 시각',scope:'구역 비율은 각 건물 전체 출발편 기준이며 위치 미확인도 포함합니다.',rank:'신장률 상위 5개',wait:'대기 관측은 출국장별 상세에서 확인',scheduled:'출발 예정시각 기준 · 편수는 승객 수·실제 운항 실적이 아닙니다.'},
 en:{title:'Airport at a glance',detail:'Airport details',preview:'Preview before publication',all:'All',today:'Today',date:'Date',total:'Selected-day departures',now:'Current hour',unit:'flights',hourly:'Departures by hour',country:'Departure growth by destination country',basis:'Included-day daily means · ranked by change in flights per day · not comparable excluded',previous:'Previous',current:'Selected',change:'Change',ready:'Prepare for departure',readyNote:'Check-in, baggage and security',news:'Customs & Duty-Free News',newsNote:'Official sources and publication times',loading:'Checking data…',missing:'No verified data available.',partial:'Partial records; no complete total shown.',art:'Approved airport artwork pending',concept:'Concept layout · not official coordinates',west:'West',center:'Centre',east:'East',unknown:'Unverified',concourse:'Concourse',selected:'Selected hour',collected:'Flights collected',monthTime:'Monthly calculation',scope:'Zone shares use each building’s total departures, including unverified locations.',rank:'Top 5 change rates',wait:'See queue observations by checkpoint in details',scheduled:'Scheduled departure times · flights are not people or certified actual operations.'},
 zh:{title:'机场一览',detail:'机场详情',preview:'公开前预览',all:'全部',today:'今天',date:'日期',total:'所选日期出发航班',now:'当前时段',unit:'班',hourly:'各时段出发航班',country:'目的地国家出发航班增长率',basis:'按实际计入日期的日均计算 · 按日均增减班次排序 · 排除无法比较的数据',previous:'上月',current:'所选月份',change:'增减',ready:'出境准备',readyNote:'值机、行李与安检指南',news:'海关·免税新闻',newsNote:'查看官方来源与发布时间',loading:'正在核实数据…',missing:'暂无可核实的数据。',partial:'记录不完整，不显示完整总数。',art:'等待连接已批准的机场图像',concept:'布局示意图 · 非官方坐标',west:'西侧',center:'中央',east:'东侧',unknown:'位置未确认',concourse:'卫星厅',selected:'所选时段',collected:'航班数据采集',monthTime:'月度汇总时间',scope:'区域比例以各建筑全部出发航班为分母，包含位置未确认的航班。',rank:'增长率前5名',wait:'各出境检查区的排队观测请查看详情',scheduled:'以计划出发时间为准 · 航班数不等于人数或实际运行量。'},
 ja:{title:'空港ひと目で',detail:'空港詳細',preview:'公開前プレビュー',all:'すべて',today:'今日',date:'日付',total:'選択日の出発便',now:'現在の時間帯',unit:'便',hourly:'時間帯別の出発便',country:'目的地の国別・出発便増加率',basis:'実際に集計した日数の1日平均が基準 · 1日平均の増減便数順 · 比較不可を除外',previous:'前月',current:'選択月',change:'増減',ready:'出国準備',readyNote:'チェックイン・手荷物・保安検査',news:'税関・免税ニュース',newsNote:'公式情報と発表日時を確認',loading:'データを確認中…',missing:'確認できるデータがありません。',partial:'一部の記録のため、全体の合計は表示しません。',art:'承認済み空港画像の接続待ち',concept:'配置の概念図 · 公式座標ではありません',west:'西側',center:'中央',east:'東側',unknown:'位置未確認',concourse:'搭乗棟',selected:'選択時間',collected:'便データ収集',monthTime:'月別集計時刻',scope:'各建物の全出発便を分母とし、位置未確認の便も含みます。',rank:'増加率上位5件',wait:'待ち時間の観測は出国場別の詳細で確認',scheduled:'出発予定時刻が基準 · 便数は人数や実際の運航実績ではありません。'},
} as const;
const destinationCopy={
 ko:{title:'목적지 국가별 출발편 비율',basis:'선택일 전체 출발편 기준 · 승객·항공사 국적 아님',more:'국가 전체 보기',unknown:'목적지 미정',domestic:'국내 목적지'},
 en:{title:'Departures by destination country',basis:'All selected-day departures · not passenger or airline nationality',more:'All countries',unknown:'Destination unknown',domestic:'Domestic destinations'},
 zh:{title:'目的地国家出发航班占比',basis:'所选日期全部出发航班 · 非旅客或航空公司国籍',more:'全部国家',unknown:'目的地未确认',domestic:'国内目的地'},
 ja:{title:'目的地の国別・出発便の割合',basis:'選択日の全出発便が基準 · 旅客・航空会社の国籍ではありません',more:'すべての国',unknown:'目的地未確認',domestic:'国内目的地'},
} as const;
const interfaceCopy={
 ko:{seoul:'서울',building:'건물 미정',country:'국가',mean:'일평균 · 편/일',perDay:'편/일',map:'공식 공항 지도',main:'주 메뉴',terminal:'터미널',summary:'요약',layout:'공항 배치',more:'공항 추가 정보',days:'포함일',dayUnit:'일'},
 en:{seoul:'Seoul',building:'Building unconfirmed',country:'Country',mean:'Daily mean · flights/day',perDay:' flights/day',map:'Official airport map',main:'Main',terminal:'Terminal',summary:'Summary',layout:'Airport layout',more:'More airport information',days:'Included dates',dayUnit:'days'},
 zh:{seoul:'首尔',building:'建筑未确认',country:'国家',mean:'日均 · 班/日',perDay:'班/日',map:'机场官方地图',main:'主菜单',terminal:'航站楼',summary:'摘要',layout:'机场布局',more:'更多机场信息',days:'计入日期',dayUnit:'天'},
 ja:{seoul:'ソウル',building:'建物未確認',country:'国',mean:'1日平均 · 便/日',perDay:'便/日',map:'空港公式地図',main:'メインメニュー',terminal:'ターミナル',summary:'概要',layout:'空港配置',more:'空港の詳細情報',days:'集計日数',dayUnit:'日'},
} as const;
// Reuse the reviewed assets already used by AirportZoneCountries; never guess a fallback flag.
const sculptedFlags=new Set(['CN','JP','US','VN']);
const flatFlags=new Set('AE AT AU BN CA CH CZ DE DK ES ET FI FR GB GE GU HK HU ID IN IT KG KH KZ LA LK MM MN MO MP MX MY NL NP NZ PH PL PT QA SG TH TM TR TW UZ'.split(' '));
const countryFlag=(country:string)=>sculptedFlags.has(country)?`/images/airport-flags/${country}.webp`:flatFlags.has(country)?`/images/airport-flags/fallback/${country.toLowerCase()}.svg`:null;
const insightCopy={
 ko:{wait:'지금 가장 긴 출국장 대기',waitBasis:'확인된 최신 관측 중',upcoming:'앞으로 출발편 집중 시간',upcomingBasis:'출발 예정 편수 · 승객 혼잡 아님',growth:'전월비 일평균 가장 늘어난 목적지',noGrowth:'비교 가능한 증가 없음',noUpcoming:'현재 이후 예정편 없음',unavailable:'확인 가능한 자료 없음',minute:'분',observed:'관측',waitShort:'대기',tie:'동률',shared:'T1 출국장 이용',growthTitle:'전월비 일평균 증가 Top 5',declineTitle:'전월비 일평균 감소 Top 5',noDecline:'비교 가능한 감소 없음'},
 en:{wait:'Longest current departure-hall wait',waitBasis:'Among fresh available observations',upcoming:'Busiest upcoming departure slot',upcomingBasis:'Scheduled flights · not passenger crowding',growth:'Largest daily-mean growth vs previous month',noGrowth:'No comparable increase',noUpcoming:'No remaining scheduled departures',unavailable:'No verified data',minute:'min',observed:'Observed',waitShort:'Wait',tie:'Tied',shared:'Uses T1 departure halls',growthTitle:'Daily-mean increase vs previous month · Top 5',declineTitle:'Daily-mean decrease vs previous month · Top 5',noDecline:'No comparable decrease'},
 zh:{wait:'当前最长出境厅等候',waitBasis:'在已确认的最新观测中',upcoming:'未来出发航班集中时段',upcomingBasis:'计划出发班次 · 不代表旅客拥挤',growth:'较上月日均增幅最大的目的地',noGrowth:'暂无可比较的增长',noUpcoming:'暂无当前之后的计划出发航班',unavailable:'暂无可核实资料',minute:'分',observed:'观测',waitShort:'等候',tie:'并列',shared:'使用T1出境厅',growthTitle:'较上月日均增加 · 前5名',declineTitle:'较上月日均减少 · 前5名',noDecline:'暂无可比较的减少'},
 ja:{wait:'現在最も長い出国場の待ち時間',waitBasis:'確認できる新しい観測の中で',upcoming:'今後の出発便が集中する時間帯',upcomingBasis:'出発予定便数 · 旅客の混雑ではありません',growth:'前月比で日平均が最も増えた目的地',noGrowth:'比較できる増加なし',noUpcoming:'現在以降の出発予定便なし',unavailable:'確認できる資料なし',minute:'分',observed:'観測',waitShort:'待ち',tie:'同順位',shared:'T1出国場を利用',growthTitle:'前月比の日平均増加 · 上位5件',declineTitle:'前月比の日平均減少 · 上位5件',noDecline:'比較できる減少なし'},
} as const;
const passengerCopy={
 ko:{transfer:'예상 환승객',transferBasis:'환승 보안검색 기준 · 도착일',today:'오늘 예상 출국객',selected:'선택일 예상 출국객',people:'명',basis:'인천공항 공식 일 예보',shared:'T1 공통(탑승동 포함)',collected:'수집',partial:'일 합계 자료 불완전'},
 en:{transfer:'Expected transfers',transferBasis:'Transfer security · arrival date',today:'Today’s expected departures',selected:'Selected-day expected departures',people:' people',basis:'Incheon official daily forecast',shared:'Shared T1 (incl. concourse)',collected:'Collected',partial:'Incomplete daily forecast'},
 zh:{transfer:'预计中转旅客',transferBasis:'中转安检口径 · 到达日',today:'今日预计出境旅客',selected:'所选日预计出境旅客',people:'人',basis:'仁川机场官方全天预测',shared:'T1共用（含登机楼）',collected:'采集',partial:'全天预测不完整'},
 ja:{transfer:'予想乗継客',transferBasis:'乗継保安検査基準・到着日',today:'今日の予想出国者数',selected:'選択日の予想出国者数',people:'人',basis:'仁川空港公式の一日予測',shared:'T1共通（搭乗棟含む）',collected:'取得',partial:'一日予測が不完全'},
} as const;
export interface GlanceOverviewContext {day:string;scope:GlanceScope;flights:number|null;passengers:number|null;transferPassengers:number|null;referenceSum:number|null;flightComparison:{mean:number;delta:number;percent:number}|null;flightBaseline:{mean:number;delta:number;percent:number|null;days:number;start:string;end:string;previous:boolean}|null}
export default function AirportGlancePreview({lang,artworkSrc=null,published=false,selectedDate=null,onDateChange,overviewHeading,overviewExtras,hideRepeatedFlightSummary=false,hideRepeatedPassengerSummary=false,artworkSrcSet,artworkNote}:{lang:Lang;artworkSrc?:string|null;published?:boolean;selectedDate?:string|null;onDateChange?:(date:string|null)=>void;overviewHeading?:(context:GlanceOverviewContext)=>ReactNode;overviewExtras?:ReactNode;hideRepeatedFlightSummary?:boolean;hideRepeatedPassengerSummary?:boolean;artworkSrcSet?:string;artworkNote?:string}){
 const c=copy[lang],ui=interfaceCopy[lang],dc=destinationCopy[lang],ic=insightCopy[lang];
 const [futureHours,setFutureHours]=useState<1|3|6>(1);
 const [previewDate,setPreviewDate]=useState<string|null>(null),[scope,setScope]=useState<GlanceScope>('all');
 useEffect(()=>{
  const restore=()=>setScope(deviceAirportScope());
  restore();window.addEventListener('popstate',restore);
  return ()=>window.removeEventListener('popstate',restore);
 },[]);
 const chooseScope=(next:GlanceScope)=>{setScope(next);saveAirportScope(next);};
 const motionRoot=useRef<HTMLElement>(null);
 useChoiceMotion(motionRoot,scope,'.glance-controls button[aria-pressed=true] .glance-selection-rule, .glance-building[data-selected=true] .glance-building-label',180);
 useChoiceMotion(motionRoot,String(futureHours),'.glance-zone-leaders, .glance-destination-growth',220);
 const date=published?selectedDate:previewDate;
 const setDate=(next:string|null)=>published&&onDateChange?onDateChange(next):setPreviewDate(next);
 const summary=useLiveSummary(date),day=date??summary?.serviceDateKst??'';
 const loaded=useFlights(day||null),clock=usePresentationClock(summary?.generatedAt??'1970-01-01T00:00:00Z');
 const month=day.slice(0,7),previousMonth=month?previousFlightMonth(month):'',monthRequest=usePreparedMonth<MonthReply>(month,`/api/live/airport-months?month=${encodeURIComponent(month)}`,month,day);
 const payload=loaded?.status==='OK'?loaded.payload:null;
 // Until the first summary and flight requests settle (always, in the server HTML) nothing is known yet:
 // the glance tiles below say "checking", never "no verified data" or a zero. The passenger tile waits on the summary alone.
 const settling=summary===undefined||(Boolean(day)&&loaded===undefined);
 const pendingText=settling?c.loading:null;
 const ready=Boolean(payload&&!payload.truncated&&(payload.retrievedAt||payload.flights.length));
 const data=useMemo(()=>ready&&payload?glanceFlights(day,payload.flights,scope):null,[ready,payload,day,scope]);
 const storedCurrent=monthRequest.reply?.data?.months.find(row=>row.month===month),storedPrevious=monthRequest.reply?.data?.months.find(row=>row.month===previousMonth);
 const current=scope==='T1'?mainBuildingMonth(storedCurrent):storedCurrent,previous=scope==='T1'?mainBuildingMonth(storedPrevious):storedPrevious;
 const monthScope=scope==='all'?'ALL':scope,ranking=glanceCountryRanking(current,previous,monthScope),declines=glanceCountryDeclines(current,previous,monthScope),comparable=glanceComparableCountries(current,previous,monthScope)>0,growth=ranking[0]??null;
 const dailyComparison=glanceDayComparison(day,data?.total??null,previous,scope==='all'?'ALL':scope);
 const overviewMonth=previous?.includedDays.length?previous:current;
 const overviewDays=overviewMonth?.includedDays??[];
 const overviewMean=overviewDays.length&&overviewDays.every(value=>value<day)?overviewMonth!.scopes[scope==='all'?'ALL':scope].total/overviewDays.length:null;
 const flightBaseline=data&&overviewMean!==null?{mean:overviewMean,delta:data.total-overviewMean,percent:overviewMean>0?(data.total/overviewMean-1)*100:null,days:overviewDays.length,start:[...overviewDays].sort()[0],end:[...overviewDays].sort().at(-1)!,previous:overviewMonth===previous}:null;
 const dailyCopy={ko:{today:'오늘 출발편',selected:'선택일 출발편',versus:'전월 일평균 대비',missing:'비교 불가',basis:'하루 전체 출발 예정편 · 전월 포함일 기준',mean:'전월 일평균'},en:{today:'Today’s departures',selected:'Selected-day departures',versus:'vs previous-month daily mean',missing:'Comparison unavailable',basis:'Whole-day scheduled departures · included dates of previous month',mean:'Previous-month daily mean'},zh:{today:'今日出发航班',selected:'所选日出发航班',versus:'较上月日均',missing:'无法比较',basis:'全天计划出发航班 · 按上月计入日期',mean:'上月日均'},ja:{today:'今日の出発便',selected:'選択日の出発便',versus:'前月の日平均比',missing:'比較不可',basis:'終日の出発予定便 · 前月の集計対象日基準',mean:'前月の日平均'}}[lang];
 const names=new Intl.DisplayNames([lang],{type:'region'}),fmt=new Intl.NumberFormat(lang,{maximumFractionDigits:1});
 const isToday=Number.isFinite(clock)&&kstDayOf(new Date(clock).toISOString())===day&&summary?.dayRelation==='TODAY';
 // The summary already validates whole-day coverage and aggregate intervals. Never sum hourly/remaining snapshots here.
 const pc=passengerCopy[lang],forecastAirport=summary?.serviceDateKst===day&&summary.airport.serviceDateKst===day?summary.airport:null;
 const forecastTerminal=scope==='T2'?'T2':'T1',forecastScope=scope==='all'?'T1 + T2':scope==='T2'?'T2':pc.shared;
 const forecastCoverage=scope==='all'?forecastAirport?.forecastCoverage?.all:forecastAirport?.forecastCoverage?.byTerminal?.[forecastTerminal];
 const forecastTotal=scope==='all'?forecastAirport?.todayExpectedPassengersTotal:forecastAirport?.todayExpectedPassengersByTerminal?.[forecastTerminal];
 const forecastPassengers=forecastCoverage==='COMPLETE'&&typeof forecastTotal==='number'&&Number.isFinite(forecastTotal)&&forecastTotal>=0?forecastTotal:null;
 const forecastAt=scope==='all'?forecastAirport?.passengerForecastRetrievedAt:forecastAirport?.passengerForecastRetrievedAtByTerminal?.[forecastTerminal];
 const transferPassengers=forecastAirport?transferForecastTotal(day,scope==='all'?'all':forecastTerminal,forecastAirport.transferForecast):null;
 const referenceSum=forecastAirport?passengerReferenceSum(forecastPassengers,forecastCoverage,day,scope==='all'?'all':forecastTerminal,forecastAirport.transferForecast):null;
 const sumLabel=({ko:'단순 합계',en:'Arithmetic sum',zh:'简单合计',ja:'単純合計'})[lang];
 const queues=isToday?summary?.airport.congestion??[]:[],wait=glanceLongestWait(queues.filter(row=>scope==='all'||row.terminal===(scope==='CONCOURSE'?'T1':scope)),clock);
 const futureReady=Boolean(data&&summary&&Number.isFinite(clock)&&Number.isFinite(Date.parse(summary.generatedAt)));
 const upcoming=futureReady&&data?glanceUpcoming(day,data.departures,clock):null;
 const future=isToday&&futureReady&&data?glanceFutureWindow(day,data.departures,clock,futureHours):null;
 const fc={ko:{title:'향후 시간대 항공편 분포',hours:'시간',ahead:'향후',zones:'앞으로 출발편이 가장 많은 구역',countries:'곧 몰리는 목적지',basis:'선택 구간 출발 예정편 · 하루 전체와 별도 · 고객 수·매장 혼잡 아님',zoneBasis:'아래 비중은 각 건물 전체 기준 · 미정 포함',countryBasis:'선택 구간 전체 편수 기준 · 승객 국적 아님',closed:'오늘과 확인된 기준시각에서만 제공',midnight:'자정까지 표시 · 다음 날 자료 미포함',none:'선택 구간에 확인된 예정편 없음',more:'목적지 전체',unplaced:'건물 미정'},en:{title:'Upcoming flight distribution',hours:'h',ahead:'Next',zones:'Area with the most upcoming departures',countries:'Destinations in the same window',basis:'Scheduled flights in selected window · separate from whole-day totals · not customers or shop crowding',zoneBasis:'Shares below use each building’s total, including unknown',countryBasis:'Share of all flights in this window · not passenger nationality',closed:'Available only for today with a verified clock',midnight:'Capped at midnight · next-day data not included',none:'No verified scheduled departures in this window',more:'All destinations',unplaced:'Unknown building'},zh:{title:'未来时段航班分布',hours:'小时',ahead:'未来',zones:'未来出发航班最多的区域',countries:'同时段主要目的地',basis:'所选时段计划出发航班 · 与全天分开 · 非顾客人数或店铺拥挤度',zoneBasis:'下列比例以各建筑全部航班为基数，含未定',countryBasis:'以所选时段全部航班为基数 · 非旅客国籍',closed:'仅限今日且基准时间已确认',midnight:'截至午夜 · 不含次日资料',none:'所选时段无已确认计划出发航班',more:'全部目的地',unplaced:'建筑未定'},ja:{title:'今後の時間帯の便分布',hours:'時間',ahead:'今後',zones:'今後の出発便が最も多いエリア',countries:'同じ時間帯の主な目的地',basis:'選択時間帯の出発予定便 · 終日の値とは別 · 顧客数や店舗混雑ではありません',zoneBasis:'下記比率は各建物の全便が分母・未定を含む',countryBasis:'選択時間帯の全便が分母 · 旅客の国籍ではありません',closed:'今日かつ基準時刻を確認できる場合のみ',midnight:'午前0時まで · 翌日の資料は含みません',none:'選択時間帯に確認済みの出発予定便なし',more:'目的地をすべて表示',unplaced:'建物未定'}}[lang];
 const increaseReady=Boolean(isToday&&futureReady&&payload?.truncated===false&&payload.serviceDateKst===day&&payload.retrievedAt&&Number.isFinite(Date.parse(payload.retrievedAt)));
 const increase=glanceDestinationIncrease(day,data?.departures??null,clock,futureHours,increaseReady);
 const gc={ko:{title:'다음 시간대에 늘어나는 목적지',before:'비교',after:'다음',basis:'같은 길이 · 출발편 비교',hold:'비교 보류',midnight:'자정 이후 비교 자료 없음',none:'늘어난 목적지 없음',unknown:'미분류',excluded:'비교 제외',uncertain:'미분류가 있어 증가 여부를 확정할 수 없습니다.',more:'목적지별 증감',known:'확인된 목적지 기준',records:'보유 예정편 기준 · 실제 고객 수 아님'},en:{title:'Destinations increasing in the next window',before:'Compare',after:'Next',basis:'Equal duration · scheduled departures',hold:'Comparison on hold',midnight:'Next-day comparison unavailable',none:'No destination increased',unknown:'Unclassified',excluded:'Excluded from ranking',uncertain:'Unclassified flights prevent a definite no-increase conclusion.',more:'Changes by destination',known:'Known destinations only',records:'Available scheduled records · not customer counts'},zh:{title:'下一时段增加的目的地',before:'比较',after:'下一时段',basis:'等长时段 · 计划出发班次',hold:'暂缓比较',midnight:'缺少次日比较资料',none:'没有增加的目的地',unknown:'未分类',excluded:'不参与排名',uncertain:'存在未分类航班，无法确定是否有增长。',more:'各目的地增减',known:'仅已确认目的地',records:'现有计划航班 · 非顾客人数'},ja:{title:'次の時間帯に増える目的地',before:'比較',after:'次',basis:'同じ長さ · 出発予定便の比較',hold:'比較保留',midnight:'翌日の比較資料なし',none:'増えた目的地なし',unknown:'未分類',excluded:'順位から除外',uncertain:'未分類便があるため増加の有無は断定できません。',more:'目的地別の増減',known:'確認済み目的地のみ',records:'保有する予定便 · 顧客数ではありません'}}[lang];
 const availabilityCopy={ko:{failed:'항공편 조회 실패',missing:'해당 시간대 정보 없음',partial:'일부 자료만 확인 · 비교 불가',comparison:'비교 자료 없음',zero:'비교 구간 출발편 0편'},en:{failed:'Flight lookup failed',missing:'No information for this window',partial:'Partial records · comparison unavailable',comparison:'Comparison unavailable',zero:'0 departures in both windows'},zh:{failed:'航班查询失败',missing:'该时段暂无资料',partial:'仅部分资料 · 无法比较',comparison:'暂无比较资料',zero:'两个时段出发航班均为0'},ja:{failed:'便情報の取得に失敗',missing:'この時間帯の情報なし',partial:'一部の資料のみ・比較不可',comparison:'比較資料なし',zero:'比較する両時間帯の出発便0便'}}[lang];
 const unavailableIncrease=pendingText??(loaded?.status==='FAILED'?availabilityCopy.failed:payload?.truncated?availabilityCopy.partial:!ready?availabilityCopy.missing:availabilityCopy.comparison);
 const increaseRest=increase.status==='READY'?increase.rows.filter(row=>!increase.leaders.includes(row)):[];
 const zoneCopy={ko:{destinations:'이 구역 주요 목적지',same:'같은',denominator:'선택 범위'},en:{destinations:'Destinations from this area',same:'Same',denominator:'Selected scope'},zh:{destinations:'本区域目的地',same:'同一',denominator:'所选范围'},ja:{destinations:'このエリアの目的地',same:'同じ',denominator:'選択範囲'}}[lang];
 const mainLabel=({ko:'T1 본관',en:'T1 main',zh:'T1 主楼',ja:'T1 本館'})[lang],sharedNote=({ko:'탑승동도 T1에서 출국수속 · 대기는 T1 공통 관측',en:'Concourse flights also use T1 departure processing · queues are shared T1 observations',zh:'卫星厅航班也在T1办理出境 · 排队为T1共同观测',ja:'搭乗棟もT1で出国手続き · 待ち時間はT1共通の観測'})[lang];
 const scopeName=scope==='all'?c.all:scope==='T1'?mainLabel:scope==='CONCOURSE'?c.concourse:scope,zoneLeader=future?.leaders[0]?.flights;
 const zoneDenominator=future?({ko:`${scopeName} · 선택 시간대 총 ${future.total}편${zoneLeader!==undefined?` 중 ${zoneLeader}편`:''}`,en:`${scopeName} · ${zoneLeader!==undefined?`${zoneLeader} of `:''}${future.total} flights in selected window`,zh:`${scopeName} · 所选时段共${future.total}班${zoneLeader!==undefined?`，其中${zoneLeader}班`:''}`,ja:`${scopeName} · 選択時間帯の全${future.total}便${zoneLeader!==undefined?`のうち${zoneLeader}便`:''}`})[lang]:'';
 const compactCopy={ko:{zones:'구역별 보기',basis:'출발편 기준',building:'해당 건물 기준',rules:'집계 기준'},en:{zones:'All zones',basis:'Scheduled departures',building:'Share of this building',rules:'Counting basis'},zh:{zones:'各区域',basis:'计划出发航班',building:'以该建筑为基数',rules:'统计依据'},ja:{zones:'エリア別',basis:'出発便基準',building:'当該建物の比率',rules:'集計基準'}}[lang];
 const windowLabel=({ko:'집계 시간',en:'Counting window',zh:'统计时段',ja:'集計時間'})[lang];
 // Format the existing aggregation boundaries only; do not extend the available day or change counts.
 function windowTime(start:number,end:number){
  const startDay=kstDayOf(new Date(start).toISOString()),endDay=kstDayOf(new Date(end).toISOString());
  return startDay===endDay?`${shortFutureTime(start)}–${shortFutureTime(end)}`:`${startDay} ${shortFutureTime(start)}–${endDay} ${shortFutureTime(end)}`;
 }
 function shortFutureTime(value:number){return new Intl.DateTimeFormat(lang,{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));}
 const stamp=(value:string|null|undefined)=>value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat(lang,{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value))+' KST':'—';
 const shortTime=(value:string)=>new Intl.DateTimeFormat(lang,{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
 const minuteText=(minute:number)=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
 const details=`/${lang}/airport?${scope==='CONCOURSE'?'building=CONCOURSE':`terminal=${scope}`}${day?`&date=${day}`:''}`;
 // Where each glance link lands (the airport page reveals these ids once its client data has mounted:
 // app/use-airport-hash-reveal.ts). The concourse page has no checkpoint or departure-map section:
 // its waits are T1's (the tile already shows T1 queues) and its map is the concourse view itself.
 const dateQuery=day?`&date=${day}`:'';
 const targets={
  forecast:`/${lang}/airport?terminal=${scope==='all'?'all':forecastTerminal}${dateQuery}#airport-forecast-title`,
  wait:scope==='CONCOURSE'?`/${lang}/airport?terminal=T1${dateQuery}#airport-checkpoints-title`:`${details}#airport-checkpoints-title`,
  map:scope==='CONCOURSE'?`${details}#airport-concourse`:`${details}#airport-departure-model-slot`,
  countries:`${details}#airport-zone-countries`,
  monthCountries:`${details}#airport-month-destinations`,
 };
 // While a value is unknown its placeholder keeps the loaded shape: an invisible pseudo-element of that shape (.glance-hold, outside the DOM
 // text) with the dash laid over its start, so the tiles, the day comparison and the picture labels already occupy the box the data will fill.
 // The shell font's figures are proportional ("1" is narrow), so date shapes carry the digits a KST date usually has rather than all zeros.
 // One table shape for both lists. Until the month request settles it says "checking"; once
 // comparisons exist but none goes this way it says so, never "no data".
 const rankingTable=(rows:ReturnType<typeof glanceCountryRanking>,none:string)=><>{rows.length>0&&<table><thead><tr><th>{ui.country}</th><th>{previous?.month??previousMonthText}</th><th>{monthText}</th><th>{c.change}</th></tr></thead><tbody>{rows.map(row=><tr key={row.country} data-country={row.country}><th scope="row">{countryLabel(row.country)}</th><td>{fmt.format(row.previous)}</td><td>{fmt.format(row.current)}</td><td><CountChange delta={row.delta} format={fmt.format} lang={lang}/></td></tr>)}</tbody></table>}{!rows.length&&<p role="status">{comparable?none:settling||(month&&monthRequest.pending)?c.loading:c.missing}</p>}</>;
 const hold=(shape:string,mark='—')=><i className="glance-hold" data-shape={shape}>{mark&&<b>{mark}</b>}</i>;
 const dayText=day||(summary===undefined?hold('2000-01-01'):'—'),monthText=month||(summary===undefined?hold('2000-01'):'—'),previousMonthText=previousMonth||(summary===undefined?hold('2000-01'):'—');
 const monthPending=monthRequest.reply===undefined,daysText=(row:typeof current)=>row?.includedDays.length??(monthPending?hold('00'):'—'),daysUnit=(row:typeof current)=>row?`${row.includedDays.length} ${ui.dayUnit}`:monthPending?hold(`00 ${ui.dayUnit}`):'—';
 const stampHold=hold(stamp('2000-01-01T00:00:00+09:00')),totalText=data?fmt.format(data.total):pendingText?hold('000'):'—';
 // With no date chosen the home shows today: its label does not wait for the summary to say so (one line in every language, unlike the
 // selected-day label), and the live-only lines (observation time, queue labels) keep their box while that summary is still on its way.
 const todayView=date===null,todayLabel=isToday||(todayView&&summary===undefined),liveHold=todayView?pendingText:null;
 const buildingNames={T1:mainLabel,CONCOURSE:c.concourse,T2:'T2'},countryName=(country:string)=>country==='KR'?dc.domestic:names.of(country)??country;
  const countryLabel=(country:string)=>{const src=countryFlag(country);return <span className="glance-country-name">{src&&<img src={src} width="18" height="18" alt="" loading="lazy" decoding="async"/>}<span>{countryName(country)}</span></span>;};
 const knownCountries=data?.countries.filter(row=>row.country!==null)??[],unknownCountry=data?.countries.find(row=>row.country===null);
 const countryLimit=knownCountries[5]?.flights??0,leadingCountries=knownCountries.filter((row,index)=>index<6||row.flights===countryLimit);
 const countryRow=(row:{country:string|null;flights:number})=><li key={row.country??'UNKNOWN'} data-country={row.country??'UNKNOWN'}><span>{row.country===null?dc.unknown:countryLabel(row.country)}</span><span>{fmt.format(row.flights)} {c.unit}</span><strong>{data&&data.total>0?`${fmt.format(row.flights/data.total*100)}%`:'—'}</strong></li>;
 const waitValue=(value:NonNullable<typeof wait>)=>`${value.minutes}${value.row.waitTimeRaw==='60+'?'+':''} ${ic.minute}`;
 const Container=published?'section':'main';
 return <Container ref={motionRoot} className="glance-preview" data-testid="airport-glance-preview">
  {!published&&<header className="glance-header"><a href={`/${lang}/airport`} className="glance-brand">KORETAIL<span>Retail Demand Signals for Korea</span></a><nav aria-label={ui.main}><a href={details}>{c.detail}</a><a href={`/${lang}/myeongdong`}>{ui.seoul}</a></nav></header>}
  <div className="glance-heading"><h1>{c.title}</h1>{!published&&<small>{c.preview}</small>}</div>
  <div className="glance-controls"><div role="group" aria-label={ui.terminal}>{(['all','T1','CONCOURSE','T2'] as const).map(value=><button key={value} aria-label={value==='all'?c.all:value==='CONCOURSE'?c.concourse:value} aria-pressed={scope===value} onClick={()=>chooseScope(value)}>{value==='all'?c.all:value==='T1'?mainLabel:value==='CONCOURSE'?c.concourse:value}{scope===value&&<i className="glance-selection-rule" aria-hidden="true"/>}</button>)}</div><label className="glance-date-control">{c.date}<input name="airport-date" autoComplete="off" type="date" value={day} onChange={event=>{if(event.target.value)setDate(event.target.value);}}/></label><button className="glance-today" data-current={date===null} onClick={()=>setDate(null)}>{c.today}</button><span>KST</span></div>
  <p className="glance-shared-note" data-testid="glance-shared-processing">{sharedNote}</p>
  {overviewHeading?.({day,scope,flights:data?.total??null,passengers:forecastPassengers,transferPassengers,referenceSum:referenceSum?.total??null,flightComparison:dailyComparison,flightBaseline})}
  <section className="glance-insights" aria-label={ui.summary}>
   {!hideRepeatedPassengerSummary&&<div className="glance-passenger-pair">
   <a className="glance-passengers" href={targets.forecast} data-testid="glance-key-passengers"><span>{todayLabel?pc.today:pc.selected}</span><strong>{forecastPassengers!==null?`${fmt.format(forecastPassengers)}${pc.people}`:forecastCoverage==='PARTIAL'?pc.partial:summary===undefined?c.loading:ic.unavailable}</strong><small>{dayText} · {forecastScope} · {pc.basis} · {pc.collected} {summary===undefined?stampHold:stamp(forecastAt)}</small></a>
   <a className="glance-transfers" href={targets.forecast} data-testid="glance-key-transfers"><span>{pc.transfer}</span><strong>{referenceSum&&<span className="glance-sum-operator">+ </span>}{transferPassengers!==null?`${fmt.format(transferPassengers)}${pc.people}`:summary===undefined?c.loading:ic.unavailable}</strong><small>{dayText} · {forecastScope} · {pc.transferBasis}</small></a>
   <div className="glance-passenger-sum" data-testid="glance-key-sum"><span>{sumLabel}</span><strong>{referenceSum&&<span className="glance-sum-operator">= </span>}{referenceSum?`${fmt.format(referenceSum.total)}${pc.people}`:'—'}</strong><small>{passengerReferenceCopy.arithmeticNote[lang]}</small></div>
   </div>}
   {overviewHeading&&<h2 className="glance-workday-heading">{isToday?'오늘 업무에서 먼저 확인':'선택일 업무 지표'}</h2>}
   <a href={targets.wait} data-testid="glance-key-wait"><span>{overviewHeading&&!isToday?'출국장 대기':ic.wait}</span><strong>{wait?`${wait.row.terminal} ${friendlyCheckpointName(wait.row.zone,lang)} · ${waitValue(wait)}`:overviewHeading&&!isToday?'오늘 자료에서 확인':pendingText??ic.unavailable}</strong><small>{wait?`${shortTime(wait.row.observedAt)} KST · ${ic.waitBasis}${wait.tied?` · ${ic.tie}`:''}`:<>{ic.waitBasis}{liveHold&&hold(` · 00:00 KST · ${ic.tie}`,'')}</>}</small></a>
   <a href={targets.map} data-testid="glance-key-upcoming"><span>{overviewHeading&&!isToday?'출발편 집중 시간':ic.upcoming}</span><strong>{overviewHeading&&!isToday?'오늘 자료에서 확인':upcoming?`${minuteText(upcoming.startMin)}–${minuteText(upcoming.endMin)} · ${upcoming.flights} ${c.unit}`:futureReady?ic.noUpcoming:pendingText??ic.unavailable}</strong><small>{dayText} KST · {ic.upcomingBasis}{upcoming?.tied?` · ${ic.tie}`:''}</small></a>
   <a href={targets.monthCountries} data-testid="glance-key-growth"><span>{ic.growth}</span><strong>{growth?<>{countryLabel(growth.country)} <CountChange delta={growth.delta} format={fmt.format} lang={lang} unit={ui.perDay}/>{ranking[1]&&sameDailyChange(ranking[1].delta,growth.delta)?` · ${ic.tie}`:''}</>:comparable?ic.noGrowth:pendingText??ic.unavailable}</strong><small>{previousMonthText} → {monthText} · {ui.days} {daysText(previous)} / {daysText(current)} {ui.dayUnit}</small></a>
   {overviewExtras&&<div className="glance-overview-extras">{overviewExtras}</div>}
  </section>
  {!ready&&!settling&&<p role="status" className="glance-status">{summary===null?c.missing:payload?.truncated?c.partial:c.missing}</p>}
  <section className="glance-airport" aria-label={ui.layout}><div className="glance-map-heading"><span>{c.total} · {scopeName} <strong>{totalText} {c.unit}</strong></span><a href={targets.map}>{c.detail} ↗</a></div><div className="glance-art-frame" data-artwork={artworkSrc?'ready':'pending'}>
   {artworkSrc?<img src={artworkSrc} srcSet={artworkSrcSet??"/images/airport-glance/approved-v1-480.webp 480w, /images/airport-glance/approved-v1-960.webp 960w, /images/airport-glance/approved-v1-1100.webp 1100w, /images/airport-glance/approved-v1-1200.webp 1200w, /images/airport-glance/approved-v1-1448.webp 1448w"} sizes={published?'(max-width:365px) calc(100vw - 52px), (max-width:700px) calc(100vw - 60px), (max-width:820px) calc(100vw - 84px), (max-width:895px) calc(100vw - 96px), 800px':'(max-width:700px) calc(100vw - 24px), (max-width:848px) calc(100vw - 48px), 800px'} width="1448" height="1086" alt="" decoding="async" fetchPriority="high"/>:<div className="glance-art-pending">{c.art}</div>}
   {(['T1','CONCOURSE','T2'] as const).map(building=>{const counts=data?.buildings[building],shares=counts?selectedZoneShares(counts):null,queue=building==='CONCOURSE'?null:glanceLongestWait(queues.filter(row=>row.terminal===building),clock);return <section key={building} className={`glance-building glance-building-${building}`} aria-label={buildingNames[building]} data-selected={scope==='all'||scope===building}><h2><span className="glance-building-label">{buildingNames[building]}</span> <span>{counts?`${counts.total} ${c.unit}`:pendingText?hold(`000 ${c.unit}`):'—'}</span></h2><dl>{(['WEST','CENTER','EAST'] as const).map(side=><div key={side}><dt>{({WEST:c.west,CENTER:c.center,EAST:c.east})[side]}</dt><dd>{shares?.[side]!==null&&shares?.[side]!==undefined?`${fmt.format(shares[side]!)}%`:pendingText?hold('00.0%'):'—'}</dd></div>)}</dl>{queue?<small className="glance-map-queue" data-queue-terminal={building}>{ic.waitShort} {waitValue(queue)} · {queue.row.zone.replace(/^DG(\d+)_/,'$1')} · {shortTime(queue.row.observedAt)}</small>:building!=='CONCOURSE'&&liveHold&&<small className="glance-map-queue glance-hold" data-shape={`${ic.waitShort} 00 ${ic.minute} · 0A · 00:00`}/>}{counts&&counts.UNVERIFIED>0&&<small className="glance-location-note">{c.unknown} {counts.UNVERIFIED} {c.unit}</small>}</section>;})}
  </div><details className="glance-context"><summary>{artworkNote??c.concept}</summary><p>{c.scope}</p><p>{c.scheduled}</p></details>{data&&data.unverifiedBuilding>0&&<p>{ui.building} {data.unverifiedBuilding} {c.unit}</p>}</section>
  <div className="glance-brief-data"><section className="glance-destinations" aria-label={dc.title}>{!hideRepeatedFlightSummary&&<div className="glance-day-comparison" data-testid="glance-day-comparison"><strong>{todayLabel?dailyCopy.today:dailyCopy.selected} {totalText} {c.unit}</strong><p>{dailyCopy.versus} {dailyComparison?<><b><CountChange delta={dailyComparison.delta} format={fmt.format} lang={lang} unit={` ${c.unit}`}/></b> (<ChangeRate value={dailyComparison.percent} lang={lang}/>)</>:pendingText??dailyCopy.missing}</p><small>{dayText} KST · {scopeName} · {dailyCopy.basis}<br/>{previousMonthText} · {ui.days} {daysText(previous)} {ui.dayUnit}{dailyComparison?` · ${dailyCopy.mean} ${fmt.format(dailyComparison.mean)} ${c.unit}`:pendingText?hold(` · ${dailyCopy.mean} 000.0 ${c.unit}`,''):''}</small></div>}<div className="glance-section-head"><h2>{dc.title}</h2><span>{dayText}</span></div><p>{dc.basis}</p>{data?<><ul>{leadingCountries.map(countryRow)}{unknownCountry&&countryRow(unknownCountry)}</ul>{data.total===0&&<p>0 {c.unit}</p>}</>:<p role="status">{pendingText??c.missing}</p>}<a className="glance-detail-link" href={targets.countries}>{dc.more}{data?` (${knownCountries.length})`:''} ↗</a></section>
  <section className="glance-ranking"><div className="glance-section-head"><h2>{ic.growthTitle}</h2></div><p>{c.basis}</p><p className="glance-included-days">{ui.days} · {c.previous} {daysUnit(previous)} / {c.current} {daysUnit(current)}</p><div className="glance-ranking-list" data-testid="glance-ranking-increase">{rankingTable(ranking,ic.noGrowth)}</div>{/* Owner: the decrease list sits right under the increase list, one note and one link below both. */}<div className="glance-ranking-list glance-ranking-decline" data-testid="glance-ranking-decrease"><div className="glance-section-head"><h2>{ic.declineTitle}</h2></div>{rankingTable(declines,ic.noDecline)}</div><small>{ui.mean}</small><a className="glance-detail-link" href={targets.monthCountries}>{c.detail} ↗</a></section></div>
  <section className="glance-future" data-testid="glance-future">
   <div className="glance-future-heading"><div role="group" aria-label={fc.title}>{([1,3,6] as const).map(hours=><button key={hours} aria-pressed={futureHours===hours} onClick={()=>setFutureHours(hours)}>{fc.ahead} {hours} {fc.hours}</button>)}</div></div>
   <div className="glance-future-cards">
    <article data-testid="glance-future-zones"><h2>{fc.zones}</h2>{future&&<p className="glance-window-time" data-testid="glance-zone-period">{windowLabel} {windowTime(future.start,future.end)} (KST)</p>}{!future?<p>{pendingText??ic.unavailable}</p>:future.total===0?<p>{fc.none}</p>:<>
     <div className="glance-zone-leaders">{future.leaders.length?future.leaders.map(row=>{const cutoff=row.countries[1]?.flights??0,leading=row.countries.filter((country,index)=>index<2||country.flights===cutoff);return <div className="glance-zone-leader" key={`${row.building}-${row.side}`} data-zone={`${row.building}-${row.side}`}>
      <div className="glance-zone-main"><strong>{buildingNames[row.building]} {row.side==='WEST'?c.west:row.side==='CENTER'?c.center:c.east}</strong><span>{row.flights} {c.unit} · <b>{fmt.format(row.share)}%</b></span></div>
      <div className="glance-zone-destinations"><small>{zoneCopy.destinations}</small>{leading.map(country=><span key={country.country??'UNKNOWN'}>{country.country?countryLabel(country.country):dc.unknown} {country.flights} {c.unit}</span>)}</div>
      <small className="glance-zone-peers">{zoneCopy.same} {buildingNames[row.building]} · {(['EAST','CENTER','WEST'] as const).filter(side=>side!==row.side).map(side=>`${side==='WEST'?c.west:side==='CENTER'?c.center:c.east} ${future.buildings[row.building][side]} ${c.unit}`).join(' · ')}</small>
     </div>;}):<p>{c.unknown}</p>}</div>
     <small className="glance-window-note">{compactCopy.basis}<br/>{zoneDenominator}{future.leaders.length>1?` · ${ic.tie}`:''}</small>
     <details><summary>{compactCopy.zones}</summary><table><thead><tr><th>{ui.terminal}</th>{[c.west,c.center,c.east].map(side=><th key={side}>{side}</th>)}</tr></thead><tbody>{(['T1','CONCOURSE','T2'] as const).filter(building=>scope==='all'||scope===building).map(building=>{const counts=future.buildings[building];return <tr key={building}><th>{buildingNames[building]}<small>{counts.total} {c.unit}{counts.UNVERIFIED>0?` · ${c.unknown} ${counts.UNVERIFIED}`:''}</small></th>{(['WEST','CENTER','EAST'] as const).map(side=><td key={side}>{counts[side]} {c.unit}<small>{counts.total>0?`${fmt.format(counts[side]/counts.total*100)}%`:'—'}</small></td>)}</tr>;})}</tbody></table><small>{fc.zoneBasis}</small></details>{future.unknownBuilding>0&&<p>{fc.unplaced} {future.unknownBuilding} {c.unit}</p>}
    </>}</article>
    <article data-testid="glance-future-countries"><h2>{gc.title}</h2>{increase.status==='READY'&&<p className="glance-window-time" data-testid="glance-comparison-periods"><span>{gc.before} {windowTime(increase.start,increase.middle)}</span>{' → '}<span>{gc.after} {windowTime(increase.middle,increase.end)} (KST)</span></p>}{increase.status==='UNAVAILABLE'?<p role="status">{unavailableIncrease}</p>:increase.status==='MIDNIGHT'?<p role="status">{gc.midnight}</p>:<>
     <div className="glance-destination-growth">{increase.leaders.length?increase.leaders.map(row=><div key={row.country} data-country={row.country}><strong>{countryLabel(row.country)}</strong><span>{row.before} → {row.after} {c.unit}</span><b><CountChange delta={row.delta} format={fmt.format} lang={lang} unit={` ${c.unit}`}/></b></div>):<p>{increase.beforeTotal+increase.afterTotal===0?availabilityCopy.zero:increase.unknown.before+increase.unknown.after>0?gc.uncertain:gc.none}</p>}</div>
     <small className="glance-window-note">{gc.basis}{increase.leaders.length>1?` · ${ic.tie}`:''}</small>
     {increase.unknown.before+increase.unknown.after>0&&<small>{gc.unknown} {increase.unknown.before} → {increase.unknown.after} {c.unit} · {gc.excluded}</small>}
     {increaseRest.length>0&&<details><summary>{gc.more} ({increase.rows.length})</summary><div className="glance-destination-growth">{increaseRest.map(row=><div key={row.country}><span>{countryLabel(row.country)}</span><span>{row.before} → {row.after} {c.unit}</span><b><CountChange delta={row.delta} format={fmt.format} lang={lang} unit={` ${c.unit}`}/></b></div>)}</div><small>{gc.known}</small></details>}
    </>}</article>
   </div>
   <p>{future?`${day} · ${scopeName} · ${compactCopy.basis}`:fc.closed}</p>
   {future?.clipped&&<small>{fc.midnight}</small>}
   <details className="glance-context"><summary>{compactCopy.rules}</summary><p>{fc.basis}</p><p>{gc.records}</p><p>{fc.zoneBasis}</p></details>
  </section>
  <footer><span>{c.collected} · {settling?stampHold:stamp(payload?.retrievedAt)}</span><span>{c.monthTime} · {monthPending?stampHold:stamp(monthRequest.reply?.calculatedAt)}</span><a href="https://www.airport.kr/geomap/ap_ko/view.do" target="_blank" rel="noreferrer">{ui.map} ↗</a></footer>
 </Container>;
}

const countChangeWords={ko:['증가','감소'],en:['up','down'],zh:['增加','减少'],ja:['増加','減少']} as const;
/** A daily-mean flight-count change: the printed sign is visual, the words carry the direction. */
function CountChange({delta,format,lang,unit=''}:{delta:number;format:(value:number)=>string;lang:Lang;unit?:string}){
 const text=dailyChangeText(delta,format);
 if(delta===0)return <span className="change-rate" data-direction="neutral">{text}{unit}</span>;
 const [up,down]=countChangeWords[lang];
 return <span className="glance-count-change change-rate" data-direction={delta>0?'up':'down'} data-delta={delta>0?'up':'down'}><span aria-hidden="true">{text}{unit}</span><span className="sr-only">{delta>0?up:down} {text.replace(/^[▲▽] [＋+−]/,'')}{unit}</span></span>;
}


