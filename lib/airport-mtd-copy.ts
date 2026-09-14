import type { BriefLang } from "./current-brief";

/**
 * Wording for the month-to-date block.
 *
 * Every string here has to survive one specific misreading: that a cumulative
 * figure built from the airport's own FORECAST is a count of people who
 * actually departed. So the measure is named in full ("공식 예상 승객 누적",
 * "official departure-hall passenger forecast") wherever the number appears,
 * and "MTD" never stands alone in English as if it were self-explanatory.
 *
 * The partial and unavailable strings exist because a month with a missing day
 * must read as incomplete rather than small. They carry the counts, so the
 * reader can see exactly how much is missing instead of being told only that
 * something is.
 */
export const mtdCopy = {
  heading: {
    ko: "이번 달 누적 · 출국장 공식 예상 승객",
    en: "Month to date · official departure-hall passenger forecast",
    zh: "本月累计 · 出境大厅官方预计旅客",
    ja: "今月累計 · 出国場公式予想旅客",
  },
  previous: { ko: "전월 동기간", en: "Same span last month", zh: "上月同期", ja: "前月同期間" },
  change: { ko: "전월 동기간 대비", en: "Vs. same span last month", zh: "较上月同期", ja: "前月同期間比" },
  daily: {
    ko: "일별 공식 예상 승객과 누적",
    en: "Daily official forecast and the running total",
    zh: "每日官方预计旅客与累计",
    ja: "日別の公式予想旅客と累計",
  },
  cumulative: { ko: "누적", en: "Running total", zh: "累计", ja: "累計" },
  perDay: { ko: "당일", en: "That day", zh: "当日", ja: "当日" },
  /** A span is only ever labelled complete when every one of its days is. */
  partial: {
    ko: (complete: number, expected: number) => `부분 누적 · ${expected}일 중 ${complete}일 자료`,
    en: (complete: number, expected: number) => `Partial · ${complete} of ${expected} days collected`,
    zh: (complete: number, expected: number) => `部分累计 · ${expected}天中有${complete}天资料`,
    ja: (complete: number, expected: number) => `部分累計 · ${expected}日中${complete}日分`,
  },
  missing: {
    ko: (dates: string[]) => `${dates.join(", ")} 자료 누락`,
    en: (dates: string[]) => `Missing: ${dates.join(", ")}`,
    zh: (dates: string[]) => `缺少资料：${dates.join(", ")}`,
    ja: (dates: string[]) => `資料欠落：${dates.join(", ")}`,
  },
  unavailable: { ko: "누적 확인 불가", en: "Cumulative total unavailable", zh: "累计无法确认", ja: "累計は確認不可" },
  noCompare: { ko: "전월 동기간 비교 불가", en: "No comparable span last month", zh: "无法与上月同期比较", ja: "前月同期間との比較不可" },
  /** Named, not silently replaced by a different span — see buildMonthToDate. */
  noSuchDay: {
    ko: "전월에 같은 일자가 없어 비교하지 않습니다",
    en: "The previous month has no matching day, so no comparison is made",
    zh: "上月没有相同日期，因此不作比较",
    ja: "前月に同じ日付がないため比較しません",
  },
  bothComplete: {
    ko: "두 기간 모두 완전할 때만 신장률을 계산합니다",
    en: "Growth is calculated only when both spans are complete",
    zh: "仅在两个期间均完整时计算增长率",
    ja: "両期間が完全な場合のみ増減率を計算します",
  },
} as const;

/** "2026-09-01"~"2026-09-13" -> "9/1–9/13": the same digits in every locale. */
export function shortRange(start: string, end: string): string {
  const short = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  return `${short(start)}–${short(end)}`;
}

export function shortDay(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

export type MtdLang = BriefLang;
