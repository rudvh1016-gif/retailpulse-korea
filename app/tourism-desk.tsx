"use client";

import { useRef, useState, type MouseEvent } from "react";

import { useEventPagination, EventPaginationControls } from "./event-pagination";
import type { Lang } from "./retailpulse-data";
import { useLiveSummary, LiveLoadMessage } from "./live-signals";
import {
  TourismVisitorShow,
  type TourismVisitorShowContent,
} from "./tourism-visitor-show";
import {
  buildAreaCurrentBrief,
  formatHumanFreshness,
} from "../lib/current-brief";
import {
  buildEventCopyText,
  eventPeriodStatusLabel,
  eventPreview,
  officialEventPeriod,
  prepareEventsForPresentation,
  safeOfficialEventHomepage,
  type PreparedEvent,
} from "../lib/event-presentation";
import {
  describeSourcePeriod,
  formatDayPeriod,
  type SourcePeriodDescription,
} from "../lib/source-period";
import { formatRepresentativeStations } from "../lib/subway-ridership";
import {
  buildTourismDeskBrief,
  type TourismDeskLine,
  type TourismSubwayComparison,
} from "../lib/tourism-desk-brief";
import { buildWeatherGuide, formatWeatherDetails, type WeatherGuideInput } from "../lib/weather-guide";

export type TourismAreaId = "myeongdong" | "hongdae" | "seongsu";

const areaNames: Record<TourismAreaId, Record<Lang, string>> = {
  myeongdong: { ko: "명동", en: "Myeongdong", zh: "明洞", ja: "明洞" },
  hongdae: { ko: "홍대", en: "Hongdae", zh: "弘大", ja: "弘大" },
  seongsu: { ko: "성수", en: "Seongsu", zh: "圣水", ja: "聖水" },
};

