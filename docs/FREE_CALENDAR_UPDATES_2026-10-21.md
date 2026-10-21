# Free official calendar update extension — 2026-10-21

Local candidate based on authoritative main `8b7690155e55129add5579e2f0d4ad912f185e0d`.
Mirror `origin/main` remained stale `6fd5e2e` after fetch. No remote publication,
migration execution, new credentials, OAuth, paid service, runtime AI or scheduler.
Root review is required before release. This is **not** a claim all countries auto-update.

## Source plan / actual activation boundary

- JP/US: keep existing monthly automatic structured sources unchanged.
- SG: this candidate adds actual date collection, validation and canonical replacement
  using the Ministry of Manpower consolidated public dataset. Not merely hash monitoring.
- KR: preserve current reviewed official dates; data.go.kr 403 cooldown not retried.
  Annual release licensing is source/year-specific. KASA 2027 press release now shows
  KOGL Type 2, correcting prior feasibility text that claimed Type 1. korea.kr's
  2027 text republication is Type 1, but RSS was discontinued July 1, 2026 for copyright
  protection. No complete annual-plus-amendment discovery contract established.
- CN: Beijing's stable English holiday page has 2026 dates but omits January 4 makeup
  workday; cannot replace complete authoritative annual data. Chinese annual notice
  has it, but new-year notice discovery remains unverified. No denied gov.cn retry.
- VN: MOHA approved notice 11483/TB-BNV (Oct 9, 2026) distinguishes public-body
  holidays from private employers' choices. Exact scopes are mandatory; no reliable
  complete stable discovery/reuse contract established. Do not promote proposal titles.
- TH: existing BOT offline parser remains inactive; public download readability does
  not close unresolved automated/public-commercial reuse policy scope. No bypass.
- HK: official rolling 1823 JSON and DATA.GOV.HK commercial open-data terms are
  promising; source-specific 1823 policy/access contract still needs review. Not activated.
- Schools/events: no speculative dates or unrelated news expansion. Existing reviewed
  regional school data remains unchanged. No review-only monitors have been activated.

## SG official evidence

- Dataset, explicitly annual consolidated update, 2020–2027, 104 rows:
  https://data.gov.sg/datasets/d_8ef23381f9417e4d4254ee8b4dcdb176/view
- Documented public API (limit defaults to 100; this implementation uses 1000 and
  rejects response unless `records.length === total <= 1000`):
  https://guide.data.gov.sg/developer-guide/dataset-apis/search-and-filter-within-dataset
- Unauthenticated public limit: 4 datastore requests / 10 seconds; no key needed:
  https://guide.data.gov.sg/developer-guide/api-overview/api-rate-limits
- Explicit commercial use/modify/distribute licence and attribution/link requirement:
  https://data.gov.sg/open-data-licence
- Ordinary Node GET exact documented dataset URL with `&limit=1000` returned HTTP200
  on 2026-10-21 05:47:41 UTC; application/json, complete 104 rows. Public raw bytes
  are retained as one bounded fixture; response cookies are neither stored nor used.
- Ordinary Node GET https://data.gov.sg/robots.txt returned HTTP200 and `User-agent: *`,
  `Allow: /`. Earlier web-tool robots error was a tool limitation, not a provider denial.
- MOM scope cross-check: https://www.mom.gov.sg/employment-practices/public-holidays
  explicitly conditions observed dates on the original holiday being the worker's
  rest day. Observed records use institutional scope and an explicit Korean condition,
  never unrestricted national closure. Sunday/parent-holiday relation is validated.

## Budget / guards / storage

One extra SG request per monthly eligible attempt, normally 12/year. Existing 7-day
failure cooldown bounds persistent failures to at most 5 attempts in a 31-day month.
No pagination following, discovery crawling, in-run retry, alternate host, AI or paid
fallback. The original daily job only checks stored eligibility; no duplicate schedule.
15-second timeout, manual redirects, 1 MiB streamed cap remain existing runtime guards.
Non-2xx errors stop. Unknown schema, name, weekday/date conflicts or incomplete year
are REVIEW_REQUIRED and preserve last-good payload and actual verifiedAt. Current±1
published years only; no generated dates or assumptions that absent years have no holidays.

