"use client";

import { useEffect, useState } from "react";
import type { Lang } from "./retailpulse-data";

type AreaId = "myeongdong" | "hongdae" | "seongsu";

interface LiveRealtime {
  congestionLevel: number;
  congestionLabel: string;
  populationMin: number;
  populationMax: number;
  observedAt: string;
  freshness: "LIVE" | "STALE";
}

interface LiveWeatherRow {
  targetAt: string;
  precipitationProbability: number | null;
  temperatureTenthC: number | null;
  conditionCode: string | null;
}

interface LiveEventRow {
  title: string;
  eventStart: string;
  eventEnd: string | null;
  distanceM: number | null;
}

interface LiveSales {
  quarterCode: string;
  tradeAreaName: string | null;
  totalAmount: number;
  industryCount: number;
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

interface LiveAreaBlock {
  realtime: LiveRealtime | null;
  weather: LiveWeatherRow[];
  events: LiveEventRow[];
  sales: LiveSales | null;
  foreignPresence: LiveForeignPresence | null;
}

interface LiveCongestionRow {
  terminal: string;
  zone: string;
  waitingCount: number;
  waitTimeMinutes: number | null;
  observedAt: string;
  freshness: "LIVE" | "STALE";
}

interface LiveScheduledRow {
  terminal: string | null;
  flights: number;
  firstTime: string;
  lastTime: string;
}

export interface LiveSummary {
  mode: string;
  generatedAt: string;
  areas: Partial<Record<AreaId, LiveAreaBlock>>;
  airport: { congestion: LiveCongestionRow[]; departuresTrackedToday: number | null; scheduled: LiveScheduledRow[] };
}

let cachedSummary: LiveSummary | null | undefined;
let pendingSummary: Promise<LiveSummary | null> | null = null;

async function loadSummary(): Promise<LiveSummary | null> {
  if (cachedSummary !== undefined) return cachedSummary;
  pendingSummary ??= fetch("/api/live/summary", { headers: { accept: "application/json" } })
    .then(async (response) => {
      if (!response.ok) return null;
      const payload = await response.json() as LiveSummary;
      return payload.mode === "live-summary" ? payload : null;
    })
    .catch(() => null)
    .then((value) => {
      cachedSummary = value;
      return value;
    });
  return pendingSummary;
}

export function useLiveSummary(): LiveSummary | null {
  const [summary, setSummary] = useState<LiveSummary | null>(cachedSummary ?? null);
  useEffect(() => {
    let active = true;
    loadSummary().then((value) => { if (active && value) setSummary(value); });
    return () => { active = false; };
  }, []);
  return summary;
}

const text = {
  eyebrow: "OFFICIAL DATA SIGNALS · KST",
  title: { ko: "오늘 수요를 움직이는 신호", en: "Signals moving demand today", zh: "今日影响需求的信号", ja: "今日の需要を動かすシグナル" },
  intro: {
    ko: "공식 데이터로 확인된 참고 신호입니다. 현재 예시 수요지수 계산에는 포함되지 않으며, 신호는 매출이나 방문자 수가 아닙니다.",
    en: "Official reference signals only. They do not yet calculate the Demo Demand Index, and a signal is not sales or visitor counts.",
    zh: "仅显示官方参考信号，目前不参与演示需求指数计算；信号不等于销售额或访客数。",
    ja: "公式データによる参考シグナルです。現在のデモ需要指数の計算には含まれず、売上や来訪者数でもありません。",
  },
  realtime: { ko: "실시간 활동", en: "Live activity", zh: "实时活动", ja: "リアルタイム活動" },
  realtimePeople: { ko: "실시간 인구", en: "people now", zh: "实时人口", ja: "現在人口" },
  weather: { ko: "날씨", en: "Weather", zh: "天气", ja: "天気" },
  rainChance: { ko: "강수확률 최대", en: "max rain chance", zh: "最大降水概率", ja: "降水確率 最大" },
  events: { ko: "주변 행사", en: "Nearby events", zh: "周边活动", ja: "周辺イベント" },
  eventCount: { ko: "건 진행·예정", en: "running or upcoming", zh: "项进行或即将举行", ja: "件 開催・予定" },
  noEvents: { ko: "확인된 행사 없음", en: "No events found", zh: "暂无确认活动", ja: "確認済みイベントなし" },
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
  airport: { ko: "공항 출국 대기", en: "Airport checkpoint waits", zh: "机场出境等候", ja: "空港出国待ち" },
  airportPeople: { ko: "명 대기 중", en: "people waiting", zh: "人等候中", ja: "人待機中" },
  airportFlights: { ko: "오늘 출발 운항", en: "departures today", zh: "今日出发航班", ja: "本日の出発便" },
  airportScheduled: { ko: "정기운항 편성", en: "scheduled service", zh: "定期航班", ja: "定期運航" },
  flightUnit: { ko: "편", en: " flights", zh: "班", ja: "便" },
  basis: { ko: "기준", en: "as of", zh: "截至", ja: "基準" },
  stale: { ko: "지연됨", en: "STALE", zh: "已延迟", ja: "遅延" },
  sourceSeoul: { ko: "서울 실시간 도시데이터", en: "Seoul real-time city data", zh: "首尔实时城市数据", ja: "ソウルリアルタイム都市データ" },
  sourceKma: { ko: "기상청 단기예보", en: "KMA short-term forecast", zh: "气象厅短期预报", ja: "気象庁短期予報" },
  sourceKto: { ko: "한국관광공사 TourAPI", en: "KTO TourAPI", zh: "韩国观光公社 TourAPI", ja: "韓国観光公社 TourAPI" },
  sourceSales: { ko: "서울시 상권분석서비스", en: "Seoul commercial-district analysis", zh: "首尔商圈分析服务", ja: "ソウル商圏分析サービス" },
  sourceAirport: { ko: "인천공항 출국장 혼잡도", en: "Incheon departure-hall congestion", zh: "仁川机场出境区拥挤度", ja: "仁川空港出国場混雑度" },
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

function formatKstClock(value: string, lang: Lang): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const formatter = new Intl.DateTimeFormat(lang === "ko" ? "ko-KR" : lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-GB", {
    timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  return formatter.format(parsed);
}

function formatPeopleRange(lang: Lang, min: number, max: number): string {
  const locale = lang === "ko" ? "ko-KR" : lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-US";
  return `${min.toLocaleString(locale)}–${max.toLocaleString(locale)}`;
}

function formatPeopleValue(lang: Lang, value: number): string {
  const locale = lang === "ko" ? "ko-KR" : lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-US";
  return value.toLocaleString(locale, { maximumFractionDigits: 1 });
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
  return `${Math.round(eok).toLocaleString(lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "ko-KR")}${unit}`;
}

export default function LiveSignals({ lang, area }: { lang: Lang; area: AreaId }) {
  const summary = useLiveSummary();
  if (!summary) return null;
  const block = summary.areas[area];
  const congestion = summary.airport.congestion;
  const totalWaiting = congestion.reduce((sum, row) => sum + row.waitingCount, 0);
  const trackedFlights = summary.airport.departuresTrackedToday;
  const scheduled = summary.airport.scheduled ?? [];
  const hasArea = Boolean(block && (block.realtime || block.foreignPresence || block.weather.length || block.events.length || block.sales));
  if (!hasArea && !congestion.length && !trackedFlights && !scheduled.length) return null;

  const rows: Array<{ key: string; label: string; value: string; note: string; state?: "LIVE" | "STALE" }> = [];

  if (block?.realtime) {
    const level = congestionLabels[block.realtime.congestionLevel]?.[lang] ?? block.realtime.congestionLabel;
    rows.push({
      key: "realtime",
      label: text.realtime[lang],
      value: `${level} · ${formatPeopleRange(lang, block.realtime.populationMin, block.realtime.populationMax)}`,
      note: `${text.sourceSeoul[lang]} · ${text.basis[lang]} ${formatKstClock(block.realtime.observedAt, lang)}`,
      state: block.realtime.freshness,
    });
  }

  if (block?.foreignPresence) {
    const productId = block.foreignPresence.productVersion.split(":", 1)[0] || "OA-23018";
    rows.push({
      key: "foreign_presence",
      label: text.foreignPresence[lang],
      value: `${formatPeopleValue(lang, block.foreignPresence.value)} ${text.foreignPeople[lang]}`,
      note: `${text.foreignNote[lang]} · ${text.basis[lang]} ${formatKstClock(block.foreignPresence.referenceAt, lang)} · ${productId}`,
    });
  }

  if (block?.weather.length) {
    const next12 = block.weather.slice(0, 12);
    const maxPop = Math.max(...next12.map((row) => row.precipitationProbability ?? 0));
    const firstTemp = next12.find((row) => row.temperatureTenthC !== null)?.temperatureTenthC;
    const condition = next12.find((row) => row.conditionCode)?.conditionCode;
    const parts: string[] = [];
    if (condition && conditionLabels[condition]) parts.push(conditionLabels[condition][lang]);
    if (firstTemp !== null && firstTemp !== undefined) parts.push(`${(firstTemp / 10).toFixed(0)}°C`);
    parts.push(`${text.rainChance[lang]} ${maxPop}%`);
    rows.push({
      key: "weather",
      label: text.weather[lang],
      value: parts.join(" · "),
      note: text.sourceKma[lang],
    });
  }

  if (block?.events.length) {
    rows.push({
      key: "events",
      label: text.events[lang],
      value: `${block.events.length}${lang === "en" ? " " : ""}${text.eventCount[lang]} · ${block.events[0].title}`,
      note: text.sourceKto[lang],
    });
  }

  if (block?.sales) {
    rows.push({
      key: "sales",
      label: text.sales[lang],
      value: `${formatKrwCompact(lang, block.sales.totalAmount)} · ${block.sales.quarterCode.slice(0, 4)}Q${block.sales.quarterCode.slice(4)}`,
      note: `${text.sourceSales[lang]} · ${text.salesNote[lang]}`,
    });
  }

  if (congestion.length) {
    const latest = congestion[0];
    rows.push({
      key: "airport",
      label: text.airport[lang],
      value: `${totalWaiting.toLocaleString(lang === "ko" ? "ko-KR" : lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-US")} ${text.airportPeople[lang]}`,
      note: `${text.sourceAirport[lang]} · ${text.basis[lang]} ${formatKstClock(latest.observedAt, lang)}`,
      state: latest.freshness,
    });
  }


  if (trackedFlights) {
    rows.push({
      key: "airport_flights",
      label: text.airportFlights[lang],
      value: `${trackedFlights.toLocaleString()}${text.flightUnit[lang]}`,
      note: localTextAirport(lang, "실제 운항편 수 · 승객 수 아님", "Actual flights · not passenger count", "实际航班数 · 非旅客人数", "実運航便数 · 旅客数ではありません"),
    });
  }

  if (scheduled.length) {
    const total = scheduled.reduce((sum, row) => sum + Number(row.flights), 0);
    const terminals = scheduled.map((row) => row.terminal).filter(Boolean).join(" · ");
    rows.push({
      key: "airport_scheduled",
      label: text.airportScheduled[lang],
      value: `${terminals} · ${total.toLocaleString()}${text.flightUnit[lang]}`,
      note: localTextAirport(lang, "미래 정기운항 · 실제 당일 운항과 별도", "Future schedule · separate from actual operations", "未来定期航班 · 与当日实际航班分开", "将来の定期運航 · 当日の実運航とは別"),
    });
  }

  if (!rows.length) return null;

  return (
    <section className="live-signals" aria-labelledby="live-signals-title">
      <div className="section-head">
        <div>
          <p className="eyebrow">{text.eyebrow}</p>
          <h2 id="live-signals-title">{text.title[lang]}</h2>
        </div>
        <span className="official-label">OFFICIAL DATA</span>
      </div>
      <p className="section-intro">{text.intro[lang]}</p>
      <div className="live-signal-rows">
        {rows.map((row, index) => (
          <p key={row.key}>
            <span>0{index + 1}</span>
            <strong>{row.label}</strong>
            <b>{row.value}</b>
            <small>{row.note}{row.state === "STALE" ? ` · ${text.stale[lang]}` : ""}</small>
          </p>
        ))}
      </div>
    </section>
  );
}

function localTextAirport(lang: Lang, ko: string, en: string, zh: string, ja: string): string {
  return { ko, en, zh, ja }[lang];
}
