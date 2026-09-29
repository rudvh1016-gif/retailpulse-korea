/**
 * The seven days ahead, for a store getting ready for the weekend and the
 * holidays inside the week. Every line says what kind of knowledge it is:
 *
 *   CONFIRMED          an official schedule (a public holiday, an official
 *                      event period, China's adjusted working day)
 *   OFFICIAL_FORECAST  KMA's forecast, only for the hours KMA has published
 *   UNCONFIRMED        nothing published yet — said, never filled in
 *
 * The short-term population forecast is not stretched to seven days, an
 * event is listed once for the week rather than once per day, and a year a
 * government has not yet published is reported as such.
 */
import type { LiveSummary } from "../app/live-signals";
import type { PrepPlace } from "./business-prep";
import { OFFICIAL_DAYS, isPublished, type HolidayCountry, type OfficialDay } from "./holiday-calendar";

export const WEEK_DAYS = 7;
const DAY_MS = 86_400_000;

export const shiftDay = (day: string, delta: number) => new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);

export type WeekItem =
  | { label: "CONFIRMED"; kind: "HOLIDAY"; country: "KR" | HolidayCountry; name: string; start: string; end: string; source: string }
  | { label: "CONFIRMED"; kind: "WORKING_DAY"; country: "CN"; name: string; source: string }
  | { label: "OFFICIAL_FORECAST"; kind: "RAIN"; percent: number; fromAt: string; toAt: string; issuedAt: string | null }
  | { label: "UNCONFIRMED"; kind: "FORECAST_NOT_PUBLISHED" };

export interface WeekDay { date: string; weekend: boolean; today: boolean; items: WeekItem[] }

export interface WeekEvent {
  title: string;
  eventStart: string;
  eventEnd: string | null;
  place: string | null;
  retrievedAt: string | null;
  daysInWeek: string[];
}

export interface WeekAhead {
  start: string;
  end: string;
  days: WeekDay[];
  /** null for the airport: TourAPI events are mapped to the four areas only. */
  events: WeekEvent[] | null;
  /** "UNAVAILABLE" when KASI months are missing: no Korean holiday can be ruled in or out. */
  koreanHolidays: "CHECKED" | "UNAVAILABLE";
  /** Countries whose arrangement for a year in the week is not published yet. */
  unpublished: HolidayCountry[];
  /** No weather for the airport: KMA grids are mapped to the four areas only. */
  weather: boolean;
}

function officialSource(day: OfficialDay): string {
  return day.country === "CN" ? "gov.cn 国办发明电〔2025〕7号" : "内閣府 国民の祝日";
}

export function buildWeekAhead(summary: LiveSummary, place: PrepPlace, todayKst: string): WeekAhead {
  const dates = Array.from({ length: WEEK_DAYS }, (_, index) => shiftDay(todayKst, index));
  const end = dates[dates.length - 1];
  const months = new Set((summary.holidays ?? []).map((month) => month.month));
  const koreanHolidays = dates.every((date) => months.has(date.slice(0, 7))) ? "CHECKED" : "UNAVAILABLE";
  const korean = (summary.holidays ?? []).flatMap((month) => (month.days ?? []).map((day) => ({ date: day.date, name: day.name })));
  const unpublished = (["CN", "JP"] as const).filter((country) => dates.some((date) => !isPublished(country, date)));
  const area = place.kind === "area" ? summary.areas[place.area] : undefined;
  const weather = (area?.weather ?? []) as Array<{ targetAt: string; precipitationProbability: number | null; issuedAt?: string | null }>;

  const days: WeekDay[] = dates.map((date) => {
    const items: WeekItem[] = [];
    for (const day of korean.filter((row) => row.date === date)) {
      items.push({ label: "CONFIRMED", kind: "HOLIDAY", country: "KR", name: day.name, start: date, end: date, source: "KASI" });
    }
    for (const day of OFFICIAL_DAYS.filter((row) => row.start <= date && row.end >= date)) {
      items.push(day.kind === "WORKING_DAY"
        ? { label: "CONFIRMED", kind: "WORKING_DAY", country: "CN", name: day.name, source: officialSource(day) }
        : { label: "CONFIRMED", kind: "HOLIDAY", country: day.country, name: day.name, start: day.start, end: day.end, source: officialSource(day) });
    }
    if (place.kind === "area") {
      const rows = weather.filter((row) => row.targetAt.slice(0, 10) === date && typeof row.precipitationProbability === "number");
      if (rows.length) {
        const top = Math.max(...rows.map((row) => row.precipitationProbability as number));
        const times = rows.map((row) => row.targetAt).sort();
        items.push({
          label: "OFFICIAL_FORECAST", kind: "RAIN", percent: top, fromAt: times[0], toAt: times[times.length - 1],
          issuedAt: rows.map((row) => row.issuedAt ?? null).find((value) => value) ?? null,
        });
      } else {
        items.push({ label: "UNCONFIRMED", kind: "FORECAST_NOT_PUBLISHED" });
      }
    }
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    return { date, weekend: weekday === 0 || weekday === 6, today: date === todayKst, items };
  });

  const events = area
    ? (area.events ?? []).flatMap((event) => {
      const last = event.eventEnd ?? event.eventStart;
      const inWeek = dates.filter((date) => event.eventStart <= date && last >= date);
      if (!inWeek.length) return [];
      const record = event as typeof event & { retrievedAt?: string | null };
      return [{
        title: event.title,
        eventStart: event.eventStart,
        eventEnd: event.eventEnd,
        place: event.address ?? null,
        retrievedAt: record.retrievedAt ?? null,
        daysInWeek: inWeek,
      }];
    })
    : null;

  return { start: todayKst, end, days, events, koreanHolidays, unpublished, weather: place.kind === "area" };
}
