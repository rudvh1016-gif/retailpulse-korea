# Product UX diagnosis

## Top problems

1. The 82/77/71 values are static samples, but their visual prominence makes them feel measured.
2. Arbitrary 80/70 status thresholds have no calibration or documented distribution basis.
3. The comparison rows omit the words “Demand Index” and do not explain the unit.
4. Area details repeat “why” twice and give methodology the same weight as the conclusion.
5. The four-week average and deltas are fabricated demo comparisons.
6. Arrows and percentage changes appear without a real baseline.
7. Static flight fixtures drive airport passenger, airline, route and gate-zone claims.
8. Hard-coded gate ranges create false topology precision.
9. Official live signals are truthful but visually compete with the sample score explanation.
10. Mobile has no horizontal overflow, but long primary sections make the conclusion hard to find.

## Decision

- Keep the sample scores only as an explicitly named **Demo demand index**.
- Classify low/normal/high by interpolated thirds of the complete displayed demo cohort, not by arbitrary absolute cutoffs. This classification is only a sample-relative reading.
- Show area, index plus text level, and sample recommended time in one scan line.
- Remove fabricated history/deltas and merge the two “why” sections into one compact disclosure with at most three factual demo assumptions.
- Label official live signals as separate reference signals which are not yet inputs to the demo score.
- Remove demo passenger and gate-pressure claims from the live airport surface. Show an honest unavailable state until internal D1 data exists.
- Prepare a tested airport-pressure read model: physical-flight deduplication, actual versus scheduled truth, 60-minute buckets, gate freshness, authoritative zone mapping only, and exact-gate → zone → terminal degradation.

Sixty-minute buckets are the first contract because source timestamps resolve to minutes, hourly rows are easy to scan on mobile, and this avoids false half-hour precision before source cadence is verified.
