'use client';

import {useEffect,useId,useMemo,useRef,useState} from 'react';
import type {Lang} from './retailpulse-data';
import type {FlightsPayload} from './flights-client';
import type {GlanceWeekReference} from '../lib/glance-week-comparison';
import {buildShiftBriefing,shiftBriefingSignature,type ShiftBriefingResult,type ShiftComparison,type ShiftReason} from '../lib/shift-briefing';
import {useAirportHistory} from './airport-history-client';
import {saveBusinessPreferences,useBusinessPreferences} from './business-preferences';
import {HOUR_CHOICES,type BusinessPreferences} from '../lib/business-preferences';
import {industryLabels,type IndustryId} from '../lib/industry-ids';
import {buildShiftStoreChecks} from '../lib/shift-store-checks';
import {CountryFlag} from './airport-country-flag';
import {PrepShare} from './prep-share';
import {shareLink,type ShareDocument} from '../lib/prep-share';
import {siteOrigin} from './seo-config';
import {ChangeRate,CountChange} from './change-rate';
import {formatChangeRate} from '../lib/change-rate';
import {trackPersonalEvent} from '../lib/personal-analytics';
import './shift-briefing.css';

const row=(ko:string,en:string,zh:string,ja:string):Record<Lang,string>=>({ko,en,zh,ja});
const copy={
 unspecified:row('위치 미지정','Location not set','未指定位置','位置未指定'),
 storeLocation:row('매장 위치','Store location','门店位置','店舗の位置'),
 areaReference:row('매장 쪽 탑승구 참고','Gates near the store · reference','门店一侧登机口参考','店舗側の搭乗口参考'),
 westArea:row('서편·중앙 포함','West + centre','西侧·含中央','西側・中央を含む'),
 eastArea:row('동편·중앙 포함','East + centre','东侧·含中央','東側・中央を含む'),
 sideLimits:row('탑승구 위치 기준이며 매장 방문 구역을 뜻하지 않습니다.','Gate locations do not identify which stores passengers visit.','登机口位置不代表旅客会到访的门店区域。','搭乗口の位置は来店するエリアを示しません。'),
 destinations:row('주요 출발 목적지','Main destinations','主要出发目的地','主な出発先'),
 topThree:row('상위 3곳','Top 3','前3位','上位3地域'),
 destinationBasis:row('국가·지역 기준 · 승객 국적과 다름','Countries and regions · not passenger nationality','按国家与地区·不代表旅客国籍','国・地域別・旅客の国籍とは異なります'),
 destinationPartial:row('확인된 목적지 기준 · 전체 순위 미확정','Verified destinations only · full ranking unconfirmed','仅已确认目的地·整体排名未确定','確認できた目的地のみ・全体順位は未確定'),
 destinationUnknown:row('목적지 미확인','Unknown destination','目的地未确认','目的地未確認'),
 destinationEmpty:row('확인된 목적지 자료가 없습니다.','No verified destination data.','暂无已确认的目的地资料。','確認できた目的地資料がありません。'),
 allDestinations:row('전체 목적지','All destinations','全部目的地','すべての目的地'),
 details:row('구역·목적지·비교 자세히','Area, destinations and comparisons','区域、目的地与比较详情','エリア・目的地・比較の詳細'),
 title:row('내 근무 브리핑','My shift briefing','我的当班简报','勤務ブリーフィング'),
 intro:row('근무하는 곳과 시간을 저장하면, 필요한 변화와 준비사항을 바로 볼 수 있어요.','Save your work location and hours to see relevant changes and preparation.','保存工作区域和时间，即可查看相关变化与准备事项。','勤務場所と時間を保存すると、関連する変化や準備をすぐ確認できます。'),
 edit:row('설정 변경','Edit settings','修改设置','設定を変更'),
 terminal:row('터미널','Terminal','航站楼','ターミナル'),
 zone:row('매장 위치 (선택)','Store location (optional)','门店位置（选填）','店舗の位置（任意）'),
 all:row('터미널 전체','Whole terminal','整个航站楼','ターミナル全体'),
 west:row('서편 근무','West-side store','西侧门店','西側の店舗'),
 east:row('동편 근무','East-side store','东侧门店','東側の店舗'),
 industry:row('업종','Business type','业态','業種'),
 selectIndustry:row('업종 선택','Choose business type','选择业态','業種を選択'),
 unselected:row('업종 선택 전','Business type not selected','尚未选择业态','業種未選択'),
 start:row('근무 시작','Shift starts','上班时间','勤務開始'),
 end:row('근무 종료','Shift ends','下班时间','勤務終了'),
 chooseTime:row('시간 선택','Select time','选择时间','時間を選択'),
 wholeDay:row('하루 전체','Whole day','全天','終日'),
 save:row('저장하고 보기','Save and view','保存并查看','保存して表示'),
 cancel:row('취소','Cancel','取消','キャンセル'),
 device:row('이 기기에 저장되며, 다음 방문에도 같은 조건으로 열립니다.','Saved on this device for your next visit.','保存在本设备，下次访问将使用相同条件。','この端末に保存し、次回も同じ条件で表示します。'),
 previewDevice:row('시안에서는 이번 화면에만 적용됩니다. 서비스 적용 시 이 기기에 저장됩니다.','Preview changes apply to this screen only; the service saves them on this device.','预览中仅应用于本画面；服务启用后将保存在本设备。','プレビューではこの画面にのみ適用します。サービスでは端末に保存します。'),
 failed:row('이 기기에 저장하지 못했습니다. 이번 방문에만 적용됩니다.','Could not save on this device. Applied for this visit only.','无法保存在本设备，仅在本次访问中使用。','この端末に保存できません。今回の訪問にのみ適用します。'),
 saved:row('근무 조건을 저장했습니다.','Shift settings saved.','已保存当班条件。','勤務条件を保存しました。'),
 savedBasis:row('저장한 근무 기준','Your saved shift','已保存的当班条件','保存した勤務条件'),
 current:row('내 근무시간 출발편','Departures during my shift','当班时段出发航班','勤務時間の出発便'),
 confirmed:row('확인된 출발편','Verified departures','已确认出发航班','確認できた出発便'),
 flights:row('편',' flights','班','便'),
 peak:row('출발편 최다 시간','Hour with the most departures','出发航班最多的时段','出発便が最も多い時間'),
 tie:row('동률 시간 있음','Other hours tied','存在并列时段','同数の時間帯あり'),
 scheduled:row('동·서편 모두 포함 · 출발 예정시각 기준','Both sides included · scheduled departure times','包含东西两侧·按计划出发时刻','東西を含む・予定出発時刻基準'),
 t1:row('T1 전체는 탑승동 포함','Whole T1 includes the concourse','T1全体包含登机楼','T1全体は搭乗棟を含む'),
 compare:row('같은 근무시간으로 비교','Compare the same shift hours','相同当班时间对比','同じ勤務時間で比較'),
 week:row('① 지난주 같은 요일','① Same weekday last week','① 上周同一天','① 先週の同じ曜日'),
 month:row('② 전월 일평균','② Previous-month daily mean','② 上月日均','② 前月の日平均'),
 partialMonthLabel:row('② 전월 확인일 평균','② Mean of verified previous-month days','② 上月已确认日期的日均','② 前月の確認日の平均'),
 zeroDifference:row('확인일 기준 차이 0편','0-flight difference on verified days','已确认日期差值为0班','確認日基準の差0便'),
 noComparison:row('비교자료 없음','Comparison unavailable','暂无比较资料','比較資料なし'),
 baseline:row('비교 기준','Baseline','比较基准','比較基準'),
 included:row('포함일','Included days','计入日期','集計日数'),
 days:row('일',' days','天','日'),
 same:row('변화 없음','No change','无变化','変化なし'),
 unchanged:row('지난 확인 이후 주요 변화가 없습니다.','No material changes since your last check.','与上次查看相比，没有主要变化。','前回確認から主な変化はありません。'),
 checked:row('지난 확인','Last checked','上次查看','前回確認'),
 comparisonSame:row('지난주·전월 비교 기준 대비 변화가 없습니다.','No change against either comparison baseline.','与上周、上月比较基准均无变化。','先週・前月の比較基準から変化はありません。'),
 prepare:row('매장에서 확인할 준비사항','Checks for your store','店内准备检查','店舗で確認する準備'),
 preparationBasis:row('업종별 기본 체크 · 실제 상태는 매장에서 확인','Routine checks for your business · verify conditions in store','业态日常检查·实际情况请在店内确认','業種別の基本チェック・実際の状態は店頭で確認'),
 preparationHint:row('눌러서 확인 순서 보기','Open for check steps','展开查看检查步骤','開いて確認手順を見る'),
 basis:row('집계·비교 기준 보기','Counting and comparison basis','查看统计与比较依据','集計・比較の基準'),
 source:row('항공편 자료 기준','Flight data as of','航班资料基准','便資料の基準'),
 boundary:row('시작 시각 포함 · 종료 시각 제외 · KST','Start inclusive · end exclusive · KST','包含开始时刻·不含结束时刻·KST','開始時刻を含む・終了時刻を除く・KST'),
 limits:row('항공편 수는 승객 수나 매장 방문·매출 예측이 아닙니다.','Flight counts do not predict passengers, store visits or sales.','航班数不代表旅客数、到店人数或销售预测。','便数は旅客数・来店数・売上の予測ではありません。'),
 more:row('매장 준비 상세 보기','Store preparation details','查看店铺准备详情','店舗準備の詳細'),
 loading:row('근무 자료를 확인하고 있습니다.','Checking shift data.','正在确认当班资料。','勤務資料を確認しています。'),
 unavailable:row('선택한 근무시간의 자료가 없습니다.','No data for the selected shift.','所选当班时间暂无资料。','選択した勤務時間の資料がありません。'),
 partial:row('일부 자료만 확인되어 전체 합계·집중 시간은 보류합니다.','Partial data; the full total and busiest hour are withheld.','仅确认部分资料，暂不显示完整总数和集中时段。','一部資料のみのため、全体合計・集中時間は保留します。'),
 overnight:row('자정을 넘는 근무는 다음 날 자료까지 필요해 현재 집계를 제공하지 않습니다.','Overnight shifts require next-day data; no total is shown yet.','跨午夜班次需要次日资料，目前不提供汇总。','日をまたぐ勤務には翌日資料が必要なため、現在は集計を表示しません。'),
 minutes:row('과거 자료는 1시간 단위로만 있어 이 근무시간과 비교할 수 없습니다.','History is hourly, so this shift cannot be compared exactly.','历史资料仅按整小时保存，无法精确比较本班次。','履歴が1時間単位のため、この勤務時間と正確に比較できません。'),
 partialMonth:row('전월 중 자료가 확인된 날짜만 평균에 포함합니다.','Only verified dates from the previous month enter the mean.','均值仅计入上月已确认资料的日期。','前月の資料を確認できた日のみ平均に含めます。'),
 sample:row('시안용 예시 자료','Example data for design review','设计预览示例数据','デザイン確認用の例'),
 savedCopy:row('복사·이미지는 저장 시점의 내용입니다.','Copied text and images keep the data shown when saved.','复制文字和图片保留保存时的资料。','コピー・画像は保存時点の内容です。'),
 unplaced:row('근무시간 내 위치 미확인','Unplaced within the shift','当班时段位置未确认','勤務時間内の位置未確認'),
 nextDay:row('다음 날','Next day','次日','翌日'),
 required:row('근무 시작과 종료 시간을 선택해 주세요.','Select the shift start and end times.','请选择上下班时间。','勤務開始・終了時間を選んでください。'),
 loadingSettings:row('저장한 근무 조건을 확인하고 있습니다.','Checking saved shift settings.','正在确认已保存的当班条件。','保存した勤務条件を確認しています。'),
};

