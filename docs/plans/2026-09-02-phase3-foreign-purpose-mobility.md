# Phase 3 — foreign shopping and tourism-purpose mobility

## Source decision

OA-22379 cannot satisfy this product contract because its published
`PURPOSE_ADMDONG4` foreigner file has no `move_purpose` column. KORETAIL must
not infer a purpose from distance, time, nationality, or any other field.

Use the same-provider official destination product OA-22378 instead. Its
`PURPOSE_ADMDONG1` foreigner files contain `d_admdong_cd`, `move_purpose`,
`total_cnt`, and `etl_ymd`. The official purpose codes are `4` (shopping) and
`5` (tourism). The source is monthly, login-free, and Public Nuri Type 1.

## Collection and storage

- Discover the newest monthly publication from the official dataset page.
- If that publication is already stored, stop with
  `SKIPPED_NO_NEW_PUBLICATION` and do not download the archive.
- On a new publication, GitHub Actions downloads the archive and extracts only
  its latest daily CSV. Cloudflare never downloads or parses the file.
- Filter to the three versioned administrative-dong mappings and purpose codes
  4/5, then store no more than six aggregate rows per reference date.
- A missing area/purpose stays unavailable; it is never converted to zero.
- Changed-only hashes exclude retrieval time. A failed refresh preserves the
  last good rows.

## Product truth boundary

The UI labels this as a recent published statistical movement estimate with a
visible reference date. It must never be described as live activity, today's
visitors, purchases, card spend, POS sales, or store revenue.

## Verification

1. Contract tests reject OA-22379 and pin OA-22378 fields and codes.
2. Aggregation tests prove filtering, sums, missing-value handling, mapping
   uniqueness, and the six-row upper bound.
3. Migration and collector tests prove idempotency, last-good preservation,
   and metadata-only skip behavior.
4. Summary/read-plan/cache/UI tests prove bounded indexed reads and historical
   wording in Korean, English, Chinese, and Japanese.
5. Full lint, typecheck, unit, build, secret scan, CI, Production collection,
   smoke, and D1 read-budget checks run before this phase is considered done.
