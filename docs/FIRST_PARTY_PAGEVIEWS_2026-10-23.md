# First-party page views — rollout and truth boundaries

## Meaning

These are accepted page views, NOT people or sessions. The initial rendered
allowlisted route, a real SPA pathname change, and manual document reload each
send one new random event. Rerenders, StrictMode replays, prefetches, query/hash
changes do not. Browser prerender waits for activation. The current route is not
counted again just because analytics is toggled off and on. Existing consent,
GPC/DNT and the production-origin restriction apply to counting. Opted-out
readers receive only one cached public aggregate GET, with no event ID or receipt. Tests, preview, automation
and basic known bot user agents are excluded; this is not perfect bot detection.

GA4 stays unchanged and independent. Count differences are expected because of
consent, blocking, different definitions, network failures and filters. No
backfilled or fabricated historical number is introduced. started_at is the
first accepted real event, not migration/deployment time.

## Storage / correctness

- pageview_totals: one singleton. Current KST day, today, lifetime total, first
  actual event timestamp, enabled switch, UTC daily event budget and gap flag.
- pageview_receipts: random per-navigation IDs and receipt timestamps only. No
  cookie, localStorage visitor identifier, raw IP, full URL, query, referrer,
  browser fingerprint or individual movement history is stored.
- Event IDs embed a generation time and random UUID, accepted for at most two
  minutes (two minutes future clock tolerance); receipts expire after ten minutes.
  At most eight expired receipts are removed on a subsequent POST. Expiry is
  logical; idle receipts remain until traffic resumes, with bounded cardinality.
- KST and UTC buckets only move forward. A delayed prior-KST-day event adds
  to cumulative total but not the current day; a delayed prior-UTC-day event
  consumes the current budget conservatively, never resetting it backward.
- A database trigger links receipt insertion to atomic count increment. Duplicate
  receipt insertions do not increment, including at the daily budget edge.
- D1 batch is transactional. No application read-modify-write counter race.
- GET reads one primary-key row; no historical aggregate scan. Existing cached
  Worker entrypoint caches healthy GET/HEAD for at most 60 seconds, capped at KST
  midnight. Query noise is stripped. POST/errors are never cached.
- Client failures only hide the optional counter. They never block site render.
  No automatic retry storm. A failed or timed-out request may have been counted
  or missed; the system does not claim exact human traffic or zero loss.

Browser clocks more than two minutes away from server time cause rejected
views, another source of undercount; the collector never claims perfect coverage.
A previously cached GET can remain visible for up to 60 seconds after a gap or
operator disable. The normal header receives POST status and hides immediately
on that response; there is no promise of instant global cache invalidation.

## Durable safety gate

The shared compile-time PAGEVIEWS_DEPLOYMENT_ENABLED flag is false. The client
makes no counter HTTP requests, and both server methods return disabled before
getDb or any D1 operation. This is the primary safe deployment kill switch.

Migration 0034 additionally creates the feature OFF (enabled=0, daily_limit=0, admission_limit=0). It does not
change deployment configuration, credentials, schedulers, paid plans or security
settings. Activation requires an operator-selected event budget based on current
account usage, not an assumed free capacity. daily_limit is constrained to
0..10,000 as an absolute implementation ceiling, NOT an approved operating value.

The accepted-event cap's first new event beyond the budget sets incomplete=1
and is not counted. A duplicate alone does not breach that accepted-event cap.
Separately, a singleton atomic UPDATE RETURNING reserves one admission for EVERY
valid POST attempt before the receipt pipeline, including duplicates and failed
operations. Reservations are never refunded. The first request beyond
admission_limit permanently marks incomplete, including a duplicate at that
request-budget edge: we conservatively suspend rather than continue costly
classification. Once paused, there is no receipt cleanup/insert/read, only the
indexed admission statement. No full scan or per-client identifier is needed.
Admission UTC buckets move forward only. A gap raced after a prior admission
also blocks that pending receipt; the UI remains unavailable. The flag persists across UTC/KST days
and deployments. During the incomplete KST day API/UI hide all numbers. A fresh
complete KST day with available UTC budget can resume today automatically, but
cumulative returns null with totalComplete=false forever after the gap. There
is no automatic gap clearing, zero substitution or lifetime reset.

