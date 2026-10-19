# Customs RSS link-only preparation

Base: `7ac4ee43a14b15f7fef4e7ace733417804086e84`. This prepares the owner's requested automatic news path without changing the current UI, existing two approved articles, schedules, production database or publication state.

## Source and presentation boundary

The official RSS directory (https://www.customs.go.kr/kcs/selectBoardRssList.do?mi=7424) explicitly describes use from mini-homepages, blogs and RSS readers and lists the four existing feed URLs. The general copyright policy (https://www.customs.go.kr/kcs/cm/cntnts/cntntsView.do?cntntsId=2610&mi=7421) requires separate consultation for reuse of unmarked works. RSS availability is NOT a blanket commercial licence for article bodies, images, attachments or derivative summaries. No such claim or KOGL clearance is generated here.

The new, separately typed RSS index presentation contains only the official title, actual publication timestamp, agency name and verified original link. Its evidence records the official RSS service, not article reuse clearance. Rich facts, summaries, dates of legal effect/deadlines, modified dates, documents and clearance flags are forbidden by validation. Existing UI already renders title/date/source/original link without requiring body content; no component or stylesheet is changed.

This distinction is a conservative implementation scope, not a legal guarantee that every possible commercial presentation is licensed. Owner review of the exact link-only scope remains required before activation; no unmarked article body is republished.

## Actual source verification

Read-only GitHub run https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/39222991667 completed 2026-10-19 08:29 UTC. Four RSS feeds each parsed 20 items; each first-page official list matched 10 links; 20 article title/ID checks passed within 28 requests. Six inspected articles matched the existing relevance filter; none of those six had article-specific Type 1 clearance. Four unrelated inspected articles had that clearance. This is not a whole-archive census.

## Storage and safety

- Both compile-time activation gates remain OFF; production CLI also requires explicit existing runtime switches. No new scheduler or credentials.
- New link-only items can be inserted only when source, identity, relevance, date and presentation validators pass.
- Existing approved summaries and private review candidates are never converted into link-only items. Existing blocked rows cannot reopen automatically.
- Receipt/evidence-check clocks do not create writes. Meaningful metadata updates retain revisions using the previous exact payload/hash/public flag as compare-and-swap conditions.
- Existing bounds remain: maximum 28 provider requests/run, 15 seconds/response, 1 MiB/response, no redirects or retries, 200 current/400 revision records and 8 KiB payload limit. Failures preserve last-good records; a verified withdrawal remains a block.
- New path uses bounded indexed reads; worst case adds at most two reads per inspected article. No migration, deletion, paid service or request-time upstream call.

## Checks and activation plan

Local Node 24 syntax checks and 43 focused existing/new source, rights, SQLite, idempotency, legacy-preservation and failure tests passed. One broader storage/API test was not runnable in the partial local checkout because its application/database dependencies are absent; full CI must run on the exact final commit. This is not a full build/E2E or production D1 pass.

Proposed cadence after explicit activation approval: one customs step per existing daily production workflow (06:07 KST), sharing its existing concurrency lock; no additional cron. Keep new links disabled until the user approves this exact metadata-only scope. Use the already configured dedicated D1 write-token reference, never a new credential.

Before declaring automatic reflection complete: run one authorized production collection, verify source IDs against D1 and `/api/airport/news`, repeat unchanged input and measure zero semantic writes, verify the old two articles unchanged, and verify later provider failure leaves published data intact. Record measured rows_read/rows_written and capacity before scheduling. Current source success does not prove D1 write, budget safety or automatic publication success.


## Owner-approved activation, 2026-10-19

The owner approved deployment of exactly title/publication date/original-link daily updates. Review gates are now open; the collector itself remains dormant without explicit activation and the CLI requires runtime switches and the existing production write-token reference. One bounded step is added to the existing daily workflow and concurrency group. No independent schedule, credentials, AI calls or paid API are introduced. Existing 200/400 storage ceilings fail closed, without eviction or paid expansion.

06:07 KST is the cron reservation, not guaranteed start time. Recent daily runs started 08:00–08:28 KST. Production D1/public API verification is still pending and must be recorded after the first authorized execution. Source verification and fixture success are not an automatic-reflection completion claim.

The prepared commit passed full CI: 1,712 unit, 50 rendered HTML, 5 critical UI and 1,441 Playwright tests. Activation changes require fresh checks before merge.
