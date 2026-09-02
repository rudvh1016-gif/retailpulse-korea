/**
 * Truthful readings of the KMA short-term forecast categories.
 *
 * `getVilageFcst` already returns every category in one response; the collector
 * simply discarded most of them. Reading more of that same payload costs no
 * extra provider request, but it does introduce a trap: several categories are
 * documented as 정성정보 — qualitative values — and arrive as Korean strings
 * rather than numbers.
 *
 * PCP and SNO are the sharp edge. `"1.0mm 미만"` means *less than* 1mm; storing
 * it as `1.0` would turn a bound into a measurement the provider never made,
 * and every downstream reader would see a precise figure that is simply false.
 * `"강수없음"` is a categorical statement, not the number zero. So the rule
 * here is: the provider's own string is always preserved, and a number is
 * derived only when the provider actually gave an exact one.
 *
 * Nothing in this module invents a value. An unrecognized string is reported
 * as unknown with its raw text intact, never coerced.
 */

/** How the provider expressed an amount, beyond the raw string itself. */
export type KmaAmountKind =
  /** 강수없음 / 적설없음 — a categorical "none", which is not the number 0. */
  | "NONE"
  /** A bare exact measurement, e.g. `3.5mm`. */
  | "EXACT"
  /** An upper bound, e.g. `1.0mm 미만` — less than, never equal to. */
  | "BELOW"
  /** A closed range, e.g. `30.0~50.0mm`. */
  | "RANGE"
  /** A lower bound, e.g. `50.0mm 이상`. */
  | "AT_OR_ABOVE"
  /** Present but not in any documented shape. Kept raw, never guessed at. */
  | "UNKNOWN";

export interface KmaAmount {
  /** The provider's value, exactly as sent. This is the audit record. */
  raw: string;
  kind: KmaAmountKind;
  /**
   * The measurement, in the category's own unit (mm for PCP, cm for SNO),
   * and only when `kind` is `EXACT`. Null for every bound, range and
   * categorical value, because none of those is a measurement.
   */
  exact: number | null;
}

/** Values the provider uses to say a category simply does not apply. */
const NONE_VALUES = new Set(["강수없음", "적설없음", "없음", "-", "0"]);

/**
 * `"0"` is listed as a none-value on purpose: KMA sends it for an absent
 * amount rather than as a measured zero, and the two are not the same claim.
 */
export function parseKmaAmount(value: string | null | undefined): KmaAmount | null {
  if (value === null || value === undefined) return null;
  const raw = value.trim();
  if (!raw) return null;
  if (NONE_VALUES.has(raw)) return { raw, kind: "NONE", exact: null };

  // Bounds and ranges are checked before the exact form, because
  // "1.0mm 미만" contains a perfectly valid-looking "1.0mm".
  if (/미만\s*$/.test(raw)) return { raw, kind: "BELOW", exact: null };
  if (/이상\s*$/.test(raw)) return { raw, kind: "AT_OR_ABOVE", exact: null };
  if (raw.includes("~")) return { raw, kind: "RANGE", exact: null };

  const exact = /^(\d+(?:\.\d+)?)\s*(?:mm|cm)?$/.exec(raw);
  if (exact) {
    const amount = Number(exact[1]);
    if (Number.isFinite(amount)) return { raw, kind: "EXACT", exact: amount };
  }
  return { raw, kind: "UNKNOWN", exact: null };
}

/** Whole-number categories such as REH (humidity %). Null unless truly numeric. */
export function parseKmaInteger(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const raw = value.trim();
  if (!raw || !/^-?\d+(?:\.\d+)?$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

/**
 * Decimal categories stored as tenths, matching how TMP is already kept.
 * Integer tenths avoid the float drift that would otherwise make an unchanged
 * forecast look changed and trigger a needless write.
 */
export function parseKmaTenths(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const raw = value.trim();
  if (!raw || !/^-?\d+(?:\.\d+)?$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed * 10) : null;
}

/**
 * Official sky and precipitation-type codes are kept as the provider's own
 * codes rather than only as a derived label, so a later reading of the data
 * is never limited by today's mapping.
 */
const SKY_CODES = new Set(["1", "3", "4"]);
const PTY_CODES = new Set(["0", "1", "2", "3", "4", "5", "6", "7"]);

export function parseSkyCode(value: string | null | undefined): string | null {
  const raw = value?.trim();
  return raw && SKY_CODES.has(raw) ? raw : null;
}

export function parsePrecipitationTypeCode(value: string | null | undefined): string | null {
  const raw = value?.trim();
  return raw && PTY_CODES.has(raw) ? raw : null;
}
