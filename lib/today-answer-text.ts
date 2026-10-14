/**
 * The one-line answers' wording: the area line the page shows and the line a
 * shared link's preview shows. Moved verbatim from ./today-answer, which
 * re-exports all of it and keeps the server-side reading; the shell needs
 * only the wording, and importing it from there also brought the reader's
 * imports (the airport forecast summary, the freshness rule) into every page.
 */
import type { ForecastBand } from "./airport-today-summary";

export const TODAY_ANSWER_AREAS = ["myeongdong", "hongdae", "seongsu", "itaewon"] as const;
export type TodayAnswerArea = typeof TODAY_ANSWER_AREAS[number];
type Lang = "ko" | "en" | "zh" | "ja";

export interface AreaNow {
  /** Official Seoul city-data congestion level, 1 (quiet) to 4 (crowded). */
  level: number;
  observedAt: string;
}

export interface TodayAnswer {
  serviceDate: string;
  /** Per-terminal busiest official departure band. Null unless that terminal's day is COMPLETE. */
  airportPeak: { T1: ForecastBand | null; T2: ForecastBand | null } | null;
  areas: Partial<Record<TodayAnswerArea, AreaNow>>;
}

const levelText: Record<Lang, string[]> = {
  ko: ["", "여유", "보통", "약간 붐빔", "붐빔"],
  en: ["", "quiet", "moderate", "slightly busy", "busy"],
  zh: ["", "空闲", "一般", "略拥挤", "拥挤"],
  ja: ["", "余裕", "普通", "やや混雑", "混雑"],
};

const areaName: Record<TodayAnswerArea, Record<Lang, string>> = {
  myeongdong: { ko: "명동", en: "Myeongdong", zh: "明洞", ja: "明洞" },
  hongdae: { ko: "홍대", en: "Hongdae", zh: "弘大", ja: "弘大" },
  seongsu: { ko: "성수", en: "Seongsu", zh: "圣水", ja: "聖水" },
  itaewon: { ko: "이태원", en: "Itaewon", zh: "梨泰院", ja: "梨泰院" },
};

export function areaAnswerText(answer: TodayAnswer | null | undefined, lang: Lang, only?: TodayAnswerArea): string | null {
  if (!answer) return null;
  const list = (only ? [only] : [...TODAY_ANSWER_AREAS]).flatMap((area) => {
    const now = answer.areas[area];
    return now ? [{ area, now }] : [];
  });
  if (!list.length) return null;
  const latest = list.map(({ now }) => now.observedAt).sort().at(-1)!;
  // The server HTML is kept by crawlers and quoted later, so the line names its own day as well as its time.
  const time = latest.slice(11, 16), day = calendarDay(latest.slice(0, 10), lang);
  const body = list.map(({ area, now }) => `${areaName[area][lang]} ${levelText[lang][now.level]}`).join(" · ");
  return {
    ko: `지금(${day} ${time} KST) 서울시 실시간 혼잡도: ${body}`,
    en: `Now (${time} KST, ${day}), Seoul city real-time congestion: ${body}`,
    zh: `现在（${day} ${time} KST）首尔市实时拥挤度：${body}`,
    ja: `いま（${day} ${time} KST）ソウル市リアルタイム混雑度：${body}`,
  }[lang];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-28" → 9월 28일 / Sep 28 / 9月28日. */
function calendarDay(day: string, lang: Lang): string {
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  return { ko: `${month}월 ${date}일`, en: `${MONTHS[month - 1]} ${date}`, zh: `${month}月${date}日`, ja: `${month}月${date}日` }[lang];
}

/**
 * The line a messenger shows under a shared link (og:description).
 *
 * KakaoTalk and other chat apps keep a link preview long after it was made,
 * so this names its own calendar day and never says "today" or "now": a
 * preview read a day later is then old, but still true. Null when there is no
 * answer, and the page keeps its ordinary description.
 */
export function shareAnswerText(answer: TodayAnswer | null | undefined, lang: Lang, page: "airport" | TodayAnswerArea): string | null {
  if (!answer) return null;
  // The owner removed the airport peak paragraph site-wide, including previews.
  if (page === "airport") return null;
  const now = answer.areas[page];
  if (!now) return null;
  const day = calendarDay(now.observedAt.slice(0, 10), lang);
  const time = now.observedAt.slice(11, 16);
  const name = areaName[page][lang];
  const level = levelText[lang][now.level];
  return {
    ko: `${day} ${time} KST 기준 ${name} 서울시 실시간 혼잡도: ${level}`,
    en: `${name} at ${time} KST on ${day}, Seoul city real-time congestion: ${level}`,
    zh: `${day} ${time} KST ${name}首尔市实时拥挤度：${level}`,
    ja: `${day} ${time} KST時点の${name}、ソウル市リアルタイム混雑度：${level}`,
  }[lang];
}
