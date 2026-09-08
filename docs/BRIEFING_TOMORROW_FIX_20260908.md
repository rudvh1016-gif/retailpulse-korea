# Briefing density and next-day departure schedules

Starting main: `8d02fb1e91f85b91812d2ca4138f281a63419ee1` (fetched, PR 163 inspected).

The owner's screenshot shows 31 T2 departures because the personal briefing used
the A3 duty-free-linked seasonal subset. The full bounded A1 scan already reads
D+1 records but discarded them. That subset is not an airport-wide total.

## Decision and truth boundaries

Retain only D+1 from the existing complete A1 scan as one replaceable date
snapshot in `airport_departure_schedule`. Keep observed `airport_flights` and
immutable predictions/outcomes untouched. Prefer the date snapshot for a future
briefing; identify it as official scheduled departures subject to change. Until
it exists, show the whole schedule as pending and label A3 as a partial duty-free
subset. The old statement that A3 owns all future semantics is superseded here:
A3 remains separate and available only as a partial fallback.

No provider endpoint, request parameter, API call, retry budget or scheduler was
added. The early/daily A1 windows populate D+1 during their next normal scan.
Do not force an extra scan merely to populate this table: preserve the existing
daily provider budget. Production counts require observing a successful scan;
local fixtures cannot establish the actual next-day number.

## Applicable hybrid audit

- Collection stays in Actions; Worker adds one indexed date lookup inside the
  existing single D1 batch, bounded to one snapshot and 2,000 physical flights.
- JSON is at most 500,000 characters; parse/ranking are bounded. Actual Worker
  CPU and D1 metering remain production verification items, not local PASS.
- Persistence compares semantic payload; changing retrieval time alone causes
  zero writes. A successful changed snapshot atomically replaces withdrawn rows.
  Empty/provider-failed scans preserve last-good data. Snapshot retention removes
  older date snapshots only, never actual history or forecast/outcome evidence.
- At the normal two daily scans, at most two snapshot upserts and one expired
  snapshot deletion per day; primary-key index amplification must be metered,
  but this is single-digit logical writes rather than per-flight UPSERTs.
- Traffic sensitivity adds at most one indexed row read per uncached summary:
  100 / 500 / 1k / 5k / 10k / 20k uncached reads add at most the same row counts.
  This is marginal cost only, not a total traffic-capacity claim. Cache unchanged.
- Existing 70/85/95 guardrails, zero paid runtime and source failure handling stay.
- Migration 0018 must run before the new collector; the existing production
  deployment applies migrations before Worker deployment. Roll back application
  code if needed; leave the harmless snapshot table, preserving actual history.

## Display

Personal briefing body 16→15px, headings 24–32→22–28px, main passenger lines
18→16px, card values 24→21px, notes 14→13px, button text 16→14px. Controls
retain a 44px touch height with less padding. Location and terminal share a row
where space allows; date buttons follow. User-selected font enlargement remains.

## Validation

Typecheck, lint and secret scan passed. SQLite regression exercises changed-only
writes, withdrawn-flight replacement, empty refresh preservation, bounded parser,
retention and truthful future briefing labels. A1 tests preserve current/history
counts while retaining tomorrow separately with no extra calls. Summary batching
tests retain one round trip with one additional statement. Migration tests cover
0018 alongside immutable forecast history protections.
