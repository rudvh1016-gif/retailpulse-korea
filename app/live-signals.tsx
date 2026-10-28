"use client";
import {unverifiedPurposeText} from '../lib/purpose-display';
import {RateText} from './change-rate';
import Image from 'next/image';
import { AirportDateCalendar } from './airport-date-calendar';
import { demandCopy, demandLevel, AreaDemandCard, usePresentationClock } from "./area-demand-card";
import { passengerCopy } from "../lib/passenger-copy";
import { AirportMonthComparison } from './airport-month-comparison';
import { SeoulFlowModels } from './seoul-flow-models';
import { CountUpNumber } from "./count-up-number";
import { passengerReferenceSum } from "../lib/passenger-reference-sum";
import { usableComparison, validPopulationRange, kstStamp, kstDay, peopleRange, populationFlow } from "../lib/demand-presentation";
import { pc } from '../lib/personal-copy';

import { SeoulContextCard, SeoulObservationScene, contextText } from "./operational-context";
import type { SeoulContext } from "../lib/seoul-context";
import type { compareComposition } from "../lib/airport-composition-history";
import { useEffect, useRef, useState, type ReactNode } from "react";
// The summary reader, the load message and the header date chip live in ./live-summary so the
// screens that need only those (the home among them) do not download the Seoul signals with them.
import { airportLocale, LiveLoadMessage, nextKstMidnight, useLiveSummary } from "./live-summary";
export { airportLocale, KstTodayChip, LiveLoadMessage, useLiveSummary } from "./live-summary";
import type { Lang } from "./retailpulse-data";
import { friendlyCheckpointName } from "../lib/airport-today-summary";
import {
  buildAirportCurrentBrief,
  buildAreaCurrentBrief,
  formatHumanFreshness,
  selectAirportNowBand,
  type AreaCurrentBrief,
  type AirportCurrentBrief,
  type ForecastDayOffset,
} from "../lib/current-brief";
import {
  eventPreview,
  eventStatusForDate,
  safeOfficialEventHomepage,
  type EventPresentationStatus,
} from "../lib/event-presentation";
import { describeSourcePeriod, PERIOD_VOUCH_WINDOW_MS } from "../lib/source-period";
import {chineseText} from '../lib/chinese-ui';
import { formatRepresentativeStations } from "../lib/subway-ridership";
import { buildWeatherGuide, worseAirGrade } from "../lib/weather-guide";
import { WeatherScene } from './weather-scene';
import type { WeatherMetricKind } from './weather-metric-scene';
import { describeObservationAge } from "../lib/observation-freshness";
import { comparisonText, comparisonValue, type RangeChange } from "../lib/period-comparison";
import type { MonthToDate, MtdDay } from "../lib/airport-mtd";
import { mtdCopy, shortDay, shortRange } from "../lib/airport-mtd-copy";
import { averagePaymentRange, commercialActivityContext } from "../lib/commercial-context";
import { CommercialMetricScene, type CommercialMetricKind } from './commercial-metric-scene';

import { useEventPagination, EventPaginationControls } from "./event-pagination";

type PeriodComparisons = Partial<Record<7 | 28, RangeChange | null>>;
function comparisonLines(comparisons: PeriodComparisons | undefined, lang: Lang): string[] {
  return ([7, 28] as const).flatMap((days) => comparisons?.[days] ? [comparisonText(comparisons[days]!, lang, days)] : []);
}

type AreaId = "myeongdong" | "hongdae" | "seongsu" | "itaewon";

interface LiveRealtime {
  comparisons?: PeriodComparisons;
  congestionLevel: number;
  congestionLabel: string;
  populationMin: number;
  populationMax: number;
  observedAt: string;
  retrievedAt?: string;
  freshness: "LIVE" | "STALE";
}

export interface LiveCommercial {
  comparisons?: PeriodComparisons;
  commercialLevel: string;
  paymentCount: number | null;
  paymentAmountMin: number | null;
  paymentAmountMax: number | null;
  observedAt: string;
  retrievedAt: string;
  qualityStatus: string;
  freshness: "LIVE" | "STALE";
}

interface LiveWeatherRow {
  targetAt: string;
  precipitationProbability: number | null;
  temperatureTenthC: number | null;
  conditionCode: string | null;
  /** Official KMA PTY code, so the guide reads falling precipitation rather than inferring it. */
  precipitationTypeCode?: string | null;
  humidityPercent?: number | null;
  windSpeedTenthMps?: number | null;
  dailyMinTemperatureTenthC?: number | null;
  dailyMaxTemperatureTenthC?: number | null;
  /** Only ever set when KMA gave an exact amount; a bound stays null here. */
  precipitationAmountTenthMm?: number | null;
  precipitationAmountKind?: string | null;
}

interface LiveRealtimeForecast {
  targetAt: string;
  congestionLevel: number;
  congestionLabel: string;
  populationMin: number;
  populationMax: number;
  issuedAt?: string;
  retrievedAt?: string;
}

interface LiveEventRow {
  contentId?: string | null;
  title: string;
  eventStart: string;
  eventEnd: string | null;
  distanceM: number | null;
  /** Official TourAPI fields stored by the collector; absent means the provider gave none. */
  categoryName?: string | null;
  address?: string | null;
  addressDetail?: string | null;
  overview?: string | null;
  homepage?: string | null;
  status?: EventPresentationStatus;
}

interface LiveSales {
  quarterCode: string;
  tradeAreaName: string | null;
  totalAmount: number;
  industryCount: number;
  retrievedAt: string | null;
}

export interface LiveStoreDynamics {
  datasetId: "OA-15577";
  quarterCode: string;
  tradeAreaCode: string;
  tradeAreaName: string;
  tradeAreaTypeCode: string;
  tradeAreaTypeName: string;
  totalStoreCount: number;
  ordinaryStoreCount: number;
  franchiseStoreCount: number;
  openingCount: number;
  closureCount: number;
  mappingVersion: string;
  retrievedAt: string;
}

interface LiveForeignPresence {
  value: number;
  unit: "people";
  referenceAt: string;
  retrievedAt: string;
  productVersion: string;
  freshness: "OFFICIAL_HISTORICAL";
  qualityStatus: string;
}

interface LiveForeignPurposeMobility {
  referenceDate: string;
  retrievedAt: string;
  datasetId: "OA-22378";
  mappingVersion: string;
  shopping: number | null;
  tourism: number | null;
}

interface LiveSubwayRidership {
  referenceDate: string;
  boardingCount: number;
  alightingCount: number;
  selectedStationCount: number;
  selectedStations: string;
  retrievedAt: string;
  datasetId: "OA-22723";
  mappingVersion: string;
  /** Added in the guide-utility release; optional while an older edge payload expires. */
  trend?: {
    observedDayCount: number;
    earliestReferenceDate: string;
    previousDay: LiveSubwayComparison | null;
    sameWeekdayLastWeek: LiveSubwayComparison | null;
    recentSevenDayAverage: LiveSubwayComparison | null;
    fourWeekSameWeekdayAverage: LiveSubwayComparison | null;
  };
}

interface LiveSubwayComparison {
  baselineDates: string[];
  baselineAlightingCount: number;
  /** Tenths of one percent: 124 means +12.4%. */
  changeTenthsPercent: number;
}

export interface LiveObservedPoint {
  observedAt: string;
  congestionLevel: number;
  congestionLabel: string;
  populationMin: number;
  populationMax: number;
}

interface LiveAreaBlock {
  context?: (SeoulContext & {retrievedAt:string}) | null;
  realtime: LiveRealtime | null;
  commercial: LiveCommercial | null;
  realtimeForecast: LiveRealtimeForecast[];
  weather: LiveWeatherRow[];
  events: LiveEventRow[];
  eventCount: number;
  observedSeries: LiveObservedPoint[];
  sales: LiveSales | null;
  storeDynamics: LiveStoreDynamics | null;
  foreignPresence: LiveForeignPresence | null;
  foreignPurposeMobility: LiveForeignPurposeMobility | null;
  subwayRidership: LiveSubwayRidership | null;
}

export interface LiveCongestionRow {
  terminal: string;
  zone: string;
  waitingCount: number | null;
  waitTimeMinutes: number | null;
  waitTimeRaw?: string | null;
  observedAt: string;
  retrievedAt?: string;
  freshness: "LIVE" | "STALE";
}

interface LiveScheduledRow {
  terminal: string | null;
  flights: number;
  firstTime: string;
  lastTime: string;
}

export interface LiveFlightRow {
  flightNumber: string;
  airlineCode: string | null;
  airportCode: string | null;
  direction: string;
  terminal: string | null;
  gate: string | null;
  checkinCounter: string | null;
  status: string;
  scheduledAt: string;
}

/** A5 — official FORECAST/EXPECTED departure passengers. Never an actual observed queue. */
interface LivePassengerForecastRow {
  terminal: string;
  targetDate: string;
  timeBandRaw: string;
  targetStartAt: string;
  targetEndAt: string;
  expectedPassengers: number;
  retrievedAt: string;
}

/** COMPLETE = full KST-day coverage proven, safe to show as a whole-day figure. PARTIAL = some official bands missing, a total/peak could hide the true peak. UNAVAILABLE = no official band at all. */
type ForecastCoverageStatus = "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
export type ForecastBand = { targetStartAt: string; targetEndAt: string; expectedPassengers: number };
type TerminalGate = { gate: string; flights: number } | null;
export type RankedAirlineRow = { iata: string | null; registryName: string | null; country: string | null; countryBasis: "REGISTRY" | "UNVERIFIED"; flights: number; share: number };
type CountryRollupRow = { country: string | null; flights: number; airlines: number; share: number };
type AirlineRankingScope = { totalFlights: number; airlines: RankedAirlineRow[]; countries: CountryRollupRow[]; retrievedAt: string | null };
type AirlineRankingPayload = { all: AirlineRankingScope; byTerminal: Record<string, AirlineRankingScope>; countrySource?: { provider: string; licence: string; retrievedOn: string; entries: number; suppressed?: number } };
type RankedGate = { terminal: string | null; gate: string; flights: number };
export type RemainingForecast = { expectedPassengers: number; fromAt: string; toAt: string; bands: number } | null;

export interface LiveSummary {
  /** Browser refresh status only; never a source collection/observation time. */
  clientRefresh?: { failedAt: string };
  holidays?: Array<{month:string;days:Array<{date:string;name:string}>;retrievedAt:string}>;
  mode: string;
  generatedAt: string;
  todayKst: string;
  serviceDateKst: string;
  dayRelation: "PAST" | "TODAY" | "FUTURE";
  dateAvailability: {
    airportFlights: string[];
    airportPassengerForecast: string[];
    seoulObserved: string[];
    airportDepartureSchedule?: string[];
    month?: string;
    startDate?: string;
    endDate?: string;
    checkedAt?: Partial<Record<'airportFlights' | 'airportPassengerForecast' | 'airportDepartureSchedule' | 'seoulObserved', string | null>>;
  };
  /**
   * Per-source collector health. `retrievedAt` here is the last SUCCESSFUL
   * collection, which is the only field that can tell a healthy source apart
   * from a stalled one: writes are changed-only, so a data row's own
   * `retrieved_at` freezes at the last time the numbers changed. A monthly
   * figure that has not moved since publication would otherwise look like a
   * collector that stopped working.
   */
  sources?: Array<{ sourceId: string; status: string; retrievedAt: string | null; detail?:string | null }>;
  areas: Partial<Record<AreaId, LiveAreaBlock>>;
  airport: {
    /** Month-to-date and the previous month's same span, per terminal scope. */
    monthToDate?: Record<"all" | "T1" | "T2", MonthToDate>;
    periodComparisons?: Record<string, Partial<Record<7 | 28, { passengers: RangeChange | null; flightRecords: RangeChange | null; composition?: (ReturnType<typeof compareComposition> & {baselineDate:string}) | null }>>>;
    congestion: LiveCongestionRow[];
    currentBusiestDepartureHallByTerminal: Record<string, LiveCongestionRow>;
    departuresTrackedToday: number | null;
    departuresTrackedTodayByTerminal: Record<string, number | null>;
    departuresTrackedTodayRetrievedAt: string | null;
    topDepartureGate: string | null;
    topDepartureGateTerminal: string | null;
    topDepartureGateFlights: number | null;
    topDepartureGateByTerminal: Record<string, TerminalGate>;
    busyDepartureGates: RankedGate[];
    busyDepartureGatesByTerminal: Record<string, RankedGate[]>;
    topDepartureGateRetrievedAt: string | null;
    topDepartureGateRetrievedAtByTerminal: Record<string, string | null>;
    gateCoverageRatio: number;
    gateCoverageRatioByTerminal: Record<string, number>;
    airlineRanking?: AirlineRankingPayload;
    serviceDateKst: string | null;
    periodStartAt: string | null;
    periodEndAt: string | null;
    /** Latest retrieval AMONG airport datasets — not proof every metric below shares this freshness. */
    latestRetrievedAt: string | null;
    todayExpectedPassengersTotal: number | null;
    todayExpectedPassengersByTerminal: Record<string, number | null>;
    flightScope?: { total:number; T1:number; T2:number; CONCOURSE?:number; other:number; unassigned:number; conflicting:number; capped:boolean };
    remainingExpectedPassengers: RemainingForecast;
    remainingExpectedPassengersByTerminal: Record<string, RemainingForecast>;
    passengerForecastRetrievedAt: string | null;
    passengerForecastRetrievedAtByTerminal: Record<string, string | null>;
    peakExpectedTimeBand: ForecastBand | null;
    peakExpectedTimeBandByTerminal: Record<string, ForecastBand | null>;
    peakExpectedPassengers: number | null;
    peakExpectedPassengersByTerminal: Record<string, number | null>;
    passengerForecastTimeline: ForecastBand[];
    passengerForecastTimelineByTerminal: Record<string, ForecastBand[]>;
    forecastCoverage: { all: ForecastCoverageStatus; byTerminal: Record<string, ForecastCoverageStatus> };
    arrivalForecast: {
      todayExpectedPassengersTotal: number | null;
      todayExpectedPassengersByTerminal: Record<string, number | null>;
      nextExpectedTimeBand: ForecastBand | null;
      peakExpectedTimeBand: ForecastBand | null;
      peakExpectedTimeBandByTerminal?: Record<string, ForecastBand | null>;
      passengerForecastTimeline?: ForecastBand[];
      passengerForecastTimelineByTerminal?: Record<string, ForecastBand[]>;
      passengerForecastRetrievedAt: string | null;
      forecastCoverage: { all: ForecastCoverageStatus; byTerminal: Record<string, ForecastCoverageStatus> };
    };
    scheduled: LiveScheduledRow[];
    transferForecast?: {terminal: "T1" | "T2"; expectedTransferPassengers: number; retrievedAt: string; serviceDate: string}[];
    scheduledBriefing?: ReturnType<typeof import('../lib/scheduled-briefing').summarizeScheduledBriefing>;
    passengerForecast: LivePassengerForecastRow[];
  };
}

