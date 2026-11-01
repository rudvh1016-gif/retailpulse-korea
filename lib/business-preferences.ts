/**
 * The store conditions a business reader chose on this device: where the
 * store is and when it is open. The business type is not here; it already
 * lives in `retailpulse-preferences` and is shared with the industry guide,
 * so the briefing and the guide can never show two different business types.
 *
 * Nothing is saved until the reader saves it. An absent or unreadable value
 * means "whole day, no hours set" — a default is never written back as if
 * the reader had chosen it.
 */
import { parseBusinessHours, type AirportSide, type BusinessHours, type PrepTerminal } from "./business-hours";
import type { PrepArea, PrepPlace } from "./business-prep";

export const BUSINESS_KEY = "koretail-business-v1";

export interface BusinessPreferences {
  version: 1;
  place: "area" | "airport";
  terminal: PrepTerminal;
  /**
   * Side of the terminal the airport store is on; null = the whole terminal.
   * Optional in stored values, so a value saved before sides existed still reads.
   */
  side: AirportSide | null;
  /** null = no hours set; the briefing reads the whole day. */
  hours: BusinessHours | null;
}

export const DEFAULT_BUSINESS_PREFERENCES: BusinessPreferences = { version: 1, place: "airport", terminal: "T1", side: null, hours: null };

/** An explicit link changes this visit's scope, never the reader's saved store. */
export function sharedBusinessPlace(params: Pick<URLSearchParams, "get">): PrepPlace | null {
  const kind = params.get("place"), area = params.get("area"), terminal = params.get("terminal"), side = params.get("side");
  if ((kind === "area" || kind === null) && (area === "myeongdong" || area === "hongdae" || area === "seongsu" || area === "itaewon")) return { kind: "area", area };
  if (kind === "airport" && (terminal === "T1" || terminal === "T2")) return { kind: "airport", terminal, side: side === "EAST" || side === "WEST" ? side : null };
  return null;
}

export function businessScopeParams(place: PrepPlace): URLSearchParams {
  const params = new URLSearchParams({ place: place.kind });
  if (place.kind === "area") params.set("area", place.area);
  else {
    params.set("terminal", place.terminal);
    if (place.side) params.set("side", place.side);
  }
  return params;
}

export function resolveBusinessContext(preferences: BusinessPreferences, area: PrepArea, scope: PrepPlace | null) {
  const effective = scope ? {
    ...preferences,
    place: scope.kind,
    ...(scope.kind === "airport" ? { terminal: scope.terminal, side: scope.side ?? null } : {}),
  } : preferences;
  const place: PrepPlace = scope ?? (effective.place === "airport"
    ? { kind: "airport", terminal: effective.terminal, side: effective.side }
    : { kind: "area", area });
  return { preferences: effective, place };
}

/**
 * Strict: a value from another version, a hand-edited value or a truncated
 * write yields the defaults rather than a half-understood setting.
 */
export function parseBusinessPreferences(raw: string | null | undefined): BusinessPreferences | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown> | null;
    if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1) return null;
    const place = value.place === "airport" ? "airport" : value.place === "area" ? "area" : null;
    const terminal = value.terminal === "T2" ? "T2" : value.terminal === "T1" ? "T1" : null;
    if (!place || !terminal) return null;
    const side = value.side === undefined || value.side === null ? null : value.side === "EAST" ? "EAST" : value.side === "WEST" ? "WEST" : undefined;
    if (side === undefined) return null;
    const hours = value.hours === null ? null : parseBusinessHours(value.hours);
    if (value.hours !== null && !hours) return null;
    return { version: 1, place, terminal, side, hours };
  } catch {
    return null;
  }
}

export function serializeBusinessPreferences(value: BusinessPreferences): string {
  return JSON.stringify({ version: 1, place: value.place, terminal: value.terminal, side: value.side, hours: value.hours });
}

/** Half-hour steps for the hour pickers, "00:00" … "23:30". */
export const HOUR_CHOICES: readonly string[] = Array.from({ length: 48 }, (_, index) =>
  `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);
