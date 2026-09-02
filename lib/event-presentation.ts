export interface EventPresentationInput {
  contentId?: string | null;
  title: string;
  eventStart: string;
  eventEnd: string | null;
  distanceM: number | null;
  address?: string | null;
  overview?: string | null;
  homepage?: string | null;
}

export type EventPresentationStatus = "RUNNING" | "UPCOMING";

export type PreparedEvent<T extends EventPresentationInput> = T & {
  status: EventPresentationStatus;
  homepage: string | null;
};

function normalizedIdentityPart(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

export function eventStatusForDate(event: EventPresentationInput, serviceDate: string): EventPresentationStatus {
  const end = event.eventEnd ?? event.eventStart;
  return event.eventStart <= serviceDate && end >= serviceDate ? "RUNNING" : "UPCOMING";
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
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
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
    if (left.status !== right.status) return left.status === "RUNNING" ? -1 : 1;
    if (left.status === "UPCOMING") {
      const start = left.eventStart.localeCompare(right.eventStart);
      if (start) return start;
    }
    const distance = finiteDistance(left.distanceM) - finiteDistance(right.distanceM);
    if (distance) return distance;
    return compareText(left.title, right.title);
  });
}