function time(iso:string|null|undefined){if(!iso)return '—';const at=Date.parse(iso);return Number.isFinite(at)?new Date(at+9*3_600_000).toISOString().slice(11,16):'—';}
function stamp(iso:string|null|undefined){if(!iso)return '—';const at=Date.parse(iso);return Number.isFinite(at)?new Date(at+9*3_600_000).toISOString().slice(0,16).replace('T',' '):'—';}
function shortDay(day:string){return /^\d{4}-\d{2}-\d{2}$/.test(day)?`${Number(day.slice(5,7))}/${Number(day.slice(8,10))}`:day;}
function scopeLabel(preferences:BusinessPreferences,lang:Lang){return `${preferences.terminal} · ${preferences.side==='WEST'?copy.west[lang]:preferences.side==='EAST'?copy.east[lang]:copy.unspecified[lang]}`;}
function hoursText(preferences:BusinessPreferences,lang:Lang){const h=preferences.hours;return !h||h.open===h.close?copy.wholeDay[lang]:`${h.open}–${h.close}${h.close<h.open?` (${copy.nextDay[lang]})`:''}`;}
function reasonText(reason:ShiftReason|null|undefined,lang:Lang){return reason==='UNSUPPORTED_OVERNIGHT'?copy.overnight[lang]:reason==='UNSUPPORTED_MINUTE_HISTORY'?copy.minutes[lang]:reason==='PENDING'?copy.loading[lang]:copy.noComparison[lang];}

