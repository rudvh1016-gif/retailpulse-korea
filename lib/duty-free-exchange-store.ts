import { activeDutyFreeVendors, kstExchangeDate, verifiedDutyFreeObservation, type DutyFreeExchangeSnapshot, type DutyFreeObservation, type DutyFreeVendor, type DutyFreeAttemptStatus } from './duty-free-exchange';

export const DUTY_FREE_MIN_INTERVAL_MS = 3_600_000;
export const DUTY_FREE_BLOCK_INTERVAL_MS = 24 * 3_600_000;
export const DUTY_FREE_LEASE_MS = 120_000;
type Store = Pick<D1Database, 'prepare' | 'batch'>;
type Stored = {
  vendor: DutyFreeVendor; status: DutyFreeAttemptStatus; attempt_at: string; last_success_at: string | null;
  error_code: string | null; next_due_at: string | null; service_date_kst: string | null;
  currency: string | null; krw_per_unit: number | null; first_verified_at: string | null;
  source_url: string | null; scope: string | null;
};

/** A database-side lease is the request budget; no successful claim means no provider request. */
export async function claimDutyFreeAttempt(db: Store, vendor: DutyFreeVendor, now: Date, leaseId: string) {
  const at = now.toISOString(), until = new Date(now.getTime() + DUTY_FREE_LEASE_MS).toISOString();
  // Persist the request budget before HTTP; a crashed run cannot reset it when its lease expires.
  const next = new Date(now.getTime() + DUTY_FREE_MIN_INTERVAL_MS).toISOString();
  const result = await db.prepare(`INSERT INTO duty_free_exchange_attempt
    (vendor, attempt_at, status, next_due_at, lease_id, lease_until)
    VALUES (?, ?, 'RUNNING', ?, ?, ?)
    ON CONFLICT(vendor) DO UPDATE SET attempt_at=excluded.attempt_at, status='RUNNING',
      error_code=NULL, next_due_at=excluded.next_due_at, lease_id=excluded.lease_id, lease_until=excluded.lease_until
    WHERE duty_free_exchange_attempt.next_due_at <= ? AND duty_free_exchange_attempt.lease_until <= ?`)
    .bind(vendor, at, next, leaseId, until, at, at).run();
  if (!result.success || typeof result.meta?.changes !== 'number') throw new Error('D1_CLAIM_UNMEASURED');
  return result.meta.changes === 1;
}

export async function saveDutyFreeSuccess(db: Store, observation: DutyFreeObservation, leaseId: string) {
  const valid = verifiedDutyFreeObservation(observation, Date.parse(observation.verifiedAt));
  if (!valid) throw new Error('INVALID_OBSERVATION');
  const {vendor, serviceDateKst, currency, krwPerUnit, verifiedAt, sourceUrl, scope} = observation;
  // Retrieval time is deliberately absent from semantic identity.
  const semantic = JSON.stringify([vendor, serviceDateKst, currency, krwPerUnit, sourceUrl, scope]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(semantic));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('');
  const next = new Date(Date.parse(verifiedAt) + DUTY_FREE_MIN_INTERVAL_MS).toISOString();
  const results = await db.batch([
    db.prepare(`INSERT INTO duty_free_exchange_current
      (vendor, service_date_kst, currency, krw_per_unit, first_verified_at, source_url, scope, source_hash)
      SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS
        (SELECT 1 FROM duty_free_exchange_attempt WHERE vendor=? AND lease_id=?)
      ON CONFLICT(vendor) DO UPDATE SET service_date_kst=excluded.service_date_kst,
        currency=excluded.currency, krw_per_unit=excluded.krw_per_unit, first_verified_at=excluded.first_verified_at,
        source_url=excluded.source_url, scope=excluded.scope, source_hash=excluded.source_hash
      WHERE duty_free_exchange_current.source_hash <> excluded.source_hash`)
      .bind(vendor, serviceDateKst, currency, krwPerUnit, verifiedAt, sourceUrl, scope, hash, vendor, leaseId),
    db.prepare(`UPDATE duty_free_exchange_attempt SET status='SUCCESS', error_code=NULL,
      last_success_at=?, next_due_at=?, lease_id=NULL, lease_until=''
      WHERE vendor=? AND lease_id=? AND EXISTS
        (SELECT 1 FROM duty_free_exchange_current WHERE vendor=? AND source_hash=?)`)
      .bind(verifiedAt, next, vendor, leaseId, vendor, hash),
  ]);
  if (results.some(result => !result.success)) throw new Error('D1_SAVE_FAILED');
  return {changedRows: results[0].meta?.changes ?? null, leaseOwned: results[1].meta?.changes === 1};
}