const COPY = {
  ko: {
    pilot: "시험 운영",
    areaSwitch: "관광안내 지역 선택",
    pilotNote: "현장 검증을 위한 시험 운영 화면이며, 특정 기관과의 제휴를 뜻하지 않습니다.",
    sectionBrief: "오늘 근무 브리핑",
    sectionGuide: "오늘 안내할 것",
    sectionTransport: "교통 흐름 참고",
    sectionCurrent: "지금 지역 상황",
    sectionBackground: "관광 흐름 배경 참고",
    sectionVisitor: "관광객에게 보여주기",
    sectionLimits: "자료 기준과 한계",
    briefIntro: "손님을 받기 전에 먼저 확인할 3–5가지입니다.",
    guideIntro: "공식 기간과 위치를 먼저 보고, 실제 운영 여부와 시간은 공식 안내에서 확인하세요.",
    transportIntro: "대표역 하차 흐름을 실제 저장 이력과 비교합니다.",
    currentIntro: "브리핑의 혼잡 상태를 공식 생활인구 범위와 관측시각으로 풀어 봅니다.",
    backgroundIntro: "즉시 안내 판단보다 느린 통계와 공항 신호는 배경 정보로만 봅니다.",
    visitorIntro: "직원이 보고 있던 화면은 그대로 두고, 선택한 공식 행사 정보를 큰 글씨로 보여줍니다.",
    limitsIntro: "각 숫자가 뜻하는 범위와 표시하지 않는 비교를 확인하세요.",
    loading: "공식 자료를 불러오는 중입니다.",
    unavailable: "현재 확인 가능한 공식 자료가 없습니다.",
    noEvents: "오늘 기준 이 지역과 관련된 공식 행사 정보가 없습니다.",
    eventPeriod: "공식 행사기간",
    eventAddress: "주소",
    eventDistance: "선택 지역 중심 기준 거리",
    eventSource: "출처",
    eventPage: "공식 안내 확인",
    eventFull: "제공자 설명 전체 보기",
    eventCopy: "정보 복사",
    copied: "복사했습니다",
    copyFailed: "복사하지 못했습니다",
    eventCaveat: "공식 행사기간만으로 지금 실제 운영 중인지 또는 오늘 몇 시에 운영하는지 확인할 수 없습니다. 방문 전 공식 안내를 확인하세요.",
    subwayAlighting: "하차",
    subwayBoarding: "승차",
    subwayFlow: "하차 흐름",
    sameWeekday: "지난주 같은 요일 대비",
    recentAverage: "최근 7일 평균 대비",
    previousDay: "전일 대비",
    fourWeekAverage: "최근 4주 같은 요일 평균 대비",
    recentAverageNote: "정확히 직전 7일의 일일 집계 평균이며, 같은 요일 보정이 아닙니다.",
    historyBuilding: "비교 이력 축적 중",
    subwayDate: "일일 집계",
    subwaySource: "서울교통공사 OA-22723",
    subwayCaveat: "지하철 개찰구 집계이며 고유 방문객 수나 이 지역 전체 방문객 수가 아닙니다.",
    currentPopulation: "현재 공식 생활인구 추정 범위",
    currentSource: "서울시 실시간 도시데이터",
    currentCaveat: "생활인구는 관광객 수나 오늘 누적 방문객 수가 아닙니다.",
    foreignPresence: "단기체류 외국인 생활인구",
    foreignPurpose: "외국인 목적별 이동",
    shoppingPurpose: "쇼핑 목적",
    tourismPurpose: "관광 목적",
    movements: "추정 이동",
    people: "명",
    foreignSource: "서울시 OA-23018",
    foreignCaveat: "단기체류 외국인 생활인구이며 관광객 수가 아닙니다.",
    purposeSource: "서울시 OA-22378",
    purposeCaveat: "월간 통계 추정 이동이며 실시간 관광객·방문객·구매·매출이 아닙니다.",
    airportArrival: "인천공항 입국 예보",
    airportNextBand: "다음 공식 시간대 예상 입국객",
    airportDay: "오늘 공식 예상 입국객",
    airportSource: "인천국제공항공사 공식 입국 예보",
    airportCaveat: "인천공항 입국 예보는 이 지역 방문객이나 관광객 수가 아닙니다.",
    observed: "관측 시각",
    collected: "수집",
    visitorShow: "이 행사 보여주기",
    ktoSource: "한국관광공사 TourAPI",
  },
  en: {
    pilot: "Pilot",
    areaSwitch: "Choose a Guide Desk area",
    pilotNote: "A pilot for field validation. It does not imply a partnership with any organisation.",
    sectionBrief: "Shift briefing",
    sectionGuide: "What to guide today",
    sectionTransport: "Transport flow reference",
    sectionCurrent: "Area conditions now",
    sectionBackground: "Tourism-flow background",
    sectionVisitor: "Show a visitor",
    sectionLimits: "Sources and limits",
    briefIntro: "The three to five things to check before receiving visitors.",
    guideIntro: "Check the official period and location first, then confirm actual operation and hours on the official page.",
    transportIntro: "Compares representative-station alightings only with observations KORETAIL has actually stored.",
    currentIntro: "The official living-population range and observation time explain the crowd status in the briefing.",
    backgroundIntro: "Slower statistics and airport signals sit here as context, not as immediate guide decisions.",
    visitorIntro: "Keep the staff interface unchanged and show selected official event facts in large type.",
    limitsIntro: "Check what each figure covers and which comparisons are withheld.",
    loading: "Loading official data.",
    unavailable: "No official data is currently available.",
    noEvents: "No official event relevant to this area is listed for today.",
    eventPeriod: "Official event period",
    eventAddress: "Address",
    eventDistance: "Distance from selected area centre",
    eventSource: "Source",
    eventPage: "Check official notice",
    eventFull: "Read the full provider description",
    eventCopy: "Copy information",
    copied: "Copied",
    copyFailed: "Could not copy",
    eventCaveat: "The official event period does not prove that the event is operating now or state today's opening hours. Check the official notice before a visit.",
    subwayAlighting: "Alighting",
    subwayBoarding: "Boarding",
    subwayFlow: "alighting flow",
    sameWeekday: "Vs the same weekday last week",
    recentAverage: "Vs the recent 7-day average",
    previousDay: "Vs the previous day",
    fourWeekAverage: "Vs the recent four-week same-weekday average",
    recentAverageNote: "The baseline is the immediately preceding seven calendar days, not a same-weekday adjustment.",
    historyBuilding: "Comparison history is accumulating",
    subwayDate: "daily count",
    subwaySource: "Seoul Metro OA-22723",
    subwayCaveat: "These are station-gate counts, not unique visitors or all visitors to this area.",
    currentPopulation: "Current official living-population estimate",
    currentSource: "Seoul real-time city data",
    currentCaveat: "Living population is not a tourist count or today's cumulative visitor count.",
    foreignPresence: "Short-stay foreign living population",
    foreignPurpose: "Foreign mobility by purpose",
    shoppingPurpose: "Shopping purpose",
    tourismPurpose: "Tourism purpose",
    movements: "estimated movements",
    people: "people",
    foreignSource: "Seoul OA-23018",
    foreignCaveat: "This is short-stay foreign living population, not a tourist count.",
    purposeSource: "Seoul OA-22378",
    purposeCaveat: "A monthly statistical movement estimate, not real-time tourists, visitors, purchases or sales.",
    airportArrival: "Incheon Airport arrival forecast",
    airportNextBand: "Expected arrivals in the next official band",
    airportDay: "Official expected arrivals today",
    airportSource: "Official Incheon International Airport arrival forecast",
    airportCaveat: "The Incheon arrival forecast is not a count of visitors or tourists to this area.",
    observed: "Observed",
    collected: "Collected",
    visitorShow: "Show this event",
    ktoSource: "Korea Tourism Organization (KTO) TourAPI",
  },
  zh: {
    pilot: "试运行",
    areaSwitch: "选择旅游咨询地区",
    pilotNote: "此页面用于现场验证，不代表与任何机构存在合作关系。",
    sectionBrief: "今日值班简报",
    sectionGuide: "今日咨询重点",
    sectionTransport: "交通流动参考",
    sectionCurrent: "当前地区情况",
    sectionBackground: "旅游流动背景参考",
    sectionVisitor: "向游客展示",
    sectionLimits: "资料依据与限制",
    briefIntro: "接待游客前先确认的三至五项重点。",
    guideIntro: "先确认官方活动期间与地点，实际举办情况和时间请查看官方页面。",
    transportIntro: "仅用 KORETAIL 实际保存的记录比较代表车站的下车次数。",
    currentIntro: "以官方生活人口区间与观测时间说明简报中的拥挤状态。",
    backgroundIntro: "更新较慢的统计与机场信号仅作为背景，不作为即时咨询判断。",
    visitorIntro: "工作人员可保持当前界面不变，并用大字向游客展示所选官方活动信息。",
    limitsIntro: "请确认每项数字的范围，以及未显示哪些比较。",
    loading: "正在载入官方数据。",
    unavailable: "目前没有可确认的官方资料。",
    noEvents: "今日暂无与该地区相关的官方活动信息。",
    eventPeriod: "官方活动期间",
    eventAddress: "地址",
    eventDistance: "距所选地区中心",
    eventSource: "来源",
    eventPage: "查看官方公告",
    eventFull: "查看供应方完整说明",
    eventCopy: "复制信息",
    copied: "已复制",
    copyFailed: "复制失败",
    eventCaveat: "官方活动期间并不能证明活动此刻正在举办，也不代表当天开放时间。到访前请查看官方公告。",
    subwayAlighting: "下车",
    subwayBoarding: "上车",
    subwayFlow: "下车流动",
    sameWeekday: "较上周同一星期几",
    recentAverage: "较最近7日平均",
    previousDay: "较前一日",
    fourWeekAverage: "较最近4周同一星期几平均",
    recentAverageNote: "基准为紧接此前7个日历日的平均，并非同星期几校正。",
    historyBuilding: "比较记录正在积累",
    subwayDate: "日度统计",
    subwaySource: "首尔交通公社 OA-22723",
    subwayCaveat: "这是地铁闸机统计，并非独立访客或该地区全部到访人数。",
    currentPopulation: "当前官方生活人口估算区间",
    currentSource: "首尔市实时城市数据",
    currentCaveat: "生活人口并非游客人数或今日累计访客人数。",
    foreignPresence: "短期停留外国人生活人口",
    foreignPurpose: "外国人分目的移动",
    shoppingPurpose: "购物目的",
    tourismPurpose: "观光目的",
    movements: "推算移动",
    people: "人",
    foreignSource: "首尔市 OA-23018",
    foreignCaveat: "这是短期停留外国人生活人口，并非游客人数。",
    purposeSource: "首尔市 OA-22378",
    purposeCaveat: "这是月度统计推算移动，并非实时游客、访客、购买或销售额。",
    airportArrival: "仁川机场入境预测",
    airportNextBand: "下一官方时段预计入境旅客",
    airportDay: "今日官方预计入境旅客",
    airportSource: "仁川国际机场公社官方入境预测",
    airportCaveat: "仁川机场入境预测并非该地区访客或游客人数。",
    observed: "观测时间",
    collected: "采集",
    visitorShow: "展示此活动",
    ktoSource: "韩国观光公社 TourAPI",
  },
  ja: {
    pilot: "試験運用",
    areaSwitch: "観光案内エリアを選択",
    pilotNote: "現場検証のための試験運用画面であり、特定機関との提携を意味しません。",
    sectionBrief: "本日の勤務ブリーフィング",
    sectionGuide: "本日案内すること",
    sectionTransport: "交通の流れ（参考）",
    sectionCurrent: "現在のエリア状況",
    sectionBackground: "観光の流れ（背景参考）",
    sectionVisitor: "観光客に見せる",
    sectionLimits: "データの基準と限界",
    briefIntro: "来訪者を迎える前に確認する3～5項目です。",
    guideIntro: "公式イベント期間と場所を確認し、実際の開催状況と時間は公式ページでご確認ください。",
    transportIntro: "KORETAIL が実際に保存した観測だけで代表駅の降車件数を比較します。",
    currentIntro: "公式の生活人口レンジと観測時刻で、ブリーフィングの混雑状況を詳しく示します。",
    backgroundIntro: "更新の遅い統計と空港シグナルは、即時の案内判断ではなく背景情報として示します。",
    visitorIntro: "スタッフが見ている画面はそのままに、選んだ公式イベント情報を大きな文字で見せます。",
    limitsIntro: "各数値の範囲と、表示しない比較をご確認ください。",
    loading: "公式データを読み込んでいます。",
    unavailable: "現在確認できる公式データはありません。",
    noEvents: "本日、このエリアに関連する公式イベント情報はありません。",
    eventPeriod: "公式イベント期間",
    eventAddress: "住所",
    eventDistance: "選択エリア中心からの距離",
    eventSource: "出典",
    eventPage: "公式案内を確認",
    eventFull: "提供元の説明全文を見る",
    eventCopy: "情報をコピー",
    copied: "コピーしました",
    copyFailed: "コピーできませんでした",
    eventCaveat: "公式イベント期間だけでは、現在の実際の開催状況や本日の開催時間は確認できません。訪問前に公式案内をご確認ください。",
    subwayAlighting: "降車",
    subwayBoarding: "乗車",
    subwayFlow: "降車の流れ",
    sameWeekday: "先週の同じ曜日比",
    recentAverage: "直近7日平均比",
    previousDay: "前日比",
    fourWeekAverage: "直近4週の同じ曜日平均比",
    recentAverageNote: "比較基準は直前7暦日の日次集計平均で、同じ曜日への補正ではありません。",
    historyBuilding: "比較履歴を蓄積中",
    subwayDate: "日次集計",
    subwaySource: "ソウル交通公社 OA-22723",
    subwayCaveat: "地下鉄改札の集計であり、ユニーク訪問者数やこのエリア全体の来訪者数ではありません。",
    currentPopulation: "現在の公式生活人口推定レンジ",
    currentSource: "ソウル市リアルタイム都市データ",
    currentCaveat: "生活人口は観光客数や本日の累計来訪者数ではありません。",
    foreignPresence: "短期滞在外国人生活人口",
    foreignPurpose: "外国人の目的別移動",
    shoppingPurpose: "買い物目的",
    tourismPurpose: "観光目的",
    movements: "推定移動",
    people: "人",
    foreignSource: "ソウル市 OA-23018",
    foreignCaveat: "短期滞在外国人生活人口であり、観光客数ではありません。",
    purposeSource: "ソウル市 OA-22378",
    purposeCaveat: "月次統計の推定移動であり、リアルタイムの観光客・来訪者・購入・売上ではありません。",
    airportArrival: "仁川空港の入国予測",
    airportNextBand: "次の公式時間帯の予想入国者数",
    airportDay: "本日の公式予想入国者数",
    airportSource: "仁川国際空港公社の公式入国予測",
    airportCaveat: "仁川空港の入国予測は、このエリアの来訪者数や観光客数ではありません。",
    observed: "観測時刻",
    collected: "取得",
    visitorShow: "このイベントを見せる",
    ktoSource: "韓国観光公社 TourAPI",
  },
} as const;

