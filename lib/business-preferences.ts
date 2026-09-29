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
import { parseBusinessHours, type BusinessHours, type PrepTerminal } from "./business-prep";

export const BUSINESS_KEY = "koretail-business-v1";

export interface BusinessPreferences {
  version: 1;
  place: "area" | "airport";
  terminal: PrepTerminal;
  /** null = no hours set; the briefing reads the whole day. */
  hours: BusinessHours | null;
}

export const DEFAULT_BUSINESS_PREFERENCES: BusinessPreferences = { version: 1, place: "area", terminal: "T1", hours: null };

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
    const hours = value.hours === null ? null : parseBusinessHours(value.hours);
    if (value.hours !== null && !hours) return null;
    return { version: 1, place, terminal, hours };
  } catch {
    return null;
  }
}

export function serializeBusinessPreferences(value: BusinessPreferences): string {
  return JSON.stringify({ version: 1, place: value.place, terminal: value.terminal, hours: value.hours });
}

/** Half-hour steps for the hour pickers, "00:00" … "23:30". */
export const HOUR_CHOICES: readonly string[] = Array.from({ length: 48 }, (_, index) =>
  `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);
