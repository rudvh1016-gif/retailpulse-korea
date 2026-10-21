# Approved-notice source-change checker — local candidate only

This is **automatic source-change checking, not automatic date ingestion**.
No existing calendar payload, dates or verifiedAt are accepted/modified. The local
integration candidate below uses existing execution/reporting paths; no publication,
activation, new scheduler, account, key or notifications.
The tested SG implementation remains independently tracked in PR430.

## Narrow source contract

Only already-reviewed KR2026/2027 annual notices are allowlisted:
- https://www.korea.kr/briefing/pressReleaseView.do?newsId=156738544
- https://www.korea.kr/briefing/pressReleaseView.do?newsId=156768474
Each points to the exact HWPX URL/hash previously reviewed in
`KOREAN_OFFICIAL_HOLIDAYS_2026_2027.md`. No guessed links or search results followed.

Ordinary robots GET returned200 with generic-client Allow:/ on2026-10-21. Both
article pages returned200 and explicitly grant KOGL Type1 for text; current title,
licence marker and exact reviewed attachment link are checked before document GET.
This is not a licence to republish page imagery/whole HWPX: candidate retains only
SHA256/status/source links, never body/attachments, and publishes no copied content.
https://www.kogl.or.kr/info/license.do

The2027 HWPX ordinary GET returned200,172438 bytes and SHA256
7f91729089b79610b3f5d4a392f8d4fff5cdd7f520e2d0bb8fd7eb9f59728560,
matching the reviewed baseline. That means SOURCE_UNCHANGED, **not** a new date
verification. Real2026/2027 page contracts and2027 fingerprint tested locally.

## Boundaries

- Max2 article+2 document requests per attempt; monthly successful/completed check,
 7-day transient-error cooldown, max20 requests/31-day persistent-failure window.
- Fixed current±1 years only, no annual discovery. In2029 these sources expire
 without requests rather than pretending a2029 calendar was found.
- 15s/manual redirects/1MiB per response; block HTML/non-ZIP HWPX stops. Exact
 401/403/451 or access-block page sets sticky accessBlocked until manual review,
 with **no automatic retry even after cooldown**. No proxy, alternate URL or UA.
- The pure checker returns state without persistence or scheduling. Its separate
 integration stores one bounded metadata state/source, no raw history.
- New file bytes, title, licence or attachment link → REVIEW_REQUIRED, not dates.
 A previously flagged source stays flagged even if original bytes reappear.
- checkedAt/lastCompletedCheckAt are inspection times only. verifiedAt and canonical
 events never enter returned state. AI calls0, canonical writes0.
- No notification outside existing site reporting is implemented. The local
 integration below still requires root review before publication.

## Explicit omissions

An unchanged annual notice does **not** prove no separate temporary holiday,
MPM amendment or later legal change exists. KR2026's known Labor Day/Constitution
Day amendment is not monitored by this candidate; its reviewed canonical dates stay.
No source discovery,2028 preliminary data, school holidays or broad news checking.

CN/VN robots reads were200 and do not disallow their reviewed article paths, but
no source-specific reuse/completeness contract has been approved for activation.
Their prepared source plans remain review-only research, not enabled monitors.
TH remains policy-scope-unresolved; data.go.kr403 source is untouched.

HK official CKAN package metadata returned200 for hk-dpo-statistic-cal, exact1823
JSON and Digital Policy Office, but license_id/title are null and isopen=false.
These metadata values are not a legal ban. FAQ explicitly requires related-site
terms; no dataset-specific override resolving1823 general copyright was located.
No HK activation. Source-specific licence evidence must not be confused with
website text copyright, but neither may an override be invented.

## Validation

20 checker/integration tests passed, including metadata limits and CAS preservation.
The original 13 checker tests cover: unchanged/changed/sticky review, no verifiedAt/dates,
monthly/error cadence, access-block stop, schema/licence/link fail-closed, exact
request bound/URLs, oversize/redirect/non-document, reviewed-year expiry.
Existing calendar regression suite also passed (38 tests combined before the final
CAS regression was added); font coverage 2/2, scoped ESLint and diff-check pass.
Initial integration full typecheck passed; final repeat after guard/test edits was
OS-killed (137), so final full typecheck remains unverified. No full build/CI/remote
D1/publication claim.

## Minimal integration candidate (not published or activated)

- Add migration `0032_approved_notice_checks.sql`: two hard-allowlisted source IDs, primary key, `checked_at`, and valid JSON `state` capped at 4096 characters. No document contents, events, or verification-date column. Total persisted JSON ≤8192 characters, no history growth.
- Existing `scripts/refresh-official-calendars.ts` invokes the checker after existing date refresh; no workflow/cron/account/key change. One SELECT LIMIT 2 each execution and at most two CAS UPSERT statements when checks actually run. Repeat-month/blocked/cooldown states perform zero writes and zero provider requests. CAS retains concurrently committed review/access blocks.
- Each eligible pass ≤4 GET requests (two known notices then their exact known attachments); transient failures wait seven days, at most five attempts per source per calendar month (≤20 GETs worst case across both). Success or review-required contract/change result waits until the next month. Access denial remains blocked indefinitely until separately reviewed code/data changes, not an automatic retry.
- Existing `/api/airport/calendar` reports a separate `sourceChecks` object from one additional SELECT LIMIT 2. No visitor-triggered fetch/write, no new UI section. Metadata failure reports UNAVAILABLE independently, preserving normal calendar reporting. Status describes only reviewed-notice checks, never verified dates; calendar `verifiedAt`, canonical events and manual-review claims remain unchanged.
- The API object is machine-readable existing reporting only; no visible card/footer changes are included in this candidate. Root review required before publication.
