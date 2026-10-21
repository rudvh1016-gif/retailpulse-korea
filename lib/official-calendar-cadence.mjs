/** Calendar-only eligibility from stored receipts; customs remains daily. */
export const CALENDAR_RETRY_COOLDOWN_MS=7*86400_000;
export function calendarMonthKey(value) {
 const time=value instanceof Date?value.getTime():Date.parse(value);
 if(!Number.isFinite(time))return null;
 return new Date(time+9*3600_000).toISOString().slice(0,7);
}
/** One successful refresh per KST month, plus at most one failed-source attempt
 * per seven days. A missed first-day workflow is eligible on its next run. */
export function calendarRefreshDecision(before,now) {
 const at=now instanceof Date?now.getTime():Date.parse(now);
 if(!Number.isFinite(at))return 'SKIPPED_INVALID_TIME';
 if(!before)return 'DUE';
 const checked=Date.parse(before.checked_at),verified=Date.parse(before.last_verified_at);
 if(checked>at||verified>at)return 'SKIPPED_FUTURE_GUARD';
 if(Number.isFinite(verified)&&calendarMonthKey(before.last_verified_at)===calendarMonthKey(now))return 'SKIPPED_MONTHLY_GUARD';
 if(before.status!=='VERIFIED'&&Number.isFinite(checked)&&at-checked<CALENDAR_RETRY_COOLDOWN_MS)return 'SKIPPED_RETRY_COOLDOWN';
 return 'DUE';
}
