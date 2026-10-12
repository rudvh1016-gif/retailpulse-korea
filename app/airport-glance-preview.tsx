'use client';
import {useMemo,useState} from 'react';
import type {Lang} from './retailpulse-data';
import {useLiveSummary} from './live-signals';
import {useFlights} from './flights-client';
import {usePreparedMonth} from './use-prepared-month';
import {usePresentationClock} from './area-demand-card';
import {ChangeRate} from './change-rate';
import {glanceFlights,glanceCountryRanking,glanceLongestWait,glanceUpcoming,type GlanceScope} from '../lib/airport-glance';
import {previousFlightMonth,type AirportMonthlyRollups} from '../lib/airport-monthly-flights';
import {selectedZoneShares} from '../lib/airport-zone-shares';
import {kstDayOf} from '../lib/kst';
import {friendlyCheckpointName} from '../lib/airport-today-summary';
import './airport-glance-preview.css';
interface MonthReply{status:string;month:string;data:AirportMonthlyRollups|null;calculatedAt:string|null}
const copy={
 ko:{title:'공항 한눈에',detail:'공항 상세',preview:'공개 반영 전 미리보기',all:'전체',today:'오늘',date:'날짜',total:'선택일 출발편',now:'현재 시간대',unit:'편',hourly:'시간대별 출발편',country:'목적지 국가별 출발편 신장률',basis:'실제 포함일 일평균 기준 · 전월 일평균 0·비교 불가 제외',previous:'전월',current:'선택월',change:'증감률',ready:'출국 준비',readyNote:'수속·수하물·보안검색 안내',news:'관세·면세 뉴스',newsNote:'공식 출처와 발표 시각 확인',loading:'자료 확인 중…',missing:'확인 가능한 자료가 없습니다.',partial:'일부 기록입니다. 전체 합계로 표시하지 않습니다.',art:'승인된 공항 그림 연결 대기',concept:'개념도 · 공식 좌표 아님',west:'서편',center:'중앙',east:'동편',unknown:'위치 미확인',concourse:'탑승동',selected:'선택 시간',collected:'항공편 자료 수집',monthTime:'월별 집계 시각',scope:'구역 비율은 각 건물 전체 출발편 기준이며 위치 미확인도 포함합니다.',rank:'신장률 상위 5개',wait:'대기 관측은 출국장별 상세에서 확인',scheduled:'출발 예정시각 기준 · 편수는 승객 수·실제 운항 실적이 아닙니다.'},
 en:{title:'Airport at a glance',detail:'Airport details',preview:'Preview before publication',all:'All',today:'Today',date:'Date',total:'Selected-day departures',now:'Current hour',unit:'flights',hourly:'Departures by hour',country:'Departure growth by destination country',basis:'Included dates · zero or missing previous means excluded',previous:'Previous',current:'Selected',change:'Change',ready:'Prepare for departure',readyNote:'Check-in, baggage and security',news:'Customs & Duty-Free News',newsNote:'Official sources and publication times',loading:'Checking data…',missing:'No verified data available.',partial:'Partial records; no complete total shown.',art:'Approved airport artwork pending',concept:'Concept layout · not official coordinates',west:'West',center:'Centre',east:'East',unknown:'Unverified',concourse:'Concourse',selected:'Selected hour',collected:'Flights collected',monthTime:'Monthly calculation',scope:'Zone shares use each building’s total departures, including unverified locations.',rank:'Top 5 change rates',wait:'See queue observations by checkpoint in details',scheduled:'Scheduled departure times · flights are not people or certified actual operations.'},
 zh:{title:'机场一览',detail:'机场详情',preview:'公开前预览',all:'全部',today:'今天',date:'日期',total:'所选日期出发航班',now:'当前时段',unit:'班',hourly:'各时段出发航班',country:'目的地国家出发航班增长率',basis:'按实际计入日期计算 · 排除上月为零或无法比较的数据',previous:'上月',current:'所选月份',change:'变化率',ready:'出境准备',readyNote:'值机、行李与安检指南',news:'海关·免税新闻',newsNote:'查看官方来源与发布时间',loading:'正在核实数据…',missing:'暂无可核实的数据。',partial:'记录不完整，不显示完整总数。',art:'等待连接已批准的机场图像',concept:'布局示意图 · 非官方坐标',west:'西侧',center:'中央',east:'东侧',unknown:'位置未确认',concourse:'卫星厅',selected:'所选时段',collected:'航班数据采集',monthTime:'月度汇总时间',scope:'区域比例以各建筑全部出发航班为分母，包含位置未确认的航班。',rank:'增长率前5名',wait:'各出境检查区的排队观测请查看详情',scheduled:'以计划出发时间为准 · 航班数不等于人数或实际运行量。'},
 ja:{title:'空港ひと目で',detail:'空港詳細',preview:'公開前プレビュー',all:'すべて',today:'今日',date:'日付',total:'選択日の出発便',now:'現在の時間帯',unit:'便',hourly:'時間帯別の出発便',country:'目的地の国別・出発便増加率',basis:'実際に集計した日数が基準 · 前月ゼロ・比較不可を除外',previous:'前月',current:'選択月',change:'増減率',ready:'出国準備',readyNote:'チェックイン・手荷物・保安検査',news:'税関・免税ニュース',newsNote:'公式情報と発表日時を確認',loading:'データを確認中…',missing:'確認できるデータがありません。',partial:'一部の記録のため、全体の合計は表示しません。',art:'承認済み空港画像の接続待ち',concept:'配置の概念図 · 公式座標ではありません',west:'西側',center:'中央',east:'東側',unknown:'位置未確認',concourse:'搭乗棟',selected:'選択時間',collected:'便データ収集',monthTime:'月別集計時刻',scope:'各建物の全出発便を分母とし、位置未確認の便も含みます。',rank:'増加率上位5件',wait:'待ち時間の観測は出国場別の詳細で確認',scheduled:'出発予定時刻が基準 · 便数は人数や実際の運航実績ではありません。'},
} as const;
const destinationCopy={
 ko:{title:'목적지 국가별 출발편 비율',basis:'선택일 전체 출발편 기준 · 승객·항공사 국적 아님',more:'국가 전체 보기',unknown:'목적지 미정',domestic:'국내 목적지'},
 en:{title:'Departures by destination country',basis:'All selected-day departures · not passenger or airline nationality',more:'All countries',unknown:'Destination unknown',domestic:'Domestic destinations'},
 zh:{title:'目的地国家出发航班占比',basis:'所选日期全部出发航班 · 非旅客或航空公司国籍',more:'全部国家',unknown:'目的地未确认',domestic:'国内目的地'},
 ja:{title:'目的地の国別・出発便の割合',basis:'選択日の全出発便が基準 · 旅客・航空会社の国籍ではありません',more:'すべての国',unknown:'目的地未確認',domestic:'国内目的地'},
} as const;
const interfaceCopy={
 ko:{seoul:'서울',building:'건물 미정',country:'국가',mean:'일평균 · 편/일',map:'공식 공항 지도',main:'주 메뉴',terminal:'터미널',summary:'요약',layout:'공항 배치',more:'공항 추가 정보',days:'포함일',dayUnit:'일'},
 en:{seoul:'Seoul',building:'Building unconfirmed',country:'Country',mean:'Daily mean · flights/day',map:'Official airport map',main:'Main',terminal:'Terminal',summary:'Summary',layout:'Airport layout',more:'More airport information',days:'Included dates',dayUnit:'days'},
 zh:{seoul:'首尔',building:'建筑未确认',country:'国家',mean:'日均 · 班/日',map:'机场官方地图',main:'主菜单',terminal:'航站楼',summary:'摘要',layout:'机场布局',more:'更多机场信息',days:'计入日期',dayUnit:'天'},
 ja:{seoul:'ソウル',building:'建物未確認',country:'国',mean:'1日平均 · 便/日',map:'空港公式地図',main:'メインメニュー',terminal:'ターミナル',summary:'概要',layout:'空港配置',more:'空港の詳細情報',days:'集計日数',dayUnit:'日'},
} as const;
const insightCopy={
 ko:{wait:'지금 가장 긴 출국장 대기',waitBasis:'확인된 최신 관측 중',upcoming:'앞으로 출발편 집중 시간',upcomingBasis:'출발 예정 편수 · 승객 혼잡 아님',growth:'전월비 일평균 가장 늘어난 목적지',noGrowth:'비교 가능한 증가 없음',noUpcoming:'현재 이후 예정편 없음',unavailable:'확인 가능한 자료 없음',minute:'분',observed:'관측',waitShort:'대기',tie:'동률',shared:'T1 출국장 이용',growthTitle:'전월비 일평균 증감 Top 5'},
 en:{wait:'Longest current departure-hall wait',waitBasis:'Among fresh available observations',upcoming:'Busiest upcoming departure slot',upcomingBasis:'Scheduled flights · not passenger crowding',growth:'Largest daily-mean growth vs previous month',noGrowth:'No comparable increase',noUpcoming:'No remaining scheduled departures',unavailable:'No verified data',minute:'min',observed:'Observed',waitShort:'Wait',tie:'Tied',shared:'Uses T1 departure halls',growthTitle:'Daily-mean change vs previous month · Top 5'},
 zh:{wait:'当前最长出境厅等候',waitBasis:'在已确认的最新观测中',upcoming:'未来出发航班集中时段',upcomingBasis:'计划出发班次 · 不代表旅客拥挤',growth:'较上月日均增幅最大的目的地',noGrowth:'暂无可比较的增长',noUpcoming:'暂无当前之后的计划出发航班',unavailable:'暂无可核实资料',minute:'分',observed:'观测',waitShort:'等候',tie:'并列',shared:'使用T1出境厅',growthTitle:'较上月日均变化 · 前5名'},
 ja:{wait:'現在最も長い出国場の待ち時間',waitBasis:'確認できる新しい観測の中で',upcoming:'今後の出発便が集中する時間帯',upcomingBasis:'出発予定便数 · 旅客の混雑ではありません',growth:'前月比で日平均が最も増えた目的地',noGrowth:'比較できる増加なし',noUpcoming:'現在以降の出発予定便なし',unavailable:'確認できる資料なし',minute:'分',observed:'観測',waitShort:'待ち',tie:'同順位',shared:'T1出国場を利用',growthTitle:'前月比の日平均増減 · 上位5件'},
} as const;
export default function AirportGlancePreview({lang,artworkSrc=null}:{lang:Lang;artworkSrc?:string|null}){
 const c=copy[lang],ui=interfaceCopy[lang],dc=destinationCopy[lang],ic=insightCopy[lang];
 const [date,setDate]=useState<string|null>(null),[scope,setScope]=useState<GlanceScope>('all');
 const summary=useLiveSummary(date),day=date??summary?.serviceDateKst??'';
 const loaded=useFlights(day||null),clock=usePresentationClock(summary?.generatedAt??'1970-01-01T00:00:00Z');
 const month=day.slice(0,7),previousMonth=month?previousFlightMonth(month):'',monthRequest=usePreparedMonth<MonthReply>(month,`/api/live/airport-months?month=${encodeURIComponent(month)}`,month,day);
 const payload=loaded?.status==='OK'?loaded.payload:null;
 const ready=Boolean(payload&&!payload.truncated&&(payload.retrievedAt||payload.flights.length));
 const data=useMemo(()=>ready&&payload?glanceFlights(day,payload.flights,scope):null,[ready,payload,day,scope]);
 const current=monthRequest.reply?.data?.months.find(row=>row.month===month),previous=monthRequest.reply?.data?.months.find(row=>row.month===previousMonth);
 const ranking=glanceCountryRanking(current,previous,scope==='all'?'ALL':scope),growth=ranking[0]?.percent!==null&&ranking[0]?.percent>0?ranking[0]:null;
 const names=new Intl.DisplayNames([lang],{type:'region'}),fmt=new Intl.NumberFormat(lang,{maximumFractionDigits:1});
 const isToday=Number.isFinite(clock)&&kstDayOf(new Date(clock).toISOString())===day&&summary?.dayRelation==='TODAY';
 const queues=isToday?summary?.airport.congestion??[]:[],wait=glanceLongestWait(queues.filter(row=>scope==='all'||row.terminal===scope),clock);
 const futureReady=Boolean(data&&summary&&Number.isFinite(clock)&&Number.isFinite(Date.parse(summary.generatedAt)));
 const upcoming=futureReady&&data?glanceUpcoming(day,data.departures,clock):null;
 const stamp=(value:string|null|undefined)=>value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat(lang,{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value))+' KST':'—';
 const shortTime=(value:string)=>new Intl.DateTimeFormat(lang,{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
 const minuteText=(minute:number)=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
 const details=`/${lang}/airport?terminal=${scope}${day?`&date=${day}`:''}`;
 const buildingNames={T1:'T1',CONCOURSE:c.concourse,T2:'T2'},countryName=(country:string)=>country==='KR'?dc.domestic:names.of(country)??country;
 const knownCountries=data?.countries.filter(row=>row.country!==null)??[],unknownCountry=data?.countries.find(row=>row.country===null);
 const countryLimit=knownCountries[5]?.flights??0,leadingCountries=knownCountries.filter((row,index)=>index<6||row.flights===countryLimit);
 const countryRow=(row:{country:string|null;flights:number})=><li key={row.country??'UNKNOWN'} data-country={row.country??'UNKNOWN'}><span>{row.country===null?dc.unknown:countryName(row.country)}</span><span>{fmt.format(row.flights)} {c.unit}</span><strong>{data&&data.total>0?`${fmt.format(row.flights/data.total*100)}%`:'—'}</strong></li>;
 const waitValue=(value:NonNullable<typeof wait>)=>`${value.minutes}${value.row.waitTimeRaw==='60+'?'+':''} ${ic.minute}`;
 return <main className="glance-preview" data-testid="airport-glance-preview">
  <header className="glance-header"><a href={`/${lang}/airport`} className="glance-brand">KORETAIL<span>Retail Demand Signals for Korea</span></a><nav aria-label={ui.main}><a href={details}>{c.detail}</a><a href={`/${lang}/myeongdong`}>{ui.seoul}</a></nav></header>
  <div className="glance-heading"><h1>{c.title}</h1><small>{c.preview}</small></div>
  <div className="glance-controls"><div role="group" aria-label={ui.terminal}>{(['all','T1','T2'] as const).map(value=><button key={value} aria-pressed={scope===value} onClick={()=>setScope(value)}>{value==='all'?c.all:value}</button>)}</div><label>{c.date}<input type="date" value={day} onChange={event=>{if(event.target.value)setDate(event.target.value);}}/></label><button onClick={()=>setDate(null)}>{c.today}</button><span>KST</span></div>
  <section className="glance-insights" aria-label={ui.summary}>
   <a href={`${details}#airport-checkpoints-title`} data-testid="glance-key-wait"><span>{ic.wait}</span><strong>{wait?`${wait.row.terminal} ${friendlyCheckpointName(wait.row.zone,lang)} · ${waitValue(wait)}`:ic.unavailable}</strong><small>{wait?`${shortTime(wait.row.observedAt)} KST · ${ic.waitBasis}${wait.tied?` · ${ic.tie}`:''}`:ic.waitBasis}</small></a>
   <a href={`${details}#airport-departure-model-slot`} data-testid="glance-key-upcoming"><span>{ic.upcoming}</span><strong>{upcoming?`${minuteText(upcoming.startMin)}–${minuteText(upcoming.endMin)} · ${upcoming.flights} ${c.unit}`:futureReady?ic.noUpcoming:ic.unavailable}</strong><small>{day||'—'} KST · {ic.upcomingBasis}{upcoming?.tied?` · ${ic.tie}`:''}</small></a>
   <a href={`${details}#airport-monthly-flights`} data-testid="glance-key-growth"><span>{ic.growth}</span><strong>{growth?<>{countryName(growth.country)} <ChangeRate value={growth.percent} lang={lang}/>{ranking[1]?.percent===growth.percent?` · ${ic.tie}`:''}</>:ranking.length?ic.noGrowth:ic.unavailable}</strong><small>{previousMonth||'—'} → {month||'—'} · {ui.days} {previous?.includedDays.length??'—'} / {current?.includedDays.length??'—'} {ui.dayUnit}</small></a>
  </section>
  {!ready&&<p role="status" className="glance-status">{summary===null?c.missing:loaded===undefined?c.loading:payload?.truncated?c.partial:c.missing}</p>}
  <section className="glance-airport" aria-label={ui.layout}><div className="glance-map-heading"><span>{c.total} · {scope==='all'?c.all:scope} <strong>{data?fmt.format(data.total):'—'} {c.unit}</strong></span><a href={`${details}#airport-departure-model-slot`}>{c.detail} ↗</a></div><div className="glance-art-frame" data-artwork={artworkSrc?'ready':'pending'}>
   {artworkSrc?<img src={artworkSrc} srcSet="/images/airport-glance/approved-v1-480.webp 480w, /images/airport-glance/approved-v1-960.webp 960w, /images/airport-glance/approved-v1-1448.webp 1448w" sizes="(max-width:700px) calc(100vw - 24px), (max-width:848px) calc(100vw - 48px), 800px" width="1448" height="1086" alt="" decoding="async" fetchPriority="high"/>:<div className="glance-art-pending">{c.art}</div>}
   {(['T1','CONCOURSE','T2'] as const).map(building=>{const counts=data?.buildings[building],shares=counts?selectedZoneShares(counts):null,queue=building==='CONCOURSE'?null:glanceLongestWait(queues.filter(row=>row.terminal===building),clock);return <section key={building} className={`glance-building glance-building-${building}`} aria-label={buildingNames[building]} data-selected={scope==='all'||scope===building||(scope==='T1'&&building==='CONCOURSE')}><h2>{buildingNames[building]} <span>{counts?`${counts.total} ${c.unit}`:'—'}</span></h2><dl>{(['WEST','CENTER','EAST'] as const).map(side=><div key={side}><dt>{({WEST:c.west,CENTER:c.center,EAST:c.east})[side]}</dt><dd>{shares?.[side]!==null&&shares?.[side]!==undefined?`${fmt.format(shares[side]!)}%`:'—'}</dd></div>)}</dl>{queue&&<small className="glance-map-queue" data-queue-terminal={building}>{ic.waitShort} {waitValue(queue)} · {queue.row.zone.replace(/^DG(\d+)_/,'$1')} · {shortTime(queue.row.observedAt)}</small>}{counts&&counts.UNVERIFIED>0&&<small className="glance-location-note">{c.unknown} {counts.UNVERIFIED} {c.unit}</small>}</section>;})}
  </div><details className="glance-context"><summary>{c.concept}</summary><p>{c.scope}</p><p>{c.scheduled}</p></details>{data&&data.unverifiedBuilding>0&&<p>{ui.building} {data.unverifiedBuilding} {c.unit}</p>}</section>
  <div className="glance-brief-data"><section className="glance-destinations" aria-label={dc.title}><div className="glance-section-head"><h2>{dc.title}</h2><span>{day||'—'}</span></div><p>{dc.basis}</p>{data?<><ul>{leadingCountries.map(countryRow)}{unknownCountry&&countryRow(unknownCountry)}</ul>{data.total===0&&<p>0 {c.unit}</p>}</>:<p role="status">{c.missing}</p>}<a className="glance-detail-link" href={`${details}#airport-departure-model-slot`}>{dc.more} ({knownCountries.length}) ↗</a></section>
  <section className="glance-ranking"><div className="glance-section-head"><h2>{ic.growthTitle}</h2></div><p>{c.basis}</p><p className="glance-included-days">{ui.days} · {c.previous} {previous?`${previous.includedDays.length} ${ui.dayUnit}`:'—'} / {c.current} {current?`${current.includedDays.length} ${ui.dayUnit}`:'—'}</p><table><thead><tr><th>{ui.country}</th><th>{previous?.month??(previousMonth||'—')}</th><th>{month||'—'}</th><th>{c.change}</th></tr></thead><tbody>{ranking.map(row=><tr key={row.country} data-country={row.country}><th scope="row">{countryName(row.country)}</th><td>{fmt.format(row.previous!)}</td><td>{fmt.format(row.current!)}</td><td><ChangeRate value={row.percent} lang={lang}/></td></tr>)}</tbody></table>{!ranking.length&&<p role="status">{month&&monthRequest.pending?c.loading:c.missing}</p>}<small>{ui.mean}</small><a className="glance-detail-link" href={`${details}#airport-monthly-flights`}>{c.detail} ↗</a></section></div>
  <nav className="glance-actions" aria-label={ui.more}><a href={`${details}#airport-departure-preparation`}><strong>{c.ready}</strong><span>{c.readyNote} ↗</span></a><a href={`/${lang}/airport-news`}><strong>{c.news}</strong><span>{c.newsNote} ↗</span></a></nav>
  <footer><span>{c.collected} · {stamp(payload?.retrievedAt)}</span><span>{c.monthTime} · {stamp(monthRequest.reply?.calculatedAt)}</span><a href="https://www.airport.kr/geomap/ap_ko/view.do" target="_blank" rel="noreferrer">{ui.map} ↗</a></footer>
 </main>;
}