function ShiftSettings({lang,preferences,industry,configured,onSave,onCancel,preview=false}:{lang:Lang;preferences:BusinessPreferences;industry:IndustryId|null;configured:boolean;onSave:(preferences:BusinessPreferences,industry:IndustryId|null)=>void;onCancel:()=>void;preview?:boolean}){
 const id=useId();
 const [terminal,setTerminal]=useState(preferences.terminal),[side,setSide]=useState(preferences.side??'');
 const [business,setBusiness]=useState<IndustryId|''>(industry??'');
 const [whole,setWhole]=useState(configured&&preferences.hours===null);
 const [open,setOpen]=useState(preferences.hours?.open??''),[close,setClose]=useState(preferences.hours?.close??'');
 const [error,setError]=useState(false);
 return <form className="shift-settings" data-testid="shift-settings" onSubmit={event=>{event.preventDefault();if(!whole&&(!open||!close)){setError(true);return;}onSave({version:1,place:'airport',terminal,side:side==='EAST'||side==='WEST'?side:null,hours:whole?null:{open,close}},business||null);}}>
  <div className="shift-settings-place">
   <label htmlFor={`${id}-terminal`}>{copy.terminal[lang]}<select id={`${id}-terminal`} value={terminal} onChange={event=>setTerminal(event.target.value==='T2'?'T2':'T1')}><option value="T1">T1</option><option value="T2">T2</option></select></label>
   <label htmlFor={`${id}-side`}>{copy.zone[lang]}<select id={`${id}-side`} value={side} onChange={event=>setSide(event.target.value==='EAST'?'EAST':event.target.value==='WEST'?'WEST':'')}><option value="">{copy.unspecified[lang]}</option><option value="WEST">{copy.west[lang]}</option><option value="EAST">{copy.east[lang]}</option></select></label>
   <label className="shift-industry-field" htmlFor={`${id}-industry`}>{copy.industry[lang]}<select id={`${id}-industry`} value={business} onChange={event=>setBusiness(event.target.value as IndustryId|'')}><option value="">{copy.selectIndustry[lang]}</option>{Object.entries(industryLabels).map(([value,label])=><option key={value} value={value}>{label[lang]}</option>)}</select></label>
  </div>
  <div className="shift-settings-hours">
   <label htmlFor={`${id}-open`}>{copy.start[lang]}<select id={`${id}-open`} value={open} disabled={whole} required={!whole} onChange={event=>{setOpen(event.target.value);setError(false);}}><option value="">{copy.chooseTime[lang]}</option>{HOUR_CHOICES.map(value=><option key={value}>{value}</option>)}</select></label>
   <label htmlFor={`${id}-close`}>{copy.end[lang]}<select id={`${id}-close`} value={close} disabled={whole} required={!whole} onChange={event=>{setClose(event.target.value);setError(false);}}><option value="">{copy.chooseTime[lang]}</option>{HOUR_CHOICES.map(value=><option key={value}>{value}</option>)}</select></label>
   <label className="shift-whole-day"><input type="checkbox" checked={whole} onChange={event=>setWhole(event.target.checked)}/>{copy.wholeDay[lang]}</label>
  </div>
  {error&&<p className="shift-setting-error" role="alert">{copy.required[lang]}</p>}
  <div className="shift-settings-footer"><p>{preview?copy.previewDevice[lang]:copy.device[lang]}</p><div><button className="shift-primary" type="submit">{copy.save[lang]}</button>{configured&&<button type="button" onClick={onCancel}>{copy.cancel[lang]}</button>}</div></div>
 </form>;
}

