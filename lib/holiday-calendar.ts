/**
 * Official public holidays of mainland China and Japan, as published by the
 * two governments and checked against the publications themselves by
 * scripts/verify-holiday-calendar.ts (run 36435863086, 2026-09-28).
 *
 * Rules this file keeps:
 *   - only years a government has actually published; nothing is computed
 *     ahead (China's 2027 arrangement had not been published on 2026-09-28);
 *   - China's adjusted working days (调休上班) are WORKING_DAY rows, never
 *     holidays;
 *   - Japan's substitute holidays (振替休日) and sandwiched citizens'
 *     holidays (国民の休日) are listed as the Cabinet Office lists them
 *     ("休日"), with the kind stated;
 *   - the official name is kept as published; a translation is shown only
 *     where it is the settled one.
 *
 * Korean holidays are not here: they come from KASI through the existing
 * collector (lib/holidays.ts).
 */
export type HolidayCountry = "CN" | "JP";
export type HolidayKind = "HOLIDAY" | "SUBSTITUTE" | "CITIZENS_HOLIDAY" | "WORKING_DAY";

export interface OfficialDay {
  country: HolidayCountry;
  kind: HolidayKind;
  /** Inclusive KST dates. A single day has start === end. */
  start: string;
  end: string;
  /** As published. */
  name: string;
  /** For China, the notice's own line for this item, checked verbatim. */
  quote?: string;
}

export interface HolidaySource {
  country: HolidayCountry;
  publisher: string;
  title: string;
  url: string;
  documentNumber?: string;
  publishedOn?: string;
  /** Years the publication covers; later years are "not yet published". */
  years: number[];
  checkedOn: string;
  /** Hash of the publication as read on `checkedOn` (evidence, not a gate). */
  sha256: string;
  reuse: string;
}

export const HOLIDAY_SOURCES: Record<HolidayCountry, HolidaySource> = {
  CN: {
    country: "CN",
    publisher: "国务院办公厅 (State Council General Office)",
    title: "国务院办公厅关于2026年部分节假日安排的通知",
    url: "https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm",
    documentNumber: "国办发明电〔2025〕7号",
    publishedOn: "2025-11-04",
    years: [2026],
    checkedOn: "2026-09-28",
    sha256: "0b9d4b2b07360bc0915ff929709a738f1297abf3d11d3a606861faee7e9be535",
    reuse: "Official government notice; dates and names are cited as facts with the source link.",
  },
  JP: {
    country: "JP",
    publisher: "内閣府 (Cabinet Office)",
    title: "国民の祝日・休日 (syukujitsu.csv)",
    url: "https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv",
    years: [2026, 2027],
    checkedOn: "2026-09-28",
    sha256: "cec37a743c96995cdb9cb52b685c9003634682a9b0e1a640a6b9b96881fe964a",
    reuse: "Cabinet Office website content, reusable with attribution under the Government of Japan Standard Terms of Use.",
  },
};

const cn = (start: string, end: string, name: string, quote: string): OfficialDay => ({ country: "CN", kind: "HOLIDAY", start, end, name, quote });
const cnWork = (date: string, name: string, quote: string): OfficialDay => ({ country: "CN", kind: "WORKING_DAY", start: date, end: date, name, quote });
const jp = (date: string, name: string, kind: HolidayKind = "HOLIDAY"): OfficialDay => ({ country: "JP", kind, start: date, end: date, name });

export const OFFICIAL_DAYS: readonly OfficialDay[] = [
  cn("2026-01-01", "2026-01-03", "元旦", "1月1日（周四）至3日（周六）放假调休，共3天"),
  cnWork("2026-01-04", "元旦", "1月4日（周日）上班"),
  cn("2026-02-15", "2026-02-23", "春节", "2月15日（农历腊月二十八、周日）至23日（农历正月初七、周一）放假调休，共9天"),
  cnWork("2026-02-14", "春节", "2月14日（周六）、2月28日（周六）上班"),
  cnWork("2026-02-28", "春节", "2月14日（周六）、2月28日（周六）上班"),
  cn("2026-04-04", "2026-04-06", "清明节", "4月4日（周六）至6日（周一）放假，共3天"),
  cn("2026-05-01", "2026-05-05", "劳动节", "5月1日（周五）至5日（周二）放假调休，共5天"),
  cnWork("2026-05-09", "劳动节", "5月9日（周六）上班"),
  cn("2026-06-19", "2026-06-21", "端午节", "6月19日（周五）至21日（周日）放假，共3天"),
  cn("2026-09-25", "2026-09-27", "中秋节", "9月25日（周五）至27日（周日）放假，共3天"),
  cn("2026-10-01", "2026-10-07", "国庆节", "10月1日（周四）至7日（周三）放假调休，共7天"),
  cnWork("2026-09-20", "国庆节", "9月20日（周日）、10月10日（周六）上班"),
  cnWork("2026-10-10", "国庆节", "9月20日（周日）、10月10日（周六）上班"),
  jp("2026-01-01", "元日"), jp("2026-01-12", "成人の日"), jp("2026-02-11", "建国記念の日"), jp("2026-02-23", "天皇誕生日"),
  jp("2026-03-20", "春分の日"), jp("2026-04-29", "昭和の日"), jp("2026-05-03", "憲法記念日"), jp("2026-05-04", "みどりの日"),
  jp("2026-05-05", "こどもの日"), jp("2026-05-06", "休日", "SUBSTITUTE"), jp("2026-07-20", "海の日"), jp("2026-08-11", "山の日"),
  jp("2026-09-21", "敬老の日"), jp("2026-09-22", "休日", "CITIZENS_HOLIDAY"), jp("2026-09-23", "秋分の日"), jp("2026-10-12", "スポーツの日"),
  jp("2026-11-03", "文化の日"), jp("2026-11-23", "勤労感謝の日"),
  jp("2027-01-01", "元日"), jp("2027-01-11", "成人の日"), jp("2027-02-11", "建国記念の日"), jp("2027-02-23", "天皇誕生日"),
  jp("2027-03-21", "春分の日"), jp("2027-03-22", "休日", "SUBSTITUTE"), jp("2027-04-29", "昭和の日"), jp("2027-05-03", "憲法記念日"),
  jp("2027-05-04", "みどりの日"), jp("2027-05-05", "こどもの日"), jp("2027-07-19", "海の日"), jp("2027-08-11", "山の日"),
  jp("2027-09-20", "敬老の日"), jp("2027-09-23", "秋分の日"), jp("2027-10-11", "スポーツの日"), jp("2027-11-03", "文化の日"),
  jp("2027-11-23", "勤労感謝の日"),
];

