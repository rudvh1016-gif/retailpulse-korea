/**
 * The comparability guard.
 *
 * Why this is an operational check and not a UI concern
 * ────────────────────────────────────────────────────
 * Most false claims this product could make are not arithmetic errors. They are
 * two honest numbers put side by side when they do not measure the same thing:
 *
 *   - a flight's ORIGIN AIRPORT is not a passenger's NATIONALITY;
 *   - a subway station's ALIGHTING COUNT is not UNIQUE VISITORS;
 *   - FOREIGN PRESENCE in an area is not FOREIGN SALES in that area;
 *   - AIRPORT PASSENGERS are not STORE TRAFFIC;
 *   - DOMESTIC CARD SPEND is not FOREIGN SPEND;
 *   - an event's DATE RANGE is not "open right now".
 *
 * Each of those would render as a clean comparison and be wrong. So the rule is
 * inverted from the usual default: a comparison is NOT_COMPARABLE unless every
 * facet matches, and the guard names the facets that differ. Silence is never a
 * pass.
 */

/** The facets that must all match before two numbers may be compared. */
export interface ComparisonFacets {
  /** Who is counted: e.g. `short_stay_foreign`, `all_visitors`, `departing_passengers`. */
  populationUniverse: string;
  /** The KST calendar day, or a period identifier such as `2026-Q2`. */
  period: string;
  /** The time window inside that period, e.g. `14:00-15:00` or `full_day`. */
  timeWindow: string;
  /** The geographic scope, e.g. `myeongdong`, `ICN`. */
  area: string;
  /** Terminal scope where applicable, e.g. `T1`, `T2`, `ALL`, `NOT_APPLICABLE`. */
  terminalScope: string;
  /** The unit, e.g. `people`, `KRW`, `flights`. */
  unit: string;
  /** What the number means, e.g. `alighting_count`, `unique_visitors`. */
  metricDefinition: string;
}

export const COMPARISON_FACET_KEYS = [
  "populationUniverse",
  "period",
  "timeWindow",
  "area",
  "terminalScope",
  "unit",
  "metricDefinition",
] as const;

export type ComparisonFacetKey = (typeof COMPARISON_FACET_KEYS)[number];

export type ComparabilityVerdict = "COMPARABLE" | "NOT_COMPARABLE";

export interface ComparabilityResult {
  verdict: ComparabilityVerdict;
  /** Facet names that differ. Empty only when the verdict is COMPARABLE. */
  mismatches: ComparisonFacetKey[];
  /** Named rule that forbade the comparison, when one applies. */
  forbiddenBy: string | null;
  /** Short, display-safe explanation. */
  reason: string;
}

/**
 * Pairs that are never comparable no matter how the facets are spelled.
 *
 * These exist because facet equality is necessary but not sufficient: someone
 * can label station alighting counts and unique visitors both as
 * `metricDefinition: "visitors"` and the facet check would pass. The named rule
 * catches the mislabelling.
 */
export const INCOMPARABLE_METRIC_PAIRS: ReadonlyArray<{ rule: string; a: string; b: string; why: string }> = [
  {
    rule: "FLIGHT_ORIGIN_IS_NOT_NATIONALITY",
    a: "flight_origin_country",
    b: "passenger_nationality",
    why: "a route's origin airport does not establish who was on the aircraft",
  },
  {
    rule: "ALIGHTING_IS_NOT_UNIQUE_VISITORS",
    a: "station_alighting_count",
    b: "unique_visitors",
    why: "one person alighting twice is counted twice, and transfers are counted at every station",
  },
  {
    rule: "PRESENCE_IS_NOT_SALES",
    a: "foreign_presence",
    b: "foreign_sales",
    why: "presence in an area does not establish a purchase in it",
  },
  {
    rule: "AIRPORT_PASSENGERS_ARE_NOT_STORE_TRAFFIC",
    a: "airport_passengers",
    b: "store_traffic",
    why: "a passenger passing through a terminal did not necessarily enter any store",
  },
  {
    rule: "DOMESTIC_SPEND_IS_NOT_FOREIGN_SPEND",
    a: "domestic_card_spend",
    b: "foreign_card_spend",
    why: "the card issuer's country is not the cardholder's residence and the universes differ",
  },
  {
    rule: "EVENT_PERIOD_IS_NOT_OPEN_NOW",
    a: "event_date_range",
    b: "open_now",
    why: "an official period that includes today says nothing about opening hours right now",
  },
];

function findForbiddenRule(a: ComparisonFacets, b: ComparisonFacets): { rule: string; why: string } | null {
  for (const pair of INCOMPARABLE_METRIC_PAIRS) {
    const left = [a.metricDefinition, a.populationUniverse];
    const right = [b.metricDefinition, b.populationUniverse];
    const matchesForward = left.includes(pair.a) && right.includes(pair.b);
    const matchesReverse = left.includes(pair.b) && right.includes(pair.a);
    if (matchesForward || matchesReverse) return { rule: pair.rule, why: pair.why };
  }
  return null;
}

/**
 * Decides whether two measurements may be placed side by side.
 *
 * Named rules are checked FIRST, so a forbidden pair cannot be rescued by
 * relabelling its facets to match.
 */
export function checkComparability(a: ComparisonFacets, b: ComparisonFacets): ComparabilityResult {
  const forbidden = findForbiddenRule(a, b);
  if (forbidden) {
    return {
      verdict: "NOT_COMPARABLE",
      mismatches: [],
      forbiddenBy: forbidden.rule,
      reason: forbidden.why,
    };
  }
  const mismatches = COMPARISON_FACET_KEYS.filter((key) => a[key] !== b[key]);
  if (mismatches.length) {
    return {
      verdict: "NOT_COMPARABLE",
      mismatches,
      forbiddenBy: null,
      reason: `these measurements differ in ${mismatches.join(", ")}`,
    };
  }
  return { verdict: "COMPARABLE", mismatches: [], forbiddenBy: null, reason: "every facet matches" };
}