type DeskCopy = (typeof COPY)[Lang];

interface GuideEventInput {
  contentId?: string | null;
  title: string;
  eventStart: string;
  eventEnd: string | null;
  distanceM: number | null;
  categoryName?: string | null;
  address?: string | null;
  addressDetail?: string | null;
  overview?: string | null;
  homepage?: string | null;
}

type GuideEvent = PreparedEvent<GuideEventInput>;

interface SubwayComparisonDisplay {
  key: "same-weekday" | "recent-average" | "previous-day" | "four-week";
  label: string;
  value: TourismSubwayComparison;
}

interface GuideWeatherRow {
  precipitationProbability: number | null;
  temperatureTenthC: number | null;
  precipitationTypeCode?: string | null;
  humidityPercent?: number | null;
  windSpeedTenthMps?: number | null;
  dailyMinTemperatureTenthC?: number | null;
  dailyMaxTemperatureTenthC?: number | null;
}

const localeFor = (lang: Lang) => lang === "ko" ? "ko-KR" : lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-GB";

function numberText(value: number, lang: Lang, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(localeFor(lang), { maximumFractionDigits }).format(value);
}

function titleFor(lang: Lang, areaName: string): string {
  return lang === "ko" ? `${areaName} 관광안내`
    : lang === "en" ? `${areaName} Guide Desk`
    : lang === "zh" ? `${areaName}旅游咨询`
    : `${areaName} 観光案内`;
}