Recovery options require deliberate owner/operator review:
1. Keep paused and preserve the ledger while diagnosing the cause.
2. If reliable independent evidence can reconcile the exact missing events,
   propose a reviewed correction; do not infer/fabricate the missing count.
3. Ask the owner to start a new clearly labelled counting period, preserving the
   prior aggregate as an audit record, before any reset or archive migration.
Never clear incomplete alone and continue presenting lifetime totals as complete.
Disabling after launch similarly introduces a possible gap; do not re-enable and
pretend uninterrupted totals without review.

## Measured local cost and planning limits

Measurements in `docs/PAGEVIEWS_LOCAL_COST_2026-10-23.json` used the final SQL,
Miniflare 4.20260515.0 and its D1 runtime locally. They are **LOCAL SIMULATION**,
not production D1 metadata, account usage, a CPU benchmark or a universal upper
bound across versions. No production requests or fake public pageviews were sent.

Operation | rows read | rows written
Admission accepted / first rejection | 2 | 1
Admission already paused | 2 | 0
Accepted pipeline without expiry, including admission | 9 | 5
Accepted pipeline with eight expired receipts, including admission | 39 | 13
Duplicate pipeline without expiry, including admission | 6 | 1
100 already-paused admission attempts | 200 | 0

Eight-row cleanup results were unchanged with 5,000 retained receipts. Four
independent SQLite writers verified exact admission limit and cap+1 latch. Query
plans use primary-key aggregate/admission access and the receipt expiry index.

For an observed accounting interval, let R be admission statements executed,
H be successful reservation writes, B be gap-latch/extension writes,
P be full receipt pipelines executed, and
G be uncached public GETs. The **tested-case model** is reads <= 2R + 37P + G and
writes <= H + B + 12P. These are execution counts, not users.
Admission and pipeline are separate awaited calls; H and P need not match in a
calendar day. A pre-midnight admission can execute its pipeline after midnight.

A candidate admission_limit of 500 bounds one admission bucket, NOT actual
calendar-day D1 execution. A single-bucket workload with one gap latch models 6,501 writes;
that is NOT an unconditional daily maximum. Reserving up to one prior bucket's
carryover gives H,P <=1,000 as a planning assumption. Allowing two gap-latch
writes gives 13,002 modeled writes; B is not permanently bounded to one because
a later KST day can record a new gap.
Without a validated execution-age bound, even that is a planning allowance,
not a proven hard daily resource ceiling. 500 is NOT an approved operating
threshold; migration defaults to zero. D1 documents a 30-second maximum query
and batch duration, but this audit has not proven an end-to-end execution-age
bound for the separate gate/await/batch flow.

