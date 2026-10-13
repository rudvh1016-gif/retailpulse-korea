/** Small DB-only guard shared by admission and the queued A1-only collector. */
export async function airportMidnightSourceBlocked(db: Pick<D1Database, 'prepare'> | undefined) {
  if (!db) return true;
  const row = await db.prepare('SELECT status,detail FROM source_health WHERE source_id=? LIMIT 1')
    .bind('INCHEON_FLIGHT_DETAIL').first<{ status: string; detail: string | null }>();
  // A1 success persists LIVE in source_health; failure detail still vetoes it.
  // Status codes count only as httpStatus=NNN: a LIVE/STALE success detail
  // carries plain counts ("changed rows 403") that must not veto.
  return !row || !['LIVE', 'SUCCESS', 'STALE'].includes(row.status) ||
    /\bhttpStatus=(?:401|403|406|429)\b|QUOTA|THROTTL|BLOCKED|AUTH|SCHEMA/i.test(row.detail ?? '');
}
