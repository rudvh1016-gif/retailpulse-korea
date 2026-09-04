# Airport Retail A2 → A4 — what is true, and how it was proven

**Recorded:** 2026-09-04 KST
**Scope:** the official facility directory (A2), the verified facility-to-zone
mapping (A3) and the per-facility operations brief (A4).

Every number here comes from a real Production run, named by its run id, and
was read back from D1 independently of whatever the collector claimed.

## A2 — the official facility directory

**First real import** (run 33809979088, manual one-shot, `confirm=IMPORT`):
SUCCESS, 52 provider requests, **1,221 facilities stored**, 4,884 D1 storage
writes, 0 unmatched translation rows.

**Idempotent re-collection** (run 33811307402, `force_facility_refresh=true`):
a full second pass over all 52 pages and all four languages against unchanged
provider data produced **`changedRows: 0` and `storage writes 0`**. That is the
changed-only semantic write path proven in Production rather than in a fixture.

**Last-good preservation** was proven by a real failure, not a simulated one.
Run 33810820692 hit a transient `NETWORK / UND_ERR_CONNECT_TIMEOUT` before its
first request completed. Read back immediately after (run 33810934859): all
1,221 rows intact, every coverage number identical, `newestRetrievedAt` still
the *successful* run's timestamp — the failed run touched no row.