function ComparisonLine({comparison,lang,showBasis=false}:{comparison:ShiftComparison;lang:Lang;showBasis?:boolean}){
 const available=comparison.delta!==null&&comparison.baseline!==null;
 const unavailableReason=reasonText(comparison.reason,lang);
 const format=new Intl.NumberFormat(lang,{maximumFractionDigits:1}).format;
 return <div className="shift-comparison" data-testid={`shift-comparison-${comparison.kind.toLowerCase()}`}>
  <p>{comparison.kind==='WEEK'?copy.week[lang]:comparison.status==='PARTIAL'?copy.partialMonthLabel[lang]:copy.month[lang]}</p>
  <strong>{available?(comparison.delta===0?(comparison.status==='PARTIAL'?copy.zeroDifference[lang]:copy.same[lang]):<><CountChange delta={comparison.delta} format={format} lang={lang} unit={copy.flights[lang]}/>{comparison.percent!==null&&<> (<ChangeRate value={comparison.percent} lang={lang}/>)</>}</>):comparison.status==='LOADING'?copy.loading[lang]:copy.noComparison[lang]}</strong>
  {showBasis&&<small>{available?<>{comparison.kind==='WEEK'?comparison.start:comparison.start.slice(0,7)} · {copy.baseline[lang]} {format(comparison.baseline!)}{copy.flights[lang]}{comparison.kind==='MONTH'&&<> · {copy.included[lang]} <b>{comparison.includedDates.length}/{comparison.expectedDays}{copy.days[lang]}</b></>}</>:unavailableReason===copy.noComparison[lang]?(comparison.kind==='WEEK'?comparison.start:comparison.start.slice(0,7)):unavailableReason}</small>}
 </div>;
}

