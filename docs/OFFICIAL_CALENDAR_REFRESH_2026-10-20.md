# Official calendar refresh — monthly as of 2026-10-21

> The owner changed the JP/US calendar cadence to monthly on 2026-10-21. See `docs/OFFICIAL_CALENDAR_MONTHLY_2026-10-21.md`. The 2026-10-20 execution evidence below remains historical, not proof that the new gate is deployed.

## Implemented path

The existing `collect-production.yml` daily event carries an independent `official-calendar-refresh` job whose stored-metadata guard now refreshes each provider once successfully per KST calendar month, with seven-day cooldown between failed attempts. A delayed month-start run catches up on the next existing run; customs still runs daily. No new cron, credentials, paid API or LLM is introduced. `scripts/refresh-official-calendars.ts` reads two allowlisted official structured files and writes at most two current D1 records using migration `0029_official_calendar_current.sql`. `/api/airport/calendar` performs a bounded stored read and merges those records over the reviewed static context. The page consumes this through `useOfficialCalendar` and the existing shared focus data context.

Japan national calendars and US OPM observed federal-employee calendars are the only new automatic publication sources. Their schemas and scope are validated, current-year coverage is required, event count is bounded, cancellation markers require review, timed/recurring ICS events are rejected, and the original official source link remains attached. Only the previous/current/next published years are retained. US institutional holidays are not national/private-sector or school holidays. Inauguration conditions are kept as restricted applicability.

Each source normally receives one successful request per KST month; failed sources retry only after seven days (at most five requests per source in a 31-day calendar month). Each attempt is capped at 15 seconds and 1 MiB, with no redirect or in-run retry. The source payload changes only when semantic values change; successful check metadata is distinct from the payload. Failures never replace last-good payload or renew its verification time. After 45 days without verification (a maximum 31-day month plus 14-day grace), events become expired and are not used for narrative. An obsolete static row is not resurrected after a canonical replacement expires. Concurrent older attempts cannot overwrite a newer check. Storage is two current rows, not unlimited raw page snapshots.

## Source review and actual execution evidence

- Japan official calendar: https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html and its linked `syukujitsu.csv`.
- Japan reuse: https://www.cao.go.jp/notice/rule.html (Public Data License 1.0); dates/names are factual, attributed; Korean display names are a KORETAIL translation, not an official translation.
- US official feed: https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/ and its linked `holidays.ics`.
- US open-data explanation: https://www.opm.gov/frequently-asked-questions/open-data/general/what-is-open-data/ . Only published holiday date/name facts are projected, not third-party site assets.

Live source→parser→local SQLite→API projection rehearsal at **2026-10-20 13:53:36 UTC**: JP 54 events and US 35 events covering published 2025–2027, two provider requests, zero AI calls, zero production writes. Earlier full-file fetches found JP 1,067 historical rows and US 112 rows; those historical excess years are not stored. JP raw file SHA256 `cec37a743c96995cdb9cb52b685c9003634682a9b0e1a640a6b9b96881fe964a`; US raw file SHA256 `977a6cfc16522b4f0d328e93f05ee01564c3e2ee3f1676d94bf58bbb61bc7096` at 13:48 UTC. Parser/runtime/API/full-holiday-UI focused tests: 15/15 passed. Repository typecheck passed; scoped lint has zero errors (one pre-existing navigation warning).

## Not fulfilled by this path

China, Vietnam, other countries and regional school-break pages are still reviewed static facts. They are not made auto-updating merely by enabling this job. Chinese next-year notice discovery and region/institution-specific school calendars require separate official source adapters and access review. Korea already uses the KASI collector; its documented service-specific 403 must not be hidden or bypassed. No new key/permission is created here. The public projection reports the limited automatic coverage.

## Release/activation proof still required

Before merging/deploying, run full repository checks and ship migration 0029. Then observe the actual default-branch daily workflow or an authorized bounded manual run, D1 current rows, and `/api/airport/calendar` response. Local rehearsal is not evidence of an active production scheduler. Standard GitHub runners and existing D1 are used; free-tier account headroom is not asserted from these tests. The normal calendar budget is two source requests and two current-row metadata writes per KST month; persistent failures are bounded to ten requests and metadata writes in a 31-day month, with one bounded two-row stored read per existing daily job. Canonical payload rewrites occur only on semantic change, and reads return only two rows with a five-minute public cache.
