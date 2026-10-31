# A1 midnight recovery — 2026-10-31 KST

Incident: the 00:07 GitHub schedule has been observed starting at 05:13 KST. A complete A1 scan then failed after 32 requests when the provider changed totalCount mid-pagination (run 40981962781). No flight rows were written by that failed scan. The existing fallback incorrectly rejected every source_health ERROR, including this pre-storage consistency failure, and stopped at 03:00.

Change: allow the existing Cloudflare-triggered realtime witness to consider its existing A1-only fallback from midnight until 06:00, preserving original-run checks, daily attempt limit, concurrency, runtime activation and atomic rolling-24h 500-request reservation. No cron expression, credential, security setting, paid resource or provider ceiling changes. This reduces dependence on GitHub schedule timing; it cannot guarantee instantaneous midnight publication or runner availability.

Only the exact classified FETCH/VALIDATION/POPULATION_CHANGED_PAGE_n failure permits a new scan. The existing early retry ladder may retry it within its existing attempt and request limits. Auth, quota, throttling, schema, arbitrary validation, storage failures and unknown details stay closed. Each new scan starts at page 1 and must pass unchanged total-count, page-size, duplicate and full-population validation before any flight write. No partial snapshot is published.

Recovery target: official A1 D-3..2026-10-31 records (10/28..31), changed-only upserts; no historical deletion or estimated/zero-filled records. Independently dated future records remain replaceable official schedule snapshots. Existing persistence and changed-row logic are unchanged. Public pre-recovery copies saved locally under recovery-evidence: 10/28 541, 10/29 529, 10/30 546 collected records; 10/31 only an older official schedule of 545, not a completed scan. These public copies are audit evidence, not a full database backup; production rollback must use existing D1 recovery bookmarks and targeted reconciliation, never blindly replace the database.

Manual existing A1-only recovery requested once for 2026-10-31: run 41116826332. Outcome pending. Do not infer success from admission or a workflow badge; verify today's collected-record basis, new retrieval time and complete coverage.

Local focused collector/recovery/retry tests: 92 passed after normalizing workflow CRLF for Linux-oriented text assertions (normalization is not part of the commit). CI remains the full Linux validation gate. Separate EVN mapping PR #524 addresses October 7 and is not this incident.