const text = {
  eyebrow: "OFFICIAL DATA SIGNALS · KST",
  title: { ko: "오늘 수요를 움직이는 신호", en: "Signals moving demand today", zh: "今日影响需求的信号", ja: "今日の需要を動かすシグナル" },
  intro: {
    ko: "모두 공식 기관이 발표한 값입니다. 신호는 매출이나 방문자 수가 아니며, 각 줄에 출처와 기준시각을 함께 적었습니다.",
    en: "Every value below is published by an official body. A signal is not sales or visitor counts; each row carries its source and reference time.",
    zh: "以下数值均由官方机构发布。信号不等于销售额或访客数，每行均标注来源与基准时间。",
    ja: "すべて公式機関が発表した値です。シグナルは売上や来訪者数ではなく、各行に出典と基準時刻を併記しています。",
  },
  realtime: { ko: "실시간 활동", en: "Live activity", zh: "实时活动", ja: "リアルタイム活動" },
  // The metric has to name itself. "96,000–98,000명" beside a bare "실시간 활동"
  // reads to most people as today's visitor count; it is the provider's
  // estimate of how many people are in the area right now.
  currentPopulation: { ko: "현재 추정 인구", en: "Estimated population now", zh: "当前推定人口", ja: "現在の推定人口" },
  notCumulative: { ko: "현재 시점 추정 범위 · 오늘 누적 방문객 아님", en: "estimated range at this moment, not today's cumulative visitors", zh: "当前时点推定范围 · 非今日累计访客", ja: "現時点の推定範囲 · 本日の累計来訪者ではありません" },
  commercial: { ko: "최근 10분 내국인 카드 소비", en: "Recent 10-minute domestic-card activity", zh: "最近10分钟境内消费者银行卡支付", ja: "直近10分の国内消費者カード決済" },
  // The first line of the card states the time basis and the population
  // before any number, so "결제금액 ₩1,000,000–₩1,100,000" is never read as
  // today's total or as all shoppers.
  commercialBasis: {
    ko: "신한카드 내국인 결제 추정 · 최근 10분 기준 · 오늘 누적 아님",
    en: "Shinhan Card domestic-consumer payment estimate · recent 10-minute window · not a daily total",
    zh: "新韩卡韩国境内消费者支付推算 · 最近10分钟窗口 · 非当日累计",
    ja: "新韓カード国内消費者決済の推定 · 直近10分基準 · 本日累計ではありません",
  },
  commercialDisclaimer: {
    ko: "신한카드 내국인 결제 기반 · 전수 매출 아님 · 외국인 소비 아님",
    en: "Based on Shinhan Card domestic-consumer payments · not total sales · not foreign-consumer spending",
    zh: "基于新韩卡韩国境内消费者支付 · 非全量销售额 · 非外国消费者支出",
    ja: "新韓カードの国内消費者決済に基づく · 売上全数ではありません · 外国人消費ではありません",
  },
  weather: { ko: "날씨", en: "Weather", zh: "天气", ja: "天気" },
  rainChance: { ko: "강수확률 최대", en: "max rain chance", zh: "最大降水概率", ja: "降水確率 最大" },
  humidity: { ko: "습도", en: "humidity", zh: "湿度", ja: "湿度" },
  wind: { ko: "바람", en: "wind", zh: "风速", ja: "風速" },
  rainfall: { ko: "강수량", en: "rainfall", zh: "降水量", ja: "降水量" },
  dayLow: { ko: "최저", en: "low", zh: "最低", ja: "最低" },
  dayHigh: { ko: "최고", en: "high", zh: "最高", ja: "最高" },
  events: { ko: "주변 행사", en: "Nearby events", zh: "周边活动", ja: "周辺イベント" },
  eventCount: {
    ko: "건 공식 행사기간 내·예정",
    en: "within official period or upcoming",
    zh: "项在官方活动期间内或即将开始",
    ja: "件 公式開催期間内・開催予定",
  },
  eventRepresentative: { ko: "대표 행사", en: "Representative events", zh: "代表活动", ja: "代表イベント" },
  eventDetails: { ko: "자세히 보기", en: "View details", zh: "查看详情", ja: "詳細を見る" },
  eventOfficialPage: { ko: "공식 행사 페이지", en: "Official event page", zh: "官方活动页面", ja: "公式イベントページ" },
  eventInOfficialPeriod: {
    ko: "선택 날짜가 공식 행사기간에 포함",
    en: "Selected date falls within the official event period",
    zh: "所选日期在官方活动期间内",
    ja: "選択日は公式開催期間内",
  },
  eventStartsAfterSelectedDate: {
    ko: "선택 날짜 이후 공식 행사기간 시작",
    en: "Official event period starts after the selected date",
    zh: "官方活动期间在所选日期之后开始",
    ja: "公式開催期間は選択日より後に開始",
  },
  eventOperationCaveat: {
    ko: "공식 행사기간만으로 실제 운영 여부나 운영시간을 확인할 수 없습니다. 공식 안내를 확인하세요.",
    en: "The official event period does not confirm that the event is actually taking place or its opening hours. Check the official notice.",
    zh: "官方活动期间并不代表活动此刻实际举办，也不代表当天开放时间。请查看官方公告。",
    ja: "公式開催期間だけでは、実際の開催状況や当日の開催時間は確認できません。公式案内をご確認ください。",
  },
  eventDistanceBasis: { ko: "선택 지역 기준", en: "from selected area", zh: "距所选区域", ja: "選択エリア基準" },
  sales: { ko: "상권 과거 흐름", en: "Commercial history", zh: "商圈历史", ja: "商圏の過去推移" },
  salesNote: { ko: "분기 추정매출 · 실매출 아님", en: "Quarterly estimate · not POS sales", zh: "季度推算 · 非实际销售", ja: "四半期推定 · 実売上ではない" },
  foreignPresence: { ko: "단기외국인 생활인구", en: "Short-stay foreign living population", zh: "短期停留外国人生活人口", ja: "短期滞在外国人生活人口" },
  foreignPeople: { ko: "명", en: "people", zh: "人", ja: "人" },
  foreignNote: {
    ko: "서울시 공식자료 · 지연 공개 · 실시간 아님",
    en: "Official Seoul data · delayed publication · not real-time",
    zh: "首尔市官方数据 · 延迟发布 · 非实时",
    ja: "ソウル市公式データ · 遅延公開 · リアルタイムではありません",
  },
  foreignPurpose: { ko: "최근 공개 외국인 이동 패턴", en: "Latest published foreign mobility pattern", zh: "最新公开外国人移动模式", ja: "最新公開の外国人移動傾向" },
  shoppingPurpose: { ko: "쇼핑 목적", en: "shopping purpose", zh: "购物目的", ja: "買い物目的" },
  tourismPurpose: { ko: "관광 목적", en: "tourism purpose", zh: "观光目的", ja: "観光目的" },
  movementUnit: { ko: "추정 이동", en: "estimated movements", zh: "推算移动", ja: "推定移動" },
  foreignPurposeNote: {
    ko: "서울시 월간 통계 추정치 · 실시간·방문객·구매·매출 아님",
    en: "Monthly Seoul statistical estimate · not real-time activity, visitors, purchases, or sales",
    zh: "首尔市月度统计推算 · 非实时活动、访客数、购买或销售额",
    ja: "ソウル市の月次統計推定 · リアルタイム・来訪者数・購入・売上ではありません",
  },
  subwayRidership: { ko: "대표 지하철역 승하차", en: "Representative station boarding and alighting", zh: "代表地铁站进出站", ja: "代表駅の乗降" },
  subwayAlighting: { ko: "하차", en: "alighting", zh: "出站", ja: "降車" },
  subwayBoarding: { ko: "승차", en: "boarding", zh: "进站", ja: "乗車" },
  subwayNote: {
    ko: "서울교통공사 일별 집계 · 실시간·고유 방문객·상권 방문객 수 아님",
    en: "Daily Seoul Metro counts · not real-time, unique people, or commercial-area visitors",
    zh: "首尔交通公社每日统计 · 非实时、独立访客或商圈访客数",
    ja: "ソウル交通公社の日次集計 · リアルタイム・ユニーク人数・商圏来訪者数ではありません",
  },
  arrivalToday: { ko: "오늘 예상 입국객", en: "Expected arrivals today", zh: "今日预计入境旅客", ja: "今日の予想入国者数" },
  arrivalNext: { ko: "다음 시간대 예상 입국객", en: "Next-band expected arrivals", zh: "下一时段预计入境旅客", ja: "次の時間帯の予想入国者数" },
  arrivalPeak: { ko: "오늘 예상 입국 피크", en: "Expected arrival peak today", zh: "今日预计入境高峰", ja: "今日の予想入国ピーク" },
  arrivalUnit: { ko: "명", en: " people", zh: "人", ja: "人" },
  arrivalSource: {
    ko: "인천공항 공식 입국 예보 · 서울의 특정 지역과 직접 연결되지 않는 배경 참고 · 실제 서울 방문객 수 아님",
    en: "Official Incheon arrival forecast · background context not directly tied to a specific Seoul area · not an actual Seoul visitor count",
    zh: "仁川机场官方入境预测 · 与首尔具体地区无直接对应关系的背景参考 · 非首尔实际访客数",
    ja: "仁川空港の公式入国予測 · ソウルの特定エリアとは直接対応しない背景参考 · ソウルの実来訪者数ではありません",
  },
  arrivalTerminalBreakdown: { ko: "터미널별", en: "By terminal", zh: "按航站楼", ja: "ターミナル別" },
  stale: { ko: "지연됨", en: "STALE", zh: "已延迟", ja: "遅延" },
  sourceSeoul: { ko: "서울 실시간 도시데이터", en: "Seoul real-time city data", zh: "首尔实时城市数据", ja: "ソウルリアルタイム都市データ" },
  sourceKma: { ko: "기상청 단기예보", en: "KMA short-term forecast", zh: "气象厅短期预报", ja: "気象庁短期予報" },
  // Named only when the sentence actually quotes an air-quality grade, so
  // the row never credits a source it did not use.
  sourceAirQuality: { ko: "미세먼지는 서울시 실시간 도시데이터 관측", en: "air quality observed by Seoul real-time city data", zh: "空气质量来自首尔市实时城市数据观测", ja: "大気質はソウル市リアルタイム都市データの観測" },
  sourceKto: { ko: "한국관광공사", en: "KTO", zh: "韩国观光公社", ja: "韓国観光公社" },
  sourceSales: { ko: "서울시 상권분석서비스", en: "Seoul commercial-district analysis", zh: "首尔商圈分析服务", ja: "ソウル商圏分析サービス" },
} as const;

const congestionLabels: Record<number, Record<Lang, string>> = {
  1: { ko: "여유", en: "Calm", zh: "宽松", ja: "余裕" },
  2: { ko: "보통", en: "Normal", zh: "一般", ja: "普通" },
  3: { ko: "약간 붐빔", en: "Somewhat busy", zh: "略拥挤", ja: "やや混雑" },
  4: { ko: "붐빔", en: "Crowded", zh: "拥挤", ja: "混雑" },
};

const conditionLabels: Record<string, Record<Lang, string>> = {
  clear: { ko: "맑음", en: "Clear", zh: "晴", ja: "晴れ" },
  cloudy: { ko: "구름많음", en: "Cloudy", zh: "多云", ja: "くもり" },
  overcast: { ko: "흐림", en: "Overcast", zh: "阴", ja: "曇天" },
  rain: { ko: "비", en: "Rain", zh: "雨", ja: "雨" },
  shower: { ko: "소나기", en: "Showers", zh: "阵雨", ja: "にわか雨" },
  snow: { ko: "눈", en: "Snow", zh: "雪", ja: "雪" },
};


export function formatKstServicePeriod(serviceDate: string, lang: Lang): string {
  const parsed = new Date(`${serviceDate}T00:00:00+09:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  const day = new Intl.DateTimeFormat(airportLocale(lang), {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(parsed);
  return `${day} 00:00–23:59 KST`;
}

export function formatKstBand(start: string, end: string): string {
  const clock = (value: string) => new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(value));
  return `${clock(start)}–${clock(end)} KST`;
}

/** "9월 5일 22:43" — enough for a reader to see how far behind collection is. */
export function formatKstDayClock(value: string, lang: Lang): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(airportLocale(lang), {
    timeZone: "Asia/Seoul", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(parsed);
}

export function formatKstClock(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(parsed);
}

const dayWord: Record<ForecastDayOffset, Record<Lang, string>> = {
  TODAY: { ko: "오늘", en: "today", zh: "今天", ja: "今日" },
  TOMORROW: { ko: "내일", en: "tomorrow", zh: "明天", ja: "明日" },
  LATER: { ko: "이후", en: "later", zh: "之后", ja: "以降" },
};

export const airportTodayText = {
  title: { ko: "한눈에 보기", en: "At a glance", zh: "概览", ja: "概要" },
  // Means "the latest retrieval AMONG airport datasets" — never that every
  // metric below shares this freshness (see per-metric `collected` lines).
  retrieved: { ko: "공항 데이터 중 최근 수집", en: "Latest collected, among airport datasets", zh: "机场数据中最近一次采集", ja: "空港データの中で最終取得" },
  expected: { ko: "출국장 공식 예상 승객", en: "Official departure-hall passenger forecast", zh: "出境大厅官方预计人数", ja: "出国場公式予想旅客数" },
  expectedNote: { ko: "인천공항 공식 예상 · 실제 출국객 집계 아님", en: "Official Incheon forecast · not an actual passenger count", zh: "仁川机场官方预测 · 非实际出境人数", ja: "仁川空港公式予測 · 実際の出国者集計ではありません" },
  remaining: { ko: "현재 시간대부터 자정까지", en: "Current hour through midnight", zh: "当前时段至午夜", ja: "現在の時間帯から深夜まで" },
  // Deliberately carries the summed BAND (14:00–24:00 KST), not a clock: the
  // card sits beside a retrieval stamp, and a bare time there read as if the
  // two numbers disagreed. A range cannot be mistaken for a retrieval moment.
  remainingNote: {
    ko: (band: string) => `${band} 공식 예상 승객 합계`,
    en: (band: string) => `Official departure-hall passenger forecast, ${band}`,
    zh: (band: string) => `${band} 官方预计旅客合计`,
    ja: (band: string) => `${band} 公式予想旅客合計`,
  },
  flights: { ko: "출발 운항", en: "Departing flights", zh: "出发航班", ja: "出発便" },
  flightsNote: { ko: "실제 운항편 기준 · 승객 수 아님", en: "Physical flights · not passengers", zh: "实际航班口径 · 非旅客人数", ja: "実運航便基準 · 旅客数ではありません" },
  peak: { ko: "예상 피크", en: "Expected peak", zh: "预计高峰", ja: "予想ピーク" },
  peakNote: { ko: "출국장 공식 예상 승객 시간대", en: "Official expected departure band", zh: "官方预计出境时段", ja: "公式予想出国時間帯" },
  unavailable: { ko: "확인 불가", en: "Unavailable", zh: "暂无法确认", ja: "確認不可" },
  // A5 daily total/peak honesty gate: shown only in place of a number when the
  // day's official aggregate bands do not prove full-day coverage — never a
  // fabricated zero and never a silently partial sum.
  forecastPartial: { ko: "전체 시간대 확인 불가", en: "Full-day coverage unavailable", zh: "无法确认全天时段", ja: "全時間帯を確認できません" },
  forecastPartialNote: { ko: "공식 예상 데이터 일부 누락", en: "Some official forecast data missing", zh: "部分官方预计数据缺失", ja: "公式予測データの一部が欠落" },
  current: { ko: "현재 출국장", en: "Current departure halls", zh: "当前出境区", ja: "現在の出国場" },
  currentNote: { ko: "출국장 체크포인트 관측 · 탑승 게이트 아님", en: "Observed checkpoints · not boarding gates", zh: "出境检查点观测 · 非登机口", ja: "出国場チェックポイント観測 · 搭乗ゲートではありません" },
  waiting: { ko: "명 대기", en: " waiting", zh: "人等候", ja: "人待機" },
  waitLabel: { ko: "대기시간", en: "Wait", zh: "等候时间", ja: "待ち時間" },
  peopleLabel: { ko: "대기인원", en: "People", zh: "等候人数", ja: "待機人数" },
  forecastOnly: { ko: "인천공항 시간대별 예상 · 실제 대기 인원 아님", en: "Incheon Airport hourly forecast · not an observed queue", zh: "仁川机场分时预测 · 非实际等候人数", ja: "仁川空港の時間帯別予想 · 実際の待機人数ではありません" },
  nowMarker: { ko: "현재 시각", en: "Now", zh: "当前时间", ja: "現在時刻" },
  scope: {
    ko: { all: "전체 공항", T1: "제1터미널", T2: "제2터미널" },
    en: { all: "All terminals", T1: "Terminal 1", T2: "Terminal 2" },
    zh: { all: "全部航站楼", T1: "1号航站楼", T2: "2号航站楼" },
    ja: { all: "全ターミナル", T1: "第1ターミナル", T2: "第2ターミナル" },
  },
  gatesTitle: { ko: "운항 집중 게이트", en: "Busiest departure gates", zh: "航班集中登机口", ja: "運航集中ゲート" },
  gatesNote: { ko: "출발편이 많이 배정된 게이트 순위입니다. 출국장 대기시간과는 다른 정보입니다.", en: "Gates ranked by tracked departures. This is separate from checkpoint waiting time.", zh: "按出发航班数排名的登机口，与出境区等候时间不同。", ja: "出発便数で並べたゲートです。出国場の待ち時間とは別の情報です。" },
  // What the bar is measured against, said out loud: a reader who assumes
  // "share of all departures" would misread every row but the first.
  gateChartNote: {
    ko: "막대는 1위 게이트 대비 비율입니다. 전체 출발편 중 비중이 아닙니다.",
    en: "Bars are drawn against the busiest gate, not as a share of all departures.",
    zh: "柱形以排名第一的登机口为基准，并非占全部出发航班的比重。",
    ja: "バーは1位のゲートを基準にした比率です。全出発便に占める割合ではありません。",
  },
  noGateList: { ko: "게이트 정보 범위가 충분하지 않아 순위를 표시하지 않습니다.", en: "Gate coverage is insufficient to show a reliable ranking.", zh: "登机口数据覆盖不足，暂不显示排名。", ja: "ゲート情報の範囲が十分でないため、順位を表示しません。" },
  longest: { ko: "현재 가장 긴 대기", en: "Longest current wait", zh: "当前最长等候", ja: "現在最も長い待ち" },
  showAllCheckpoints: { ko: "전체 출국장 보기", en: "Show all checkpoints", zh: "查看全部出境检查口", ja: "すべての出国場を表示" },
  showLongestOnly: { ko: "가장 긴 대기만 보기", en: "Show longest wait only", zh: "仅显示最长等候", ja: "最も長い待ちのみ表示" },
  forecastTitle: { ko: "출국장 공식 예상 승객 흐름", en: "Official departure-hall passenger flow", zh: "出境大厅官方预计客流", ja: "出国場公式予想旅客の流れ" },
  partialBody: { ko: "공식 예상 데이터의 일부 시간대가 누락되어 하루 전체 합계와 피크는 표시하지 않습니다.", en: "Some official time bands are missing, so the full-day total and peak are not shown.", zh: "部分官方时段数据缺失，因此不显示全天合计与高峰。", ja: "公式予測の一部時間帯が欠けているため、1日全体の合計とピークは表示しません。" },
  unavailableBody: { ko: "이 날짜의 공식 예상 시간대가 없습니다. 실제 출발 운항과 현재 출국장 정보는 계속 확인할 수 있습니다.", en: "No official forecast bands exist for this date. Physical departures and current checkpoints remain available.", zh: "该日期没有官方预计时段数据，仍可查看实际出发航班和当前出境区信息。", ja: "この日付の公式予測時間帯はありません。実出発便と現在の出国場情報は引き続き確認できます。" },
  rankLabel: { ko: "순위", en: "Rank", zh: "排名", ja: "順位" },
  gateColumn: { ko: "게이트", en: "Gate", zh: "登机口", ja: "ゲート" },
  terminalGateColumn: { ko: "터미널 · 게이트", en: "Terminal · gate", zh: "航站楼 · 登机口", ja: "ターミナル · ゲート" },
  departuresColumn: { ko: "출발편", en: "Departures", zh: "出发航班", ja: "出発便" },
  departureShareColumn: { ko: "출발편 · 비중", en: "Departures · share", zh: "出发航班 · 占比", ja: "出発便 · 構成比" },
  // Today's rows can be absent for a whole service day when the morning A1
  // scan timed out at the provider. Say that plainly instead of the generic
  // coverage line, which would blame gate data that was never collected.
  noFlightsToday: { ko: "오늘 출발편 수집이 완료되지 않았습니다. 첫 정기 수집은 00:07 KST 예정이며, 재시도 조건에 해당하면 최대 두 번 더 시도합니다. 06:07 KST에도 정기 수집이 예정되어 있습니다. 실행 지연이나 공급자 장애로 늦어질 수 있습니다. 수집 성공 후 게이트·항공사·등록 국가가 함께 표시됩니다.", en: "Today's departures collection is incomplete. The first scheduled attempt is 00:07 KST, with up to two additional attempts for eligible failures. Another regular collection is scheduled for 06:07 KST. Execution delays or provider outages may postpone the gate, airline and registration-country breakdowns.", zh: "今日出发航班尚未完成采集。首次定时采集计划于 00:07 KST 执行，符合重试条件时最多再试两次，另于 06:07 KST 安排定时采集。任务延迟或供应方故障可能推迟登机口、航空公司及注册国统计的显示。", ja: "本日の出発便の収集は未完了です。最初の定期収集は 00:07 KST の予定で、再試行条件に該当する場合は最大2回追加で試行します。06:07 KST にも定期収集を予定しています。実行遅延や提供元の障害でゲート・航空会社・登録国の表示が遅れる場合があります。" },
  noFlightsForDate: { ko: "이 날짜의 출발편 데이터가 없습니다.", en: "No departure data is stored for this date.", zh: "该日期没有出发航班数据。", ja: "この日付の出発便データはありません。" },
  airlinesTitle: { ko: "항공사별 운항 순위", en: "Airlines by departures", zh: "航空公司出发航班排名", ja: "航空会社別運航ランキング" },
  airlinesNote: { ko: "오늘 실제 출발편을 운항 항공사 기준으로 집계한 순위입니다. 공동운항편은 운항사 1편으로만 셉니다.", en: "Today's physical departures counted by operating airline. A codeshare counts once, for its operator.", zh: "按实际执飞航空公司统计的今日出发航班排名，共享航班仅按执飞方计 1 班。", ja: "本日の実運航出発便を運航会社ごとに集計した順位です。コードシェア便は運航会社の1便としてのみ数えます。" },
  airlineColumn: { ko: "항공사 · 등록 국가", en: "Airline · registered country", zh: "航空公司 · 注册国", ja: "航空会社 · 登録国" },
  compositionTitle: { ko: "오늘 출발편 구성", en: "Today's departure composition", zh: "今日出发航班构成", ja: "本日の出発便構成" },
  compositionIntro: {
    ko: "오늘 실제 출발편을 게이트·항공사·항공사 등록 국가 기준으로 나눠 봅니다.",
    en: "Today's physical departures, viewed by gate, airline, and the airline's registered country.",
    zh: "按登机口、航空公司及航空公司注册国查看今日实际出发航班。",
    ja: "本日の実運航出発便を、ゲート・航空会社・航空会社の登録国別に確認します。",
  },
  compositionTruth: { ko: "운항편 기준이며 승객 수가 아닙니다.", en: "Flight counts, not passenger counts.", zh: "按航班统计，并非旅客人数。", ja: "運航便数であり、旅客数ではありません。" },
  compositionScope: {
    ko: (scope: string) => `${scope} · 오늘 실제 출발편 기준`,
    en: (scope: string) => `${scope} · today's physical departures`,
    zh: (scope: string) => `${scope} · 今日实际出发航班口径`,
    ja: (scope: string) => `${scope} · 本日の実運航出発便基準`,
  },
  compositionTabsLabel: { ko: "선택일 출발편 구성 보기", en: "Choose the selected date's departure composition view", zh: "选择所选日期出发航班构成视图", ja: "選択日の出発便構成の表示を選択" },
  compositionTabs: {
    gates: { ko: "게이트", en: "Gates", zh: "登机口", ja: "ゲート" },
    airlines: { ko: "항공사", en: "Airlines", zh: "航空公司", ja: "航空会社" },
    countries: { ko: "등록 국가", en: "Registered country", zh: "注册国", ja: "登録国" },
  },
  /**
   * 항공사가 등록된 나라이지, 그 비행기에 탄 사람들의 국적이 아니다.
   * 한국어에서 "국적"은 사람의 국적으로 먼저 읽히므로 쓰지 않는다.
   */
  countriesTitle: { ko: "항공사 등록 국가별 운항편", en: "Departures by airline's registered country", zh: "按航空公司注册国的出发航班", ja: "航空会社の登録国別出発便" },
  countriesNote: { ko: "오늘 실제 출발편을 운항 항공사의 등록 국가 기준으로 묶었습니다.", en: "Today's physical departures grouped by the operating airline's registered country.", zh: "按执飞航空公司的注册国汇总今日实际出发航班。", ja: "本日の実運航出発便を、運航会社の登録国別に集計しました。" },
  countryColumn: { ko: "등록 국가 · 항공사 수", en: "Registered country · airlines", zh: "注册国 · 航空公司数", ja: "登録国 · 航空会社数" },
  countryUnverified: { ko: "등록 국가 미확인", en: "Registered country unverified", zh: "注册国未确认", ja: "登録国未確認" },
  airlinesUnit: { ko: "개 항공사", en: " airlines", zh: "家航空公司", ja: "社" },
  noAirlineList: { ko: "운항 항공사를 식별할 수 있는 출발편이 없습니다.", en: "No departures with an identifiable operating airline.", zh: "没有可识别执飞航空公司的出发航班。", ja: "運航会社を識別できる出発便がありません。" },
  airlineCountryBasis: {
    ko: (retrievedOn: string) => `항공사가 등록된 국가이며, 그 비행기를 탄 승객의 국적이 아닙니다. OpenFlights 항공사 참조표(ODbL, ${retrievedOn} 수집) 기준이며 공식 등록 자료가 아닙니다. RS 에어서울은 나리타공항·에어서울 공식 자료로 별도 확인했습니다. 확인하지 못한 항공사는 '등록 국가 미확인'으로 표시합니다.`,
    en: (retrievedOn: string) => `The country the airline is registered in — never the nationality of the passengers on board. From the OpenFlights airline reference table (ODbL, retrieved ${retrievedOn}), not an official register. RS / Air Seoul is separately verified against Narita Airport and Air Seoul official sources. Other unverified airlines remain marked unverified.`,
    zh: (retrievedOn: string) => `这是航空公司的注册国，并非机上旅客的国籍。依据 OpenFlights 航空公司参考表（ODbL，${retrievedOn} 获取），并非官方登记资料。RS 首尔航空另据成田机场及首尔航空官方资料确认。无法确认的航空公司显示为“注册国未确认”。`,
    ja: (retrievedOn: string) => `航空会社が登録されている国であり、搭乗した旅客の国籍ではありません。OpenFlights 航空会社参照表（ODbL、${retrievedOn} 取得）に基づき、公式登録資料ではありません。RS エアソウルは成田空港・エアソウルの公式資料で別途確認しています。確認できない航空会社は「登録国未確認」と表示します。`,
  },
  airlineCountryShortBasis: {
    ko: "등록 국가는 OpenFlights 항공사 참조표 기준이며 승객 국적이 아닙니다.",
    en: "Registered country comes from the OpenFlights airline reference table and is not passenger nationality.",
    zh: "注册国依据 OpenFlights 航空公司参考表，并非旅客国籍。",
    ja: "登録国は OpenFlights 航空会社参照表に基づき、旅客の国籍ではありません。",
  },
  nowOnly: {
    ko: "현재 출국장 대기는 실시간 관측이라 언제나 지금 시점만 보여줍니다.",
    en: "Departure-hall waits are live observations, so they always show the present moment.",
    zh: "出境区等候为实时观测，因此始终显示当前时刻。",
    ja: "出国場の待ちはリアルタイム観測のため、常に現在時点のみを表示します。",
  },
} as const;