function destinationName(country:string,lang:Lang){
 const name=new Intl.DisplayNames([lang],{type:'region'}).of(country)??country;
 return lang==='ko'?`${name}행`:lang==='en'?`To ${name}`:lang==='zh'?`飞往${name}`:`${name}行き`;
}

export interface ShiftBriefingViewProps {
 lang:Lang;day:string;preferences:BusinessPreferences;industry:IndustryId|null;configured:boolean;
 /** Main figures always cover the whole terminal during the shift. */
 result:ShiftBriefingResult|null;areaReference?:ShiftBriefingResult|null;
 onSave:(preferences:BusinessPreferences,industry:IndustryId|null)=>void;
 storageFailed?:boolean;previousCheck?:{unchanged:boolean;checkedAt:string}|null;preview?:boolean;businessHref?:string;
}

/** The production and review pages render the same compact briefing and share document. */
export function ShiftBriefingView({lang,day,preferences,industry,configured,result,areaReference,onSave,storageFailed=false,previousCheck=null,preview=false,businessHref}:ShiftBriefingViewProps){
 const [editing,setEditing]=useState(false),[saved,setSaved]=useState(false);
 const id=useId(),format=new Intl.NumberFormat(lang,{maximumFractionDigits:1}).format;
 const current=result?.current,peak=current?.peak,destinations=current?.destinations;
 const leading=destinations?.countries.slice(0,3)??[];
 const destinationFallback=!result||current?.status==='LOADING'?copy.loading[lang]:copy.destinationEmpty[lang];
 const actions=buildShiftStoreChecks(industry,lang);
 const count=current?.total??current?.confirmed??null;
 const lastUnchanged=previousCheck?.unchanged===true&&current?.status==='READY';
 const condition=`${scopeLabel(preferences,lang)} · ${hoursText(preferences,lang)} · ${industry?industryLabels[industry][lang]:copy.unselected[lang]}`;
 const mainScope=`${preferences.terminal} ${copy.all[lang]} · ${hoursText(preferences,lang)}`;
 const areaCount=areaReference?.current.total??areaReference?.current.confirmed??null;
 const doc:ShareDocument={title:`KORETAIL · ${copy.title[lang]}`,lines:[
  ...(preview?[{kind:'note' as const,text:copy.sample[lang]}]:[]),
  {kind:'text',text:`${day} · ${condition}`},
  {kind:'note',text:mainScope},
  {kind:'item',text:count===null?copy.unavailable[lang]:`${current?.total!==null?copy.current[lang]:copy.confirmed[lang]} ${format(count)}${copy.flights[lang]}`},
  ...(peak?[{kind:'item' as const,text:`${copy.peak[lang]} ${time(peak.startAt)}–${time(peak.endAt)} · ${peak.count}${copy.flights[lang]}`}]:[]),
  ...(current?.status==='PARTIAL'?[{kind:'note' as const,text:copy.partial[lang]}]:[]),
  ...(lastUnchanged?[{kind:'note' as const,text:copy.unchanged[lang]}]:[]),
  {kind:'heading',text:copy.destinations[lang]},
  ...leading.map(item=>({kind:'item' as const,text:`${destinationName(item.country,lang)} ${format(item.flights)}${copy.flights[lang]}`})),
  ...(destinations&&!destinations.complete?[{kind:'note' as const,text:copy.destinationPartial[lang]}]:[]),
  ...(destinations?.unknown?[{kind:'note' as const,text:`${copy.destinationUnknown[lang]} ${format(destinations.unknown)}${copy.flights[lang]}`}]:[]),
  {kind:'note',text:copy.destinationBasis[lang]},
  {kind:'heading',text:copy.compare[lang]},
  ...([['week',copy.week[lang]],['month',result?.comparisons.month.status==='PARTIAL'?copy.partialMonthLabel[lang]:copy.month[lang]]] as const).map(([key,label])=>{const comp=result?.comparisons[key];return {kind:'item' as const,text:`${label}: ${comp?.delta!==null&&comp?.delta!==undefined&&comp.baseline!==null?`${comp.delta>0?'+':comp.delta<0?'△ ':''}${format(Math.abs(comp.delta))}${copy.flights[lang]}${comp.percent!==null?` (${formatChangeRate(comp.percent)})`:''} · ${copy.baseline[lang]} ${format(comp.baseline)}${copy.flights[lang]} · ${comp.start}${key==='month'?`–${comp.end} · ${copy.included[lang]} ${comp.includedDates.length}/${comp.expectedDays}${copy.days[lang]}`:''}`:copy.noComparison[lang]}`};}),
  {kind:'heading',text:copy.prepare[lang]},...actions.map(action=>({kind:'item' as const,text:`${action.title}: ${action.summary}`})),
  {kind:'note',text:copy.preparationBasis[lang]},
  {kind:'note',text:`${copy.source[lang]} ${stamp(current?.checkedAt??current?.retrievedAt)} KST`},
  {kind:'note',text:copy.limits[lang]},{kind:'note',text:copy.savedCopy[lang]},
 ]};
 return <section className="shift-briefing" lang={lang} aria-labelledby={`${id}-title`} data-testid="shift-briefing" data-configured={configured}>
  <div className="shift-heading"><h2 id={`${id}-title`} data-heading="section" className="shift-title"><span className="heading-marker" aria-hidden="true"/>{copy.title[lang]}</h2>{configured&&<button type="button" className="shift-edit" onClick={()=>{setEditing(value=>!value);setSaved(false);}} aria-expanded={editing}>{editing?copy.cancel[lang]:copy.edit[lang]}</button>}</div>
  {!configured&&<p className="shift-intro">{copy.intro[lang]}</p>}
  {(!configured||editing)&&<ShiftSettings key={`${configured}:${editing}:${condition}`} lang={lang} preferences={preferences} industry={industry} configured={configured} preview={preview} onSave={(next,nextIndustry)=>{onSave(next,nextIndustry);setEditing(false);setSaved(true);}} onCancel={()=>setEditing(false)}/>}
  {saved&&<p className="shift-save-status" role="status">{storageFailed?copy.failed[lang]:copy.saved[lang]}</p>}
  {storageFailed&&!saved&&<p className="shift-save-status" role="status">{copy.failed[lang]}</p>}
  {configured&&<>
   <div className="shift-scope" data-testid="shift-scope"><p>{shortDay(day)} · {copy.savedBasis[lang]}</p><p><strong className={`shift-terminal shift-terminal-${preferences.terminal}`}>{preferences.terminal}</strong><span>{preferences.side==='WEST'?copy.west[lang]:preferences.side==='EAST'?copy.east[lang]:copy.unspecified[lang]}</span><b>{hoursText(preferences,lang)}</b><span>{industry?industryLabels[industry][lang]:copy.unselected[lang]}</span></p></div>
   {lastUnchanged?<p className="shift-unchanged" role="status"><strong>{copy.unchanged[lang]}</strong><small>{copy.checked[lang]} {time(previousCheck?.checkedAt)} KST</small></p>:result?.status==='NO_CHANGE'?<p className="shift-unchanged">{copy.comparisonSame[lang]}</p>:null}
   <div className="shift-data">
    <div className="shift-current">
     <h3>{current?.status==='PARTIAL'?copy.confirmed[lang]:copy.current[lang]} · {preferences.terminal} {copy.all[lang]}</h3>
     <p className="shift-count" data-testid="shift-count" data-empty={count===null}>{count===null?<span className="shift-no-value">{current?.status==='LOADING'||!result?copy.loading[lang]:copy.unavailable[lang]}</span>:<><strong>{format(count)}</strong><span>{copy.flights[lang]}</span></>}</p>
     <small>{copy.scheduled[lang]}{preferences.terminal==='T1'?` · ${copy.t1[lang]}`:''}</small>
     {current?.status==='PARTIAL'&&<p className="shift-data-note">{copy.partial[lang]}{current.unknownBuilding>0&&<> {copy.unplaced[lang]} <b>{current.unknownBuilding}{copy.flights[lang]}</b></>}</p>}
     {current?.reason==='UNSUPPORTED_OVERNIGHT'&&<p className="shift-data-note">{copy.overnight[lang]}</p>}
     {peak&&<div className="shift-peak"><p>{copy.peak[lang]}</p><strong><span>{time(peak.startAt)}–{time(peak.endAt)}</span><span className="shift-peak-count">· {peak.count}{copy.flights[lang]}</span></strong>{peak.ties>1&&<small>{copy.tie[lang]}</small>}</div>}
    </div>
    <div className="shift-comparisons"><h3>{copy.compare[lang]}</h3>{result?<div className="shift-comparison-pair"><ComparisonLine comparison={result.comparisons.week} lang={lang}/><ComparisonLine comparison={result.comparisons.month} lang={lang}/></div>:<p className="shift-data-note">{copy.loading[lang]}</p>}</div>
   </div>
   <section className="shift-destinations" aria-labelledby={`${id}-destinations`} data-testid="shift-destinations">
    <div className="shift-section-heading"><h3 id={`${id}-destinations`}>{copy.destinations[lang]}</h3>{leading.length===3&&<small>{copy.topThree[lang]}</small>}</div>
    {leading.length?<ul>{leading.map(item=><li key={item.country}><span className="shift-destination-name"><CountryFlag code={item.country} size={18}/><span>{destinationName(item.country,lang)}</span></span><strong>{format(item.flights)}<small>{copy.flights[lang]}</small></strong></li>)}</ul>:<p className="shift-data-note">{destinationFallback}</p>}
    <p className="shift-destination-note">{copy.destinationBasis[lang]}</p>
    {destinations&&!destinations.complete&&<p className="shift-data-note">{copy.destinationPartial[lang]}{destinations.unknown>0&&<> · {copy.destinationUnknown[lang]} {format(destinations.unknown)}{copy.flights[lang]}</>}</p>}
   </section>
   <section className="shift-preparation" aria-labelledby={`${id}-prepare`} data-testid="shift-preparation">
    <div className="shift-section-heading"><h3 id={`${id}-prepare`}>{copy.prepare[lang]}</h3><small>{copy.preparationHint[lang]}</small></div>
    <div className="shift-store-checks">{actions.map(action=><details className="shift-store-check" key={action.id} data-testid={`shift-store-check-${action.id}`}>
     <summary><span><strong>{action.title}</strong><span>{action.summary}</span></span></summary>
     <ol>{action.details.map(step=><li key={step}>{step}</li>)}</ol>
    </details>)}</div>
    <p className="shift-preparation-basis">{copy.preparationBasis[lang]}</p>
   </section>
   <details className="shift-details" data-testid="shift-details"><summary>{copy.details[lang]}</summary><div className="shift-details-content">
    {preferences.side&&<section><h3>{copy.areaReference[lang]}</h3><p>{preferences.terminal} · {preferences.side==='WEST'?copy.westArea[lang]:copy.eastArea[lang]} · {hoursText(preferences,lang)}</p><p>{areaCount===null?copy.unavailable[lang]:`${areaReference?.current.status==='PARTIAL'?copy.confirmed[lang]:copy.current[lang]} ${format(areaCount)}${copy.flights[lang]}`}</p><p>{copy.sideLimits[lang]}</p></section>}
    <section><h3>{copy.allDestinations[lang]}</h3>{destinations?.countries.length?<ul>{destinations.countries.map(item=><li key={item.country}>{destinationName(item.country,lang)} <b>{format(item.flights)}{copy.flights[lang]}</b></li>)}</ul>:<p>{destinationFallback}</p>}{destinations?.unknown? <p>{copy.destinationUnknown[lang]} {format(destinations.unknown)}{copy.flights[lang]}</p>:null}<p>{copy.destinationBasis[lang]}</p></section>
    {result&&<section><h3>{copy.basis[lang]}</h3><p>{day} · {mainScope}</p><ComparisonLine comparison={result.comparisons.week} lang={lang} showBasis/><ComparisonLine comparison={result.comparisons.month} lang={lang} showBasis/><p>{copy.boundary[lang]}</p>{result.comparisons.month.status==='PARTIAL'&&<p>{copy.partialMonth[lang]}</p>}{[result.comparisons.week.reason,result.comparisons.month.reason].includes('UNSUPPORTED_MINUTE_HISTORY')&&<p>{copy.minutes[lang]}</p>}</section>}
    <p>{copy.limits[lang]}</p>
   </div></details>
   <p className="shift-source-line">{copy.source[lang]} {stamp(current?.checkedAt??current?.retrievedAt)} KST</p>
   {count!==null&&<PrepShare compact lang={lang} doc={doc} fileName={`koretail-shift-${day}-${preferences.terminal}.png`} analytics={{language:lang,location:'airport',terminal:preferences.terminal}}/>}
   {businessHref&&<a className="shift-detail-link" href={businessHref}>{copy.more[lang]} ↗</a>}
  </>}
 </section>;
}

