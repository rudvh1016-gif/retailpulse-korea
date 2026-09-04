/**
 * How old a number is allowed to be, said out loud.
 *
 * The owner asked in September why August was "missing". For three of the
 * four sources involved, nothing was missing at all:
 *
 *   · the monthly mobility file's newest publication really is July,
 *   · the quarterly sources have no month called August in the first place,
 *   · the daily foreign-presence source publishes about nine days behind.
 *
 * A screen that shows only a number and a date cannot answer that question,
 * so a reader assumes the product is broken. These helpers turn the two
 * facts KORETAIL already stores — the period the data describes, and when
 * the collector last succeeded — into a sentence that separates
 *
 *   "the provider has not published the next period yet"        (normal)
 *
 * from
 *
 *   "KORETAIL has not collected recently, so it may be behind"  (a problem).
 *
 * Nothing here hardcodes a month or a quarter. Every collector fetches the
 * provider's newest publication, so a stored period plus a recent successful
 * retrieval IS the evidence that the provider has published nothing newer;
 * when the retrieval is not recent, that claim is withheld instead of
 * guessed. When August is published, collection alone moves the screen.
 */
export type SourceCadence = "REALTIME" | "DAILY" | "MONTHLY" | "QUARTERLY" | "EVENT";

export type PeriodLang = "ko" | "en" | "zh" | "ja";

/**
 * How recently a collector must have succeeded before its stored period can
 * be presented as the provider's newest. Every periodic collector runs at
 * least daily, so two days is generous; past that the honest answer is that
 * KORETAIL does not know whether something newer exists.
 */
export const PERIOD_VOUCH_WINDOW_MS = 48 * 3_600_000;

export interface SourcePeriodInput {
  cadence: SourceCadence;
  /**
   * The period the data itself describes, in its own stored shape:
   * `YYYYQ` for quarters, `YYYY-MM` or an ISO date for months and days.
   */
  referencePeriod: string;
  /** When KORETAIL last SUCCESSFULLY retrieved this source; null when unknown. */
  retrievedAt: string | null;
  nowIso: string;
}

export type PublicationStandpoint =
  /** Collection is recent, so the stored period is the provider's newest. */
  | "PROVIDER_NEWEST"
  /** Collection is not recent enough to vouch for that. */
  | "COLLECTION_BEHIND"
  /** No successful retrieval recorded at all. */
  | "UNKNOWN";

export interface SourcePeriodDescription {
  cadenceLabel: string;
  /** The period the data describes, e.g. "2026년 7월". */
  periodLabel: string;
  standpoint: PublicationStandpoint;
  /** One sentence separating provider lag from collector lag. */
  publicationNote: string;
  /**
   * Only for cadences where a month cannot exist. Null otherwise, so a
   * caller never renders an irrelevant explanation.
   */
  cadenceNote: string | null;
}

const CADENCE_LABEL: Record<SourceCadence, Record<PeriodLang, string>> = {
  REALTIME: { ko: "실시간 자료", en: "Real-time source", zh: "实时数据", ja: "リアルタイム資料" },
  DAILY: { ko: "일간 자료", en: "Daily source", zh: "每日数据", ja: "日次資料" },
  MONTHLY: { ko: "월간 자료", en: "Monthly source", zh: "月度数据", ja: "月次資料" },
  QUARTERLY: { ko: "분기 자료", en: "Quarterly source", zh: "季度数据", ja: "四半期資料" },
  EVENT: { ko: "행사 일정 자료", en: "Event schedule", zh: "活动日程数据", ja: "イベント日程資料" },
};

/**
 * A quarterly source has no August, and a daily one publishes days behind.
 * Saying so where it applies stops a reader hunting for a month that was
 * never going to exist.
 */
const CADENCE_NOTE: Partial<Record<SourceCadence, Record<PeriodLang, string>>> = {
  QUARTERLY: {
    ko: "분기 단위로 공개되어 월별 자료는 없습니다",
    en: "Published by quarter, so there is no month-by-month figure",
    zh: "按季度公开，因此没有分月数据",
    ja: "四半期単位で公開されるため、月別の数値はありません",
  },
  DAILY: {
    ko: "공급자가 며칠 뒤에 공개하므로 가장 최근 날짜는 오늘이 아닙니다",
    en: "The provider publishes some days later, so the newest date is not today",
    zh: "供应方延后数日公开，因此最新日期并非今天",
    ja: "提供元は数日後に公開するため、最新日は本日ではありません",
  },
};