If the documented Workers Free account ceiling applies to these external
requests, and R+G <=100,000 in the interval, then with the explicit one-bucket
carryover planning assumption the feature read model is <=237,000 rows (4.74%
of D1's 5M daily limit). Request-day versus execution-day carryover must also be
accounted for in real measurements. The Worker allowance is shared with the
main site: reaching 100,000 requests can break core availability. This is NOT a
reserve of 100,000 requests for the counter and does not prove account headroom.
Cached GET savings are not assumed; cold GETs count in G. Invalid requests are
rejected before D1 but still invoke the Worker when routed.

The D1 admission gate resolves the unbounded *expensive pipeline* concern using
existing infrastructure. It cannot stop forged requests consuming the shared
Worker allowance, and its own rejection still reads two D1 rows in local tests.
A process-local limiter would not create a global guarantee, so none is claimed.
No self-contained code here can promise attack-proof availability. Activation
requires recent daily peak/current usage and an explicit reviewed acceptance of
this bounded residual risk (or separately authorized edge mitigation).

An illustrative allocation for 500 admissions with the stated rollover planning
allowance is 250k extra reads and 20k extra writes, above that measured model. To stay below the
repository's 85% PROTECT boundary, core usage plus projection must then remain
below 4M reads and 65k writes/day, respectively. These are planning margins,
not current measured account capacity or permission to enable the feature.
The admission cap is attempts, not people and not guaranteed views; duplicates
and failed requests consume it. If ordinary traffic exceeds it, numbers hide
and stay paused. Thus a too-small cap is safe degradation but poor product value;
choose it from normal traffic and daily peaks, never silently show the capped
number as a complete daily/lifetime count.

Official planning limits rechecked 2026-10-23: D1 Free 5M rows read/day,
100k rows written/day, 5GB account storage; Workers Free 100k requests/day and
10ms HTTP CPU. Sources:
https://developers.cloudflare.com/d1/platform/pricing/
https://developers.cloudflare.com/workers/platform/limits/
https://developers.cloudflare.com/d1/platform/limits/

## Smallest existing production verification route

Obtain recent official daily and current-period D1/Worker usage through an
existing authorized read-only operational diagnostic. Preserve explicit
UNAVAILABLE results; do not substitute collector lower bounds or multi-day
averages for current headroom. Diagnostics themselves should be reviewed for
query cost and must not send artificial production pageviews.

For a modest rollout, the remaining minimal verification is: combined CI and
actual disabled/fixture UI behavior; a current/peak usage report;
a chosen admission budget based on normal traffic, not the illustrative 500;
and a reviewed acceptance of remaining shared-Worker availability risk. Real
production runtime metrics must be observed after a controlled activation,
with the kill switch ready. Local simulation alone is not that observation.

## Implemented recovery without fabricated cumulative totals

The snapshot separates today and cumulative availability:
`{available:true,today,day,startedAt,total:number|null,totalComplete:boolean}`.
A complete lifetime has totalComplete=true and a numeric total. Once any known
gap occurs, totalComplete=false and total=null; the retained actual total is
never fabricated/reset or exposed as complete. The real original start stays.

`partial_day` monotonically records the latest incomplete KST day. Counting
stays unavailable for that day. A later fresh KST day can resume today if UTC
admission capacity has renewed. If KST midnight arrives before the exhausted
UTC budget renews, the first attempted view extends the gap to that new KST day;
there is no mid-day resume with a falsely complete today number. Recovery then
waits for another fresh eligible KST day. Rejected calls within a partial day
write nothing, but a future-day gap extension can write one new latch.

Do not choose 500 simply because tests use it. It is a stress-test candidate,
not a product limit or approval. Measure normal traffic and choose appropriate
capacity. A too-small cap creates truthful unavailability, not useful counting.
Lifetime visibility can recover only with reliable reconciliation or an approved
new clearly labelled counting period preserving the prior aggregate as evidence.
No reset, fabricated backfill or supposedly complete capped total is introduced.

## Mandatory rollout proof before enabling

1. Fetch/review newest main and concurrent changes; do not overwrite their edits.
2. Run unit, lint, typecheck, build, rendered UI and E2E checks on combined commit.
   Local focused tests alone are not a full project pass.
3. Obtain existing official account usage reports for current UTC day plus recent
   peaks: D1 read/write, Worker requests, storage. Distinguish official metrics
   from collector-only lower bounds. Historical warnings are not current proof.
4. Run migration and replay/concurrency/rollover/expiry tests against local D1 or
   a permitted staging environment. Record D1 meta and Worker CPU. No production
   artificial pageview tests: tests would pollute the owner's actual-start count.
5. Calculate a conservative daily_limit and 70/85/95 headroom response, reserving
   core product/collector capacity first. If insufficient, remain OFF.
6. Apply migration before code activation, verify migration identity and zero
   initial count. Deploy exact reviewed commit. No migration rollback by dropping
   user data; code rollback leaves harmless OFF/retained tables.
7. Only after measurement and the bounded-risk request-abuse review pass, review a change to
   PAGEVIEWS_DEPLOYMENT_ENABLED and configure enabled/admission_limit/daily_limit through the
   already-authorized operator path. Do not set total/today/started_at manually.
8. Observe actual user traffic and compare aggregate, errors and usage. API
   failures hide UI; verify no fake zero and no impact on existing site/GA4.
9. On emergency or rollback, disable optional counting, preserve data and record
   the gap. Do not silently reactivate incomplete cumulative totals.

## Verification at preparation time

- Focused local SQLite/TypeScript backend/client tests: 27/27 pass.
- Exact final singleton admission SQL and expiry pipeline: measured in local D1
  simulation, including repeated rejection and 5,000-receipt cleanup.
- SQL plans: primary-key aggregate read and indexed bounded receipt cleanup.
- Default OFF (no client requests and no D1), no seed, idempotency, cap,
  out-of-order midnight requests, concurrent writers and consent cases exercised.
- Full repository typecheck/build/E2E and real D1/Worker measurement: pending.
- Production DB access/write, deployment and activation: NOT performed here.
- Current official account headroom must be verified separately before activation.
