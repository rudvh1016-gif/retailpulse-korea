/**
 * The 10–30 second briefing a tourism-information worker reads before a
 * shift. It is deliberately a short decision surface rather than a catalogue
 * of every KORETAIL dataset.
 *
 * Every line is a deterministic reading of already-collected official data.
 * Missing evidence removes the line; nothing is invented to fill the list.
 * Background statistics such as short-stay foreign living population and
 * airport arrivals do not belong here — the Tourism Desk renders those lower
 * on the page with their own reference periods and limitations.
 */
export type DeskLang = "ko" | "en" | "zh" | "ja";

export interface TourismSubwayComparison {
  baselineDates: string[];
  baselineAlightingCount: number;
  /** Signed percentage change multiplied by ten: 124 means +12.4%. */
  changeTenthsPercent: number;
}

export interface TourismSubwayTrend {
  observedDayCount: number;
  earliestReferenceDate: string | null;
  previousDay: TourismSubwayComparison | null;
  sameWeekdayLastWeek: TourismSubwayComparison | null;
  recentSevenDayAverage: TourismSubwayComparison | null;
  fourWeekSameWeekdayAverage: TourismSubwayComparison | null;
}

export interface TourismDeskInput {
  crowding: {
    /** The canonical Seoul level, 1–4. Never pass the provider's Korean label. */
    congestionLevel: number;
    populationMin: number;
    populationMax: number;
    observedAt: string;
  } | null;
  /** The busiest official Seoul forecast band still ahead of the reader. */
  crowdForecast: {
    targetAt: string;
    congestionLevel: number;
    dayOffset: "TODAY" | "TOMORROW" | "LATER";
  } | null;
  /** Already-built deterministic weather sentence, or null when KMA published too little. */
  weatherGuide: string | null;
  todayEvent: {
    title: string;
    categoryName: string | null;
    /** A date-range check, not a claim that the venue is operating right now. */
    status: "IN_OFFICIAL_PERIOD" | "UPCOMING";
  } | null;
  subway: {
    boardingCount: number;
    alightingCount: number;
    referenceDate: string;
    selectedStations: string;
    trend: TourismSubwayTrend;
  } | null;
}

export interface TourismDeskLine {
  key: "crowding" | "forecast" | "weather" | "event" | "subway";
  /** The fact. */
  text: string;
  /** What that fact is, and what it is not. Never optional. */
  basis: string;
}

const LOCALE: Record<DeskLang, string> = { ko: "ko-KR", en: "en-GB", zh: "zh-CN", ja: "ja-JP" };

const CROWD_STATUS: Record<number, Record<DeskLang, string>> = {
  1: { ko: "여유", en: "Calm", zh: "宽松", ja: "余裕" },
  2: { ko: "보통", en: "Normal", zh: "一般", ja: "普通" },
  3: { ko: "약간 붐빔", en: "Somewhat busy", zh: "略拥挤", ja: "やや混雑" },
  4: { ko: "붐빔", en: "Crowded", zh: "拥挤", ja: "混雑" },
};

