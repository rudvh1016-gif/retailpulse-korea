# Migration 0007 free-tier preflight

Written 2026-09-01 before applying `drizzle/0007_d1_read_budget_indexes.sql` to
Production. The deploy that will apply it is scheduled for just after the
00:00 UTC quota reset, and this file is the budget decision that deploy depends
on — read it before running the deploy, and abort per the criteria below rather
than pushing through.

## Official limits (Cloudflare docs, `partials/workers/d1-pricing`)

| | Free |
| --- | --- |
| Rows read | **5,000,000 / day** |
| Rows written | **100,000 / day** |
| Storage | 5 GB total |
| Reset | "Free limits reset daily at 00:00 UTC" |

Rows read is "how many rows a query reads (scans), regardless of the size of
each row" — rows scanned, not rows returned. That is precisely the accounting
that caused the 2026-09-01 incident (Cloudflare error 7500).

**Writes, not reads, are the binding constraint for this migration.** The index
build is a one-time write cost, and exhausting writes stops collection, which
is worse than exhausting reads.

## Measured write amplification

Production collector logs report both `changed rows` and `storage writes`, and
the ratio is the existing index amplification — one extra row written per index
on the table:

| Source | changed rows | storage writes | ratio |
| --- | --- | --- | --- |
| SEOUL_CITYDATA_PPLTN | 39 | 117 | 3× |
| KMA_VILAGE_FCST | 126 | 378 | 3× |
| INCHEON_DEPARTURE_CONGESTION | 6 | 18 | 3× |
| INCHEON_PASSENGER_FORECAST | 576 | 1,152 | 2× |

So **each added index costs one row written per changed row, forever.** That is
the number that matters for steady state, and one index entry per existing row
for the one-time build.

## One-time build cost (conservative upper bound)

Row counts are measured where the collector reports them and otherwise derived
from the measured write rate over the ~6 days since the first production deploy
on 2026-08-27. They are deliberately rounded up.

| Table | rows | basis | new indexes | entries |
| --- | ---: | --- | ---: | ---: |
| `seoul_realtime_forecast` | ~20,700 | 36 changed/cycle × 96/day × 6d | 1 | ~20,700 |
| `airport_flights` | 11,733 | measured `population 11733` | 1 | 11,733 |
| `weather_forecast` | ~6,000 | 126 changed × 8/day × 6d | 2 | ~12,000 |
| `airport_congestion` | ~8,100 | 14 changed/cycle × 96/day × 6d | 1 | ~8,100 |
| `seoul_realtime_area` | ~1,700 | 3/cycle × 96/day × 6d | 2 | ~3,500 |
| `seoul_estimated_sales` | ~350 | measured `changed writes 348` | 1 | ~350 |
| **Total** | | | **8** | **~56,400** |

If Cloudflare bills one row written per index entry created, the build costs
**~56,400 writes = ~56% of the daily allowance.** Whether DDL is billed that way
is *not* documented, so this is an upper bound, not a prediction.

## Steady state after the migration

| | writes/day |
| --- | ---: |
| Today's measured collector writes | ~23,400 |
| Added by the 8 new indexes | ~+8,450 |
| **Projected steady state** | **~31,850 (32% of allowance)** |

Comfortable, and it is the number that persists.

## Decision

**Apply the migration in one deploy, immediately after the 00:00 UTC reset.**

Worst case on the migration day is ~56,400 build + ~31,850 collection ≈
**~88,250 writes, about 88% of the allowance.** That sits in the 70–90% band, so
it got the closer look this file records, and three things justify proceeding
rather than staging it:

1. 56,400 is an upper bound that assumes DDL bills one write per index entry.
   The real figure may be far lower.
2. Staging does not actually work here. `wrangler d1 migrations apply` runs every
   pending migration in one invocation, so splitting 0007 into two files would
   still apply both in the same deploy unless the second were withheld from the
   repository — which trades a measurable risk for an unmerged-migration risk.
3. The failure mode is recoverable and non-destructive. Exhausting writes blocks
   further writes until the next reset; stored data is untouched, last-good is
   preserved, and collection resumes automatically at 00:00 UTC. No data is lost
   and no manual repair is needed.

Deploying right after the reset is what keeps the margin: the day's collection
has barely started, so the build competes with almost nothing.

## Abort criteria for the deploying session

- If the migration step fails with error 7500 again, **stop**. Do not retry, do
  not upgrade the plan. Report the blocker.
- After the migration, before treating the deploy as done, check the reported
  `rows_written` if Wrangler surfaces it. If the build alone consumed more than
  **70,000** writes, do not run any further optional D1 diagnostics that day —
  leave the remaining budget to the collectors.
- Read-only verification for the day stays within **100,000 rows read**, which is
  2% of the read allowance.
- Never drop an index from 0007 to make the budget fit. Every one of the eight is
  justified by a measured query plan in `tests/d1-read-plans.test.mjs`; removing
  one puts a growing full scan back on the public hot path.
