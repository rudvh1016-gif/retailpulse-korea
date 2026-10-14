/**
 * A store's place and hours as the business reader saves them on this device.
 *
 * Moved verbatim from ./business-prep, which re-exports all of it: the saved
 * preferences (./business-preferences) need only these, and the shell reads
 * them on every page, so every page no longer downloads the whole briefing's
 * rules (and the weather thresholds and flight split they use) with them.
 */
export type PrepTerminal = "T1" | "T2";
export type AirportSide = "EAST" | "WEST";

/** Store hours in KST, "HH:MM". Equal open and close mean open all day. */
export interface BusinessHours { open: string; close: string }

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function minutesOf(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = TIME.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Stored or typed hours, or null when anything about them is invalid. */
export function parseBusinessHours(value: unknown): BusinessHours | null {
  if (!value || typeof value !== "object") return null;
  const { open, close } = value as Record<string, unknown>;
  if (minutesOf(open) === null || minutesOf(close) === null) return null;
  return { open: open as string, close: close as string };
}