const areaBriefText = {
  title: { ko: "서울 지금", en: "Seoul now", zh: "首尔当前", ja: "ソウル現在" },
  unavailableNow: { ko: "현재 공식 활동 상태를 확인할 수 없습니다", en: "Current official activity is unavailable", zh: "当前官方活动状态暂不可用", ja: "現在の公式活動状況を確認できません" },
  noForecast: { ko: "확인할 수 있는 공식 혼잡 예측이 없습니다", en: "No official crowd forecast is available to read", zh: "暂无可确认的官方拥挤预测", ja: "確認できる公式の混雑予測はありません" },
  stale: { ko: "최근 관측 지연", en: "Latest observation delayed", zh: "最新观测延迟", ja: "最新観測に遅れ" },
  nowLabel: { ko: "지금", en: "now", zh: "当前", ja: "現在" },
} as const;

const areaNames: Record<AreaId, Record<Lang, string>> = {
  myeongdong: { ko: "명동", en: "Myeongdong", zh: "明洞", ja: "明洞" },
  hongdae: { ko: "홍대", en: "Hongdae", zh: "弘大", ja: "弘大" },
  seongsu: { ko: "성수", en: "Seongsu", zh: "圣水", ja: "聖水" },
  itaewon: { ko: "이태원", en: "Itaewon", zh: "梨泰院", ja: "梨泰院" },
};

export const AREA_IDS: AreaId[] = ["myeongdong", "hongdae", "seongsu", "itaewon"];
export function areaDisplayName(area: AreaId, lang: Lang): string {
  return areaNames[area][lang];
}

function formatForecastHour(value: string): string {
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date(start.getTime() + 3_600_000);
  return `${formatKstClock(start.toISOString())}–${formatKstClock(end.toISOString())}`;
}

/**
 * Turns one area's brief into the 3–4 lines the reader sees first.
 *
 * Every line is a statement about official data that exists. When a line has
 * no data behind it, it is dropped rather than filled with a placeholder, so
 * the brief is short and true instead of long and padded.
 */
function localizeAreaBrief(brief: AreaCurrentBrief, lang: Lang, selectedDay = false): { headline: string; lines: string[]; freshness: string | null } {
  const locale = airportLocale(lang);
  let headline: string = areaBriefText.unavailableNow[lang];
  let freshness: string | null = null;
  if (brief.current) {
    const level = congestionLabels[brief.current.congestionLevel]?.[lang] ?? String(brief.current.congestionLevel);
    const range = `${brief.current.populationMin.toLocaleString(locale, {maximumFractionDigits:0})}–${brief.current.populationMax.toLocaleString(locale, {maximumFractionDigits:0})}`;
    const people = lang === "en" ? " people" : lang === "ko" ? "명" : "人";
    // The metric is named before the number here too: a bare range next to a
    // congestion word is the exact ambiguity this phase set out to remove.
    const metric = lang === "ko" ? "현재 추정 인구" : lang === "en" ? "Estimated population now"
      : lang === "zh" ? "当前推定人口" : "現在の推定人口";
    const measured = `${metric} ${range}${people} · ${level}`;
    headline = brief.current.freshness === "STALE" ? `${areaBriefText.stale[lang]} · ${measured}` : measured;
    freshness = brief.current.observedAt;
  }

  const lines: string[] = [];
  if (brief.upcomingPeak) {
    const band = formatForecastHour(brief.upcomingPeak.targetAt);
    // The day is always said out loud: Seoul's rolling 12-hour horizon means
    // the busiest hour ahead is often tomorrow, and "04:00" alone would read
    // as an hour that already passed.
    const when = `${dayWord[brief.upcomingPeak.dayOffset][lang]} ${band}`;
    const level = congestionLabels[brief.upcomingPeak.congestionLevel]?.[lang] ?? "";
    lines.push(lang === "ko" ? `서울시 공식 예측: ${when}가 가장 붐빌 전망 (${level})`
      : lang === "en" ? `Seoul's official forecast: ${when} is the busiest hour ahead (${level})`
      : lang === "zh" ? `首尔市官方预测：${when}最为拥挤（${level}）`
      : `ソウル市公式予測：${when}が最も混雑する見込み（${level}）`);
  } else lines.push(areaBriefText.noForecast[lang]);

  if (brief.weatherAdvice) {
    const advice = brief.weatherAdvice;
    if (advice.kind === "UMBRELLA") lines.push(lang === "ko" ? `비 가능성 ${Math.round(advice.probability)}% · 우산을 챙기세요` : lang === "en" ? `${Math.round(advice.probability)}% chance of rain · bring an umbrella` : lang === "zh" ? `降雨概率${Math.round(advice.probability)}% · 请带伞` : `降水確率${Math.round(advice.probability)}% · 傘を用意してください`);
    else if (advice.kind === "CHECK_RAIN") lines.push(lang === "ko" ? `비 가능성 ${Math.round(advice.probability)}% · 이동 전 날씨를 확인하세요` : lang === "en" ? `${Math.round(advice.probability)}% chance of rain · check before heading out` : lang === "zh" ? `降雨概率${Math.round(advice.probability)}% · 出发前请确认天气` : `降水確率${Math.round(advice.probability)}% · 移動前に天気を確認してください`);
    else if (advice.kind === "HOT") lines.push(lang === "ko" ? `최고 ${advice.temperatureC.toFixed(0)}°C · 가벼운 복장과 물을 준비하세요` : lang === "en" ? `Up to ${advice.temperatureC.toFixed(0)}°C · dress lightly and carry water` : lang === "zh" ? `最高${advice.temperatureC.toFixed(0)}°C · 建议轻装并备水` : `最高${advice.temperatureC.toFixed(0)}°C · 軽い服装と水を用意してください`);
    else lines.push(lang === "ko" ? `최저 ${advice.temperatureC.toFixed(0)}°C · 겉옷을 챙기세요` : lang === "en" ? `Down to ${advice.temperatureC.toFixed(0)}°C · bring an outer layer` : lang === "zh" ? `最低${advice.temperatureC.toFixed(0)}°C · 建议携带外套` : `最低${advice.temperatureC.toFixed(0)}°C · 上着を用意してください`);
  }

  // The events line is reference material, so it only appears when there is
  // something to reference — never as filler to reach a line count.
  if (brief.eventCount > 0) {
    // Official category name first, then the title: "축제 · 명동 페스티벌".
    const nextEvent = [brief.nextEventCategory, brief.nextEventTitle].filter(Boolean).join(" · ");
    const label = nextEvent
      ? (lang === "ko" ? `인근 행사 ${brief.eventCount}건 · ${nextEvent}`
        : lang === "en" ? `${brief.eventCount} nearby event${brief.eventCount === 1 ? "" : "s"} · ${nextEvent}`
        : lang === "zh" ? `附近${brief.eventCount}项活动 · ${nextEvent}`
        : `周辺イベント${brief.eventCount}件 · ${nextEvent}`)
      : (lang === "ko" ? `인근 행사 ${brief.eventCount}건` : lang === "en" ? `${brief.eventCount} nearby events` : lang === "zh" ? `附近${brief.eventCount}项活动` : `周辺イベント${brief.eventCount}件`);
    lines.push(label);
  }
  if (selectedDay && !brief.current) headline = contextText(lang,"선택일 공식 예보·일정 요약","Official forecasts and schedules for the selected day","所选日期官方预测与日程概要","選択日の公式予報・日程の概要");
  return { headline, lines: lines.slice(0, 3), freshness };
}

function localizeAirportBrief(
  brief: AirportCurrentBrief,
  lang: Lang,
  remaining: RemainingForecast,
  /**
   * When collection last succeeded for the official forecast, from
   * `source_health.last_retrieved_at`. Null when unknown.
   *
   * "자료 없음" and "우리가 아직 못 가져왔음" are different facts and the
   * reader needs the second one: the owner asked "내일 출국객수가 왜 자꾸
   * 안 뜨는지 모르겠어" while the provider had simply been unreachable for a
   * day, which the screen described as the airport having published nothing.
   */
  forecastCollectedAt: string | null = null,
  nowIso: string | null = null,
  collectionFailureOnly = false,
): string[] {
  const locale = airportLocale(lang);
  // Collection counts as behind when the last success is older than the
  // window every periodic collector comfortably beats. Same 48h boundary as
  // lib/source-period.ts, so the product speaks with one voice about lag.
  const collectedMs = forecastCollectedAt ? Date.parse(forecastCollectedAt) : Number.NaN;
  const nowMs = nowIso ? Date.parse(nowIso) : Number.NaN;
  const collectionBehind = Number.isFinite(collectedMs) && Number.isFinite(nowMs)
    && nowMs - collectedMs > PERIOD_VOUCH_WINDOW_MS / 4;
  const collectedLabel = collectionBehind ? formatKstDayClock(forecastCollectedAt!, lang) : "";
  /*
   * Order and length, both deliberate (owner review 2026-09-04).
   *
   * The headline used to be "지금 …에서 대기가 가장 긴 곳은 …, 16분입니다" —
   * a long bold sentence that made one checkpoint queue look like the most
   * important fact on the page. It is not. The number an airport retail
   * worker plans a shift around is how many departing passengers the airport
   * officially expects IN THE HOUR THEY ARE STANDING IN. That figure still
   * leads the view — it is now the first cell of the at-a-glance grid these
   * lines sit under (2026-09-13), where it is the largest thing on the
   * screen after the day's total. The queue stays a short supporting line.
   *
   * Every line is trimmed to what it asserts. "…가 오늘 피크입니다 (4,675명)"
   * became "오늘 피크 07:00–08:00 · 4,675명": same facts, no sentence to read
   * through. Nothing was removed except words — no figure, and no basis.
   *
   * Nothing here restates a grid cell. The line that used to open this list
   * ("14:00–15:00 출국장 공식 예상 승객 5,110명") printed the grid's first
   * cell again, one line below it, in smaller type — two identical figures a
   * reader had to compare before trusting either. The peak line survives for
   * the dates the grid's current-hour cell cannot fill (a past or future
   * day), so the list never opens on a queue.
   */
  // Share of the day's peak, and where the next hour goes. Stated only from
  // two real bands; the last band of the day says so rather than implying
  // the day simply stops.
  //
  // It names its own hour ("현재 시간대 · …") because it no longer follows a
  // line that did. The share is a RATIO, which is the one thing the grid
  // above cannot show; both figures it used to quote — this hour's count and
  // the peak's — are already up there, so quoting them again only made the
  // reader check whether two identical numbers were really the same fact.
  const trendLine = (() => {
    if (!brief.nowBand) return null;
    const now = brief.nowBand;
    const share = now.peakShare === null ? null : Math.round(now.peakShare * 100);
    const next = now.nextExpectedPassengers === null ? null : Math.round(now.nextExpectedPassengers);
    const nextPeople = next === null ? null : next.toLocaleString(locale, {maximumFractionDigits:0});
    const nextBand = now.nextTargetStartAt && now.nextTargetEndAt ? formatKstBand(now.nextTargetStartAt, now.nextTargetEndAt).replace(" KST", "") : null;
    const sharePart = share === null ? null : {
      ko: `현재 시간대 · 오늘 피크의 ${share}%`, en: `This hour · ${share}% of today's peak`,
      zh: `当前时段 · 为今日高峰的${share}%`, ja: `現在の時間帯 · 本日ピークの${share}%`,
    }[lang];
    const nextPart = nextPeople === null
      ? { ko: "오늘 마지막 시간대", en: "last hour of the day", zh: "今日最后一个时段", ja: "本日最後の時間帯" }[lang]
      : { ko: `다음 ${nextBand ?? "시간대"} ${nextPeople}명`, en: `next ${nextBand ?? "hour"}: ${nextPeople}`, zh: `下一时段 ${nextBand ?? ""} ${nextPeople}人`, ja: `次 ${nextBand ?? "の時間帯"} ${nextPeople}人` }[lang];
    return [sharePart, nextPart].filter(Boolean).join(" · ");
  })();

  const peakLine = (() => {
    if (brief.forecastCoverage === "COMPLETE" && brief.peak) {
      const band = formatKstBand(brief.peak.targetStartAt, brief.peak.targetEndAt).replace(" KST", "");
      const people = Math.round(brief.peak.expectedPassengers).toLocaleString(locale);
      return {
        ko: `오늘 피크 ${band} · 출국장 공식 예상 승객 ${people}명`,
        en: `Today's peak ${band} · ${people} officially expected`,
        zh: `今日高峰 ${band} · 官方预计${people}人`,
        ja: `本日ピーク ${band} · 公式予想${people}人`,
      }[lang];
    }
    if (brief.forecastCoverage === "PARTIAL") {
      return { ko: "공식 예상 승객 일부 누락 · 피크 판단 안 함", en: "Some official bands missing · no peak inferred", zh: "部分官方时段缺失 · 不判断高峰", ja: "公式予想の一部が欠落 · ピークは判断しません" }[lang];
    }
    // Stale collection is named as KORETAIL's lag, never as the provider's
    // silence — the same distinction lib/source-period.ts draws elsewhere.
    if (collectionBehind) {
      return {
        ko: `공식 예상 승객 수집이 ${collectedLabel} 이후 실패 중 · 공급자 자료 없음이 아닙니다`,
        en: `Official forecast collection has been failing since ${collectedLabel} · not a gap in the provider's data`,
        zh: `官方预计旅客采集自${collectedLabel}起持续失败 · 并非供应方无数据`,
        ja: `公式予想旅客の収集が${collectedLabel}以降失敗中 · 提供元にデータが無いわけではありません`,
      }[lang];
    }
    return { ko: "이 날짜의 공식 예상 승객 자료 없음", en: "No official passenger forecast for this date", zh: "该日期无官方预计旅客数据", ja: "この日付の公式予想旅客データなし" }[lang];
  })();

  if (collectionFailureOnly) return collectionBehind && brief.forecastCoverage === 'UNAVAILABLE' ? [peakLine] : [];
  // The queue, kept but demoted: one checkpoint's wait is a fact about that
  // checkpoint, not about the terminal's day.
  const waitLine = (() => {
    if (!brief.checkpoint) return null;
    const checkpoint = friendlyCheckpointName(brief.checkpoint.zone, lang);
    const where = brief.scope === "all" ? `${brief.checkpoint.terminal} ${checkpoint}` : checkpoint;
    if (brief.checkpointBasis === "WAIT_TIME") {
      const raw = brief.checkpoint.waitTimeRaw ?? (brief.checkpoint.waitTimeMinutes === null ? null : String(brief.checkpoint.waitTimeMinutes));
      if (!raw) return null;
      const unit = { ko: "분", en: " min", zh: "分钟", ja: "分" }[lang];
      const wait = /분|min|分钟|分/i.test(raw) ? raw : `${raw}${unit}`;
      return {
        ko: `대기 최장 ${where} ${wait}`, en: `Longest wait ${where} ${wait}`,
        zh: `等候最长 ${where} ${wait}`, ja: `待ち最長 ${where} ${wait}`,
      }[lang];
    }
    if (brief.checkpoint.waitingCount === null) return null;
    const people = brief.checkpoint.waitingCount.toLocaleString(locale, {maximumFractionDigits:0});
    return {
      ko: `${where} 대기 ${people}명`, en: `${where}: ${people} waiting`,
      zh: `${where} 等候${people}人`, ja: `${where} 待機${people}人`,
    }[lang];
  })();

  const restLine = remaining ? {
    ko: `${formatKstClock(remaining.fromAt)} 이후 시간대 합계 ${Math.round(remaining.expectedPassengers).toLocaleString(locale)}명`,
    en: `${formatKstClock(remaining.fromAt)} onward: ${Math.round(remaining.expectedPassengers).toLocaleString(locale)} expected`,
    zh: `${formatKstClock(remaining.fromAt)}起预计${Math.round(remaining.expectedPassengers).toLocaleString(locale)}人`,
    ja: `${formatKstClock(remaining.fromAt)}以降 予想${Math.round(remaining.expectedPassengers).toLocaleString(locale)}人`,
  }[lang] : null;

  // This hour leads when there is one — as the first cell of the at-a-glance
  // grid these lines sit under, which states it in larger type than any line
  // here could. What remains is what the grid cannot hold: the ratio to the
  // peak, the next band, the queue, the rest of the day. Without a current
  // hour there is no grid figure to lead with, so the day's peak opens the
  // lines instead, and the queue still never does.
  const lines = (trendLine
    ? [trendLine, waitLine, restLine]
    : [peakLine, waitLine, restLine]
  ).filter((line): line is string => Boolean(line && line.trim()));
  return lines.slice(0, 5);
}

