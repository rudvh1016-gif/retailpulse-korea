/**
 * A store's own feeling about its day, kept on this device only.
 *
 * It records the date, the place, the business type and one of three
 * feelings — nothing else, and no free text, so a note can never carry a
 * name, a phone number or a sales figure. It is the reader's own record,
 * never mixed with official data: it is not sent anywhere, it is never used
 * in a comparison, and it can be changed or deleted at any time.
 */
export const FEELING_KEY = "koretail-feeling-v1";
export const FEELING_LIMIT = 60;
export const FEELING_KEEP_DAYS = 90;

export const FEELINGS = ["BUSIER", "USUAL", "QUIETER"] as const;
export type Feeling = typeof FEELINGS[number];

export interface FeelingEntry {
  date: string;
  place: string;
  industry: string;
  feeling: Feeling;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PLACE = /^(area:(myeongdong|hongdae|seongsu|itaewon)|airport:T[12])$/;
const INDUSTRY = /^(beauty|fashion|food|convenience|popup|tourism)$/;

function isEntry(value: unknown): value is FeelingEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.date === "string" && DAY.test(entry.date) && typeof entry.place === "string" && PLACE.test(entry.place)
    && typeof entry.industry === "string" && INDUSTRY.test(entry.industry) && FEELINGS.includes(entry.feeling as Feeling)
    && Object.keys(entry).length === 4;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Strict, and pruned to the retention window as it is read. */
export function parseFeelings(raw: string | null | undefined, todayKst: string): FeelingEntry[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter(isEntry)
      .filter((entry) => entry.date <= todayKst && daysBetween(entry.date, todayKst) < FEELING_KEEP_DAYS)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-FEELING_LIMIT);
  } catch {
    return [];
  }
}

/**
 * Records or replaces the feeling for one date, place and business type.
 * A future date is refused: a feeling is about a day that has happened.
 */
export function recordFeeling(entries: readonly FeelingEntry[], entry: FeelingEntry, todayKst: string): FeelingEntry[] {
  if (!isEntry(entry) || entry.date > todayKst) throw new Error("invalid_feeling");
  const others = entries.filter((row) => !(row.date === entry.date && row.place === entry.place && row.industry === entry.industry));
  return [...others, entry].sort((a, b) => a.date.localeCompare(b.date)).slice(-FEELING_LIMIT);
}

export function removeFeeling(entries: readonly FeelingEntry[], date: string, place: string, industry: string): FeelingEntry[] {
  return entries.filter((row) => !(row.date === date && row.place === place && row.industry === industry));
}
