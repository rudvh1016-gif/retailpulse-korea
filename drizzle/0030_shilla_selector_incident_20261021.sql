-- REVIEW ONLY: one known Shilla selector incident after the verified parser repair.
-- Evidence: natural run 39534064040 / job 119006486989 (2026-10-21 02:38 UTC).
-- Latest known source request: diagnostic #418 at 02:21:09.207598 UTC;
-- rounded UP to 02:21:10, plus the existing one-hour minimum = 03:21:10 UTC.
-- Root must verify no later source request and no older-code FX job remains queued/running.
-- No rate/date/status/error/last_success_at/lease/canonical row is changed.
-- Filename bookkeeping plus exact original next_due_at makes this one-time only.
-- After the reviewed KST day expires, or after any state change, it is a no-op.
UPDATE duty_free_exchange_attempt
SET next_due_at='2026-10-21T03:21:10.000Z'
WHERE vendor='shilla'
  AND status='BLOCKED'
  AND error_code='SELECTOR_UNVERIFIED'
  AND attempt_at='2026-10-21T02:10:25.714Z'
  AND next_due_at='2026-10-22T02:10:27.047Z'
  AND lease_id IS NULL AND lease_until=''
  AND date('now','+9 hours')='2026-10-21'
  AND strftime('%Y-%m-%dT%H:%M:%fZ','now') < '2026-10-21T15:00:00.000Z'
  AND '2026-10-21T03:21:10.000Z' >= strftime('%Y-%m-%dT%H:%M:%fZ','2026-10-21T02:21:10.000Z','+1 hour')
  AND '2026-10-21T03:21:10.000Z' >= strftime('%Y-%m-%dT%H:%M:%fZ',attempt_at,'+1 hour')
  AND '2026-10-21T03:21:10.000Z' < next_due_at
  AND NOT EXISTS (SELECT 1 FROM duty_free_exchange_daily
                  WHERE vendor='shilla' AND service_date_kst='2026-10-21')
  AND NOT EXISTS (SELECT 1 FROM duty_free_exchange_current
                  WHERE vendor='shilla' AND service_date_kst='2026-10-21');