/** Settled translations only; anything else is shown as published. */
export const HOLIDAY_TRANSLATIONS: Record<string, Partial<Record<"ko" | "en" | "zh" | "ja", string>>> = {
  元旦: { ko: "원단", en: "New Year's Day" },
  春节: { ko: "춘절", en: "Spring Festival" },
  清明节: { ko: "청명절", en: "Qingming Festival" },
  劳动节: { ko: "노동절", en: "Labour Day" },
  端午节: { ko: "단오절", en: "Dragon Boat Festival" },
  中秋节: { ko: "중추절", en: "Mid-Autumn Festival" },
  国庆节: { ko: "국경절", en: "National Day" },
  元日: { ko: "새해 첫날", en: "New Year's Day" },
  成人の日: { ko: "성인의 날", en: "Coming of Age Day" },
  建国記念の日: { ko: "건국기념일", en: "National Foundation Day" },
  天皇誕生日: { en: "The Emperor's Birthday" },
  春分の日: { ko: "춘분의 날", en: "Vernal Equinox Day" },
  昭和の日: { en: "Showa Day" },
  憲法記念日: { ko: "헌법기념일", en: "Constitution Memorial Day" },
  みどりの日: { en: "Greenery Day" },
  こどもの日: { ko: "어린이날", en: "Children's Day" },
  海の日: { ko: "바다의 날", en: "Marine Day" },
  山の日: { ko: "산의 날", en: "Mountain Day" },
  敬老の日: { ko: "경로의 날", en: "Respect for the Aged Day" },
  秋分の日: { ko: "추분의 날", en: "Autumnal Equinox Day" },
  スポーツの日: { en: "Sports Day" },
  文化の日: { ko: "문화의 날", en: "Culture Day" },
  勤労感謝の日: { ko: "근로감사의 날", en: "Labour Thanksgiving Day" },
};

export function officialDaysOn(date: string, countries: readonly HolidayCountry[] = ["CN", "JP"]): OfficialDay[] {
  return OFFICIAL_DAYS.filter((day) => countries.includes(day.country) && day.start <= date && day.end >= date);
}

/** Holidays only — an adjusted working day is never a holiday. */
export function holidaysOn(date: string, countries: readonly HolidayCountry[] = ["CN", "JP"]): OfficialDay[] {
  return officialDaysOn(date, countries).filter((day) => day.kind !== "WORKING_DAY");
}

export interface CalendarCoverage {
  country: HolidayCountry;
  coveredThrough: string;
  /** True from 1 November of the last covered year: the next arrangement is due. */
  renewalDue: boolean;
}

export function calendarCoverage(todayKst: string): CalendarCoverage[] {
  return (Object.keys(HOLIDAY_SOURCES) as HolidayCountry[]).map((country) => {
    const last = Math.max(...HOLIDAY_SOURCES[country].years);
    return { country, coveredThrough: `${last}-12-31`, renewalDue: todayKst >= `${last}-11-01` };
  });
}

/** True when a date is inside a year the country has published. */
export function isPublished(country: HolidayCountry, date: string): boolean {
  return HOLIDAY_SOURCES[country].years.includes(Number(date.slice(0, 4)));
}

/**
 * A holiday name for a reader: native names stay as published; otherwise the
 * settled translation with the published name beside it, or the published
 * name alone when no translation is settled.
 */
export function localHolidayName(name: string, lang: "ko" | "en" | "zh" | "ja", country: "KR" | HolidayCountry): string {
  if (country === "KR" || (country === "CN" && lang === "zh") || (country === "JP" && lang === "ja")) return name;
  const translated = HOLIDAY_TRANSLATIONS[name]?.[lang];
  return translated ? `${translated} (${name})` : name;
}
