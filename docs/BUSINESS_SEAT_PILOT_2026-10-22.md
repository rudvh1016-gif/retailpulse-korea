# Business-seat supply pilot — evidence and data contract, 2026-10-22

**The checked dataset does not complete the actual 30-flight / 3-city / 3-day pilot.**

## Concrete result

A reproducible official-source dataset contains **three published-schedule entries, one city, three service dates**. It contains **zero dated aircraft observations and zero verified flight configurations**. Verified business-seat subtotal is **null, not 0 seats**. There are no passenger, nationality, wealth, VIP or sales estimates.

| Published departure (KST) | Route | Official published plan | Dated aircraft / cabin assignment |
| --- | --- | --- | --- |
| 2026-10-20 11:05 · KE917 | ICN → Zurich | B787-10, 325 total / 36 Prestige | Unknown |
| 2026-10-22 11:05 · KE917 | ICN → Zurich | B787-10, 325 total / 36 Prestige | Unknown |
| 2026-10-24 11:05 · KE917 | ICN → Zurich | B787-10, 325 total / 36 Prestige | Unknown |

These dates are a deterministic expansion of Korean Air's [2026-05-28 official notice](https://news.koreanair.com/대한항공-스위스-취리히-여객-노선-취항-50주년-한·스/): Tue/Thu/Sat KE917 at 11:05 during the stated summer period ending October 24, with B787-10 / 36 Prestige from June 2. This proves what the airline published, **not that those aircraft were actually assigned or those flights operated**. Do not aggregate 108 seats as current verified supply. The notice does not establish October 25 or winter-season schedules.

## Inspected inputs and gaps