Migration 0031 copies existing rows into the bounded JP/US/SG table; runtime reads at
most 3 rows (previously 2), SG stores at most 60 dates (real fixture: 38), no raw history.
Semantic unchanged payload writes remain avoided; metadata renewal records actual
successful collection. Existing stale threshold45 days and CAS protections are preserved.
Each SG year replaces national public holidays and conditional observed dates separately;
regional schools and unrelated country records remain untouched. Visible source and
licence links are added without layout/style changes.

## Other primary references

- KR RSS retirement: https://www.korea.kr/etc/noticeView.do?newsId=132038885&pWise=main&pWiseSub=O1
- KASA 2027: https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=431
- CN stable incomplete page: https://english.beijing.gov.cn/workinginbeijing/laborrights/publicholidays/
- CN full 2026 notice: https://www.beijing.gov.cn/zhengce/zhengcefagui/202511/t20251104_4258873.html
- VN approved notice: https://moha.gov.vn/nghi-quyet-tw4/tin-tuc/thong-bao-lich-nghi-tet-am-lich-va-le-quoc-khanh-nam-2027---id19741
- BOT terms: https://www.bot.or.th/en/terms-and-condition.html
- HK dataset: https://data.gov.hk/en-data/dataset/hk-dpo-statistic-cal
- HK licence: https://data.gov.hk/en/terms-and-conditions

## Validation limits

Real source read + parser fixture + local SQLite runtime/migration tests are not
production success. Full typecheck was OS-killed (no diagnostics, not PASS), awaiting
root/CI resource-isolated verification. No build/browser/D1 staging/deployment claim.
Production enable variable remains RUNTIME_ENABLE_STATE_UNKNOWN from checkout.

Local validation: 69/69 focused tests passed (SG parser, existing runtime, parsers,
cadence, preparation calendar, scheduler truth, migrations); scoped ESLint and
`git diff --check` passed. Existing JP/US fixtures are unchanged except expected
request-count increases and migration setup for the additional source. Further
SG rendering assertions cover no duplicate static dates and conditional scope.

## Root-requested migration and runtime review

Cloudflare documents per-migration rollback in its Wrangler command contract:
https://developers.cloudflare.com/workers/wrangler/commands/d1/#migrations-apply
The repository deploy path uses Wrangler D1 migrations, not standalone SQL fragments.
The source 0029 has only its automatic primary-key index and no custom indexes/triggers;
0031 preserves every constraint except the intentional country allowlist expansion.
Explicit nested BEGIN/COMMIT are not added to D1 migration SQL.

Actual local Wrangler D1 experiment (isolated /tmp database, never remote): applied
0029, seeded JP/US payloads, appended a deliberate failing SELECT **after** the
0031 DROP/RENAME. `wrangler d1 migrations apply --local` failed and rolled back the
entire migration. Query after failure confirmed both original payloads, original
CHECK(JP,US), no expanded table and migration history containing only0029. Unit
fault injection additionally covers pre-INSERT, pre-DROP and pre-RENAME rollback,
all original CHECK/NOT NULL constraints and preserved rows (23 runtime tests pass).

Read-only GitHub evidence: scheduled collect-production run39517221144 started
2026-10-20T23:46:55Z and succeeded. Official-calendar-refresh job118952175120 actually
ran its refresh step successfully (not skipped), as did the general collect job.
https://github.com/rudvh1016-gif/retailpulse-korea/actions/runs/39517221144
This establishes enabled execution for that observed run, **not** direct knowledge
of the current repository variable. No credentials or variable/secret endpoints read.

HK additional gate: 1823 officially supports self-updating calendar subscriptions,
but its general copyright notice (review date2026-10-13) restricts text redistribution
to personal/internal noncommercial use absent consent. DATA.GOV.HK explicitly
licenses its exported dataset commercially. Dataset-specific precedence needs
confirmation; no blanket legal conclusion or HK activation is made.
https://www.1823.gov.hk/en/copyright-notice
https://www.1823.gov.hk/en/hong-kong-public-holidays-ical
Clean0031 then applied successfully through the same local Wrangler runner. Post-run
queries retained both JP/US original payloads, country CHECK(JP,US,SG), original
primary-key index and all other constraints; migration history records0029+0031.
Final focused suite: **70/70 passed** after rollback coverage was added. Scoped
ESLint and diff-check passed. No remote database operation was performed.
