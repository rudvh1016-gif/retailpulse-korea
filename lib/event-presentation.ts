export interface EventPresentationInput {
  contentId?: string | null;
  title: string;
  eventStart: string;
  eventEnd: string | null;
  distanceM: number | null;
  address?: string | null;
  addressDetail?: string | null;
  overview?: string | null;
  homepage?: string | null;
}

/**
 * This describes the provider's published date range, not whether the venue
 * is open or the event is physically operating at this moment.
 */
export type EventPresentationStatus = "IN_OFFICIAL_PERIOD" | "UPCOMING";

export type EventPresentationLang = "ko" | "en" | "zh" | "ja";

export type PreparedEvent<T extends EventPresentationInput> = T & {
  status: EventPresentationStatus;
  homepage: string | null;
};

function normalizedIdentityPart(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

export function eventStatusForDate(event: EventPresentationInput, serviceDate: string): EventPresentationStatus {
  const end = event.eventEnd ?? event.eventStart;
  return event.eventStart <= serviceDate && end >= serviceDate ? "IN_OFFICIAL_PERIOD" : "UPCOMING";
}

const PERIOD_STATUS_LABELS: Record<EventPresentationStatus, Record<EventPresentationLang, string>> = {
  IN_OFFICIAL_PERIOD: {
    ko: "공식 행사기간에 오늘 포함",
    en: "Today falls within the official event period",
    zh: "今日在官方活动期间内",
    ja: "本日は公式開催期間内",
  },
  UPCOMING: {
    ko: "공식 행사기간 시작 전",
    en: "Official event period has not started",
    zh: "官方活动期间尚未开始",
    ja: "公式イベント期間の開始前です",
  },
};

/** Truthful, visitor-safe wording for the provider's date-range status. */
export function eventPeriodStatusLabel(status: EventPresentationStatus, lang: EventPresentationLang): string {
  return PERIOD_STATUS_LABELS[status][lang];
}

function finiteDistance(value: number | null): number {
  return value !== null && Number.isFinite(value) && value >= 0 ? value : Number.POSITIVE_INFINITY;
}

function compareText(left: string, right: string): number {
  const a = normalizedIdentityPart(left);
  const b = normalizedIdentityPart(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Accept only the provider's absolute HTTP(S) homepage. */
export function safeOfficialEventHomepage(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    const http = url.protocol === "http:" || url.protocol === "https:";
    return http && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/** First complete official sentence; no sentence means no arbitrary preview. */
export function eventPreview(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  return /^(.+?[.!?。！？])(?:\s|$)/u.exec(text)?.[1]?.trim() ?? null;
}

function cleanCopyField(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/gu, " ");
}

/** Keep the provider's dates exact while avoiding a duplicated one-day end. */
export function officialEventPeriod(event: Pick<EventPresentationInput, "eventStart" | "eventEnd">): string | null {
  const start = cleanCopyField(event.eventStart);
  if (!start) return null;
  const end = cleanCopyField(event.eventEnd);
  return !end || end === start ? start : `${start} – ${end}`;
}

const COPY_TEXT: Record<EventPresentationLang, {
  title: string;
  period: string;
  address: string;
  homepage: string;
  source: string;
  sourceValue: string;
  caveat: string;
}> = {
  ko: {
    title: "행사명",
    period: "공식 행사기간",
    address: "주소",
    homepage: "공식 안내",
    source: "출처",
    sourceValue: "한국관광공사 TourAPI",
    caveat: "공식 행사기간은 실제 운영 여부나 운영시간을 뜻하지 않습니다. 공식 안내를 확인하세요.",
  },
  en: {
    title: "Event",
    period: "Official event period",
    address: "Address",
    homepage: "Official page",
    source: "Source",
    sourceValue: "Korea Tourism Organization (KTO) TourAPI",
    caveat: "The official event period does not confirm actual operation or opening hours. Check the official notice.",
  },
  zh: {
    title: "活动名称",
    period: "官方活动期间",
    address: "地址",
    homepage: "官方页面",
    source: "来源",
    sourceValue: "韩国观光公社 TourAPI",
    caveat: "官方活动期间并不代表实际运营状态或开放时间。请查看官方公告。",
  },
  ja: {
    title: "イベント名",
    period: "公式イベント期間",
    address: "住所",
    homepage: "公式案内",
    source: "出典",
    sourceValue: "韓国観光公社 TourAPI",
    caveat: "公式イベント期間は実際の運営状況や開催時間を示すものではありません。公式案内をご確認ください。",
  },
};

export type EventCopyInput = Pick<
  EventPresentationInput,
  "title" | "eventStart" | "eventEnd" | "address" | "addressDetail" | "homepage"
>;

/**
 * Build copyable event facts from an explicit allowlist. The event's official
 * title is never translated, and missing or unsafe optional fields disappear
 * instead of being replaced with generated advice.
 */
export function buildEventCopyText(event: EventCopyInput, lang: EventPresentationLang = "ko"): string {
  const labels = COPY_TEXT[lang];
  const title = cleanCopyField(event.title);
  const period = officialEventPeriod(event);
  const addressParts = [cleanCopyField(event.address), cleanCopyField(event.addressDetail)]
    .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);
  const homepage = safeOfficialEventHomepage(event.homepage);
  const lines: string[] = [];

  if (title) lines.push(`${labels.title}: ${title}`);
  if (period) lines.push(`${labels.period}: ${period}`);
  if (addressParts.length) lines.push(`${labels.address}: ${addressParts.join(" · ")}`);
  if (homepage) lines.push(`${labels.homepage}: ${homepage}`);
  lines.push(`${labels.source}: ${labels.sourceValue}`);
  lines.push(labels.caveat);
  return lines.join("\n");
}

/**
 * Build the bounded event set used by both the area brief and event panel.
 * Content identity wins; a normalized official title/period/address fingerprint
 * also removes provider duplicates published under different content IDs.
 */
export function prepareEventsForPresentation<T extends EventPresentationInput>(
  events: readonly T[],
  serviceDate: string,
): Array<PreparedEvent<T>> {
  const contentIds = new Set<string>();
  const fingerprints = new Set<string>();
  const unique: Array<PreparedEvent<T>> = [];

  for (const event of events) {
    const contentId = normalizedIdentityPart(event.contentId);
    const fingerprint = [event.title, event.eventStart, event.eventEnd ?? event.eventStart, event.address ?? ""]
      .map(normalizedIdentityPart)
      .join("|");
    if ((contentId && contentIds.has(contentId)) || fingerprints.has(fingerprint)) continue;
    if (contentId) contentIds.add(contentId);
    fingerprints.add(fingerprint);
    unique.push({
      ...event,
      status: eventStatusForDate(event, serviceDate),
      homepage: safeOfficialEventHomepage(event.homepage),
    });
  }

  return unique.sort((left, right) => {
    if (left.status !== right.status) return left.status === "IN_OFFICIAL_PERIOD" ? -1 : 1;
    if (left.status === "UPCOMING") {
      const start = left.eventStart.localeCompare(right.eventStart);
      if (start) return start;
    }
    const distance = finiteDistance(left.distanceM) - finiteDistance(right.distanceM);
    if (distance) return distance;
    return compareText(left.title, right.title);
  });
}