export const dateNavText = {
  yesterday: { ko: "어제", en: "Yesterday", zh: "昨天", ja: "昨日" },
  today: { ko: "오늘", en: "Today", zh: "今天", ja: "今日" },
  tomorrow: { ko: "내일", en: "Tomorrow", zh: "明天", ja: "明日" },
  pick: { ko: "날짜 선택", en: "Pick a date", zh: "选择日期", ja: "日付を選択" },
  label: { ko: "날짜 선택", en: "Select date", zh: "选择日期", ja: "日付選択" },
  availableFrom: { ko: "선택 가능", en: "Available", zh: "可选范围", ja: "選択可能" },
  noData: {
    ko: "이 날짜에는 저장된 공식 데이터가 없습니다.",
    en: "No official data is stored for this date.",
    zh: "该日期没有已存储的官方数据。",
    ja: "この日付に保存された公式データはありません。",
  },
} as const;

function shiftDay(day: string, delta: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + delta)).toISOString().slice(0, 10);
}

/**
 * A free date input commits each keystroke that forms a valid date: typing a
 * year passes through 0002, 0020 and 0202 before 2026, and typing day 25
 * passes the 2nd. Typed values stay in the field and become the selection
 * once, on Enter, on leaving the field, or when typing pauses for the
 * browser's own one-second segment window. A year below 1000 is never
 * finished. Picker, arrow-key and mobile selections still apply at once.
 * It is deliberately not an input `min`: the picker stays unbounded so older
 * stored dates are never blocked.
 */
const TYPED_DATE_SETTLE_MS = 1_000;
const unfinishedYear = (value: string) => value < "1000-01-01";

/**
 * 어제 / 오늘 / 내일 / 날짜 선택.
 *
 * Shortcuts use the refreshed server KST day. The free picker may cross
 * months; a month-bounded list separately identifies dates actually held.
 * Retain only navigation context on a failed date request, never its numbers.
 */
export function DateNavigator({
  lang, date, onChange, historyHref, airportDates = false, modernCalendar = false, compactDatePicker = false,
}: { lang: Lang; date: string | null; onChange: (date: string | null) => void; historyHref?: string; airportDates?: boolean; modernCalendar?: boolean; compactDatePicker?: boolean }) {
  const summary = useLiveSummary(date);
  const [navigation, setNavigation] = useState(summary);
  if (summary && summary !== navigation) setNavigation(summary);
  const [navigationClock, setNavigationClock] = useState<{
    serverAt: number; receivedAt: number; serverDay: string; today: string;
  } | null>(null);
  // Typed digits stay in the field without becoming the selection.
  const [typedDate, setTypedDate] = useState<string | null>(null);
  const typedAt = useRef(Number.NEGATIVE_INFINITY);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(settle.current), []);
  const freshServerAt = summary && !summary.clientRefresh ? Date.parse(summary.generatedAt) : Number.NaN;
  const freshServerDay = summary && !summary.clientRefresh ? summary.todayKst : undefined;
  useEffect(() => {
    if (!Number.isFinite(freshServerAt) || !freshServerDay) return;
    const receivedAt = performance.now();
    const timer = setTimeout(() => setNavigationClock(current => !current || freshServerAt > current.serverAt
      ? { serverAt: freshServerAt, receivedAt, serverDay: freshServerDay, today: freshServerDay }
      : current), 0);
    return () => clearTimeout(timer);
  }, [freshServerAt, freshServerDay]);
  const serverAt = navigationClock?.serverAt;
  const receivedAt = navigationClock?.receivedAt;
  const serverDay = navigationClock?.serverDay;
  useEffect(() => {
    if (serverAt === undefined || receivedAt === undefined || !serverDay) return;
    // Advance navigation from the last successful SERVER clock, not the
    // device calendar. Failures and old cache entries never reset this anchor.
    // This one midnight timer changes no payload and performs no request.
    const estimatedNow = () => serverAt + Math.max(0, performance.now() - receivedAt);
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      const now = estimatedNow();
      const days = Math.floor((now + 9 * 3_600_000) / 86_400_000) - Math.floor((serverAt + 9 * 3_600_000) / 86_400_000);
      const today = shiftDay(serverDay, days);
      setNavigationClock(current => current?.serverAt === serverAt && current.today !== today ? { ...current, today } : current);
      timer = setTimeout(update, Math.max(1, nextKstMidnight(now) - now));
    };
    const onVisible = () => { if (document.visibilityState === 'visible') update(); };
    const now = estimatedNow();
    timer = setTimeout(update, Math.max(1, nextKstMidnight(now) - now));
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [serverAt, receivedAt, serverDay]);
  const context = summary ?? navigation;
  if (!context?.todayKst) return null;
  const today = freshServerDay && (!navigationClock || freshServerAt > navigationClock.serverAt)
    ? freshServerDay : navigationClock?.today ?? context.todayKst;
  const selected = date ?? today;
  const commitDate = (value: string) => {
    clearTimeout(settle.current);
    setTypedDate(null);
    if (!unfinishedYear(value) && value !== selected) onChange(value === today ? null : value);
  };
  const shortcuts: Array<[string, string]> = [
    [shiftDay(today, -1), dateNavText.yesterday[lang]],
    [today, dateNavText.today[lang]],
    [shiftDay(today, 1), dateNavText.tomorrow[lang]],
  ];
  // Airport uses the existing stored-date disclosure instead of a large calendar card.
  const datePicker = modernCalendar ? <AirportCalendarWithAvailability lang={lang} date={date} selected={selected} today={today} onChange={value=>onChange(value===today?null:value)}/> : <label className="date-nav-picker">
      <span>{dateNavText.pick[lang]}</span>
      <input
        type="date"
        value={typedDate ?? selected}
        onKeyDown={(event) => {
          if (/^\d$/.test(event.key)) typedAt.current = event.timeStamp;
          else if (event.key === "Enter" && typedDate !== null) commitDate(typedDate);
        }}
        onBlur={() => { if (typedDate !== null) commitDate(typedDate); }}
        onChange={(event) => {
          const next = event.target.value;
          clearTimeout(settle.current);
          if (!next) { setTypedDate(null); return; }
          if (event.timeStamp - typedAt.current < TYPED_DATE_SETTLE_MS) {
            setTypedDate(next);
            if (!unfinishedYear(next)) settle.current = setTimeout(() => commitDate(next), TYPED_DATE_SETTLE_MS);
            return;
          }
          commitDate(next);
        }}
      />
    </label>;
  return <nav className="date-nav" data-selected-date={selected} aria-label={dateNavText.label[lang]}>
    <div className="date-nav-shortcuts" role="group">
      {shortcuts.map(([value, label]) => <button
        key={value}
        type="button"
        className={selected === value ? "active" : ""}
        aria-current={selected === value ? "date" : undefined}
        aria-pressed={selected === value}
        aria-label={label}
        onClick={() => onChange(value === today ? null : value)}
      ><span>{label}</span><time dateTime={value}>{new Intl.DateTimeFormat(airportLocale(lang), {
        timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short",
      }).format(new Date(`${value}T12:00:00+09:00`))}</time></button>)}
    </div>
    {(!compactDatePicker || historyHref) && <div className="date-nav-tools">
    {!compactDatePicker && datePicker}
    {historyHref && <a className="period-outlook-link" href={historyHref}>7DAYS · {contextText(lang,"지난 기록","Past records","历史记录","過去の記録")}</a>}
    </div>}
    {(airportDates || compactDatePicker) && <StoredAirportDates lang={lang} date={date} selected={selected} onChange={onChange} showStored={airportDates}>{compactDatePicker ? datePicker : null}</StoredAirportDates>}
  </nav>;
}

function AirportCalendarWithAvailability({lang,date,selected,today,onChange}:{lang:Lang;date:string|null;selected:string;today:string;onChange:(date:string)=>void}) {
  const [month,setMonth]=useState<string|null>(null);
  const summary=useLiveSummary(date,month??undefined);
  const availability=summary?.dateAvailability;
  const known=[...new Set([...(availability?.airportFlights??[]),...(availability?.airportPassengerForecast??[]),...(availability?.airportDepartureSchedule??[])])].filter(day=>day.startsWith(month??selected.slice(0,7)));
  return <AirportDateCalendar lang={lang} selected={selected} today={today} onChange={onChange} known={known} onMonth={setMonth} availabilityState={summary===undefined?'LOADING':summary===null||summary.clientRefresh?.failedAt?'FAILED':'READY'}/>;
}

const storedDateText = {
  dates: { ko: '보유 날짜', en: 'Stored dates', zh: '已存日期', ja: '保存済みの日付' },
  month: { ko: '조회 월', en: 'Month to read', zh: '查询月份', ja: '照会月' },
  select: { ko: '저장된 날짜 선택', en: 'Select a stored date', zh: '选择已存日期', ja: '保存済みの日付を選択' },
  flights: { ko: '운항 기록', en: 'Flight records', zh: '航班记录', ja: '運航記録' },
  forecast: { ko: '승객 예보', en: 'Passenger forecast', zh: '旅客预测', ja: '旅客予報' },
  planned: { ko: '예정 출발편', en: 'Scheduled departures', zh: '计划出发航班', ja: '出発予定便' },
  none: { ko: '이 월에 확인된 공항 자료 없음', en: 'No airport data confirmed in this month', zh: '本月暂无已确认机场资料', ja: 'この月に確認済みの空港資料はありません' },
  note: { ko: '저장된 날짜만 표시합니다. 예정편은 변경될 수 있고, 과거 승객 예보는 실제 여객 실적이 아닙니다.', en: 'Only stored dates are listed. Scheduled flights may change; past passenger forecasts are not actual passenger results.', zh: '仅列出已存日期。计划航班可能变更；过去的旅客预测并非实际旅客统计。', ja: '保存済みの日付のみ表示。予定便は変更される場合があり、過去の旅客予報は実績ではありません。' },
} as const;

function StoredAirportDates({ lang, date, selected, onChange, children, showStored = true }: {
  lang: Lang; date: string | null; selected: string; onChange: (date: string | null) => void; children?: ReactNode; showStored?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return <details className="stored-date-picker" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{showStored ? storedDateText.dates[lang] : dateNavText.pick[lang]}</summary>
    {open && <>{children}{showStored && <StoredAirportMonth lang={lang} date={date} selected={selected} onChange={onChange} />}</>}
  </details>;
}

function StoredAirportMonth({ lang, date, selected, onChange }: {
  lang: Lang; date: string | null; selected: string; onChange: (date: string | null) => void;
}) {
  const [pickedMonth, setPickedMonth] = useState<string>();
  const month = pickedMonth ?? selected.slice(0, 7);
  const summary = useLiveSummary(date, pickedMonth);
  const availability = summary?.dateAvailability;
  const known = [...new Set([
    ...(availability?.airportFlights ?? []), ...(availability?.airportPassengerForecast ?? []),
    ...(availability?.airportDepartureSchedule ?? []),
  ])].filter(day => day.startsWith(month)).sort();
  return <div className="stored-date-content">
    <label>{storedDateText.month[lang]} <input type="month" value={month} onChange={event => {
      if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) setPickedMonth(event.target.value);
    }} /></label>
    <label>{storedDateText.select[lang]} <select aria-label={storedDateText.select[lang]} value={known.includes(selected) ? selected : ''} onChange={event => {
      if (!event.target.value) return;
      setPickedMonth(undefined);
      onChange(event.target.value);
    }}>
      <option value="" disabled>{storedDateText.select[lang]}</option>
      {known.map(day => <option key={day} value={day}>{day} · {[
        availability?.airportFlights.includes(day) ? storedDateText.flights[lang] : null,
        availability?.airportPassengerForecast.includes(day) ? storedDateText.forecast[lang] : null,
        availability?.airportDepartureSchedule?.includes(day) ? storedDateText.planned[lang] : null,
      ].filter(Boolean).join(' / ')}</option>)}
    </select></label>
    {summary ? !known.length && <p>{storedDateText.none[lang]}</p> : <LiveLoadMessage loading={summary === undefined} lang={lang} />}
    <p>{storedDateText.note[lang]}</p>
  </div>;
}

/** Explains, in one line, what a chosen date can and cannot show. */
export function DateScopeNote({ lang, date, scope = "departures" }: {
  lang: Lang;
  date: string | null;
  /**
   * Which screen is asking.
   *
   * Stored FLIGHT records are a departure fact — the arrival screen shows
   * no flights at all — so announcing "저장된 운항 기록 없음" above 입국
   * described something that screen never claimed to have.
   */
  scope?: "departures" | "arrivals";
}) {
  const summary = useLiveSummary(date);
  if (!summary) return null;
  const { dayRelation, serviceDateKst, dateAvailability } = summary;
  const showsFlights = scope === "departures";
  const hasFlights = dateAvailability.airportFlights.includes(serviceDateKst);
  const passengerData = scope === 'arrivals' ? summary.airport.arrivalForecast : summary.airport;
  const hasForecast = dateAvailability.airportPassengerForecast.includes(serviceDateKst)
    && passengerData?.forecastCoverage?.all !== 'UNAVAILABLE';
  const hasSchedule = dateAvailability.airportDepartureSchedule?.includes(serviceDateKst);
  const parts: string[] = [];
  if (dayRelation === "PAST") {
    parts.push(lang === "ko" ? "지난 날짜는 기록으로만 봅니다" : lang === "en" ? "A past date is shown as a record only" : lang === "zh" ? "过去日期仅作为记录显示" : "過去の日付は記録としてのみ表示します");
  }
  if (dayRelation === "FUTURE") {
    parts.push(contextText(lang, '확보한 예보·예정 운항만 표시합니다', 'Only forecasts and schedules actually held are shown', '仅显示已获取的预测与计划航班', '取得済みの予報・予定便のみ表示します'));
  }
  if (hasForecast) {
    const stamp = passengerData?.passengerForecastRetrievedAt;
    parts.push(`${storedDateText.forecast[lang]}${stamp ? ` · ${kstStamp(stamp)} KST` : ''}`);
    if (passengerData?.forecastCoverage?.all === 'PARTIAL') parts.push(contextText(lang,
      '일부 시간대만 확보', 'Only some time bands held', '仅获取部分时段', '一部の時間帯のみ取得'));
  } else {
    parts.push(lang === "ko" ? "공식 예상 승객 없음" : lang === "en" ? "no official passenger forecast" : lang === "zh" ? "无官方预计旅客" : "公式予想旅客なし");
  }
  if (showsFlights && dayRelation !== 'FUTURE' && hasFlights) {
    const stamp = summary.airport.departuresTrackedTodayRetrievedAt;
    parts.push(`${storedDateText.flights[lang]}${stamp ? ` · ${kstStamp(stamp)} KST` : ''}`);
  } else if (showsFlights && dayRelation !== 'FUTURE') {
    parts.push(lang === "ko" ? "저장된 운항 기록 없음" : lang === "en" ? "no stored flight record" : lang === "zh" ? "无已存储航班记录" : "保存された運航記録なし");
  }
  if (showsFlights && dayRelation === 'FUTURE') {
    const stamp = summary.airport.scheduledBriefing?.ranking.all.retrievedAt;
    parts.push(hasSchedule ? `${storedDateText.planned[lang]}${stamp ? ` · ${kstStamp(stamp)} KST` : ''}`
      : contextText(lang, '해당 날짜 예정편 자료 없음 / 제공 범위 확인 불가', 'No held schedule for this date / provider coverage unconfirmed', '该日期无已存计划航班／提供范围未确认', 'この日の予定便資料なし・提供範囲は未確認'));
  }
  const forecastSource = summary.sources?.find(source => source.sourceId === 'INCHEON_PASSENGER_FORECAST');
  if (forecastSource?.status === 'ERROR' || forecastSource?.status === 'DEGRADED') {
    parts.push(contextText(lang, '승객 예보 자료원의 최근 수집 오류', 'Latest passenger-source collection had an error', '旅客预测资料源最近采集出错', '旅客予報の資料源の直近収集にエラー'));
  }
  if (!parts.length) return null;
  return <p className="date-scope-note" role="status">{summary.clientRefresh?.failedAt && <span data-testid="summary-refresh-failed">{contextText(lang,
    '화면 갱신 실패 · 마지막 정상 자료를 표시합니다.',
    'Refresh failed · showing the last successful data.',
    '页面更新失败 · 显示上次成功取得的资料。',
    '画面の更新に失敗・最後に取得できた資料を表示します。')} {kstStamp(summary.clientRefresh.failedAt)} KST · </span>}{parts.join(" · ")}</p>;
}

/**
 * The official hourly forecast chart.
 *
 * Its own component for one reason: it owns a hook. The bars scroll
 * horizontally and a whole day does not fit on a phone, so the chart used
 * to open at 00:00 — a reader at 17:27 saw the small hours and had to drag
 * to find themselves, which is the one hour the chart exists to show.
 *
 * `scrollLeft`, never `scrollIntoView`: the latter scrolls the PAGE too,
 * which would drag the reader away from the summary above.
 */
export function FlightScopeNote({airport,lang}:{airport:LiveSummary["airport"];lang:Lang}) {
  const counts=airport.flightScope;
  if(!counts || !counts.total)return null;
  const t=(ko:string,en:string,zh:string,ja:string)=>contextText(lang,ko,en,zh,ja);
  const unit=t('편',' flights','班','便');
  const parts=[`T1 ${counts.T1}${unit}`,`T2 ${counts.T2}${unit}`,
    counts.CONCOURSE?`${t('탑승동','Concourse','登机楼','コンコース')} ${counts.CONCOURSE}${unit}`:null,
    counts.other?`${t('기타 표기','Other designation','其他标记','その他表記')} ${counts.other}${unit}`:null,
    counts.unassigned?`${t('탑승 위치 확인 중','Boarding location unknown','登机位置待确认','搭乗場所確認中')} ${counts.unassigned}${unit}`:null,
    counts.conflicting?`${t('터미널 표기 충돌','Conflicting terminal labels','航站楼标记冲突','ターミナル表記の不一致')} ${counts.conflicting}${unit}`:null].filter(Boolean);
  return <div className="flight-scope-note"><p>{parts.join(' · ')}{counts.capped&&t(' 조회 상한에 도달해 일부 기록일 수 있습니다.',' Query limit reached; records may be partial.',' 已达查询上限，可能不完整。',' 取得上限に達し、一部記録の可能性があります。')}</p>
    <details className="methodology-details"><summary>{t('집계 기준 보기','Counting methodology','查看统计口径','集計基準を見る')}</summary><p>{t('같은 출발편을 한 번씩 셉니다. 탑승동은 공식 게이트 안내(101~132번)로 확인한 탑승 위치이며, 체크인 터미널과 다릅니다. 위치를 확인할 근거가 없는 편만 별도로 표시합니다.','Each departure is counted once. Concourse boarding is identified by the official gate map (101–132), not the check-in terminal. Unknown locations stay separate.','每个实际出发航班计一次。登机楼依据官方101–132号登机口识别，不代表值机航站楼；未知位置单独显示。','同じ出発便は1回集計。コンコースは公式の101–132番ゲートで確認した搭乗場所です。チェックイン場所とは異なり、不明な場所は別表示。')}</p></details>
  </div>;
}