const CHECK_KEY='koretail-shift-check-v1';
interface ShiftCheck {key:string;signature:string;checkedAt:string}
function readChecks():ShiftCheck[]{try{const value:unknown=JSON.parse(localStorage.getItem(CHECK_KEY)??'[]');return Array.isArray(value)?value.filter((entry):entry is ShiftCheck=>Boolean(entry&&typeof entry==='object'&&typeof entry.key==='string'&&typeof entry.signature==='string'&&Number.isFinite(Date.parse(entry.checkedAt)))).slice(-20):[];}catch{return [];}}
function usePreviousCheck(key:string,signature:string|null){
 const previous=useRef<{key:string;value:ShiftCheck|null}|null>(null);
 const [loaded,setLoaded]=useState<{key:string;value:ShiftCheck|null}|null>(null);
 useEffect(()=>{if(!signature)return;const checks=readChecks();if(previous.current?.key!==key){const value=checks.find(entry=>entry.key===key)??null;previous.current={key,value};setLoaded({key,value});}try{localStorage.setItem(CHECK_KEY,JSON.stringify([...checks.filter(entry=>entry.key!==key),{key,signature,checkedAt:new Date().toISOString()}].slice(-20)));}catch{/* Optional comparison is device-only. */}},[key,signature]);
 return loaded?.key===key&&loaded.value?{unchanged:loaded.value.signature===signature,checkedAt:loaded.value.checkedAt}:null;
}