function clock(iso: string, lang: DeskLang): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(LOCALE[lang], {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(parsed);
}

function day(value: string, lang: DeskLang): string {
  const trimmed = value.trim();
  const bareDay = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  let year: string;
  let month: string;
  let date: string;
  if (bareDay) {
    [, year, month, date] = bareDay;
  } else {
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return value;
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(parsed);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value;
    year = part("year") ?? "";
    month = part("month") ?? "";
    date = part("day") ?? "";
    if (!year || !month || !date) return value;
  }
  const m = Number(month);
  const d = Number(date);
  return lang === "en" ? `${year}-${month}-${date}` : `${m}${lang === "ko" ? "월 " : "月"}${d}${lang === "ko" ? "일" : "日"}`;
}

function crowdingBasis(lang: DeskLang, observedAt: string): string {
  const at = clock(observedAt, lang);
  return lang === "ko" ? `서울시 실시간 생활인구 상태${at ? ` · ${at} 관측` : ""} · 관광객 수가 아닙니다`
    : lang === "en" ? `Seoul live living-population status${at ? ` · observed ${at}` : ""} · not a count of tourists`
    : lang === "zh" ? `首尔市实时生活人口状态${at ? ` · ${at}观测` : ""} · 并非游客人数`
    : `ソウル市のリアルタイム生活人口状況${at ? ` · ${at}観測` : ""} · 観光客数ではありません`;
}

const BASIS = {
  forecast: {
    ko: "서울시 공식 생활인구 예측 · 관광객이나 매장 방문객 예측이 아닙니다",
    en: "Seoul official living-population forecast · not a tourist or store-visitor forecast",
    zh: "首尔市官方生活人口预测 · 并非游客或门店访客预测",
    ja: "ソウル市の公式生活人口予測 · 観光客や店舗来訪者の予測ではありません",
  },
  weather: {
    ko: "기상청 단기예보 기준",
    en: "Based on the KMA short-range forecast",
    zh: "以韩国气象厅短期预报为准",
    ja: "気象庁の短期予報基準",
  },
  event: {
    ko: "한국관광공사 공식 행사기간 기준 · 실제 운영 여부와 시간은 공식 안내를 확인하세요",
    en: "Based on the official KTO event period · check the official notice for actual operation and hours",
    zh: "以韩国观光公社官方活动期间为准 · 实际开放与时间请查看官方公告",
    ja: "韓国観光公社の公式イベント期間基準 · 実際の開催有無と時間は公式案内をご確認ください",
  },
} as const;

function forecastBand(input: NonNullable<TourismDeskInput["crowdForecast"]>, lang: DeskLang): string | null {
  const start = new Date(input.targetAt);
  if (Number.isNaN(start.getTime())) return null;
  const startText = clock(start.toISOString(), lang);
  const endText = clock(new Date(start.getTime() + 3_600_000).toISOString(), lang);
  if (!startText || !endText) return null;
  const when = input.dayOffset === "TODAY"
    ? { ko: "오늘", en: "today", zh: "今天", ja: "今日" }[lang]
    : input.dayOffset === "TOMORROW"
      ? { ko: "내일", en: "tomorrow", zh: "明天", ja: "明日" }[lang]
      : day(input.targetAt, lang);
  return `${when} ${startText}–${endText}`;
}

type SubwayComparisonKind = "sameWeekdayLastWeek" | "recentSevenDayAverage" | "previousDay";

function usableComparison(
  value: TourismSubwayComparison | null,
  expectedBaselineDates: number,
): value is TourismSubwayComparison {
  return value !== null
    && value.baselineDates.length === expectedBaselineDates
    && Number.isFinite(value.baselineAlightingCount)
    && value.baselineAlightingCount > 0
    && Number.isFinite(value.changeTenthsPercent);
}

function preferredSubwayComparison(trend: TourismSubwayTrend): {
  kind: SubwayComparisonKind;
  value: TourismSubwayComparison;
} | null {
  if (usableComparison(trend.sameWeekdayLastWeek, 1)) {
    return { kind: "sameWeekdayLastWeek", value: trend.sameWeekdayLastWeek };
  }
  if (usableComparison(trend.recentSevenDayAverage, 7)) {
    return { kind: "recentSevenDayAverage", value: trend.recentSevenDayAverage };
  }
  if (usableComparison(trend.previousDay, 1)) return { kind: "previousDay", value: trend.previousDay };
  return null;
}

function signedPercent(tenths: number, lang: DeskLang): string {
  const magnitude = Math.abs(tenths) / 10;
  const rendered = new Intl.NumberFormat(LOCALE[lang], {
    minimumFractionDigits: Number.isInteger(magnitude) ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(magnitude);
  return `${tenths > 0 ? "+" : tenths < 0 ? "−" : ""}${rendered}%`;
}

function subwayLine(
  subway: NonNullable<TourismDeskInput["subway"]>,
  lang: DeskLang,
): TourismDeskLine | null {
  const selected = preferredSubwayComparison(subway.trend);
  if (!selected) return null;
  const percent = signedPercent(selected.value.changeTenthsPercent, lang);
  const comparison = selected.kind === "sameWeekdayLastWeek"
    ? { ko: `지난주 같은 요일 대비 ${percent}`, en: `${percent} vs the same weekday last week`, zh: `较上周同一星期几 ${percent}`, ja: `先週の同じ曜日比 ${percent}` }[lang]
    : selected.kind === "recentSevenDayAverage"
      ? { ko: `최근 7일 평균 대비 ${percent}`, en: `${percent} vs the recent 7-day average`, zh: `较最近7日平均 ${percent}`, ja: `直近7日平均比 ${percent}` }[lang]
      : { ko: `전일 대비 ${percent}`, en: `${percent} vs the previous day`, zh: `较前一日 ${percent}`, ja: `前日比 ${percent}` }[lang];
  const text = lang === "ko" ? `${subway.selectedStations} 하차 흐름 · ${comparison}`
    : lang === "en" ? `${subway.selectedStations} alighting count · ${comparison}`
    : lang === "zh" ? `${subway.selectedStations} 下车次数 · ${comparison}`
    : `${subway.selectedStations} 降車件数 · ${comparison}`;
  const recentAverageNote = selected.kind === "recentSevenDayAverage"
    ? {
      ko: " · 정확히 직전 7일의 일일 집계 평균이며 같은 요일 보정이 아닙니다",
      en: " · the baseline is the immediately preceding seven calendar days, not a same-weekday adjustment",
      zh: " · 基准为紧接此前7个日历日的平均，并非同星期几校正",
      ja: " · 比較基準は直前7暦日の日次集計平均で、同じ曜日への補正ではありません",
    }[lang]
    : "";
  const dateText = day(subway.referenceDate, lang);
  const basis = lang === "ko" ? `서울교통공사 ${dateText} 일일 하차 건수${recentAverageNote} · 개찰구 집계이며 고유 방문객 수나 지역 전체 방문객 수가 아닙니다`
    : lang === "en" ? `Seoul Metro daily alighting count for ${dateText}${recentAverageNote} · gate counts, not unique visitors or total area visitors`
    : lang === "zh" ? `首尔交通公社${dateText}日度下车次数${recentAverageNote} · 为闸机统计，并非独立访客或整个地区到访人数`
    : `ソウル交通公社の${dateText}の日次降車件数${recentAverageNote} · 改札集計であり、ユニーク訪問者数や地域全体の来訪者数ではありません`;
  return { key: "subway", text, basis };
}

/**
 * Returns zero to five lines in guide-work priority order:
 * current state → official crowd peak → weather → today's event → subway
 * comparison. A sparse official response stays sparse.
 */
export function buildTourismDeskBrief(input: TourismDeskInput, lang: DeskLang, areaName: string): TourismDeskLine[] {
  const lines: TourismDeskLine[] = [];

  if (input.crowding) {
    const status = CROWD_STATUS[input.crowding.congestionLevel]?.[lang];
    if (status) {
      lines.push({
        key: "crowding",
        text: lang === "ko" ? `현재 ${areaName} · ${status}`
          : lang === "en" ? `${areaName} now · ${status}`
          : lang === "zh" ? `当前${areaName} · ${status}`
          : `現在の${areaName} · ${status}`,
        basis: crowdingBasis(lang, input.crowding.observedAt),
      });
    }
  }

  if (input.crowdForecast) {
    const status = CROWD_STATUS[input.crowdForecast.congestionLevel]?.[lang];
    const band = forecastBand(input.crowdForecast, lang);
    if (status && band) {
      lines.push({
        key: "forecast",
        text: lang === "ko" ? `공식 예상 최대 시간대 · ${band} · ${status}`
          : lang === "en" ? `Official busiest band ahead · ${band} · ${status}`
          : lang === "zh" ? `官方预计最拥挤时段 · ${band} · ${status}`
          : `公式予想の最混雑時間帯 · ${band} · ${status}`,
        basis: BASIS.forecast[lang],
      });
    }
  }

  if (input.weatherGuide) lines.push({ key: "weather", text: input.weatherGuide, basis: BASIS.weather[lang] });

  // A date range can prove only that today is inside the official period. It
  // cannot prove the venue is operating at the moment this page is read.
  if (input.todayEvent?.status === "IN_OFFICIAL_PERIOD") {
    const named = [input.todayEvent.categoryName, input.todayEvent.title].filter(Boolean).join(" · ");
    lines.push({
      key: "event",
      text: lang === "ko" ? `오늘은 공식 행사기간에 포함 · ${named}`
        : lang === "en" ? `Today falls within the official event period · ${named}`
        : lang === "zh" ? `今日在官方活动期间内 · ${named}`
        : `本日は公式開催期間内 · ${named}`,
      basis: BASIS.event[lang],
    });
  }

  if (input.subway) {
    const line = subwayLine(input.subway, lang);
    if (line) lines.push(line);
  }

  return lines.slice(0, 5);
}