That check also found a real defect: source health said `ERROR` ("nothing is
stored") instead of `STALE` ("a directory exists, it just could not be
refreshed"). Root cause was a missing `first()` on the D1 REST adapter, whose
caller turns any throw into a count of zero. Fixed, with a test that scans
call sites so the next missing method fails in CI instead of in Production.

### Coverage as stored (probes `airport_facility_totals`, `airport_facility_by_terminal_category`)

| | |
|---|---|
| stored facilities | **1,221** |
| terminals | T1 556 · T2 584 · 탑승동 81 · unrecognised **0** |
| area | duty-free 595 · general 626 · unknown **0** |
| side | departure 1,159 · arrival 62 · unknown **0** |
| categories | 면세점 165 · 식당·카페 234 · 편의점 15 · 약국 8 · 환전·통신 119 · 여객 서비스 680 |
| names | KO/EN/JA/ZH all 1,221 — missing **0** in every language |
| quality | **1,221 VALID / 0 PARTIAL** |
| missing | official hours 154 · phone 436 · location text 48 · terminal **0** |
| source health | **LIVE**, `consecutive_failures` 0 |

### Why 1,221 and not the provider's `totalCount` of 1,232

Not a loss. All three translation passes matched **1,232/1,232** rows against
the Korean pass, which is only possible if every translation row's `sn`
already existed. The Korean response therefore ships 1,232 rows carrying
1,221 distinct `sn` values, and `collector_runs.records_read` 1,232 against
`records_written` 1,221 measures exactly that. `sn` is the provider's own key
and the table's primary key, so one row per `sn` is the correct reading of the
source. Nothing was dropped for failing validation.

### The 81 unrecognised terminals — resolved 2026-09-04

They were never junk. Zero rows carried the documented `G01`/`G02`/`G03`
codes; instead the provider sent an **undocumented `P02`** for 81 rows, and
every sampled row's own published location text said 탑승동 ("탑승동 3층 동편
107번 탑승구 부근"). `resolveFacilityTerminal` now reads such a code only when
**two independent pieces of evidence agree** — the consistent undocumented code
*and* the official location text naming the building — because an undocumented
code can be reassigned by the provider at any time and a building name alone
can belong to a sentence about a neighbour. The basis of every resolution is
recorded as `DOCUMENTED_CODE` / `UNDOCUMENTED_CODE_WITH_LOCATION_TEXT` /
`OFFICIAL_LOCATION_TEXT` / `NONE`, so each one is auditable. Brand, trade,
neighbouring facility id and gate number are never used to infer a terminal.

**Proven in Production** (run 33834973908, forced re-collection): terminals now
read T1 556 · T2 584 · **탑승동 81**, `missingTerminal` **0**, and quality
1,221 VALID / **0 PARTIAL**. The write cost was **81 changed rows and 243
storage writes** out of 1,221 facilities — the changed-only path writing exactly
the rows whose meaning changed and nothing else.

That run also re-proved last-good preservation the hard way: the attempt
immediately before it (run 33834868567) died on a transient
`NETWORK / UND_ERR_CONNECT_TIMEOUT` before its first provider request
completed. It wrote nothing, deleted nothing, and moved source health to
**STALE**, not ERROR — the site kept serving all 1,221 rows throughout, which
the site smoke of that window recorded independently.

## A3 — verified facility-to-zone mapping

`config/airport-zone-map.v1.json`, derived read-only from the stored A2 rows
(run 33812037794; regenerated read-only against the post-fix directory in run
33835162738).

| method | count | |
|---|---:|---|
| `OFFICIAL_DIRECT` | **459** | 423 a single gate · 4 a stated gate range · 33 a departure checkpoint |
| `OFFICIAL_MAP_REVIEW` | **0** | |
| `AMBIGUOUS` | **762** | |

**Zero map-review entries is the honest count.** That method requires a human
to locate a facility on an official Incheon Airport map. Nobody has, so no
record claims it.

**Terminals in the record.** 220 T2 · 191 T1 · 48 탑승동, none null. The 48
are the mapped subset of the 81 facilities the `P02` fix resolved; since
Production now reports `missingTerminal` 0, a mapped record with no terminal
would mean the directory regressed, and a test says so.

**762 ambiguous is not a gap to close by loosening the rules.** Those
facilities' published location text names no gate. A test asserts
`ambiguous > 0` so a later change cannot quietly claim 100% coverage.

### False proximity claims = 0, structurally

Three independent properties, each tested:

1. The record lists only facilities whose text proved a zone, so a facility it
   omits resolves to `AMBIGUOUS` with null gate, group and checkpoint.
2. The endpoint reads every zone field from the resolved mapping, never from
   the facility row — it has nothing to render a gate from otherwise.
3. Each listed record's `evidenceText` is a verbatim substring of its own
   `officialLocationRaw`.

The production smoke re-checks the first property against live edge output.

### Rules the extraction follows

- A stated range stays literal (`24~27`), never enumerated: the text does not
  say every number in between is a real gate.
- Two gates in one string are a group, never a pick.
- A digit is only a gate next to a gate word — `지하1층`, `3번 출입구` yield
  nothing.
- Confidence is `PROVEN` or `NONE`, not a score that would invent precision.
- A mapping under a different `mappingVersion` is ignored, not reinterpreted.

## A4 — the per-facility operations brief

Four equations the screen never makes: a checkpoint queue is not store
visitors; a flight count is not a passenger count; a terminal passenger
forecast is not a store passenger forecast; a gate number is not physical
proximity. No sales prediction, no visitor forecast, no conversion estimate,
no 0–100 score, and no runtime LLM.

Three refusals worth remembering:

- A checkpoint attaches only when the mapping proved one **and** a stored
  observation carries that exact zone. A terminal match would relabel a
  terminal-wide queue as this store's queue.
- An ambiguous facility carries no gate anywhere in the brief.
- A facility with no recognised terminal gets no terminal numbers at all, and
  says why.

The KORETAIL 운영 참고 is a deterministic reading of official signals, and the
sentence saying what it is not sits immediately beneath it — adjacent in the
markup, enforced by test, so the interpretation cannot travel without its
boundary, including onto paper.

## Cost

- A3's index is built once per isolate from a bundled file: **no D1 read**.
- The record is 268 KB raw, **8 KB gzipped**; the server bundle is 237 KB
  gzipped against Cloudflare's 3 MiB limit, and it is not in the client
  bundle.
- A4 is its own endpoint, read only when a store is selected. Each read is
  bounded and seeks an existing index; no migration and no new index were
  needed.
- Cloudflare Cron remains exactly **5**. No paid service, no paid API.