function introFor(lang: Lang, areaName: string): string {
  return lang === "ko" ? `${areaName}에서 관광안내 근무를 시작할 때, 손님을 받기 전 10–30초 안에 확인할 내용입니다.`
    : lang === "en" ? `A 10–30 second check before receiving visitors at a guide shift in ${areaName}.`
    : lang === "zh" ? `在${areaName}开始旅游咨询值班时，接待游客前用10至30秒确认的内容。`
    : `${areaName}で観光案内の勤務を始める際、来訪者を迎える前の10～30秒で確認する内容です。`;
}

function formatDate(value: string, lang: Lang): string {
  return formatDayPeriod(value, lang) ?? value;
}

function formatKstDateTime(value: string, lang: Lang): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(localeFor(lang), {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function formatKstBand(start: string, end: string, lang: Lang): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return `${start} – ${end}`;
  const day = new Intl.DateTimeFormat(localeFor(lang), {
    timeZone: "Asia/Seoul", year: "numeric", month: "short", day: "numeric",
  }).format(startDate);
  const clock = (value: Date) => new Intl.DateTimeFormat(localeFor(lang), {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(value);
  return `${day} ${clock(startDate)}–${clock(endDate)} KST`;
}

function weatherInput(rows: readonly GuideWeatherRow[]): WeatherGuideInput | null {
  const next = rows.slice(0, 12);
  if (!next.length) return null;
  const first = (pick: (row: GuideWeatherRow) => number | null | undefined) =>
    next.map(pick).find((value) => value !== null && value !== undefined) ?? null;
  const probabilities = next
    .map((row) => row.precipitationProbability)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  return {
    temperatureTenthC: first((row) => row.temperatureTenthC),
    dailyMinTemperatureTenthC: first((row) => row.dailyMinTemperatureTenthC),
    dailyMaxTemperatureTenthC: first((row) => row.dailyMaxTemperatureTenthC),
    precipitationProbability: probabilities.length ? Math.max(...probabilities) : null,
    precipitationTypeCode: next.map((row) => row.precipitationTypeCode).find((value) => value !== null && value !== undefined) ?? null,
    humidityPercent: first((row) => row.humidityPercent),
    windSpeedTenthMps: first((row) => row.windSpeedTenthMps),
  };
}

function weatherGuides(rows: readonly GuideWeatherRow[]): Partial<Record<Lang, string>> {
  const input = weatherInput(rows);
  if (!input) return {};
  const result: Partial<Record<Lang, string>> = {};
  for (const language of ["ko", "en", "zh", "ja"] as const) {
    const guide = buildWeatherGuide(input, language);
    if (guide) result[language] = guide;
  }
  return result;
}

function formatDistance(distanceM: number | null, lang: Lang): string | null {
  if (distanceM === null || !Number.isFinite(distanceM) || distanceM < 0) return null;
  const rounded = Math.round(distanceM);
  return rounded >= 1000
    ? `${numberText(rounded / 1000, lang, 1)} km`
    : `${numberText(rounded, lang, 0)} m`;
}

function signedPercent(tenths: number, lang: Lang): string {
  const value = Math.abs(tenths) / 10;
  const rendered = new Intl.NumberFormat(localeFor(lang), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
  return `${tenths > 0 ? "+" : tenths < 0 ? "−" : ""}${rendered}%`;
}

function usableComparison(value: TourismSubwayComparison | null, requiredDates: number): value is TourismSubwayComparison {
  return value !== null
    && value.baselineDates.length === requiredDates
    && new Set(value.baselineDates).size === requiredDates
    && Number.isFinite(value.baselineAlightingCount)
    && value.baselineAlightingCount > 0
    && Number.isFinite(value.changeTenthsPercent);
}

function PeriodNote({ period }: { period: SourcePeriodDescription }) {
  return <div className="tourism-source-period">
    <p><strong>{period.cadenceLabel} · {period.periodLabel}</strong></p>
    <p>{period.publicationNote}</p>
    {period.cadenceNote && <p>{period.cadenceNote}</p>}
  </div>;
}

function BriefLine({ line, weatherDetails }: { line: TourismDeskLine; weatherDetails: string }) {
  const marked = line.koreanText;
  const canMark = Boolean(marked && (marked.position === "start"
    ? line.text.startsWith(marked.value)
    : line.text.endsWith(marked.value)));
  const before = canMark && marked?.position === "end"
    ? line.text.slice(0, -marked.value.length)
    : canMark && marked?.position === "start" ? "" : line.text;
  const after = canMark && marked?.position === "start"
    ? line.text.slice(marked.value.length)
    : "";
  return <li className="tourism-brief-line">
    <strong>{before}{canMark && marked && <span
      className={line.key === "event" ? "tourism-official-ko" : undefined}
      lang="ko"
    >{marked.value}</span>}{after}</strong>
    <small>{line.basis}{line.key === "weather" && weatherDetails ? ` · ${weatherDetails}` : ""}</small>
  </li>;
}

function EventCard({ event, lang, featured }: { event: GuideEvent; lang: Lang; featured: boolean }) {
  const copy = COPY[lang];
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const period = officialEventPeriod(event);
  const address = [event.address?.trim(), event.addressDetail?.trim()]
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
    .join(" · ");
  const overview = event.overview?.trim() ?? "";
  const preview = eventPreview(overview);
  const showFullDescription = Boolean(overview && overview !== preview);
  const homepage = safeOfficialEventHomepage(event.homepage);
  const distance = formatDistance(event.distanceM, lang);

  const copyInformation = async () => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(buildEventCopyText(event, lang));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return <article className={`tourism-event${featured ? " tourism-event-featured" : ""}`}>
    <header className="tourism-event-header">
      <span className="tourism-event-status">{eventPeriodStatusLabel(event.status, lang)}</span>
      <h3 className="tourism-official-ko" lang="ko">{event.title}</h3>
      {event.categoryName && <p className="tourism-event-category tourism-official-ko" lang="ko">{event.categoryName}</p>}
    </header>
    <dl className="tourism-event-facts">
      {period && <div><dt>{copy.eventPeriod}</dt><dd>{period}</dd></div>}
      {address && <div><dt>{copy.eventAddress}</dt><dd className="tourism-official-ko" lang="ko">{address}</dd></div>}
      {distance && <div><dt>{copy.eventDistance}</dt><dd>{distance}</dd></div>}
      <div><dt>{copy.eventSource}</dt><dd>{copy.ktoSource}</dd></div>
    </dl>
    {preview && <p className="tourism-event-preview tourism-official-ko" lang="ko">{preview}</p>}
    {showFullDescription && <details className="tourism-event-description">
      <summary>{copy.eventFull}</summary>
      <p className="tourism-official-ko" lang="ko">{overview}</p>
    </details>}
    <div className="tourism-event-actions">
      {homepage && <a
        href={homepage}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${copy.eventPage}: ${event.title}`}
      >{copy.eventPage} <span aria-hidden="true">↗</span></a>}
      <button type="button" onClick={copyInformation} aria-label={`${copy.eventCopy}: ${event.title}`}>{copy.eventCopy}</button>
      <span className="tourism-event-copy-state" role="status" aria-live="polite">
        {copyState === "copied" ? copy.copied : copyState === "failed" ? copy.copyFailed : ""}
      </span>
    </div>
  </article>;
}

function limitLines(lang: Lang, areaName: string): string[] {
  if (lang === "ko") return [
    "생활인구는 현재 지역에 머무는 인구의 공식 추정 범위이며 관광객 수가 아닙니다.",
    "지하철 승·하차는 개찰구 집계입니다. 고유 방문객 수, 지역 유입 인원 또는 관광객 수로 바꾸어 말하지 않습니다.",
    "비교값은 (최신 하차 − 기준 하차) ÷ 기준 하차 × 100으로 계산합니다. 기준값이 0 이하이거나 정확한 날짜 자료가 없으면 표시하지 않습니다.",
    "지난주 비교는 정확히 7일 전, 최근 7일 평균은 정확히 직전 7개 날짜, 전일 비교는 정확히 1일 전 자료가 있을 때만 표시합니다.",
    "4주 같은 요일 평균은 7·14·21·28일 전 네 날짜가 모두 있을 때만 표시합니다. 충분한 실제 이력과 설명 가능한 방법이 생기기 전에는 단순 전월·전년 비교를 표시하지 않습니다.",
    "행사 공식 기간에 오늘이 포함돼도 지금 실제 운영 중이라는 뜻은 아닙니다. 운영 여부와 시간은 공식 안내에서 확인합니다.",
    `단기체류 외국인 생활인구·목적별 이동·인천공항 입국 예보는 ${areaName} 관광객 또는 방문객 수가 아닙니다.`,
  ];
  if (lang === "en") return [
    "Living population is an official estimate of people present in the area now, not a tourist count.",
    "Subway boarding and alighting figures are gate counts. They are not unique visitors, area inflow or tourist counts.",
    "Each change is (latest alightings − baseline alightings) ÷ baseline alightings × 100. It is withheld when the baseline is zero or lower or the exact required date is missing.",
    "Last-week comparison needs exactly D−7, the recent average needs each of the immediately preceding seven calendar days, and previous-day comparison needs exactly D−1.",
    "The four-week same-weekday average appears only with all of D−7, D−14, D−21 and D−28. Simple month or year comparisons stay hidden until real history and a defensible method exist.",
    "Today being within an official event period does not mean the event is operating now. Check the official notice for operation and hours.",
    `Short-stay foreign living population, purpose mobility and the Incheon arrival forecast are not tourist or visitor counts for ${areaName}.`,
  ];
  if (lang === "zh") return [
    "生活人口是当前停留在该地区的人口官方估算区间，并非游客人数。",
    "地铁上下车数据是闸机统计，并非独立访客、地区流入人数或游客人数。",
    "变化率按（最新下车次数－基准下车次数）÷基准下车次数×100计算。基准值不大于0或缺少准确日期时不显示。",
    "上周比较必须有准确的D−7记录，最近7日平均必须有紧接此前7个日历日的记录，前日比较必须有准确的D−1记录。",
    "最近4周同星期几平均仅在D−7、D−14、D−21、D−28四天齐全时显示。拥有充分真实历史与合理方法前，不显示简单的环比或同比。",
    "今日在官方活动期间内，并不代表活动此刻实际举办。运营情况与时间请查看官方公告。",
    `短期停留外国人生活人口、分目的移动与仁川机场入境预测均非${areaName}游客或访客人数。`,
  ];
  return [
    "生活人口は現在エリアに滞在する人口の公式推定レンジであり、観光客数ではありません。",
    "地下鉄の乗降は改札集計です。ユニーク訪問者数、エリアへの流入人数、観光客数ではありません。",
    "変化率は（最新の降車件数－基準の降車件数）÷基準の降車件数×100で計算します。基準値が0以下、または必要な日付のデータがない場合は表示しません。",
    "先週比は正確なD−7、直近7日平均は直前7暦日すべて、前日比は正確なD−1がある場合だけ表示します。",
    "4週の同じ曜日平均はD−7・D−14・D−21・D−28がすべてある場合だけ表示します。十分な実履歴と説明可能な方法が整うまで、単純な前月・前年比較は表示しません。",
    "本日が公式イベント期間内でも、現在実際に開催していることを意味しません。開催状況と時間は公式案内で確認します。",
    `短期滞在外国人生活人口・目的別移動・仁川空港の入国予測は、${areaName}の観光客数や来訪者数ではありません。`,
  ];
}

export function TourismDeskView({ lang, area, onAreaChange }: {
  lang: Lang;
  area: TourismAreaId;
  onAreaChange: (area: TourismAreaId) => void;
}) {
  const summary = useLiveSummary(null);
  const block = summary?.areas?.[area] ?? null;
  const areaName = areaNames[area][lang];
  const copy: DeskCopy = COPY[lang];
  const visitorTriggerRef = useRef<HTMLElement | null>(null);
  const [visitorContent, setVisitorContent] = useState<TourismVisitorShowContent | null>(null);

  const preparedEvents: GuideEvent[] = !block?.events?.length || !summary?.todayKst
    ? []
    : prepareEventsForPresentation(block.events.map((row) => ({
      contentId: row.contentId,
      title: row.title,
      eventStart: row.eventStart,
      eventEnd: row.eventEnd,
      distanceM: row.distanceM,
      categoryName: row.categoryName,
      address: row.address,
      addressDetail: row.addressDetail,
      overview: row.overview,
      homepage: row.homepage,
    })), summary.todayKst);
  const eventPage = useEventPagination(preparedEvents, area, summary?.todayKst ?? "");

  const guides = weatherGuides(block?.weather ?? []);
  const weatherGuide = guides[lang] ?? null;
  const weatherDetails = formatWeatherDetails(weatherInput(block?.weather ?? []), lang);
  const areaBrief = buildAreaCurrentBrief({
    realtime: block?.realtime?.freshness === "LIVE" ? block.realtime : null,
    realtimeForecast: block?.realtimeForecast ?? [],
    weather: block?.weather ?? [],
    eventCount: preparedEvents.length,
    nextEventTitle: preparedEvents[0]?.title ?? null,
    nextEventCategory: preparedEvents[0]?.categoryName ?? null,
    nowIso: summary?.generatedAt ?? new Date(0).toISOString(),
  });
  const brief = buildTourismDeskBrief({
    crowding: block?.realtime?.freshness === "LIVE" ? {
      congestionLevel: block.realtime.congestionLevel,
      populationMin: block.realtime.populationMin,
      populationMax: block.realtime.populationMax,
      observedAt: block.realtime.observedAt,
    } : null,
    crowdForecast: areaBrief.upcomingPeak ? {
      targetAt: areaBrief.upcomingPeak.targetAt,
      congestionLevel: areaBrief.upcomingPeak.congestionLevel,
      dayOffset: areaBrief.upcomingPeak.dayOffset,
    } : null,
    weatherGuide,
    todayEvent: preparedEvents[0] ? {
      title: preparedEvents[0].title,
      categoryName: preparedEvents[0].categoryName ?? null,
      status: preparedEvents[0].status,
    } : null,
    subway: block?.subwayRidership?.trend ? {
      boardingCount: block.subwayRidership.boardingCount,
      alightingCount: block.subwayRidership.alightingCount,
      referenceDate: block.subwayRidership.referenceDate,
      selectedStations: formatRepresentativeStations(block.subwayRidership.selectedStations)
        ?? block.subwayRidership.selectedStations,
      trend: block.subwayRidership.trend,
    } : null,
  }, lang, areaName);

  const lastCollected = (sourceId: string): string | null =>
    summary?.sources?.find((source) => source.sourceId === sourceId)?.retrievedAt ?? null;
  const foreignPeriod = block?.foreignPresence && summary
    ? describeSourcePeriod({
      cadence: "DAILY",
      referencePeriod: block.foreignPresence.referenceAt,
      retrievedAt: lastCollected("SEOUL_SHORT_STAY_FOREIGN_LIVING_POPULATION"),
      nowIso: summary.generatedAt,
    }, lang)
    : null;
  const mobilityPeriod = block?.foreignPurposeMobility && summary
    ? describeSourcePeriod({
      cadence: "MONTHLY",
      referencePeriod: block.foreignPurposeMobility.referenceDate,
      retrievedAt: lastCollected("SEOUL_FOREIGN_PURPOSE_MOBILITY"),
      nowIso: summary.generatedAt,
    }, lang)
    : null;

  const subway = block?.subwayRidership ?? null;
  const station = formatRepresentativeStations(subway?.selectedStations) ?? subway?.selectedStations ?? null;
  const comparisons: SubwayComparisonDisplay[] = [];
  const trend = subway?.trend;
  if (trend) {
    if (usableComparison(trend.sameWeekdayLastWeek, 1)) {
      comparisons.push({ key: "same-weekday", label: copy.sameWeekday, value: trend.sameWeekdayLastWeek });
    }
    if (usableComparison(trend.recentSevenDayAverage, 7)) {
      comparisons.push({ key: "recent-average", label: copy.recentAverage, value: trend.recentSevenDayAverage });
    }
    if (usableComparison(trend.previousDay, 1)) {
      comparisons.push({ key: "previous-day", label: copy.previousDay, value: trend.previousDay });
    }
    if (usableComparison(trend.fourWeekSameWeekdayAverage, 4)) {
      comparisons.push({ key: "four-week", label: copy.fourWeekAverage, value: trend.fourWeekSameWeekdayAverage });
    }
  }

  const arrival = summary?.airport?.arrivalForecast ?? null;
  const completeArrival = arrival?.forecastCoverage?.all === "COMPLETE" ? arrival : null;
  const arrivalBand = completeArrival?.nextExpectedTimeBand ?? null;
  const arrivalDayTotal = completeArrival?.todayExpectedPassengersTotal ?? null;
  const hasForeignPurpose = Boolean(block?.foreignPurposeMobility
    && (block.foreignPurposeMobility.shopping !== null || block.foreignPurposeMobility.tourism !== null));
  const hasBackground = Boolean(block?.foreignPresence || hasForeignPurpose || arrivalBand || arrivalDayTotal !== null);

  const openVisitor = (event: MouseEvent<HTMLButtonElement>, row: GuideEvent) => {
    const period = officialEventPeriod(row);
    if (!period) return;
    visitorTriggerRef.current = event.currentTarget;
    setVisitorContent({
      officialEventTitleKo: row.title,
      officialEventPeriod: period,
      officialEventAddressKo: [row.address?.trim(), row.addressDetail?.trim()].filter(Boolean).join(" · ") || null,
      officialEventUrl: row.homepage,
      officialEventSource: "Korea Tourism Organization (KTO) TourAPI",
      deterministicWeatherNote: guides,
    });
  };

  return <section className="tourism-desk" aria-labelledby="tourism-desk-title">
    <header className="tourism-desk-head">
      <div>
        <p className="tourism-desk-kicker">KORETAIL · Tourism Desk</p>
        <h1 id="tourism-desk-title">{titleFor(lang, areaName)}</h1>
      </div>
      <span className="tourism-pilot-label">{copy.pilot}</span>
    </header>

    <nav className="tourism-area-switcher" aria-label={copy.areaSwitch}>
      {(Object.keys(areaNames) as TourismAreaId[]).map((id) => <a
        key={id}
        href={`/${lang}/tourism-desk/${id}`}
        className={area === id ? "tourism-area-active" : undefined}
        aria-current={area === id ? "page" : undefined}
        onClick={(event) => {
          event.preventDefault();
          onAreaChange(id);
        }}
      >{areaNames[id][lang]}</a>)}
    </nav>
    <p className="tourism-desk-intro">{introFor(lang, areaName)}</p>
    <p className="tourism-pilot-note">{copy.pilotNote}</p>

    {!summary ? <LiveLoadMessage loading={summary === undefined} lang={lang} /> : <>
      <section className="tourism-guide-section tourism-shift-brief" aria-labelledby="tourism-brief-title">
        <header className="tourism-section-head">
          <h2 id="tourism-brief-title">{copy.sectionBrief}</h2>
          <p>{copy.briefIntro}</p>
        </header>
        {brief.length
          ? <ol className="tourism-brief-list">{brief.map((line) => <BriefLine key={line.key} line={line} weatherDetails={weatherDetails} />)}</ol>
          : <p className="tourism-empty">{copy.unavailable}</p>}
      </section>

      <section className="tourism-guide-section" aria-labelledby="tourism-events-title">
        <header className="tourism-section-head">
          <h2 id="tourism-events-title">{copy.sectionGuide}</h2>
          <p>{copy.guideIntro}</p>
        </header>
        {preparedEvents.length
          ? <>
            <div className="tourism-events">
              {eventPage.visible.map((event, index) => <EventCard
                key={event.contentId ?? `${event.title}-${event.eventStart}`}
                event={event}
                lang={lang}
                featured={index === 0}
              />)}
            </div>
            <EventPaginationControls page={eventPage} lang={lang} />
            <p className="tourism-event-caveat">{copy.eventCaveat}</p>
          </>
          : <p className="tourism-empty">{copy.noEvents}</p>}
      </section>

      <section className="tourism-guide-section" aria-labelledby="tourism-subway-title">
        <header className="tourism-section-head">
          <h2 id="tourism-subway-title">{copy.sectionTransport}</h2>
          <p>{copy.transportIntro}</p>
        </header>
        {subway && station ? <article className="tourism-subway">
          <header className="tourism-subway-head">
            <h3 lang="ko">{station}</h3>
            <p>{copy.subwayFlow}</p>
          </header>
          <div className="tourism-subway-primary">
            <span>{copy.subwayAlighting}</span>
            <strong>{numberText(subway.alightingCount, lang, 0)}<small>{copy.people}</small></strong>
          </div>
          {comparisons.length ? <ul className="tourism-subway-comparisons">
            {comparisons.map((comparison) => <li key={comparison.key}>
              <span>{comparison.label}</span>
              <strong>{signedPercent(comparison.value.changeTenthsPercent, lang)}</strong>
              {comparison.key === "recent-average" && <small>{copy.recentAverageNote}</small>}
            </li>)}
          </ul> : <p className="tourism-subway-history">{copy.historyBuilding}</p>}
          <dl className="tourism-subway-secondary">
            <div><dt>{copy.subwayBoarding}</dt><dd>{numberText(subway.boardingCount, lang, 0)} {copy.people}</dd></div>
            <div><dt>{copy.subwayDate}</dt><dd>{formatDate(subway.referenceDate, lang)}</dd></div>
          </dl>
          <p className="tourism-source">{copy.subwaySource}</p>
          <p className="tourism-limit-note">{copy.subwayCaveat}</p>
        </article> : <p className="tourism-empty">{copy.unavailable}</p>}
      </section>

      <section className="tourism-guide-section" aria-labelledby="tourism-current-title">
        <header className="tourism-section-head">
          <h2 id="tourism-current-title">{copy.sectionCurrent}</h2>
          <p>{copy.currentIntro}</p>
        </header>
        {block?.realtime?.freshness === "LIVE" ? <article className="tourism-current-reading">
          <dl>
            <div>
              <dt>{copy.currentPopulation}</dt>
              <dd>{numberText(block.realtime.populationMin, lang, 0)}–{numberText(block.realtime.populationMax, lang, 0)} {copy.people}</dd>
            </div>
            <div>
              <dt>{copy.observed}</dt>
              <dd>{formatHumanFreshness(block.realtime.observedAt, summary.generatedAt, lang, "plain")}</dd>
            </div>
          </dl>
          <p className="tourism-source">{copy.currentSource}</p>
          <p className="tourism-limit-note">{copy.currentCaveat}</p>
        </article> : <p className="tourism-empty">{copy.unavailable}</p>}
      </section>

      <section className="tourism-guide-section" aria-labelledby="tourism-background-title">
        <header className="tourism-section-head">
          <h2 id="tourism-background-title">{copy.sectionBackground}</h2>
          <p>{copy.backgroundIntro}</p>
        </header>
        {hasBackground ? <div className="tourism-background-list">
          {block?.foreignPresence && <article className="tourism-background-item">
            <h3>{copy.foreignPresence}</h3>
            <p className="tourism-background-value">{numberText(block.foreignPresence.value, lang)} {copy.people}</p>
            {foreignPeriod && <PeriodNote period={foreignPeriod} />}
            <p className="tourism-source">{copy.foreignSource}</p>
            <p className="tourism-limit-note">{copy.foreignCaveat}</p>
          </article>}
          {hasForeignPurpose && block?.foreignPurposeMobility && <article className="tourism-background-item">
            <h3>{copy.foreignPurpose}</h3>
            <dl className="tourism-background-values">
              {block.foreignPurposeMobility.shopping !== null && <div>
                <dt>{copy.shoppingPurpose}</dt>
                <dd>{numberText(block.foreignPurposeMobility.shopping, lang)} {copy.movements}</dd>
              </div>}
              {block.foreignPurposeMobility.tourism !== null && <div>
                <dt>{copy.tourismPurpose}</dt>
                <dd>{numberText(block.foreignPurposeMobility.tourism, lang)} {copy.movements}</dd>
              </div>}
            </dl>
            {mobilityPeriod && <PeriodNote period={mobilityPeriod} />}
            <p className="tourism-source">{copy.purposeSource}</p>
            <p className="tourism-limit-note">{copy.purposeCaveat}</p>
          </article>}
          {(arrivalBand || arrivalDayTotal !== null) && <article className="tourism-background-item">
            <h3>{copy.airportArrival}</h3>
            {arrivalBand ? <>
              <p className="tourism-background-label">{copy.airportNextBand}</p>
              <p className="tourism-background-value">{numberText(arrivalBand.expectedPassengers, lang, 0)} {copy.people}</p>
              <p className="tourism-background-period">{formatKstBand(arrivalBand.targetStartAt, arrivalBand.targetEndAt, lang)}</p>
            </> : <>
              <p className="tourism-background-label">{copy.airportDay}</p>
              <p className="tourism-background-value">{numberText(arrivalDayTotal!, lang, 0)} {copy.people}</p>
            </>}
            {completeArrival?.passengerForecastRetrievedAt && <p className="tourism-background-period">
              {copy.collected} · {formatKstDateTime(completeArrival.passengerForecastRetrievedAt, lang)}
            </p>}
            <p className="tourism-source">{copy.airportSource}</p>
            <p className="tourism-limit-note">{copy.airportCaveat}</p>
          </article>}
        </div> : <p className="tourism-empty">{copy.unavailable}</p>}
      </section>

      <section className="tourism-guide-section" aria-labelledby="tourism-visitor-title">
        <header className="tourism-section-head">
          <h2 id="tourism-visitor-title">{copy.sectionVisitor}</h2>
          <p>{copy.visitorIntro}</p>
        </header>
        {preparedEvents.length ? <ul className="tourism-visitor-launches">
          {eventPage.visible.map((event) => <li key={event.contentId ?? `${event.title}-${event.eventStart}`}>
            <span className="tourism-official-ko" lang="ko">{event.title}</span>
            <button
              type="button"
              onClick={(clickEvent) => openVisitor(clickEvent, event)}
              aria-label={`${copy.visitorShow}: ${event.title}`}
            >{copy.visitorShow}</button>
          </li>)}
        </ul> : <p className="tourism-empty">{copy.noEvents}</p>}
      </section>

      <section className="tourism-guide-section" aria-labelledby="tourism-limits-title">
        <header className="tourism-section-head">
          <h2 id="tourism-limits-title">{copy.sectionLimits}</h2>
          <p>{copy.limitsIntro}</p>
        </header>
        <ul className="tourism-limits">
          {limitLines(lang, areaName).map((line) => <li key={line}>{line}</li>)}
        </ul>
      </section>
    </>}

    <TourismVisitorShow
      open={visitorContent !== null}
      content={visitorContent}
      triggerRef={visitorTriggerRef}
      initialLanguage={lang}
      onRequestClose={() => setVisitorContent(null)}
    />
  </section>;
}