const PUBLICATION_NOTE: Record<PublicationStandpoint, Record<PeriodLang, string>> = {
  PROVIDER_NEWEST: {
    ko: "공급자가 공개한 가장 최근 자료입니다. 다음 기간은 아직 공개되지 않았습니다",
    en: "This is the provider's most recent publication; the next period is not published yet",
    zh: "这是供应方最新公开的资料，下一期尚未公开",
    ja: "提供元が公開した最新の資料です。次の期間はまだ公開されていません",
  },
  COLLECTION_BEHIND: {
    ko: "KORETAIL 수집이 최근에 성공하지 않아, 더 최근 공개분이 있을 수 있습니다",
    en: "KORETAIL has not collected recently, so a newer publication may exist",
    zh: "KORETAIL 近期未成功采集，可能已有更新的公开资料",
    ja: "KORETAIL の収集が最近成功していないため、より新しい公開分がある可能性があります",
  },
  UNKNOWN: {
    ko: "수집 시각이 없어 공급자 최신 공개 여부를 확인하지 못했습니다",
    en: "No retrieval time is recorded, so the provider's newest publication is unconfirmed",
    zh: "没有采集时间记录，无法确认供应方是否有更新公开",
    ja: "取得時刻の記録がなく、提供元の最新公開状況は確認できていません",
  },
};

/** "20262" -> "2026년 2분기". Null when the code is not a quarter. */
export function formatQuarterPeriod(code: string, lang: PeriodLang): string | null {
  const match = /^(\d{4})([1-4])$/.exec(code.trim());
  if (!match) return null;
  const [, year, quarter] = match;
  return lang === "ko" ? `${year}년 ${quarter}분기`
    : lang === "en" ? `Q${quarter} ${year}`
    : lang === "zh" ? `${year}年第${quarter}季度`
    : `${year}年第${quarter}四半期`;
}

/** "2026-07-31" or "2026-07" -> "2026년 7월". Null when no month can be read. */
export function formatMonthPeriod(value: string, lang: PeriodLang): string | null {
  const match = /^(\d{4})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const [, year, month] = match;
  const monthNumber = Number(month);
  if (monthNumber < 1 || monthNumber > 12) return null;
  return lang === "ko" ? `${year}년 ${monthNumber}월`
    : lang === "en" ? `${new Date(Date.UTC(2000, monthNumber - 1, 1)).toLocaleString("en-GB", { month: "long", timeZone: "UTC" })} ${year}`
    : lang === "zh" ? `${year}年${monthNumber}月`
    : `${year}年${monthNumber}月`;
}

/** "2026-08-26T23:00:00+09:00" -> "2026년 8월 26일". Null when no day can be read. */
export function formatDayPeriod(value: string, lang: PeriodLang): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) return null;
  return lang === "ko" ? `${year}년 ${monthNumber}월 ${dayNumber}일`
    : lang === "en" ? `${year}-${month}-${day}`
    : lang === "zh" ? `${year}年${monthNumber}月${dayNumber}日`
    : `${year}年${monthNumber}月${dayNumber}日`;
}

function formatPeriod(cadence: SourceCadence, value: string, lang: PeriodLang): string | null {
  if (cadence === "QUARTERLY") return formatQuarterPeriod(value, lang);
  if (cadence === "MONTHLY") return formatMonthPeriod(value, lang);
  return formatDayPeriod(value, lang);
}

/**
 * Whether the stored period can be presented as the provider's newest.
 *
 * The only evidence for "the provider has published nothing newer" is that
 * a collector which always fetches the newest publication ran recently and
 * still came back with this period. Without a recent success that claim is
 * withheld — which is the distinction between a provider that has not
 * published and a collector that has stopped working.
 */
export function publicationStandpoint(retrievedAt: string | null, nowIso: string): PublicationStandpoint {
  if (!retrievedAt) return "UNKNOWN";
  const retrieved = Date.parse(retrievedAt);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(retrieved) || !Number.isFinite(now)) return "UNKNOWN";
  return now - retrieved <= PERIOD_VOUCH_WINDOW_MS ? "PROVIDER_NEWEST" : "COLLECTION_BEHIND";
}

export function describeSourcePeriod(input: SourcePeriodInput, lang: PeriodLang): SourcePeriodDescription | null {
  const periodLabel = formatPeriod(input.cadence, input.referencePeriod, lang);
  if (!periodLabel) return null;
  const standpoint = publicationStandpoint(input.retrievedAt, input.nowIso);
  return {
    cadenceLabel: CADENCE_LABEL[input.cadence][lang],
    periodLabel,
    standpoint,
    publicationNote: PUBLICATION_NOTE[standpoint][lang],
    cadenceNote: CADENCE_NOTE[input.cadence]?.[lang] ?? null,
  };
}
