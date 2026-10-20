# AI-free calendar context: preview and read-only preparation

This change does not activate collection, update a production database, create credentials or publish candidates. Production routes stay unchanged until image approval.

## Three separate layers

1. **Monthly airport statistics:** existing collectors/APIs remain intact. The approval preview's six-month chart still uses verified April–September 2026 snapshots, not a new live monthly feed. Route country is not passenger nationality.
2. **Official calendar refresh:** Japanese Cabinet Office CP932 CSV and US OPM UTF-8 ICS have no API-key requirement. The new CLI can parse a saved official response or make one explicit bounded request. Output is `candidate` / `withdrawal_candidate`, `verifiedAt: null`, never the published event set. No scheduler, D1 write or automatic approval is connected. Korea special-day and NEIS APIs need an approved key connection; no existing connection was verified and no key was requested. Vietnam and local school pages require source-specific review. Initial annual Korean calendars can miss later changes, including the reviewed 2026 May 1 and July 17 additions.
3. **Deterministic narrative:** verified stored event dates and actual monthly values produce prose without an LLM. Consecutive changes break on missing or nonadjacent months. Same inputs yield the same output. Calendar overlap is not evidence of causation or a predicted return-flight peak.

## Source preparation

`node scripts/prepare-official-calendars.mjs --source JP --input official.csv --observed-at ISO_TIMESTAMP`

The source-specific allowlist, manual redirects, 15-second deadline and 1 MiB response cap bound optional `--fetch-once`. No retries or bot-block bypass. Saved input requires its original observation timestamp. Observed time is not evidence review time. Official file hashes, date basis and original names are preserved. JP names such as 休日 are not silently reinterpreted. US dates are OPM observed federal-employee dates, not universal private-sector holidays; inauguration-day restrictions remain in the scope and description.

Actual saved-source dry runs on 2026-10-20 parsed 1,067 JP records and 112 US records with zero additional provider requests. These are parser results, not approved/published events or proof of ongoing refresh. The official raw files and HTTP metadata were retrieved by the research task; the CLI did not re-download them.

`calendarDiff` detects additions, changes, removals and cancellation candidates. Every result requires review. An unavailable source never renews `verifiedAt`. A future operational integration should store observations/candidates separately, review semantic changes/removals, and reuse a bounded existing workflow only after approval. Last verified records must not be represented as newly verified when a source is unavailable or changed.

## Public-context boundary

`data/airport-focus-preview/calendar-context.json` contains reviewed dates only. Unsupported government closures and makeup workdays are not relabeled as public holidays. Regional school breaks preserve location and institution scope. Federal/conditional institutional holidays remain restricted. Korean events are origin context, never a Korean-nationality passenger series. OTHER aggregates receive no pooled national-calendar explanation.

Matching uses the actual chart month and optionally the immediately preceding observed month. October–January events cannot explain April–September values. Up to two short contexts are visible with all matching source links available in details. A recent-calendar section is separately dated and never used as the cause of the previous monthly change.

## Period-average comparison

The current verified preview does not contain a complete daily country-flight series for October 1–19. Monthly China flight total 2,609 cannot be split into the 7-day national-holiday period and 12 subsequent dates. No monthly passenger count is apportioned into daily estimates. A future calculation must use consistent route, terminal scope, metric and KST flight dates, exclude incomplete/missing days, disclose coverage, and keep unknown destinations separate. No comparison rate is published until those inputs are verified.