/**
 * The arithmetic sum, shown as the arithmetic it is.
 *
 * The two inputs are official; their sum is not an official figure, and the
 * screen has to make that visible rather than only say it in a footnote. So
 * the operands and the operator are drawn, not implied: a reader who sees
 * "A + B = C" knows C was computed here. A pie or a 100% stacked bar would
 * claim the opposite — that C is a known whole being divided — which is
 * exactly what "overlap unverified" means we cannot claim.
 */
function AirportSumFormula({ hall, transfer, total, lang, numberLocale, unit, isToday }: {
  hall: number; transfer: number; total: number; lang: Lang; numberLocale: string; unit: string; isToday: boolean;
}) {
  const row = (op: string, label: string, value: number, kind: string) => (
    <div className="airport-sum-row" data-kind={kind}>
      <span className="airport-sum-op" aria-hidden="true">{op}</span>
      <span className="airport-sum-label">{label}</span>
      <b className="airport-sum-value">{Math.round(value).toLocaleString(numberLocale)}{unit}</b>
    </div>
  );
  return <div className="airport-sum-formula" data-testid="airport-sum-formula">
    {row("", passengerCopy.hallComponent[lang], hall, "hall")}
    {row("+", passengerCopy.transferComponent[lang], transfer, "transfer")}
    {row("=", passengerCopy[isToday ? "summedToday" : "summedSelected"][lang], total, "total")}
  </div>;
}

/**
 * The month's running total, defined only while every day so far is complete.
 *
 * Once a day is missing, every later entry is null: a cumulative figure that
 * steps over a gap quietly asserts the gap contributed nothing. Pure and
 * module-level so the chart computes it without holding mutable render state.
 */
function runningTotals(days: readonly MtdDay[]): (number | null)[] {
  return days.reduce<(number | null)[]>((acc, day) => {
    const previous = acc.length === 0 ? 0 : acc[acc.length - 1];
    acc.push(previous === null || day.total === null ? null : previous + day.total);
    return acc;
  }, []);
}

/**
 * Daily forecast bars; the month's running total stays in the text readout.
 *
 * Two rules the drawing must not break:
 *
 *  - A day with no complete forecast has NO bar and no zero. It is drawn as a
 *    gap tick, because a missing day rendered at height zero is indistinguishable
 *    from a day the airport expected nobody.
 *  - The running total stops at the first incomplete day. A cumulative line
 *    drawn across a gap silently asserts the gap contributed nothing, which is
 *    the same lie in line form.
 */