- Current adapter has flight/master, direction, scheduled date/time, upstream fid, terminal, gate, check-in and status. Existing canonical identity collapses codeshares using direction + service day + operating flight + scheduled time.
- Optional aircraft subtype/registration is not a configuration identifier. A3 is a separate timetable, not actual assignment.
- The checked real-source input contains published schedules, not auditable dated flight/type/tail/configuration observations. Test fixtures are synthetic and excluded from the real-source dataset.
- [A1 API 15140153](https://www.data.go.kr/data/15140153/openapi.do), checked October 22, still advertises aircraft subtype/registration, D−3..D+6 subject to approval and season boundaries. Documentation is not proof of populated fields in current responses. `regNo` and compatibility alias `aircraftRegNo` are accepted; actual source coverage and exact live spelling remain unmeasured.
- [Korean Air B777 fleet](https://www.koreanair.com/contents/plan-your-travel/in-flight-experience/fleet/b777) lists 328, 277 and 291 total-seat versions of B777-300ER. The accessible seat-map pages did not expose readable per-cabin counts in this research pass; those counts are deliberately null, not copied from third-party tables.
- [Asiana official A350 cabin guide](https://asiana350.flyasiana.com/pc/html/index.html?keyGroup=09&pageId=PC_0072) explicitly gives 311 total / 28 Business Smartium / 36 Economy Smartium / 247 Economy. Economy Smartium is not added to business seats or silently relabelled as premium economy. A model-only match remains unverified even if the catalog contains only one layout.
- Source `checkedAt` is the research observation time; `publishedAt` is the source's publication date where known. Neither means an aircraft operated. Existing changed-only row `retrievedAt` is the retained content-version timestamp, not proof that every recent refresh changed the row.

## Optional aircraft metadata capture

1. Nullable `aircraft_subtype` / `aircraft_reg_no` added to existing flight/current and optional change-history tables. No new table/index/backfill/raw-payload archive.
2. Only already-returned A1 fields are normalized. Bounded ASCII tokens (32/16 characters); invalid/missing values are discarded; conflicting valid registration aliases yield null. A2 cannot introduce aircraft metadata.
3. Absent fields preserve **exact pre-change semantic hashes** and future payload shape. Meaningful type/tail change or disappearance changes the hash; timestamps alone do not. Disappearance clears old values rather than implying a stale tail is current.
4. Current-day, future-snapshot and generic collector paths share operating-row-first physical-flight deduplication before persistence; a marketing row, including one without aircraft fields, cannot replace the operator's metadata. An observed metadata row is not configuration evidence. The offline resolver rejects conflicting marketing observations when supplied; the existing public projection does not preserve all marketing aliases, so upstream contradiction detection is not claimed.
5. Existing future snapshots and the already-capped flight-board read carry these two fields. Request count, page/retry/reservation budgets, schedule 500 KB/day + 3 MB total guards, cache policy and 1200-row display cap are unchanged. Summary and flight-share formulas do not consume these fields.
6. Normal deployment must apply migration `0033_airport_aircraft_metadata.sql` before changed collector/read code. Version rollback may stop exposing/capturing fields while additive nullable columns can remain; no destructive rollback is needed.

## Reproduce

```sh
node --import tsx scripts/business-seat-pilot.ts \
  data/business-seat-pilot/official-schedule-input.json \
  data/business-seat-pilot/readout.json
node --experimental-sqlite --import tsx --test --test-concurrency=1 \
  tests/aircraft-fields.test.mjs tests/business-seat-pilot.test.ts
```

Input interfaces are in `lib/business-seat-pilot.ts`; the checked input and deterministic result are in `data/business-seat-pilot/`. Sources, dates, confidence, missing fields and marketing aliases are retained per output row.

The offline resolver requires an explicit dated flight/configuration assignment or a dated official tail/configuration assignment matching the exact reviewed flight observation, service date, operator/type and registration. Model alone, tail alone, conflicts, expired mappings and subsequent observation/swap invalidate a unique assignment. A catalogue candidate range is separate context, **not an assigned-flight interval**. An exact configuration may remain count-unconfirmed; the known layout link is retained separately. City coverage uses an explicit city field, not distinct airport codes (NRT/HND are one city). Cancelled flights are excluded; unknown is never converted to zero. No automatic tail-to-layout source or fully unattended freshness guarantee has been established.

## Observation denominator

`datedFlightRecords`, `serviceDates`, `cities`, `actualPilotTargetMet`, unknown-configuration counts and capacity coverage use the same eligible-observation denominator. A qualifying row must be a dated flight record, have a valid HTTPS source with non-future observation/publication timestamps, not be cancelled, and have no conflicting codeshare evidence. Its service date cannot be later than the KST day of observation: a held future schedule is not an observed service-day record. Excluded dated rows are counted separately. Published schedules remain available in the per-row output but do not contribute to actual-pilot dates, cities or totals.

The sole cutoff is the explicit input `asOf` instant, not the system clock. `asOf` and source `checkedAt` require timezone-qualified ISO timestamps and are compared as UTC instants. A date-only `publishedAt` is interpreted as the UTC calendar-day lower bound, not a precise release time. The service-day check uses KST for `checkedAt`. For flight rows, `checkedAt` records when the flight evidence was observed; for layout sources it records when the reference was checked. Neither proves actual takeoff or completed operation.

Source URLs and factual content must still be reviewed against primary official evidence; URL/timestamp checks alone do not authenticate a source or prove that a flight operated. Meeting the sampling target does not establish cabin-capacity coverage. Unknown configurations never count as zero-seat flights.

## Cost and safety scope

- Additional provider calls: **0 by code path**. No additional credentials, scheduler or paid API is introduced.
- Each deduplicated physical flight uses the existing current-flight statement and optional history statement; no index is added. New values can cause one changed write per affected flight; repeat identical observations remain no-op. Optional legacy change-history adds columns to already-existing rows, not extra rows per scan.
- Worst bounded string payload addition: at most 48 ASCII value bytes per stored flight, excluding SQLite record overhead. At 550 physical flights/day that is 26,400 bytes/day (~9.64 MB/year) if both max-length fields are present every day. This is an **upper value-byte estimate**, not measured D1 storage or official quota usage. Optional change-history depends on actual swap rate and remains unmeasured.
- Synthetic six-date × 550-flight schedule test measured **1,054,896 bytes total, 176,001 max/day, +184,800 bytes** versus the same rows without aircraft fields, below both existing bounds; no guard was raised. Current free-tier usage/safety is not established by offline tests.
- No images/seat-map copying or commercial bulk-fetch rights are assumed. Short factual counts and official deep links only; automated source monitoring remains a separate rights/refresh review.
