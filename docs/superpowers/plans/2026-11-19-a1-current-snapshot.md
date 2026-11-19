# Exact current A1 generation for the glance flight card

The Nov 19 weekly comparison refused comparison correctly: complete Nov 12
T2 baseline 249; current retained archive 526 overall (T2 251); latest
verified all-page A1 generation 525 unique (117 pages). The one-row
difference cannot be attributed to a particular terminal from the retained
counts or to an individual withdrawn flight. Do not backfill or rerun the
provider solely to repair that past generation.

Build scope tallies from each normal complete A1 scan's exact same-day
canonical physical records. Preserve cancellation exclusion, main versus
concourse scope and unknown-building airport count. Put a classification-
versioned tally and digest of the exact projection in the existing SUCCESS
detail, under the existing 500-byte limit; health detail unchanged. Original
Nov 19 example prefix is 258 bytes, a typical suffix 131, format maximum 140.
No extra provider calls, collector schedule, SQL statement, migration, raw
history writes, or queries are added. Existing read returns separate exact
proof tied to date, run/health clocks and full population balance. Overview
uses one exact total for the headline and both comparisons only when the
exact generation matches current LIVE summary and the date/flight read are
valid; the weekly change still requires a completed prior-date baseline.
Raw/board/shift/country/legacy semantics and UI layout remain unchanged.
A known invalid modern proof withholds comparison rather than overriding
the old guard. The added title describes the current tally as provisional.

Prior unmarked attempts and older versions retain legacy behavior. Production
requires reviewed CI and the next existing successful A1 collection after
deployment; no synthetic comparison or historical record rewrite.
