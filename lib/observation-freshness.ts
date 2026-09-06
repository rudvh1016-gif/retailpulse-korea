/**
 * How old an observation is, said out loud.
 *
 * The area screen shows two temperatures from two different official
 * sources, and on 2026-09-07 they read "지금 29.4°C" next to a forecast of
 * 21°C. Both numbers were correct; the label was not. The 29.4°C was
 * Seoul's newest published observation — from 14:50 the previous
 * afternoon, because that collector had stopped succeeding — and calling a
 * nine-hour-old reading "지금" is the one thing that makes two honest
 * numbers look like a broken screen.
 *
 * So "지금" is earned, not assumed: past the window below, the reading is
 * labelled with the moment it was actually taken, and the card says why the
 * forecast underneath disagrees.
 */
export type FreshnessLang = "ko" | "en" | "zh" | "ja";

/**
 * Seoul's city-data feed publishes every few minutes, so anything inside
 * an hour and a half is fairly called "now". Past that it is a record.
 */
export const OBSERVATION_NOW_WINDOW_MS = 90 * 60_000;

export interface ObservationAge {
  /** True only when the reading is recent enough to be called "지금". */
  isNow: boolean;
  /** "09-06 14:50" — the moment the reading was actually taken. */
  clock: string;
  /** "9시간 27분 전" — null when the reading is fresh or unreadable. */
  ago: string | null;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** KST month-day and clock, from the timestamp the provider published. */
export function observationClock(observedAt: string): string {
  const parsed = new Date(observedAt);
  if (Number.isNaN(parsed.getTime())) return "";
  const kst = new Date(parsed.getTime() + 9 * 3_600_000);
  return `${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
}

function agoText(elapsedMs: number, lang: FreshnessLang): string {
  const minutes = Math.max(1, Math.round(elapsedMs / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) {
    return { ko: `${minutes}분 전`, en: `${minutes} min ago`, zh: `${minutes}分钟前`, ja: `${minutes}分前` }[lang];
  }
  const days = Math.floor(hours / 24);
  if (days >= 1) {
    return { ko: `${days}일 전`, en: `${days} day${days > 1 ? "s" : ""} ago`, zh: `${days}天前`, ja: `${days}日前` }[lang];
  }
  if (rest === 0) {
    return { ko: `${hours}시간 전`, en: `${hours} h ago`, zh: `${hours}小时前`, ja: `${hours}時間前` }[lang];
  }
  return {
    ko: `${hours}시간 ${rest}분 전`,
    en: `${hours} h ${rest} min ago`,
    zh: `${hours}小时${rest}分钟前`,
    ja: `${hours}時間${rest}分前`,
  }[lang];
}

export function describeObservationAge(observedAt: string, nowIso: string, lang: FreshnessLang): ObservationAge {
  const observed = Date.parse(observedAt);
  const now = Date.parse(nowIso);
  const clock = observationClock(observedAt);
  if (!Number.isFinite(observed) || !Number.isFinite(now)) return { isNow: false, clock, ago: null };
  const elapsed = now - observed;
  // A reading stamped in the future is not fresher than now; it is unusable
  // as an age, so it is treated as a plain record rather than as "지금".
  if (elapsed < 0) return { isNow: false, clock, ago: null };
  if (elapsed <= OBSERVATION_NOW_WINDOW_MS) return { isNow: true, clock, ago: null };
  return { isNow: false, clock, ago: agoText(elapsed, lang) };
}

/**
 * The sentence that answers "왜 온도가 두 개고 왜 다른가".
 *
 * Only shown when the observation is no longer "now": while it is fresh,
 * an observation and a forecast for the same hour are close enough that
 * spelling out the difference is noise.
 */
export function explainObservationVsForecast(age: ObservationAge, lang: FreshnessLang): string | null {
  if (age.isNow || !age.ago) return null;
  return {
    ko: `${age.ago} 관측된 값입니다. 아래 '날씨'는 지금 시각의 기상청 예보라서 숫자가 다릅니다`,
    en: `Observed ${age.ago}. The weather row below is the KMA forecast for the current hour, which is why the numbers differ`,
    zh: `为${age.ago}的观测值。下方"天气"是当前时段的气象厅预报，因此数值不同`,
    ja: `${age.ago}に観測された値です。下の「天気」は現在時刻の気象庁予報のため数値が異なります`,
  }[lang];
}
