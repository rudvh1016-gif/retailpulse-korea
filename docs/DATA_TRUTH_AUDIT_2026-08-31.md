# Data truth audit — 2026-08-31

Evidence source: the read-only Production diagnostic
(`Inspect Production Operations`, run 33403447632, branch
`feat/koretail-final-ux`, 2026-08-31T14:35Z / 23:35 KST). It performs zero
provider calls and executes only SELECTs. The `dataCoverage` probes added in
that run are what separate "the collector ran" from "the screen has a row for
the hour the reader is looking at" — a distinction `source_health` alone
cannot make.

## Why this audit was needed

Two symptoms were reported: the airport screen showed **확인 불가** where the
official expected-passenger total belongs, and every Seoul area said
**"오늘 남은 시간 혼잡 예측을 확인할 수 없습니다"**. Both looked like collection
failures. Neither was. In both cases the data was present in D1 and the
product was discarding it.

## Per-source state

| Source | Collector | Data in D1 | Reaches the screen | Note |
| --- | --- | --- | --- | --- |
| A1 `INCHEON_FLIGHT_DETAIL` | LIVE | 544 departures for 2026-08-31, 100% with a gate | Yes | Retrieved 08-30 15:03Z; the range fetch covers D-3…D+6, so today is present without a same-day run. Not re-run manually. |
| A2 `INCHEON_DUTY_FREE_ACTUAL` | ERROR (TIMEOUT) | Last retrieval 08-30 13:07Z | Not used on screen | Provider timeout; no product surface depends on it. |
| A3 `INCHEON_SCHEDULED_DUTY_FREE` | ERROR (TIMEOUT) | Last retrieval 08-30 13:07Z | Not used on screen | Same. |
| A4-T1 `INCHEON_DEPARTURE_CONGESTION` | ERROR | **Fresh**: 12 zones observed 22:51 KST | Yes | The *latest attempt* timed out (`NETWORK_UND_ERR_CONNECT_TIMEOUT`, 2 consecutive). The stored observation is recent and is displayed with its own timestamp, going STALE after 20 minutes. Collection problem, not a display problem. |
| A4-T2 `INCHEON_DEPARTURE_CONGESTION_T2` | ERROR | **Fresh**: 8 zones observed 22:53 KST | Yes | Same shape as T1. |
| A5 `INCHEON_PASSENGER_FORECAST` | LIVE (was silently lossy) | 23 of 24 hourly bands per day | **Was blocked → now yes** | See "Bug 1". |
| S1 `SEOUL_CITYDATA_PPLTN` | LIVE | 3/3 areas, observation 22:55 KST + a 12-band forecast per area | **Was discarded → now yes** | See "Bug 2". |
| S2 `SEOUL_SHORT_STAY_FOREIGN_LIVING_POPULATION` | OFFICIAL_HISTORICAL | Reference 2026-07-24 | Yes | Published with a delay by design; labelled as delayed, not real-time. |
| S3 `SEOUL_ESTIMATED_SALES` | OFFICIAL_HISTORICAL | Quarter 20261, 3/3 areas | Yes | Quarterly estimate, labelled as not POS sales. |
| W1 `KMA_VILAGE_FCST` | LIVE | 39 bands per area, 34 still ahead | Yes | Issue 17:00 KST covering to 2026-09-02 08:00. |
| T1 `KTO_TOURAPI_EVENT` | ERROR (TIMEOUT) | 13 / 1 / 1 upcoming events per area from 08-30 | Yes | Stored events still render; the failing attempt only stops new ones arriving. |

## Bug 1 — the airport lost the last band of every day

`airport_passenger_forecast` held exactly 23 of 24 hourly bands for both
stored dates, ending at 23:00 instead of the following midnight, while the
collector logged one `SCHEMA_A5_ATIME_END_HOUR` rejection per request.

`evaluateTerminalCoverage` requires the day's bands to be gapless and anchored
to the 00:00–00:00 KST boundary before it will call coverage COMPLETE. One
missing band made that impossible, so coverage was permanently PARTIAL — which
is exactly the state that (correctly) withholds the daily total, the peak and
the timeline. The honesty gate was working; it was being fed a day that was
missing its final hour.

The provider writes that final band as the clock wrapping past midnight
(`23_00`) as well as `23_24`. The parser accepted `23_24` and rejected `23_00`
as an out-of-range end hour. `23_00` is now normalized to next-day midnight,
because a band starting at 23:00 and ending at hour 00 can only end at the
following midnight. A `00` end hour after any other start (`05_00`) is still
rejected rather than being given an invented meaning.

The fix cannot fabricate coverage: if the label were something else, the band
still would not parse and the screen would still say 확인 불가.

**Confirmed against the provider** (collector run 33410264971 on the fixed
code, coverage probe 33410430817, both 2026-08-31T15:45–15:47Z):

| targetDate | terminal | bands | lastBandEnd | retrievedAt |
| --- | --- | --- | --- | --- |
| 2026-09-01 | T1 / T2 | **24** | 2026-09-02T00:00:00+09:00 | 15:45:54Z (fixed parser) |
| 2026-09-02 | T1 / T2 | **24** | 2026-09-03T00:00:00+09:00 | 15:45:54Z (fixed parser) |
| 2026-08-31 | T1 / T2 | 23 | 2026-08-31T23:00:00+09:00 | 14:23:00Z (old parser) |

24 hourly bands anchored 00:00 → next-day 00:00 is exactly what
`evaluateTerminalCoverage` requires, so those days report COMPLETE and the
daily total, peak, timeline and remaining-departures figure all render real
numbers.

2026-08-31 stays at 23 bands permanently. It was collected before the fix,
and by the time the fix shipped the KST day had rolled over, so the collector
no longer requests it. That is the intended behaviour of an immutable archive:
a past day is not rewritten to look better than it was recorded.

## Bug 2 — Seoul's forecast was thrown away every evening

Seoul publishes a rolling 12-hour forecast. At the moment of the diagnostic
(22:55 KST) the latest issue covered **00:00–11:00 the next day** — so
`bandsToday` was 0 for all three areas.

The brief filtered forecast bands to the current calendar day, so from
mid-evening onward it discarded all twelve official bands and reported that no
forecast existed. The horizon is now used as published, and each peak carries
the day it falls on (`dayOffset`), so the reader is told "내일 04:00–05:00"
instead of being told nothing.

## Cost note

While fixing the above, two per-request D1 reads were removed from
`/api/live/summary`: an unused recorded-observation query, and the 1,200-row
flight board. The board now has its own endpoint fetched only when that tab is
opened, so the page every visitor loads no longer pays for a list most of them
never see.

## What remains outside this change

- A2, A3 and T1 are failing at the provider with timeouts. No product surface
  presents them as current, and none is fabricated in their absence.
- A4-T1/T2 collection is intermittently timing out. Stored observations stay
  visible with their own timestamps and go STALE after 20 minutes; the fix for
  the provider-side timeouts is not attempted here.
- A5 still rejects one row per request with `SCHEMA_A5_ADATE_FORMAT`. That row
  is not an hourly band (its `adate` is not a date), and dropping it is
  correct; all 24 hourly bands are accounted for once the wrap band parses.
