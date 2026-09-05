# Contextual insights release — 2026-09-05

Continues PR #139; original checkpoint 4faf6a65c247476f8f957b3add1f646d07f6cae5 is untouched.

- Compact domestic-card amount/count and combined observation/retrieval line; Korean complete Pretendard face prevents new-copy glyph fallback.
- Current population/card comparisons use exactly matching KST time, source, schema and VALID quality. Zero/missing baselines are unavailable. Published ranges remain ranges. 28 days is explicitly four weeks, never calendar-month change.
- Airport expected totals require complete forecast coverage. Flight comparisons describe collected physical-flight records, not a verified whole-day operational census. No invented 357-flight constant.
- Settings explains audience, use, cadence and limitations before preferences; official source list remains last.
- RS is Air Seoul/KR, verified against Narita Airport and Air Seoul official sources. Community registry provenance and the verified override remain distinguished.
- OG image is the approved preserved PNG.

## Collection correction and limits

Observed failure: A1 and other data.go.kr sources returned NETWORK_UND_ERR_CONNECT_TIMEOUT. Scheduled Actions can also start late. Provider uptime cannot be guaranteed.

The A1 scan now retries transient failures after 20 seconds, still at most once per page and within its existing request budget. Permanent HTTP failures do not retry. Failed refreshes write source health/run diagnostics without deleting last-good data or replacing its observation/retrieval timestamps. The primary 06:07 KST and recovery 10:07 KST schedules, shared concurrency, complete-day skip and 300+200 request limits remain unchanged. UI describes these as planned times, not guaranteed completion times. No extra scheduled provider calls or Worker collection were added.

## Evidence before remote CI

21 targeted comparison/SQL/A1/airline tests; 52 production-runner and UX truth tests; typecheck, lint and production build passed locally. Production workflow gates and post-deploy checks remain required. No whole-service audit was repeated.