export default function ShiftBriefing({lang,day,industry,onIndustryChange,preferredTerminal='T1',flights,weekReference,nowIso}:{lang:Lang;day:string;industry:IndustryId|null;onIndustryChange:(id:IndustryId|null)=>void;preferredTerminal?:'T1'|'T2';flights:FlightsPayload|null|undefined;weekReference?:GlanceWeekReference|null;nowIso:string}){
 const stored=useBusinessPreferences(),configured=stored.saved&&stored.preferences.place==='airport';
 const preferences=configured?stored.preferences:{...stored.preferences,place:'airport' as const,terminal:preferredTerminal,side:null,hours:null};
 const history=useAirportHistory(configured&&day?day:null);
 const rows=history?.status==='OK'?history.payload.history:history===undefined?undefined:null;
 const result=useMemo(()=>configured&&day?buildShiftBriefing({day,nowIso,terminal:preferences.terminal,side:null,hours:preferences.hours,flights,history:rows,weekReference}):null,[configured,day,nowIso,preferences.terminal,preferences.hours,flights,rows,weekReference]);
 const areaReference=useMemo(()=>configured&&day&&preferences.side?buildShiftBriefing({day,nowIso,terminal:preferences.terminal,side:preferences.side,hours:preferences.hours,flights,history:rows,weekReference}):null,[configured,day,nowIso,preferences.terminal,preferences.side,preferences.hours,flights,rows,weekReference]);
 const checkKey=`${day}:${preferences.terminal}:${preferences.side??'all'}:${preferences.hours?.open??'day'}:${preferences.hours?.close??'day'}:${industry??''}`;
 const signature=result?.current.status==='READY'?`${shiftBriefingSignature(result)}:${areaReference?shiftBriefingSignature(areaReference):''}`:null;
 const previousCheck=usePreviousCheck(checkKey,signature);
 if(!stored.ready)return <section className="shift-briefing" aria-label={copy.title[lang]}><h2 data-heading="section" className="shift-title"><span className="heading-marker" aria-hidden="true"/>{copy.title[lang]}</h2><p className="shift-data-note">{copy.loadingSettings[lang]}</p></section>;
 return <ShiftBriefingView lang={lang} day={day} preferences={preferences} industry={configured?industry:null} configured={configured} result={result} areaReference={areaReference} previousCheck={previousCheck} storageFailed={stored.storageFailed} businessHref={shareLink(siteOrigin,lang,day,{kind:'airport',terminal:preferences.terminal,side:preferences.side})} onSave={(next,nextIndustry)=>{saveBusinessPreferences(next);onIndustryChange(nextIndustry);trackPersonalEvent('business_hours_saved',{language:lang,location:'airport',terminal:next.terminal});}}/>;
}