export async function saveDutyFreeFailure(db: Store, vendor: DutyFreeVendor, leaseId: string, at: Date, errorCode: string, blocked: boolean) {
  if (!/^[A-Z0-9_]{1,64}$/.test(errorCode)) throw new Error('INVALID_ERROR_CODE');
  const next = new Date(at.getTime() + (blocked ? DUTY_FREE_BLOCK_INTERVAL_MS : DUTY_FREE_MIN_INTERVAL_MS)).toISOString();
  const result = await db.prepare(`UPDATE duty_free_exchange_attempt SET status=?, error_code=?,
    next_due_at=?, lease_id=NULL, lease_until='' WHERE vendor=? AND lease_id=?`)
    .bind(blocked ? 'BLOCKED' : 'ERROR', errorCode, next, vendor, leaseId).run();
  if (!result.success) throw new Error('D1_FAILURE_SAVE_FAILED');
  return result.meta?.changes === 1;
}

const timeOrNull = (input: string | null) => input && Number.isFinite(Date.parse(input)) ? input : null;
export function unavailableDutyFreeSnapshot(now: Date): DutyFreeExchangeSnapshot {
  return {mode:'duty-free-exchange', collectionMode:'AUTOMATED', generatedAt:now.toISOString(),
    todayKst:kstExchangeDate(now.getTime())!, sources:activeDutyFreeVendors.map(vendor =>
      ({vendor, observation:null, lastAttemptAt:null, lastAttemptStatus:'NEVER', errorCode:'STORAGE_UNAVAILABLE', nextAttemptAt:null}))};
}

/** One bounded active-source read; historical inactive rows remain stored. No provider request. */
export async function readDutyFreeSnapshot(db: Pick<D1Database, 'prepare'>, now: Date): Promise<DutyFreeExchangeSnapshot> {
  const query = await db.prepare(`SELECT a.vendor, a.status, a.attempt_at, a.last_success_at, a.error_code, a.next_due_at,
    c.service_date_kst, c.currency, c.krw_per_unit, c.first_verified_at, c.source_url, c.scope
    FROM duty_free_exchange_attempt a LEFT JOIN duty_free_exchange_current c ON c.vendor=a.vendor
    WHERE a.vendor='shilla' LIMIT 1`).all<Stored>();
  if (!query.success) throw new Error('D1_READ_FAILED');
  const snapshot = unavailableDutyFreeSnapshot(now);
  snapshot.sources = snapshot.sources.map(source => {
    const row = (query.results??[]).find(value => value.vendor === source.vendor);
    if (!row) return {...source, errorCode:null};
    const latest=row.last_success_at&&row.first_verified_at&&row.last_success_at>=row.first_verified_at
      &&kstExchangeDate(Date.parse(row.last_success_at))===row.service_date_kst?row.last_success_at:row.first_verified_at;
    const observation = verifiedDutyFreeObservation({vendor:row.vendor,serviceDateKst:row.service_date_kst,
      currency:row.currency,krwPerUnit:row.krw_per_unit,verifiedAt:latest,
      sourceUrl:row.source_url,scope:row.scope,verified:true}, now.getTime());
    const status: DutyFreeAttemptStatus = ['SUCCESS','ERROR','BLOCKED','RUNNING'].includes(row.status) ? row.status : 'NEVER';
    return {vendor:source.vendor, observation,lastAttemptAt:timeOrNull(row.attempt_at),lastAttemptStatus:status,
      errorCode:row.error_code && /^[A-Z0-9_]{1,64}$/.test(row.error_code) ? row.error_code : null,nextAttemptAt:timeOrNull(row.next_due_at)};
  });
  return snapshot;
}