function AirportMonthChart({ days, lang, numberLocale, unit }: {
  days: readonly MtdDay[]; lang: Lang; numberLocale: string; unit: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  if (!days.length) return null;
  const width = 100, height = 100;
  // Each calendar date receives equal space; missing values remain gaps.
  const slots = days.length;
  const slot = width / slots;
  // Fill two thirds of each date slot; cap short series to avoid oversized bars.
  const barWidth = Math.min(8, slot * 0.66);
  const maxDay = days.reduce((best, day) => Math.max(best, day.total ?? 0), 0);
  const showEachValue = days.length <= 5;
  // Long strips grow from 12px/date on phones to 22px/date on desktop,
  // bounded by the card. Plot, ticks and full-date controls share this width.
  const plotStyle = { width: days.length > 9 ? `min(100%, calc(${slots} * clamp(12px, 1.6vw, 22px)))` : undefined, maxWidth: "100%" };

  // The running total is still COMPUTED — the readout below prints the selected
  // day's cumulative figure — it is simply no longer DRAWN. The owner removed
  // the line on 2026-09-15: the month total sits at the top of this card and
  // the same cumulative value is one line below in words, so a third rendering
  // of it as a diagonal repeated what the card already said twice.
  const cumulative = runningTotals(days);
  const x = (index: number) => slot * (index + 0.5);
  // One mark, so it uses the plot. The bars were held to the lower 74% to leave
  // the upper quarter for the line that climbed through it; with the line gone
  // that reserved band is just a permanently empty strip above the tallest day.
  // A short run has room for a value above every bar. Longer months keep the
  // full plot height and let the selected day's readout carry the exact value.
  const barY = (value: number) => height - (maxDay > 0 ? (value / maxDay) * (height * (showEachValue ? 0.62 : 0.92)) : 0);

  const activeIndex = active ? days.findIndex((day) => day.date === active) : -1;
  const shown = activeIndex >= 0 ? activeIndex : days.length - 1;
  const shownDay = days[shown];
  // Day-of-month labels (the month is named by the card): the 1st, every fifth
  // day, and today when it is not crowding the one before it.
  const ticks = days.length <= 9 ? days.map((_, index) => index) : [0, 4, 9, 14, 19, 24, 29].filter((index) => index < days.length);
  if (days.length > 9 && days.length - 1 - ticks[ticks.length - 1] >= 2) ticks.push(days.length - 1);

  return <figure className="airport-month-chart" data-short-series={showEachValue}>
    {/* One series, named by the caption. A legend existed to tell two marks
        apart; with a single mark it restates the caption and nothing else. */}
    <figcaption>
      <span>{mtdCopy.daily[lang]} ({unit.trim()})</span>
    </figcaption>
    <div className="airport-month-plot" style={plotStyle}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <line className="airport-month-baseline" x1="0" x2={width} y1={height - 0.5} y2={height - 0.5}/>
        {days.map((day, index) => day.total === null
          ? <rect key={day.date} className="airport-month-gap" x={x(index) - barWidth / 2} y={height - 1.5} width={barWidth} height={1.5} />
          : <g key={day.date}><rect className="airport-month-soft-depth" x={x(index) - barWidth / 2 + .7} y={barY(day.total) + 2} width={barWidth} height={Math.max(0, height - barY(day.total) - 2)} rx={Math.min(1.5, barWidth/2)} ry={6} fill="#a6c5ce"/><rect className="airport-month-bar" data-value={day.total} data-selected={day.date === shownDay.date || undefined}
              x={x(index) - barWidth / 2} y={barY(day.total)} width={barWidth} height={Math.max(0, height - barY(day.total))} rx={Math.min(1.5, barWidth / 2)} ry={6} />
              {day.total > 0 && <path className="airport-month-soft-highlight" d={`M${x(index)-barWidth/2+1.2} ${barY(day.total)+2} h${Math.max(0,barWidth-2.4)}`} stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/>}
            </g>)}
      </svg>
      {showEachValue && <div className="airport-month-value-labels" aria-hidden="true">
        {days.map((day, index) => <span key={day.date} data-date={day.date} data-missing={day.total === null || undefined}
          style={{ left: `${x(index)}%`, top: `${day.total === null ? 84 : Math.max(0, barY(day.total) - 3)}%` }}>
          {day.total === null ? '—' : Math.round(day.total).toLocaleString(numberLocale)}
        </span>)}
      </div>}
      <div className="airport-month-picks" role="group" aria-label={mtdCopy.daily[lang]}>
        {days.map((day) => <button key={day.date} type="button" aria-pressed={day.date === shownDay.date} style={{ flex: `0 0 ${100 / slots}%` }}
          onClick={() => setActive(day.date)} onPointerEnter={() => setActive(day.date)} onFocus={() => setActive(day.date)}
          aria-label={`${shortDay(day.date)} · ${day.total === null ? airportTodayText.unavailable[lang] : `${Math.round(day.total).toLocaleString(numberLocale)}${unit}`}`} />)}
      </div>
    </div>
    <div className="airport-month-ticks" style={plotStyle} aria-hidden="true">
      {ticks.map((index) => <span key={index} style={{ left: `${Math.min(97.5, Math.max(2.5, (x(index) / width) * 100))}%`, transform: 'translateX(-50%)' }}>{showEachValue ? shortDay(days[index].date) : Number(days[index].date.slice(8, 10))}</span>)}
    </div>
    <p className="airport-month-readout" aria-live="polite">
      <span>{shortDay(shownDay.date)}</span>
      <b>{mtdCopy.perDay[lang]} {shownDay.total === null ? airportTodayText.unavailable[lang] : `${Math.round(shownDay.total).toLocaleString(numberLocale)}${unit}`}</b>
      <small>{mtdCopy.cumulative[lang]} {cumulative[shown] === null ? airportTodayText.unavailable[lang] : `${Math.round(cumulative[shown]!).toLocaleString(numberLocale)}${unit}`}</small>
    </p>
  </figure>;
}

export function AirportAtAGlance({summary,lang,terminal="all",showPassengers=true,showCrowding=true,showFlights=true,flow=null}:{summary:LiveSummary;lang:Lang;terminal?:"all"|"T1"|"T2";showPassengers?:boolean;showCrowding?:boolean;showFlights?:boolean;flow?:ReactNode}) {
  const airport=summary.airport;
  const isAll=terminal==="all";
  const numberLocale=airportLocale(lang);
  const peopleUnit={ko:"명",en:" people",zh:"人",ja:"人"}[lang];
  const flightUnit={ko:"편",en:" flights",zh:"班",ja:"便"}[lang];
  const expectedTotal=isAll?airport.todayExpectedPassengersTotal:airport.todayExpectedPassengersByTerminal?.[terminal]??null;
  const flightsCount=isAll?airport.departuresTrackedToday:airport.departuresTrackedTodayByTerminal?.[terminal]??null;
  const peak=isAll?airport.peakExpectedTimeBand:airport.peakExpectedTimeBandByTerminal?.[terminal]??null;
  const timeline=isAll?airport.passengerForecastTimeline:airport.passengerForecastTimelineByTerminal?.[terminal]??[];
  const forecastStatus=isAll?airport.forecastCoverage?.all:airport.forecastCoverage?.byTerminal?.[terminal];
  const referenceSum=passengerReferenceSum(expectedTotal,forecastStatus,summary.serviceDateKst,terminal,airport.transferForecast);
  const gate=airport.topDepartureGateByTerminal?.[terminal];
  const topGate=isAll?(airport.topDepartureGate&&airport.topDepartureGateFlights!==null?{terminal:airport.topDepartureGateTerminal,gate:airport.topDepartureGate,flights:airport.topDepartureGateFlights}:null):(gate?{terminal,...gate}:null);
  const presentationNow = usePresentationClock(summary.generatedAt);
  const nowIso = new Date(presentationNow).toISOString();
  const scopeLabel=airportTodayText.scope[lang][terminal];
  const passengerAt=isAll?airport.passengerForecastRetrievedAt:airport.passengerForecastRetrievedAtByTerminal?.[terminal]??null;
  const flightsAt=airport.departuresTrackedTodayRetrievedAt;
  const passengerCollected=passengerAt?formatHumanFreshness(passengerAt,nowIso,lang,"collected"):null;
  const flightsCollected=flightsAt?formatHumanFreshness(flightsAt,nowIso,lang,"collected"):null;
  // "현재" only means something on the day being read today; the selector
  // returns null otherwise rather than dressing a stale hour as now.
  const nowBand = selectAirportNowBand({
    timeline,
    nowIso,
    peakExpectedPassengers: forecastStatus === "COMPLETE" ? peak?.expectedPassengers ?? null : null,
    isToday: summary?.dayRelation === "TODAY",
  });
  const airportBrief = buildAirportCurrentBrief({
    scope: terminal,
    congestion: summary.dayRelation === "TODAY" ? airport.congestion ?? [] : [],
    forecastCoverage: forecastStatus ?? "UNAVAILABLE",
    peak,
    nowBand,
    departures: flightsCount,
    topGate,
  });
  const forecastCollectionFailure = localizeAirportBrief(airportBrief, lang, null,
    summary.sources?.find(source => source.sourceId === 'INCHEON_PASSENGER_FORECAST')?.retrievedAt ?? null,
    nowIso, true)[0];
  const comparisons = airport.periodComparisons?.[terminal];
  const passengerChanges = ([7, 28] as const).flatMap((days) => comparisons?.[days]?.passengers ? [comparisonText(comparisons[days]!.passengers!, lang, days)] : []);
  // No placeholder for a missing 7-day comparison: the grid's third cell says
  // "비교 자료 없음" in its own right, and this line repeated it word for word
  // six rows further down. The real comparisons stay here because they carry
  // the baseline timestamp the grid has no room for.
  const flightChanges = ([7, 28] as const).flatMap((days) => comparisons?.[days]?.flightRecords ? [{days,change:comparisons[days]!.flightRecords!}] : []);
  const recordsOnly = ({ ko: "수집된 출발편 기록 기준 · 전체 운항 증감과 다를 수 있음", en: "Collected departing-flight records; not a complete operational census", zh: "按已采集出发航班记录，非完整运行统计", ja: "収集済み出発便記録による比較・全運航の増減とは異なる場合あり" })[lang];
  const schedule=airport.scheduledBriefing?.serviceDateKst===summary.serviceDateKst&&summary.dayRelation!=="PAST"?airport.scheduledBriefing:null;
  const officialSchedule=schedule?.basis==='OFFICIAL_DEPARTURE_SCHEDULE';
  const planned=isAll?schedule?.ranking.all:schedule?.ranking.byTerminal[terminal];
  const dayLabel=summary.dayRelation==="TODAY"?areaBriefText.nowLabel[lang]:contextText(lang,"선택일 요약","Selected day summary","所选日期概览","選択日の概要");
  const mtd = airport.monthToDate?.[terminal] ?? null;
  const checkpoint = airportBrief.checkpoint;
  const queueIsStale = checkpoint && (checkpoint.freshness === "STALE" || presentationNow - Date.parse(checkpoint.observedAt) > 20 * 60_000);
  const queueValue = checkpoint?.waitTimeRaw ?? (checkpoint?.waitTimeMinutes !== null && checkpoint?.waitTimeMinutes !== undefined ? String(checkpoint.waitTimeMinutes) : null);

  // The day's size and its hour-by-hour shape are one picture on the airport
  // page: the lead (scope, total, formula, limitation, the flow figure) sits on
  // the dusk-sky panel (app/airport-visual.css .airport-hero). The personal
  // home passes no flow and keeps the plain lead.
  const lead = <>
      <p className="eyebrow">{scopeLabel} · {dayLabel}</p>
      {showPassengers&&<>
      {/* OWNER PRIORITY LOCK 1-3 (2026-09-14). The arithmetic sum of the two
          official forecasts leads, because that is the number an airport
          retail manager plans around. Under it the sum is SHOWN as arithmetic,
          and the limitation follows immediately — not many rows below, where a
          reader who has already taken the figure as a passenger count will
          never reach it. The departure hall alone led this view before and
          must not lead it again: it is one of the two operands, so a reader
          could not tell the part from the whole. When the sum cannot be formed
          the hall figure leads again, labelled as itself. */}
      {referenceSum ? <>
        <strong className="airport-brief-total" data-basis="ARITHMETIC_ONLY" data-testid="airport-sum-total">
          <span className="airport-metric-label">{passengerCopy[summary.dayRelation === "TODAY" ? "summedToday" : "summedSelected"][lang]}</span>{" "}
          <span className={flow ? "airport-metric-value av-display" : "airport-metric-value"}><CountUpNumber value={referenceSum.total} locale={numberLocale} animate={Boolean(flow)} /><small>{peopleUnit}</small></span>
        </strong>
        <AirportSumFormula hall={referenceSum.hall} transfer={referenceSum.transfer} total={referenceSum.total}
          lang={lang} numberLocale={numberLocale} unit={peopleUnit} isToday={summary.dayRelation === "TODAY"} />
        <small className="passenger-transfer-limitation">{passengerCopy.arithmeticNote[lang]}</small>
      </> : expectedTotal !== null && forecastStatus === "COMPLETE"
        ? <><strong className="airport-brief-total"><span className="airport-metric-label">{passengerCopy[summary.dayRelation === "TODAY" ? "today" : "selected"][lang]}</span>{" "}<span className={flow ? "airport-metric-value av-display" : "airport-metric-value"}><CountUpNumber value={Math.round(expectedTotal)} locale={numberLocale} animate={Boolean(flow)} /><small>{peopleUnit}</small></span></strong>
          <small className="passenger-transfer-limitation">{passengerCopy.limitation[lang]}</small></>
        : <p className="airport-data-missing">{forecastStatus === "PARTIAL" ? airportTodayText.forecastPartial[lang] : airportTodayText.unavailable[lang]}</p>}
      <small className="departure-hall-scope-note">{passengerCopy.scopeSentence[lang](summary.serviceDateKst, scopeLabel)}</small>
      {/* LOCK 4: the hour-by-hour shape of the day, directly under the day's
          size. Supplied by the airport page; the personal home passes none. */}
      {flow}
      </>}
  </>;

  return <section className="current-brief airport-current-brief" aria-label={`${scopeLabel} ${dayLabel}`}>
      {flow ? <div className="airport-hero">{lead}</div> : lead}
      {showPassengers&&<>
      {forecastCollectionFailure && <p className="prep-note" role="status" data-testid="airport-forecast-collection-failure">{forecastCollectionFailure}</p>}
      {/* OWNER PRIORITY LOCK 6-8: this month so far, the same span of the month
          before, and the shape of how it accumulated. Scope-isolated like every
          other figure here — T2 sums T2's own days and nothing else. */}
      {mtd && <><h3 data-heading="subsection"><span className="heading-marker" aria-hidden="true"/>{mtdCopy.sectionTitle[lang]}</h3><section className="airport-mtd" data-scope={terminal} data-testid="airport-mtd" aria-label={mtdCopy.heading[lang]}>
        <p className="airport-mtd-head"><span>{mtdCopy.heading[lang]}</span><small>{shortRange(mtd.current.start, mtd.current.end)}</small></p>
        {mtd.current.total !== null
          ? <strong className="airport-mtd-total">{Math.round(mtd.current.total).toLocaleString(numberLocale)}{peopleUnit}</strong>
          : <p className="airport-mtd-missing">{mtd.current.status === "PARTIAL"
              ? mtdCopy.partial[lang](mtd.current.completeDays, mtd.current.expectedDays)
              : mtdCopy.unavailable[lang]}</p>}
        {/* A partial span names the days it is missing rather than only saying
            it is partial, so the reader can judge how far off the total is. */}
        {mtd.current.status === "PARTIAL" && mtd.current.missingDates.length > 0
          && <small className="airport-mtd-note">{mtdCopy.missing[lang](mtd.current.missingDates.map(shortDay))}</small>}
        <dl className="airport-mtd-compare">
          <div><dt>{mtdCopy.previous[lang]}</dt>
            <dd>{mtd.previous && mtd.previous.total !== null
              ? <><b>{Math.round(mtd.previous.total).toLocaleString(numberLocale)}{peopleUnit}</b><small>{shortRange(mtd.previous.start, mtd.previous.end)}</small></>
              : <small>{mtd.previousAbsentReason === "NO_SUCH_DAY" ? mtdCopy.noSuchDay[lang] : mtdCopy.noCompare[lang]}</small>}</dd></div>
          <div><dt>{mtdCopy.change[lang]}</dt>
            <dd>{mtd.change
              ? <b className="airport-glance-change"><RateText text={comparisonValue(mtd.change)} lang={lang}/></b>
              : <small>{mtd.previousAbsentReason === "NO_SUCH_DAY" ? mtdCopy.noSuchDay[lang] : mtdCopy.bothComplete[lang]}</small>}</dd></div>
        </dl>
        <AirportMonthComparison current={mtd.current.total} previous={mtd.previous?.total ?? null} currentLabel={shortRange(mtd.current.start, mtd.current.end)} previousLabel={mtd.previous ? shortRange(mtd.previous.start, mtd.previous.end) : ''} numberLocale={numberLocale} unit={peopleUnit}/>
        <AirportMonthChart days={mtd.current.days} lang={lang} numberLocale={numberLocale} unit={peopleUnit} />
      </section></>}
      <div className="transfer-forecast" data-testid="transfer-forecast">
        {(airport.transferForecast ?? []).filter(r => r.serviceDate === summary.serviceDateKst && (isAll || r.terminal === terminal)).map(r =>
          <small key={r.terminal} style={{display:'block'}}>{r.terminal} · {passengerCopy.transfer[lang]} {r.expectedTransferPassengers.toLocaleString(numberLocale, {maximumFractionDigits:0})}{peopleUnit} · {formatHumanFreshness(r.retrievedAt,nowIso,lang,"collected")}</small>)}
        {((isAll ? ['T1','T2'] : [terminal]) as string[]).filter(t => !(airport.transferForecast ?? []).some(r => r.serviceDate === summary.serviceDateKst && r.terminal === t)).map(t => <p key={t}>{t} · {passengerCopy[summary.sources?.some(s => s.sourceId === 'INCHEON_TRANSFER_FORECAST' && s.status === 'ERROR' && s.detail?.includes(`service_date=${summary.serviceDateKst}`)) ? 'failed' : summary.dayRelation === 'FUTURE' && new Date(new Date(nowIso).getTime()+9*3600000).getUTCHours()<17 ? 'pending' : 'unavailable'][lang]}</p>)}
      </div>

      </>}
      {showCrowding && checkpoint && <aside className="airport-wait-brief"><p>{queueIsStale ? contextText(lang,"이전 대기 관측","Previous queue observation","先前等候观测","以前の待ち状況の観測") : contextText(lang,"현재 대기 관측","Current queue observation","当前等候观测","現在の待ち状況の観測")} · {checkpoint.terminal} {friendlyCheckpointName(checkpoint.zone,lang)}</p><p><strong className="airport-wait-value">{queueValue ? `${queueValue}${/분|min|分钟|分/i.test(queueValue) ? '' : {ko:'분',en:' min',zh:'分钟',ja:'分'}[lang]}` : checkpoint.waitingCount !== null ? `${checkpoint.waitingCount.toLocaleString(numberLocale, {maximumFractionDigits:0})}${peopleUnit}` : airportTodayText.unavailable[lang]}</strong><small className="airport-wait-observed">{kstStamp(checkpoint.observedAt)} KST {demandCopy.observed[lang]}</small></p></aside>}
      {showPassengers && expectedTotal !== null && passengerChanges.length > 0 && <p>{airportTodayText.expected[lang]} · <strong><RateText text={passengerChanges.join(" · ")} lang={lang}/></strong></p>}
      {showFlights && flightsCount !== null && <p>{airportTodayText.flights[lang]} {flightsCount.toLocaleString(numberLocale)}{flightUnit}{flightChanges.map(({days,change})=>{
        const exact=change.baselineMin!==undefined&&change.baselineMin===change.baselineMax && (change.baselineMin ?? 0)>0&&Number.isSafeInteger(change.baselineMin);
        const prefix=days===7?contextText(lang,'전주 동요일','Same weekday last week','上周同星期','先週同曜日'):contextText(lang,'4주 전 같은 요일','Same weekday 4 weeks ago','4周前同星期','4週前同曜日');
        return <span key={days} style={days===28?{fontWeight:'var(--weight-strong)'}:undefined}> · {prefix}{exact?` ${change.baselineMin!.toLocaleString(numberLocale)}${flightUnit}${contextText(lang,'보다',' compared with','相比','比')}`:''} <strong className="airport-comparison-change"><RateText text={comparisonValue(change)} lang={lang}/></strong> {days===28?<strong>({change.baselineAt.slice(0,10)})</strong>:<>({change.baselineAt.slice(0,10)})</>}</span>;
      })}</p>}
      {showFlights && flightsCount===null&&<>{officialSchedule&&planned&&planned.totalFlights>0?<><p>{pc('officialScheduledFlights',lang)} {planned.totalFlights.toLocaleString(numberLocale)}{flightUnit}</p><small>{pc('officialScheduleBasis',lang)}</small></>:<><p>{pc('schedulePending',lang)}</p>{planned&&planned.totalFlights>0&&<small>{pc('scheduledFlights',lang)} {planned.totalFlights.toLocaleString(numberLocale)}{flightUnit} · {pc('scheduleBasis',lang)}</small>}</>}</>}
      {showFlights && isAll && <FlightScopeNote airport={airport} lang={lang} />}
      {showFlights && flightChanges.length > 0 && <details className="airport-record-scope"><summary>{contextText(lang,'항공편 자료 범위','Flight coverage','航班资料范围','便の資料範囲')}</summary><p>{recordsOnly}</p></details>}
      <small>{[showPassengers && passengerCollected ? `${airportTodayText.expected[lang]} · ${passengerCollected}` : null, showFlights && flightsCollected ? `${airportTodayText.flights[lang]} · ${flightsCollected}` : null].filter(Boolean).join(" / ")}</small>
      {showPassengers && (isAll || terminal === "T1") && <details className="methodology-details passenger-scope-note"><summary>{contextText(lang,'집계 기준 보기','Counting methodology','查看统计口径','集計基準を見る')}</summary><p>{contextText(lang,
        "출국장 예상 승객은 출국장 기준입니다. T1에서 출국 수속 후 탑승동으로 이동하는 승객도 T1 범위이며, 탑승동 인원을 따로 더하지 않습니다.",
        "Passenger forecasts count departure halls. Passengers clearing departure at T1 before moving to the concourse are within T1; no separate concourse count is added.",
        "出境大厅预计旅客按出境大厅统计。在T1办理出境后前往登机楼的旅客属于T1范围，不另加登机楼人数。",
        "予想出国客は出国場単位です。T1で出国手続き後にコンコースへ移動する旅客もT1の範囲で、別途加算しません。")}</p></details>}
    </section>;
}

/** The four Seoul areas, each opening with its own official brief. */
export function HomeTodayBrief({ lang, selected, onSelect, date = null, includeAirport = true }: { lang: Lang; selected: AreaId; onSelect: (area: AreaId) => void; date?: string | null; includeAirport?: boolean }) {
  const summary = useLiveSummary(date);
  const now = usePresentationClock(summary?.generatedAt ?? "");
  if (!summary) return <div className="demand-loading"><LiveLoadMessage loading={summary === undefined} lang={lang}/></div>;
  const block = summary.areas[selected];
  const dateSuffix = date ? `?date=${encodeURIComponent(date)}` : "";
  const supporting = buildAreaCurrentBrief({ realtime: null, realtimeForecast: [], weather: block?.weather ?? [], eventCount: block?.eventCount ?? 0, nextEventTitle: block?.events?.[0]?.title, nextEventCategory: block?.events?.[0]?.categoryName ?? null, nowIso: new Date(now).toISOString() });
  const supportLines = localizeAreaBrief(supporting, lang).lines.slice(1);
  const changes = AREA_IDS.flatMap(area => {
    const row = summary.areas[area];
    const current = row?.realtime;
    if (summary.dayRelation !== "TODAY" || !current || current.freshness !== "LIVE" || !describeObservationAge(current.observedAt, new Date(now).toISOString(), lang).isNow) return [];
    const comparison = usableComparison(current, 7);
    if (comparison && (comparison.minPercent > 0 || comparison.maxPercent < 0)) return [{ area, line: comparisonText(comparison, lang, 7) }];
    const future = populationFlow({ ...row, serviceDate: summary.serviceDateKst, isToday: true, now }).filter(p => p.kind === 'forecast');
    const rising = future.map(p => row!.realtimeForecast.find(r => r.targetAt === p.at)!).find(p => p.congestionLevel > current.congestionLevel);
    return rising ? [{ area, line: `${demandCopy.forecast[lang]} · ${kstDay(rising.targetAt) === kstDay(now + 86400000) ? demandCopy.tomorrow[lang] + ' ' : ''}${kstStamp(rising.targetAt)} KST · ${demandLevel(current.congestionLevel, lang)} → ${demandLevel(rising.congestionLevel, lang)}` }] : [];
  }).slice(0, 3);
  return <div className="demand-home">
    <p className="demand-section-label">{demandCopy.selected[lang]} · {summary.serviceDateKst} KST</p>
    <AreaDemandCard summary={summary} area={selected} lang={lang} linkHref={`/${lang}/${selected}${dateSuffix}`}/>
    <section className="home-area-briefs" aria-labelledby="home-area-briefs-title">
      <h2 data-heading="section" id="home-area-briefs-title"><span className="heading-marker" aria-hidden="true"/>{contextText(lang,"다른 상권 살펴보기","Explore the districts","查看其他商圈","ほかの商圏を見る")}</h2>
      <div className="home-area-brief-rows">{AREA_IDS.map(area => {
        const row = summary.areas[area]?.realtime;
        const valid = validPopulationRange(row) && kstDay(row!.observedAt) === summary.serviceDateKst;
        return <button key={area} className={selected === area ? 'selected' : ''} aria-pressed={selected === area} onClick={() => onSelect(area)}>
          {/* Decorative district concepts, independent of measured population and official maps. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="district-menu-model" src={`/airport-models/district-${area}.webp`} width="1200" height="900" alt="" loading="lazy" decoding="async"/>
          <span>{areaNames[area][lang]}</span><strong>{valid ? demandLevel(row!.congestionLevel, lang) : demandCopy.missing[lang]}</strong>
          <small>{valid ? `${peopleRange(row!,lang)}${text.foreignPeople[lang]} · ${kstStamp(row!.observedAt)} ${demandCopy.observed[lang]}` : '—'}</small>
        </button>;
      })}</div>
      <p className="flow-note">{contextText(lang,"각 측정 구역의 범위가 달라, 인구 크기로 지역의 인기나 혼잡 밀도를 비교하지 않습니다.","Measured areas differ. Headcounts are not a ranking of popularity or crowd density.","测量区域范围不同，人数不能作为人气或拥挤密度排名。","測定区域が異なるため、人口の大きさで人気や混雑密度は比較できません。")}</p>
    </section>
    {changes.length > 0 && <section className="demand-changes"><h2 data-heading="section"><span className="heading-marker" aria-hidden="true"/>{contextText(lang,"주목할 변화","Changes to watch","值得关注的变化","注目する変化")}</h2><ul>{changes.map(change => <li key={change.area}><strong>{areaNames[change.area][lang]}</strong><p><RateText text={change.line} lang={lang}/></p></li>)}</ul></section>}
    {includeAirport && <section className="home-airport"><div className="demand-section-head"><h2 data-heading="section"><span className="heading-marker" aria-hidden="true"/>{contextText(lang,"인천공항","Incheon Airport","仁川机场","仁川空港")}</h2><a href={`/${lang}/airport${dateSuffix}`}>{contextText(lang,"공항 자세히 보기","Explore airport","机场详情","空港の詳細")} →</a></div><AirportAtAGlance summary={summary} lang={lang}/></section>}
    <section className="home-support"><h2 data-heading="section"><span className="heading-marker" aria-hidden="true"/>{contextText(lang,"날씨와 주변 일정","Weather and nearby events","天气与周边日程","天気と周辺の予定")}</h2>
      {supportLines.length ? supportLines.map(line => <p key={line}>{line}</p>) : <p>{contextText(lang,"선택 날짜에 확인된 보조자료가 없습니다.","No supporting data for the selected date.","所选日期暂无辅助资料。","選択日の補足資料はありません。")}</p>}
      <p className="flow-note">{contextText(lang,"기상청 예보·공식 행사기간 기준. 실제 운영시간은 상세 화면의 공식 안내를 확인하세요.","KMA forecasts and official event periods. Check official links in the area details for operating hours.","按气象厅预测与官方活动期间，实际营业时间请查看地区详情内的官方信息。","気象庁予報・公式イベント期間。実際の開催時間はエリア詳細の公式案内をご確認ください。")}</p>
      <a href={`/${lang}/${selected}${dateSuffix}`}>{areaNames[selected][lang]} · {contextText(lang,"날씨·행사·소비·지하철 보기","Weather, events, spending and subway","查看天气、活动、消费及地铁","天気・イベント・消費・地下鉄を見る")} →</a>
    </section>
  </div>;
}

/** `9/1–9/30` from the official start and end dates; start alone when there is no end. */
function formatEventPeriod(event: { eventStart: string; eventEnd: string | null }): string {
  const short = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    return match ? `${Number(match[2])}/${Number(match[3])}` : "";
  };
  const start = short(event.eventStart);
  if (!start) return "";
  const end = event.eventEnd ? short(event.eventEnd) : "";
  return end && end !== start ? `${start}\u2013${end}` : start;
}

/**
 * The official address as the place line. The city prefix says nothing on a
 * page that is only about Seoul, so it is dropped; nothing else is altered.
 */
function formatEventPlace(event: { address?: string | null }): string {
  const address = event.address?.trim() ?? "";
  return address.replace(/^서울특별시\s*|^서울시\s*|^서울\s+/, "").trim();
}

/** Official distance from the area centre, rounded to a unit a reader can use. */
function formatEventDistance(lang: Lang, event: { distanceM: number | null }): string {
  if (event.distanceM === null || !Number.isFinite(event.distanceM)) return "";
  const metres = Math.round(event.distanceM);
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)}km`;
  return `${metres}m`;
}

function formatPeopleValue(lang: Lang, value: number): string {
  const locale = airportLocale(lang);
  return value.toLocaleString(locale, { maximumFractionDigits: 0 });
}

function formatKrwCompact(lang: Lang, amount: number): string {
  const eok = amount / 100_000_000;
  if (lang === "en") {
    if (eok >= 10_000) return `₩${(eok / 10_000).toFixed(1)}T`;
    return `₩${Math.round(eok).toLocaleString("en-US")}00M`;
  }
  const unit = lang === "zh" ? "亿" : lang === "ja" ? "億" : "억";
  const jo = lang === "zh" ? "万亿" : lang === "ja" ? "兆" : "조";
  if (eok >= 10_000) return `${(eok / 10_000).toFixed(1)}${jo}`;
  return `${Math.round(eok).toLocaleString(airportLocale(lang))}${unit}`;
}

export interface CommercialSignalRow {
  activityContext: string | null;
  averagePayment: string | null;
  comparisons: string[];
  key: "commercial";
  label: string;
  statusLabel: string;
  statusValue: string;
  amountLabel: string;
  amountValue: string | null;
  countLabel: string;
  countValue: string | null;
  referenceLabel: string;
  referenceValue: string;
  retrievalLabel: string;
  retrievalValue: string;
  attribution: string;
  privacyMessage: string | null;
  staleAge: string | null;
  /** Kept until the structured card consumes this builder directly. */
  value: string;
  note: string;
  state: "LIVE" | "STALE";
}

const commercialFieldText = {
  status: { ko: "상태", en: "Status", zh: "状态", ja: "状態" },
  amount: { ko: "결제금액", en: "Payment amount", zh: "支付金额", ja: "決済金額" },
  count: { ko: "결제 건수", en: "Payment count", zh: "支付笔数", ja: "決済件数" },
  reference: { ko: "관측 기준", en: "Reference window", zh: "基准时间", ja: "観測基準" },
  retrieval: { ko: "KORETAIL 수집", en: "KORETAIL retrieval", zh: "KORETAIL采集", ja: "KORETAIL取得" },
  privacy: {
    ko: "표본 보호로 금액 비공개",
    en: "Amount withheld for sample privacy",
    zh: "为保护样本隐私，金额未公开",
    ja: "サンプル保護のため金額非公開",
  },
} as const;

function formatCommercialReference(lang: Lang, observedAt: string): string {
  const clock = formatKstClock(observedAt);
  if (!clock) return lang === "ko" ? "최근 10분" : lang === "en" ? "Recent 10 minutes" : lang === "zh" ? "最近10分钟" : "直近10分";
  return lang === "ko" ? `${clock} 기준 최근 10분`
    : lang === "en" ? `Recent 10 minutes as of ${clock} KST`
      : lang === "zh" ? `截至${clock} KST的最近10分钟`
        : `${clock} KST時点の直近10分`;
}

function formatCommercialRetrieval(lang: Lang, retrievedAt: string): string {
  const clock = formatKstClock(retrievedAt);
  if (!clock) return "";
  return lang === "ko" ? `${clock} 수집`
    : lang === "en" ? `Collected ${clock} KST`
      : lang === "zh" ? `${clock} KST采集`
        : `${clock} KST取得`;
}

function formatCommercialAge(lang: Lang, observedAt: string, generatedAt: string): string | null {
  const ageMinutes = Math.max(0, Math.floor((Date.parse(generatedAt) - Date.parse(observedAt)) / 60_000));
  if (!Number.isFinite(ageMinutes)) return null;
  if (ageMinutes < 60) return lang === "ko" ? `${ageMinutes}분 전` : lang === "en" ? `${ageMinutes} min old` : lang === "zh" ? `${ageMinutes}分钟前` : `${ageMinutes}分前`;
  const hours = Math.floor(ageMinutes / 60);
  return lang === "ko" ? `${hours}시간 전` : lang === "en" ? `${hours} hr old` : lang === "zh" ? `${hours}小时前` : `${hours}時間前`;
}

/** Truthful OA-21285 row; suppressed amounts are omitted, never zero-filled. */
export function buildCommercialSignalRow(
  lang: Lang,
  commercial: LiveCommercial | null | undefined,
  generatedAt: string,
): CommercialSignalRow | null {
  if (!commercial?.commercialLevel.trim()) return null;
  const hasRange = commercial.paymentAmountMin !== null
    && commercial.paymentAmountMax !== null
    && Number.isFinite(commercial.paymentAmountMin)
    && Number.isFinite(commercial.paymentAmountMax)
    && commercial.paymentAmountMin >= 0
    && commercial.paymentAmountMax >= 0;
  const hasCount = commercial.paymentCount !== null && Number.isFinite(commercial.paymentCount) && commercial.paymentCount >= 0;
  const amountValue = hasRange
    // "min ~ max" with spaces: the bare en dash read as a strike-through on
    // small screens, and the spaces give the line a place to wrap that is
    // not inside a number.
    ? `₩${commercial.paymentAmountMin!.toLocaleString(airportLocale(lang))} ~ ₩${commercial.paymentAmountMax!.toLocaleString(airportLocale(lang))}`
    : null;
  const countValue = hasCount
    ? `${commercial.paymentCount!.toLocaleString(airportLocale(lang))}${lang === "ko" ? "건" : lang === "en" ? " payments" : lang === "zh" ? "笔" : "件"}`
    : null;
  const average = averagePaymentRange(commercial.paymentAmountMin, commercial.paymentAmountMax, commercial.paymentCount);
  const averagePayment = average ? `₩${average[0].toLocaleString(airportLocale(lang))} ~ ₩${average[1].toLocaleString(airportLocale(lang))}` : null;
  const referenceValue = formatCommercialReference(lang, commercial.observedAt);
  const retrievalValue = formatCommercialRetrieval(lang, commercial.retrievedAt);
  const staleAge = commercial.freshness === "STALE" ? formatCommercialAge(lang, commercial.observedAt, generatedAt) : null;
  return {
    key: "commercial",
    activityContext: commercialActivityContext(commercial.commercialLevel, lang),
    averagePayment,
    comparisons: comparisonLines(commercial.comparisons, lang),
    label: text.commercial[lang],
    statusLabel: commercialFieldText.status[lang],
    statusValue: commercial.commercialLevel.trim(),
    amountLabel: commercialFieldText.amount[lang],
    amountValue,
    countLabel: commercialFieldText.count[lang],
    countValue,
    referenceLabel: commercialFieldText.reference[lang],
    referenceValue,
    retrievalLabel: commercialFieldText.retrieval[lang],
    retrievalValue,
    attribution: text.commercialDisclaimer[lang],
    privacyMessage: hasRange ? null : commercialFieldText.privacy[lang],
    staleAge,
    value: commercial.commercialLevel.trim(),
    note: [referenceValue, retrievalValue, text.commercialDisclaimer[lang], staleAge].filter(Boolean).join(" · "),
    state: commercial.freshness,
  };
}

const storeDynamicsText = {
  title: { ko: "점포 현황", en: "Store openings and closures", zh: "店铺开业与歇业", ja: "店舗の開業・廃業" },
  total: { ko: "총 점포", en: "Total stores", zh: "店铺总数", ja: "総店舗数" },
  ordinary: { ko: "일반 점포", en: "Non-franchise stores", zh: "非加盟店", ja: "非フランチャイズ店舗" },
  franchise: { ko: "프랜차이즈", en: "Franchise stores", zh: "加盟店", ja: "フランチャイズ店舗" },
  opening: { ko: "개업", en: "Opened", zh: "开业", ja: "開業" },
  closure: { ko: "폐업", en: "Closed", zh: "歇业", ja: "廃業" },
  changeTitle: { ko: "이번 분기 변화", en: "Change this quarter", zh: "本季度变化", ja: "今四半期の変化" },
  basis: { ko: "공식 과거자료", en: "official historical record", zh: "官方历史资料", ja: "公式過去資料" },
  retrieval: { ko: "KORETAIL 수집", en: "KORETAIL retrieval", zh: "KORETAIL采集", ja: "KORETAIL取得" },
  source: {
    ko: "서울시 상권분석서비스",
    en: "Seoul Commercial District Analysis Service",
    zh: "首尔市商圈分析服务",
    ja: "ソウル市商圏分析サービス",
  },
  limitation: {
    ko: "분기 기준 공식 과거 자료이며, 현재 영업 중인 점포의 실시간 수가 아닙니다.",
    en: "Official quarterly historical data, not a real-time count of stores currently operating.",
    zh: "官方季度历史资料，并非当前营业店铺的实时数量。",
    ja: "四半期基準の公式過去資料であり、現在営業中の店舗のリアルタイム件数ではありません。",
  },
} as const;

/**
 * Store Dynamics, shaped as a short piece of writing rather than a table.
 *
 * The previous layout put every field in its own bordered cell, which made a
 * spreadsheet out of five numbers and gave the incidental ones the same weight
 * as the headline. This shape says the same facts in reading order: what
 * period and area they describe, the one number that matters, what it is made
 * of, then what changed — with the provenance underneath where it belongs.
 */
export interface StoreDynamicsPresentation {
  title: string;
  timeState: string;
  /** Quarter and official trade area: the scope every number below inherits. */
  periodValue: string;
  /** Quarterly cadence facts, so nobody looks for an August that cannot exist. */
  period: { cadenceLabel: string; periodLabel: string; publicationNote: string; cadenceNote: string | null } | null;
  areaValue: string;
  totalLabel: string;
  totalValue: string;
  /** 일반 / 프랜차이즈 — a breakdown of the total, never peers of it. */
  composition: string[];
  changeTitle: string;
  change: string[];
  /** Source, basis, limitation and retrieval time, in that reading order. */
  meta: string[];
}

function formatStoreDynamicsQuarter(lang: Lang, quarterCode: string): string | null {
  const match = /^(\d{4})([1-4])$/.exec(quarterCode);
  if (!match) return null;
  const [, year, quarter] = match;
  return lang === "ko" ? `${year}년 ${quarter}분기`
    : lang === "en" ? `Q${quarter} ${year}`
      : lang === "zh" ? `${year}年第${quarter}季度`
        : `${year}年第${quarter}四半期`;
}

function formatStoreDynamicsRetrieval(value: string): string | null {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsed).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} KST`;
}

/**
 * UI projection of one already validated compact OA-15577 area aggregate.
 *
 * Counts only. No area-wide 개업률/폐업률 is shown: the provider publishes
 * those rates per industry row and they cannot be reconstructed from the
 * row fields for every real row, so any area-level percentage KORETAIL
 * computed would be an invented figure dressed as an official one. A
 * deliberately omitted ambiguous percentage beats a fabricated one.
 */
export function buildStoreDynamicsPresentation(
  lang: Lang,
  row: LiveStoreDynamics | null | undefined,
  nowIso: string | null = null,
  lastCollectedAt: string | null = null,
): StoreDynamicsPresentation | null {
  if (!row || row.datasetId !== "OA-15577") return null;
  const counts = [row.totalStoreCount, row.ordinaryStoreCount, row.franchiseStoreCount, row.openingCount, row.closureCount];
  if (counts.some((value) => !Number.isSafeInteger(value) || value < 0)
    || row.totalStoreCount !== row.ordinaryStoreCount + row.franchiseStoreCount
    || row.totalStoreCount === 0
    || !row.tradeAreaName.trim() || !row.tradeAreaTypeName.trim()) return null;
  const referenceValue = formatStoreDynamicsQuarter(lang, row.quarterCode);
  const retrievalValue = formatStoreDynamicsRetrieval(row.retrievedAt);
  if (!referenceValue || !retrievalValue) return null;
  const locale = airportLocale(lang);
  const countValue = (value: number) => `${value.toLocaleString(locale)}${lang === "ko" ? "개" : lang === "en" ? " stores" : lang === "zh" ? "家" : "店"}`;
  const labelled = (label: string, value: number) => `${label} ${countValue(value)}`;
  return {
    title: storeDynamicsText.title[lang],
    timeState: signalStructureText.timeState.historical[lang],
    periodValue: referenceValue,
    period: describeSourcePeriod({
      cadence: "QUARTERLY",
      referencePeriod: row.quarterCode,
      retrievedAt: lastCollectedAt,
      nowIso: nowIso ?? row.retrievedAt,
    }, lang),
    areaValue: chineseText(lang,row.tradeAreaName.endsWith(row.tradeAreaTypeName)
      ? row.tradeAreaName
      : `${row.tradeAreaName} · ${row.tradeAreaTypeName}`),
    totalLabel: storeDynamicsText.total[lang],
    totalValue: countValue(row.totalStoreCount),
    composition: [
      labelled(storeDynamicsText.ordinary[lang], row.ordinaryStoreCount),
      labelled(storeDynamicsText.franchise[lang], row.franchiseStoreCount),
    ],
    changeTitle: storeDynamicsText.changeTitle[lang],
    change: [
      labelled(storeDynamicsText.opening[lang], row.openingCount),
      labelled(storeDynamicsText.closure[lang], row.closureCount),
    ],
    // Provenance in reading order: where it came from, what kind of record it
    // is, what it is not, and when KORETAIL fetched it. The limitation keeps
    // its full sentence — a disclaimer is the one line not to trim.
    meta: [
      storeDynamicsText.source[lang],
      `${referenceValue} ${storeDynamicsText.basis[lang]}`,
      storeDynamicsText.limitation[lang],
      `${storeDynamicsText.retrieval[lang]} ${retrievalValue}`,
    ],
  };
}

type SignalGroupId = "now" | "movement" | "today-next" | "past";

interface SignalRow {
  key: string;
  group: SignalGroupId;
  timeState: string;
  label: string;
  value: string;
  note: string;
  detail?: string;
  weather?: { issuedAt: readonly string[]; targetAt: readonly string[]; showScene: boolean; kinds: readonly WeatherMetricKind[] };
  /**
   * For a source that publishes on a cycle: which period the number
   * describes, and whether that is the provider's newest publication or a
   * sign KORETAIL has fallen behind. It gets its own line rather than being
   * appended to `note`, because "왜 8월이 없나" is a different question from
   * "어디서 온 자료인가" and a reader should not have to parse one sentence
   * to answer both.
   */
  period?: { cadenceLabel: string; periodLabel: string; publicationNote: string; cadenceNote: string | null };
  state?: "LIVE" | "STALE";
}

const signalStructureText = {
  /** Says what the date next to it means, so "최신" never stands alone. */
  referencePeriod: { ko: "자료 기준", en: "Data for", zh: "数据基准", ja: "資料基準" },
  groups: {
    now: {
      title: { ko: "지금", en: "Now", zh: "现在", ja: "現在" },
      state: { ko: "실시간/최근", en: "Live / recent", zh: "实时/近期", ja: "リアルタイム/直近" },
    },
    movement: {
      title: { ko: "이동과 외국인 흐름", en: "Movement and foreign flow", zh: "移动与外国人流动", ja: "移動と外国人動向" },
      state: { ko: "최근·지연 공개", en: "Recent / delayed release", zh: "近期/延迟发布", ja: "直近/遅延公開" },
    },
    "today-next": {
      title: { ko: "오늘과 다음", en: "Today and next", zh: "今天与接下来", ja: "今日と次" },
      state: { ko: "공식 일정·예상", en: "Official schedule / forecast", zh: "官方日程/预测", ja: "公式日程/予想" },
    },
    past: {
      title: { ko: "과거 상권 정보", en: "Past commercial-area information", zh: "历史商圈信息", ja: "過去の商圏情報" },
      state: { ko: "과거 자료", en: "Historical", zh: "历史资料", ja: "過去資料" },
    },
  },
  timeState: {
    recent: { ko: "실시간/최근", en: "Live / recent", zh: "实时/近期", ja: "リアルタイム/直近" },
    forecast: { ko: "공식 예상", en: "Official forecast", zh: "官方预测", ja: "公式予想" },
    delayed: { ko: "지연 공개", en: "Delayed release", zh: "延迟发布", ja: "遅延公開" },
    historical: { ko: "과거 자료", en: "Historical", zh: "历史资料", ja: "過去資料" },
    schedule: { ko: "공식 일정", en: "Official schedule", zh: "官方日程", ja: "公式日程" },
  },
  eventAll: {
    ko: (count: number) => `전체 ${count.toLocaleString("ko-KR")}건 보기`,
    en: (count: number) => `View all ${count.toLocaleString("en-GB")} events`,
    zh: (count: number) => `查看全部${count.toLocaleString("zh-CN")}项活动`,
    ja: (count: number) => `全${count.toLocaleString("ja-JP")}件を見る`,
  },
  eventRepresentativesOnly: {
    ko: "대표 행사만 보기", en: "Show representative events", zh: "仅显示代表活动", ja: "代表イベントのみ表示",
  },
} as const;

function SignalRowCard({ row, lang }: { row: SignalRow; lang: Lang }) {
  return <article className={`signal-row${row.weather ? ' signal-weather' : ''}`} data-signal-key={row.key}>
    <div className="signal-row-label">
      <span className="signal-time-state">{row.timeState}</span>
      <h4>{row.label}</h4>
    </div>
    <div className="signal-row-content">
      {row.weather ? <WeatherScene lang={lang} forecast={null} forecastFacts={row.value.split(' · ')}
        forecastTitle={null} source={row.note} guide={row.detail} issuedAt={row.weather.issuedAt}
        targetAt={row.weather.targetAt} showScene={row.weather.showScene} metricScenes forecastKinds={row.weather.kinds}/>
      : <>
      <b className="signal-row-value">{row.key==="foreign_purpose_mobility"&&<span className="clarity-purpose-scenes" aria-hidden="true"><Image unoptimized src="/visuals/clarity/v1/shopping-bag-256.webp" width="48" height="48" alt="" loading="lazy" decoding="async"/><Image unoptimized src="/visuals/clarity/v1/tourism-camera-256.webp" width="48" height="48" alt="" loading="lazy" decoding="async"/></span>}{row.value}</b>
      {row.detail && <p className="signal-row-detail">{row.detail}</p>}
      {row.period && <p className="signal-row-period">
        <span>{row.period.cadenceLabel} · {signalStructureText.referencePeriod[lang]} {row.period.periodLabel}</span>
        <small>{row.period.publicationNote}</small>
        {row.period.cadenceNote && <small>{row.period.cadenceNote}</small>}
      </p>}
      <small className="signal-row-source">{row.note}{row.state === "STALE" ? ` · ${text.stale[lang]}` : ""}</small>
      </>}
    </div>
  </article>;
}

function CommercialSignalCard({ signal, lang }: { signal: CommercialSignalRow; lang: Lang }) {
  const metrics: { kind: CommercialMetricKind; label: string; value: string | null }[] = [
    { kind: 'amount', label: signal.amountLabel, value: signal.amountValue ?? signal.privacyMessage },
    ...(signal.countValue ? [{ kind: 'count' as const, label: signal.countLabel, value: signal.countValue }] : []),
    ...(signal.averagePayment ? [{ kind: 'average' as const, label: ({ ko: "건당 평균 결제액", en: "Average per payment", zh: "每笔平均支付额", ja: "1件あたり平均決済額" })[lang], value: signal.averagePayment }] : []),
  ];
  return <article className="commercial-signal-card commercial-scenes">
    <div className="commercial-signal-label">
      <span className="signal-time-state">{signalStructureText.timeState.recent[lang]}</span>
      <h4>{signal.label}</h4>
      {signal.state === "STALE" && <small className="signal-stale">{text.stale[lang]}{signal.staleAge ? ` · ${signal.staleAge}` : ""}</small>}
    </div>
    <div className="commercial-signal-content">
      <p className="commercial-basis">{text.commercialBasis[lang]}</p>
      <dl className="commercial-metrics">
        {metrics.map((metric) => <div key={metric.kind} data-metric-kind={metric.kind}><dt><CommercialMetricScene kind={metric.kind}/>{metric.label}</dt><dd>{metric.value}</dd></div>)}
      </dl>
      <p className="commercial-status">{lang === "ko" ? "서울시 제공 소비활동 상태" : signal.statusLabel} · <strong>{signal.activityContext ?? signal.statusValue}</strong></p>
      <p className="commercial-times">{signal.referenceValue} · {signal.retrievalValue}</p>
      <details className="commercial-method"><summary>{({ko:"비교·출처·계산 설명",en:"Comparisons, sources and calculation",zh:"比较、来源与计算说明",ja:"比較・出典・計算の説明"})[lang]}</summary>
       {signal.comparisons.length ? signal.comparisons.map((line) => <p className="period-comparison" key={line}><RateText text={line} lang={lang}/></p>) : <p className="commercial-times">{({ ko: "동일 시간대 과거 자료 부족 · 전주·4주 전 비교 불가", en: "Matching historical time window unavailable for weekly comparisons", zh: "缺少同一时段历史资料，无法进行周比较", ja: "同時刻の過去資料不足のため週比較不可" })[lang]}</p>}
       <p className="commercial-attribution">{text.sourceSeoul[lang]} · {signal.attribution}</p>
       {signal.averagePayment && <p className="commercial-attribution">{({ ko: "건당 평균 결제액 · 같은 10분 기준", en: "Average per payment · same 10-minute window", zh: "每笔平均支付额 · 同一10分钟", ja: "1件あたり平均決済額・同じ10分間" })[lang]}</p>}
       <p className="commercial-attribution">{({ ko: "소비활동은 과거 평균 결제금액 등을 고려한 서울시 4단계 등급입니다. 과거 평균 금액이나 증감률 자체가 아니며, 건당 평균은 현재 금액을 현재 건수로 나눈 값입니다.", en: "Seoul’s four activity levels consider past average payments. They are not historical mean amounts or growth rates; the per-payment average uses this window’s amount and count.", zh: "首尔市四级消费活跃度参考过去平均支付金额，不代表历史均额或增减率；每笔平均额按当前时段金额和笔数计算。", ja: "ソウル市の4段階指標は過去の平均決済額などを考慮します。過去の平均額や増減率そのものではなく、1件平均は現在の金額と件数から算出します。" })[lang]}</p>
      </details>
    </div>
  </article>;
}

function StoreDynamicsCard({ presentation }: { presentation: StoreDynamicsPresentation }) {
  return <article className="store-dynamics-card" data-signal-key="store-dynamics">
    <div className="store-dynamics-label">
      <span className="signal-time-state">{presentation.timeState}</span>
      <h4>{presentation.title}</h4>
    </div>
    <div className="store-dynamics-content">
      <p className="store-dynamics-scope">
        <span>{presentation.periodValue}</span>
        <span lang="ko">{presentation.areaValue}</span>
      </p>
      {presentation.period && <p className="signal-row-period">
        <span>{presentation.period.cadenceLabel}</span>
        <small>{presentation.period.publicationNote}</small>
        {presentation.period.cadenceNote && <small>{presentation.period.cadenceNote}</small>}
      </p>}
      <p className="store-dynamics-total">
        <span>{presentation.totalLabel}</span>
        <strong>{presentation.totalValue}</strong>
      </p>
      <p className="store-dynamics-composition">
        {presentation.composition.map((part) => <span key={part}>{part}</span>)}
      </p>
      <p className="store-dynamics-change">
        <span className="store-dynamics-change-title">{presentation.changeTitle}</span>
        {presentation.change.map((part) => <span key={part}>{part}</span>)}
      </p>
      <p className="store-dynamics-meta">
        {presentation.meta.map((line) => <span key={line}>{line}</span>)}
      </p>
    </div>
  </article>;
}

function EventCard({ event, lang, serviceDate }: { event: LiveEventRow; lang: Lang; serviceDate: string }) {
  const suppliedStatus: unknown = event.status;
  const status: EventPresentationStatus = suppliedStatus === "IN_OFFICIAL_PERIOD" || suppliedStatus === "UPCOMING"
    ? suppliedStatus
    : eventStatusForDate(event, serviceDate);
  const localizedOverview=chineseText(lang,event.overview);
  const sourceOriginal=lang==='zh'&&/[\uac00-\ud7a3]/.test(localizedOverview??'');
  const preview = chineseText(lang,eventPreview(event.overview));
  const homepage = safeOfficialEventHomepage(event.homepage);
  const place = [formatEventPlace(event), event.addressDetail?.trim()].filter(Boolean).join(" · ");
  const distance = formatEventDistance(lang, event);
  return <li className="event-card">
    <article>
      <header>
        <span className={`event-status ${status.toLowerCase().replaceAll("_", "-")}`}>
          {status === "IN_OFFICIAL_PERIOD" ? text.eventInOfficialPeriod[lang] : text.eventStartsAfterSelectedDate[lang]}
        </span>
        <h4>{chineseText(lang,[event.categoryName, event.title].filter(Boolean).join(" · "))}</h4>
      </header>
      <p className="event-meta">{lang==='zh'?<>{formatEventPeriod(event)}{place&&<> · <span lang={/[\uac00-\ud7a3]/.test(place)?'ko':undefined}>{/[\uac00-\ud7a3]/.test(place)?'地址原文：':''}{place}</span></>}</>:[formatEventPeriod(event), place].filter(Boolean).join(" · ")}</p>
      {distance && <p className="event-distance">{text.eventDistanceBasis[lang]} {distance}</p>}
      {sourceOriginal&&/[\uac00-\ud7a3]/.test(preview??'')&&<small lang="zh-CN">官方原文（韩语）</small>}
      {preview && <p className="event-preview" lang={sourceOriginal&&/[\uac00-\ud7a3]/.test(preview??'')?'ko':undefined}>{preview}</p>}
      <div className="event-actions">
        {event.overview && <details>
          <summary>{text.eventDetails[lang]}{sourceOriginal?' · 官方原文（韩语）':''}</summary>
          <p className="event-overview" lang={sourceOriginal?'ko':undefined}>{localizedOverview}</p>
        </details>}
        {homepage && <a href={homepage} target="_blank" rel="noopener noreferrer">{text.eventOfficialPage[lang]} <span aria-hidden="true">↗</span></a>}
      </div>
    </article>
  </li>;
}

function EventSignalPanel({ lang, events, eventCount, serviceDate, area }: { lang: Lang; events: LiveEventRow[]; eventCount: number; serviceDate: string; area: AreaId }) {
  const page = useEventPagination(events, area, serviceDate);
  const visibleEvents = page.visible;
  const listId = `event-list-${serviceDate}`;
  if (!events.length) return null;
  return <section className="event-signal-panel" aria-labelledby={`${listId}-title`}>
    <header className="event-panel-head">
      <div>
        <span className="signal-time-state">{signalStructureText.timeState.schedule[lang]}</span>
        <h4 id={`${listId}-title`}>{text.events[lang]}</h4>
      </div>
      <p><strong>{(page.expanded && page.rows.length ? page.rows.length : eventCount).toLocaleString(airportLocale(lang))}{(page.expanded ? page.next !== null : events.length >= 30) ? "+" : ""}</strong>{lang === "en" ? " " : ""}{text.eventCount[lang]} · {text.eventRepresentative[lang]} {Math.min(3, events.length)}</p>
    </header>
    <p className="event-operation-caveat">{text.eventOperationCaveat[lang]}</p>
    <ol className="event-card-list" id={listId}>
      {visibleEvents.map((event, index) => <EventCard
        key={event.contentId ?? `${event.title}-${event.eventStart}-${index}`}
        event={event}
        lang={lang}
        serviceDate={serviceDate}
      />)}
    </ol>
    <EventPaginationControls page={page} lang={lang} />
  </section>;
}

/**
 * One area's short current brief on its own, for screens that need the
 * "where · now · next peak" sentence without the full signal page (the store
 * screen). Same deterministic builder as the home rows and the area page.
 */
export function AreaCurrentBrief({ lang, area, date = null, linkHref, linkLabel }: {
  lang: Lang; area: AreaId; date?: string | null; linkHref?: string; linkLabel?: string;
}) {
  const summary = useLiveSummary(date);
  if (!summary) return <LiveLoadMessage loading={summary === undefined} lang={lang} />;
  return <AreaDemandCard summary={summary} area={area} lang={lang} linkHref={linkHref} linkLabel={linkLabel}/>;
}

export default function LiveSignals({ lang, area, date = null }: { lang: Lang; area: AreaId; date?: string | null }) {
  const summary = useLiveSummary(date);
  if (!summary) return <LiveLoadMessage loading={summary === undefined} lang={lang} />;
  const block = summary.areas[area];
  const arrival = summary.airport.arrivalForecast ?? {
    todayExpectedPassengersTotal: null,
    todayExpectedPassengersByTerminal: {},
    nextExpectedTimeBand: null,
    peakExpectedTimeBand: null,
    passengerForecastRetrievedAt: null,
    forecastCoverage: { all: "UNAVAILABLE" as const, byTerminal: {} },
  };

  // The detail screen reuses the same deterministic builder as the home rows,
  // so the same data can never produce two different sentences.

  /**
   * When a collector last SUCCEEDED, from source health — not from the data
   * row's own `retrieved_at`.
   *
   * Writes are changed-only, so an unchanged row keeps the timestamp of the
   * last time its numbers moved. For a monthly figure that is correct and
   * stable for a month at a time, which would make a perfectly healthy
   * source look like a stalled one. Source health records every successful
   * run, changed or not, so it is the field that separates "the provider has
   * published nothing newer" from "KORETAIL stopped collecting".
   */
  const lastCollected = (sourceId: string): string | null =>
    summary.sources?.find((source) => source.sourceId === sourceId)?.retrievedAt ?? null;

  const rows: SignalRow[] = [];

  const commercialRow = buildCommercialSignalRow(lang, block?.commercial, summary.generatedAt);
  const storeDynamicsPresentation = buildStoreDynamicsPresentation(
    lang, block?.storeDynamics, summary.generatedAt, lastCollected("SEOUL_STORE_DYNAMICS"));

  if (block?.subwayRidership) {
    const subway = block.subwayRidership;
    // The station says its own name. "선정 역" was internal vocabulary that
    // told a visitor nothing about which station the number came from.
    const station = chineseText(lang,formatRepresentativeStations(subway.selectedStations));
    const withStation = (action: string, count: number) =>
      `${station ? `${station} ` : ""}${action} ${formatPeopleValue(lang, count)}${text.foreignPeople[lang]}`;
    rows.push({
      key: "subway_ridership",
      group: "movement",
      timeState: signalStructureText.timeState.recent[lang],
      label: text.subwayRidership[lang],
      value: withStation(text.subwayAlighting[lang], subway.alightingCount),
      detail: withStation(text.subwayBoarding[lang], subway.boardingCount),
      // The limitation stays: a daily station count is not unique people and
      // not visitors to the commercial area around it.
      note: `${subway.referenceDate} · ${text.subwayNote[lang]}`,
    });
  }

  if (block?.foreignPresence) {
    rows.push({
      key: "foreign_presence",
      group: "movement",
      timeState: signalStructureText.timeState.delayed[lang],
      label: text.foreignPresence[lang],
      value: `${formatPeopleValue(lang, block.foreignPresence.value)} ${text.foreignPeople[lang]}`,
      note: `${kstStamp(block.foreignPresence.referenceAt)} KST · ${text.foreignNote[lang]}`,
      detail: contextText(lang,'해당 시각에 머문 단기체류 외국인 추정 인구 · 같은 시각의 과거 비교 자료 부족','Estimated short-stay foreign people present at that hour · matching historical comparison unavailable','该时刻短期停留外国人在场人口推算 · 同时刻历史比较资料不足','その時刻に滞在した短期滞在外国人の推定人口・同時刻の過去比較資料不足'),
      period: describeSourcePeriod({
        cadence: "DAILY",
        referencePeriod: block.foreignPresence.referenceAt,
        retrievedAt: lastCollected("SEOUL_SHORT_STAY_FOREIGN_LIVING_POPULATION"),
        nowIso: summary.generatedAt,
      }, lang) ?? undefined,
    });
  }

  if (block?.foreignPurposeMobility) {
    const mobility = block.foreignPurposeMobility;
    if (mobility.shopping != null || mobility.tourism != null) rows.push({
      key: "foreign_purpose_mobility",
      group: "movement",
      timeState: signalStructureText.timeState.delayed[lang],
      label: text.foreignPurpose[lang],
      value: unverifiedPurposeText[lang],
      note: `${mobility.referenceDate} · ${text.foreignPurposeNote[lang]}`,
      detail: contextText(lang,'해당일 도착 행정동의 추정 이동량 · 중복 이동 포함 · 같은 조건의 과거 비교 자료 부족. 쇼핑 목적은 백화점·프리미엄 아울렛 기준입니다.','Estimated movements into the mapped districts that day; repeat movements included. Matching past comparison unavailable. Shopping covers department stores and premium outlets.','该日进入所选行政区的推算移动量，包含重复移动。相同条件历史比较资料不足。购物指百货商场与高端奥特莱斯。','当日の対象行政洞への推定移動量・重複移動を含みます。同条件の過去比較資料不足。買い物目的は百貨店・プレミアムアウトレット基準です。'),
      period: describeSourcePeriod({
        cadence: "MONTHLY",
        referencePeriod: mobility.referenceDate,
        retrievedAt: lastCollected("SEOUL_FOREIGN_PURPOSE_MOBILITY"),
        nowIso: summary.generatedAt,
      }, lang) ?? undefined,
    });
  }

  if (block?.weather.length) {
    const next12 = block.weather.slice(0, 12);
    const maxPop = Math.max(...next12.map((row) => row.precipitationProbability ?? 0));
    // A published zero is a fact; an absent POP field cannot become 0%.
    const hasProbability = next12.some(row => row.precipitationProbability !== null && row.precipitationProbability !== undefined);
    const firstTemp = next12.find((row) => row.temperatureTenthC !== null)?.temperatureTenthC;
    const condition = next12.find((row) => row.conditionCode)?.conditionCode;
    const parts: string[] = [];
    const kinds: WeatherMetricKind[] = [];
    const fact = (kind: WeatherMetricKind, value: string) => { kinds.push(kind); parts.push(value); };
    if (condition && conditionLabels[condition]) fact(condition === 'clear' ? 'sun' : condition === 'snow' ? 'snow' : condition === 'rain' || condition === 'shower' ? 'rain' : 'cloud', conditionLabels[condition][lang]);
    if (firstTemp !== null && firstTemp !== undefined) fact('temperature', `${(firstTemp / 10).toFixed(0)}°C`);
    if (hasProbability) fact('rain', `${text.rainChance[lang]} ${Math.round(maxPop)}%`);

    // Richer categories from the same KMA response. Each is shown only where
    // the provider actually published it: a missing category is left out
    // rather than rendered as a zero, and an amount appears only when KMA gave
    // an exact one — "1.0mm 미만" is a bound, so it stays out of the reader's
    // numbers and remains in D1 as the raw official record.
    const firstOf = (pick: (row: LiveWeatherRow) => number | null | undefined) =>
      next12.map(pick).find((value) => value !== null && value !== undefined);
    const humidity = firstOf((row) => row.humidityPercent);
    const wind = firstOf((row) => row.windSpeedTenthMps);
    const rainfall = next12.find((row) => row.precipitationAmountKind === "EXACT"
      && row.precipitationAmountTenthMm !== null && row.precipitationAmountTenthMm !== undefined);
    const dayLow = firstOf((row) => row.dailyMinTemperatureTenthC);
    const dayHigh = firstOf((row) => row.dailyMaxTemperatureTenthC);

    const observation = block?.context?.weather ?? null;
    if (humidity !== undefined) fact('humidity', `${text.humidity[lang]} ${Math.round(humidity)}%`);
    if (wind !== undefined) fact('wind', `${text.wind[lang]} ${(wind / 10).toFixed(1)}m/s`);
    if (rainfall) fact('rain', `${text.rainfall[lang]} ${(rainfall.precipitationAmountTenthMm! / 10).toFixed(1)}mm`);
    if (dayLow !== undefined) fact('temperature', `${text.dayLow[lang]} ${(dayLow / 10).toFixed(0)}°C`);
    if (dayHigh !== undefined) fact('temperature', `${text.dayHigh[lang]} ${(dayHigh / 10).toFixed(0)}°C`);

    // One practical line under the numbers. 맑음 · 24°C · 강수확률 is correct
    // and useless to someone deciding whether to take a jacket; this says what
    // to do about it, from the same official fields, by fixed rules.
    // The air-quality half comes from Seoul's real-time city data, not from
    // KMA — a different source and a different reading, so the row's note
    // names both rather than letting one sentence imply one provider.
    const airGrades = observation && describeObservationAge(observation.observedAt, summary.generatedAt, lang).isNow ? observation : null;
    const guide = buildWeatherGuide({
      temperatureTenthC: firstTemp ?? null,
      dailyMinTemperatureTenthC: dayLow ?? null,
      dailyMaxTemperatureTenthC: dayHigh ?? null,
      precipitationProbability: hasProbability ? maxPop : null,
      precipitationTypeCode: next12.find((row) => row.precipitationTypeCode)?.precipitationTypeCode ?? null,
      humidityPercent: humidity ?? null,
      windSpeedTenthMps: wind ?? null,
    }, lang, { pm10Grade: airGrades?.pm10Grade ?? null, pm25Grade: airGrades?.pm25Grade ?? null });
    const quotedAir = Boolean(worseAirGrade(airGrades?.pm10Grade, airGrades?.pm25Grade));

    if (parts.length || guide) rows.push({
      key: "weather",
      group: "now",
      timeState: signalStructureText.timeState.forecast[lang],
      label: text.weather[lang],
      value: parts.join(" · "),
      detail: guide ?? undefined,
      note: quotedAir ? `${text.sourceKma[lang]} · ${text.sourceAirQuality[lang]}` : text.sourceKma[lang],
      weather: {
        kinds,
        issuedAt: next12.flatMap(row => {
          const issued = (row as LiveWeatherRow & { issuedAt?: string }).issuedAt;
          return issued ? [issued] : [];
        }),
        targetAt: next12.map(row => row.targetAt),
        showScene: ![observation?.temperature, observation?.humidity, observation?.wind, observation?.pm10, observation?.pm25]
          .some(value => value !== null && value !== undefined),
      },
    });
  }

  if (block?.sales) {
    rows.push({
      key: "sales",
      group: "past",
      timeState: signalStructureText.timeState.historical[lang],
      label: text.sales[lang],
      value: formatKrwCompact(lang, block.sales.totalAmount),
      note: `${text.sourceSales[lang]} · ${text.salesNote[lang]}`,
      detail: contextText(lang,'해당 분기의 추정 매출 합계 · 같은 범위의 과거 비교 자료 부족','Estimated sales total for the reference quarter · matching past comparison unavailable','该季度推算销售额合计 · 相同范围历史比较资料不足','基準四半期の推定売上合計・同範囲の過去比較資料不足'),
      period: describeSourcePeriod({
        cadence: "QUARTERLY",
        referencePeriod: block.sales.quarterCode,
        retrievedAt: lastCollected("SEOUL_ESTIMATED_SALES"),
        nowIso: summary.generatedAt,
      }, lang) ?? undefined,
    });
  }

  // A5 ARRIVAL is a forecast and only area-independent background context.
  // It is never presented as observed airport arrivals, Seoul visitors, or a
  // causal/leading signal for demand in a specific Seoul area.
  // Whole-day total and peak stay hidden unless all aggregate T1/T2 bands prove
  // COMPLETE coverage; the next band is independently safe only when both
  // terminals have the exact same active interval.
  const arrivalNote = [
    text.arrivalSource[lang],
    arrival.passengerForecastRetrievedAt
      ? formatHumanFreshness(arrival.passengerForecastRetrievedAt, summary.generatedAt, lang, "collected")
      : null,
  ].filter(Boolean).join(" · ");
  if (arrival.forecastCoverage.all === "COMPLETE" && arrival.todayExpectedPassengersTotal !== null) {
    const terminalBreakdown = Object.entries(arrival.todayExpectedPassengersByTerminal)
      .filter((entry): entry is [string, number] => entry[1] !== null)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([terminal, value]) => `${terminal} ${Math.round(value).toLocaleString(airportLocale(lang))}${text.arrivalUnit[lang]}`)
      .join(" · ");
    rows.push({
      key: "arrival_today",
      group: "today-next",
      timeState: signalStructureText.timeState.forecast[lang],
      label: text.arrivalToday[lang],
      value: `${Math.round(arrival.todayExpectedPassengersTotal).toLocaleString(airportLocale(lang))}${text.arrivalUnit[lang]}`,
      note: [
        arrivalNote,
        terminalBreakdown ? `${text.arrivalTerminalBreakdown[lang]} · ${terminalBreakdown}` : null,
      ].filter(Boolean).join(" · "),
    });
  }

  if (arrival.nextExpectedTimeBand) {
    const band = arrival.nextExpectedTimeBand;
    rows.push({
      key: "arrival_next",
      group: "today-next",
      timeState: signalStructureText.timeState.forecast[lang],
      label: text.arrivalNext[lang],
      value: `${Math.round(band.expectedPassengers).toLocaleString(airportLocale(lang))}${text.arrivalUnit[lang]} · ${formatKstBand(band.targetStartAt, band.targetEndAt).replace(" KST", "")}`,
      note: arrivalNote,
    });
  }

  if (arrival.forecastCoverage.all === "COMPLETE" && arrival.peakExpectedTimeBand) {
    const band = arrival.peakExpectedTimeBand;
    rows.push({
      key: "arrival_peak",
      group: "today-next",
      timeState: signalStructureText.timeState.forecast[lang],
      label: text.arrivalPeak[lang],
      value: `${formatKstBand(band.targetStartAt, band.targetEndAt).replace(" KST", "")} · ${Math.round(band.expectedPassengers).toLocaleString(airportLocale(lang))}${text.arrivalUnit[lang]}`,
      note: arrivalNote,
    });
  }

  const events = block?.events ?? [];

  const groupIds: SignalGroupId[] = ["now", "movement", "today-next", "past"];

  return (
    <section className="live-signals" aria-labelledby="live-signals-title">
      <AreaDemandCard summary={summary} area={area} lang={lang}/>
      <SeoulFlowModels summary={summary} area={area} lang={lang}/>
      <div className="section-head">
        <div>
          <p className="eyebrow">{text.eyebrow}</p>
          <h2 data-heading="section" id="live-signals-title"><span className="heading-marker" aria-hidden="true"/>{text.title[lang]}</h2>
        </div>
      </div>
      <p className="section-intro">{text.intro[lang]}</p>
      <div className="signal-groups">
        {groupIds.map((groupId) => {
          const groupRows = rows.filter((row) => row.group === groupId);
          const hasSpecial = (groupId === "now" && commercialRow)
            || (groupId === "today-next" && events.length)
            || (groupId === "past" && storeDynamicsPresentation);
          if (!groupRows.length && !hasSpecial) return null;
          const groupCopy = signalStructureText.groups[groupId];
          const firstNow = groupId === "now" ? groupRows.filter((row) => row.key === "realtime") : [];
            const weatherRow = groupId === "now" ? groupRows.find((row) => row.key === "weather") : undefined;
            const remainingNow = groupId === "now" ? groupRows.filter((row) => row.key !== "realtime" && row.key !== "weather") : [];
            const observedWeather = block?.context?.weather;
            const hasObservation = [observedWeather?.pm10, observedWeather?.pm25].some(value => value !== null && value !== undefined) || [observedWeather?.pm10Grade, observedWeather?.pm25Grade].some(grade => Boolean(grade?.trim()));
          return <section className={`signal-group signal-group-${groupId}`} key={groupId}>
            <header className="signal-group-head">
              <h3 data-heading="subsection" className="signal-group-title"><span className="heading-marker" aria-hidden="true"/>{groupCopy.title[lang]}</h3>
              <span>{groupCopy.state[lang]}</span>
            </header>
            <div className="signal-group-body">
              {groupId === "now" ? <>
                {firstNow.map((row) => <SignalRowCard key={row.key} row={row} lang={lang} />)}
                {commercialRow && <CommercialSignalCard signal={commercialRow} lang={lang} />}
                <SeoulContextCard context={block?.context} lang={lang} nowIso={summary.generatedAt} showWeather={false}/>
                {(hasObservation || weatherRow) && <section className="seoul-weather-panel" aria-labelledby={`seoul-weather-${area}`}>
                  <h3 id={`seoul-weather-${area}`}>{contextText(lang,'날씨','Weather','天气','天気')}</h3>
                  <SeoulObservationScene context={block?.context} lang={lang} nowIso={summary.generatedAt} metricScenes airOnly/>
                  {weatherRow && <SignalRowCard row={{...weatherRow,label:contextText(lang,'날씨','Weather','天气','天気')}} lang={lang}/>}
                </section>}
                {remainingNow.map((row) => <SignalRowCard key={row.key} row={row} lang={lang} />)}
              </> : null}
              {groupId === "today-next" && events.length > 0 && <EventSignalPanel
                lang={lang}
                events={events}
                area={area}
                eventCount={block?.eventCount ?? events.length}
                serviceDate={summary.serviceDateKst}
              />}
              {groupId !== "now" && groupRows.map((row) => <SignalRowCard key={row.key} row={row} lang={lang} />)}
              {groupId === "past" && storeDynamicsPresentation && <StoreDynamicsCard presentation={storeDynamicsPresentation} />}
            </div>
          </section>;
        })}
      </div>
    </section>
  );
}

/**
 * The today screen's signals as the shell shows them below the area tabs: the
 * date navigator, its scope note, then the home brief or the area's signals.
 * The shell renders this one component in place of the three it rendered
 * there, so that it can load this module with the screens that show it (see
 * app/retailpulse-app.tsx); the markup is unchanged.
 */
export function TodaySignals({ lang, date, onDateChange, historyHref, homeVisible, selected, onSelect }: {
  lang: Lang; date: string | null; onDateChange: (date: string | null) => void; historyHref: string;
  homeVisible: boolean; selected: AreaId; onSelect: (area: AreaId) => void;
}) {
  return <>
    <DateNavigator lang={lang} date={date} onChange={onDateChange} historyHref={historyHref} />
    <DateScopeNote lang={lang} date={date} />
    {homeVisible ? <HomeTodayBrief lang={lang} selected={selected} onSelect={onSelect} date={date} /> : <LiveSignals lang={lang} area={selected} date={date} />}
  </>;
}
