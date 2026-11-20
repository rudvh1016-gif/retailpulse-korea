/** Immutable congestion captures and the exact pointer to the published capture. */
import { selectA4Generation } from './a4-overflow-routing';

type Terminal = 'T1' | 'T2';
type Row = { terminal: string; zone: string | number; observedAt: string; sourceId: string };
export type A4Pointer = { terminal: Terminal; observedAt: string; digest: string; count: number };
type Manifest = A4Pointer & { payload: string };
export type A4Stores = {
  overflow: { put(m: Manifest): Promise<unknown>; get(digest: string): Promise<Manifest | undefined> };
  primary: { publish(m: A4Pointer): Promise<boolean>; get(terminal: Terminal): Promise<A4Pointer | undefined> };
};
const MAX_ROWS = 60;
const MAX_PAYLOAD_BYTES = 48 * 1024;

export const A4_GENERATION_SCHEMA = `
CREATE TABLE a4_generation (
  digest TEXT PRIMARY KEY NOT NULL CHECK(length(digest)=64),
  terminal TEXT NOT NULL CHECK(terminal IN ('T1','T2')),
  observed_at TEXT NOT NULL,
  row_count INTEGER NOT NULL CHECK(row_count BETWEEN 1 AND 60),
  payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=49152)
);
CREATE TRIGGER a4_generation_no_update BEFORE UPDATE ON a4_generation
BEGIN SELECT RAISE(ABORT,'immutable_generation'); END;
CREATE TRIGGER a4_generation_no_delete BEFORE DELETE ON a4_generation
BEGIN SELECT RAISE(ABORT,'immutable_generation'); END;
`;

export const A4_POINTER_SCHEMA = `
CREATE TABLE a4_pointer (
 terminal TEXT PRIMARY KEY NOT NULL CHECK(terminal IN ('T1','T2')),
 observed_at TEXT NOT NULL,
 digest TEXT NOT NULL CHECK(length(digest)=64),
 row_count INTEGER NOT NULL CHECK(row_count BETWEEN 1 AND 60)
);
CREATE TABLE a4_cutover (
 terminal TEXT PRIMARY KEY NOT NULL CHECK(terminal IN ('T1','T2')),
 cutover_at TEXT
);
`;

// Observed time is normalized to UTC with millisecond precision before storage.
export const A4_PUBLISH_POINTER = `
INSERT INTO a4_pointer(terminal,observed_at,digest,row_count) VALUES (?,?,?,?)
ON CONFLICT(terminal) DO UPDATE SET observed_at=excluded.observed_at,
 digest=excluded.digest,row_count=excluded.row_count
WHERE excluded.observed_at>a4_pointer.observed_at`;

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).sort(([a],[b]) => a < b ? -1 : a === b ? 0 : 1)
      .map(([k,v]) => [k,canonicalJson(v)]),
  );
  return value;
}

async function manifestFor<T extends Row>(capture: {terminal: Terminal; rows: readonly T[]}): Promise<Manifest> {
  const {terminal,rows}=capture;
  if ((terminal !== 'T1' && terminal !== 'T2') || !rows.length || rows.length>MAX_ROWS
    || selectA4Generation(terminal,rows,{state:'disabled'}).source !== 'primary') throw new Error('a4_invalid_capture');
  const sorted = [...rows].sort((a,b) => String(a.zone)<String(b.zone) ? -1 : String(a.zone)===String(b.zone) ? 0 : 1);
  const payload = JSON.stringify(canonicalJson(sorted));
  const bytes = new TextEncoder().encode(payload);
  if (bytes.length>MAX_PAYLOAD_BYTES) throw new Error('a4_invalid_capture');
  const hash = await crypto.subtle.digest('SHA-256',bytes);
  const digest = Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2,'0')).join('');
  return {terminal,observedAt:new Date(rows[0].observedAt).toISOString(),digest,count:rows.length,payload};
}

function same(a: A4Pointer | undefined,b: A4Pointer): boolean {
  return !!a && a.terminal===b.terminal && a.observedAt===b.observedAt && a.digest===b.digest && a.count===b.count;
}

export async function publishA4Generation<T extends Row>(capture: {terminal: Terminal; rows: readonly T[]}, stores: A4Stores): Promise<'published'|'superseded'> {
  const m = await manifestFor(capture);
  const old = await stores.primary.get(m.terminal);
  if (old && old.observedAt>=m.observedAt) return 'superseded';
  try { await stores.overflow.put(m); } catch { /* An acknowledgement can be lost; only exact durable readback is decisive. */ }
  let stored: Manifest | undefined;
  try { stored = await stores.overflow.get(m.digest); } catch { /* Unverified shard remains unpublished. */ }
  if (!same(stored,m) || stored?.payload!==m.payload) throw new Error('a4_unverified_generation');
  const pointer = {terminal:m.terminal,observedAt:m.observedAt,digest:m.digest,count:m.count};
  try { return await stores.primary.publish(pointer) ? 'published' : 'superseded'; }
  catch {
    let latest: A4Pointer | undefined;
    try { latest = await stores.primary.get(m.terminal); } catch { /* No publish proof. */ }
    if (same(latest,pointer)) return 'published';
    if (latest && latest.observedAt>=m.observedAt) return 'superseded';
    throw new Error('a4_unverified_publication');
  }
}

export async function readA4Generation(terminal: Terminal, stores: A4Stores): Promise<{state:'ok'; rows:readonly Row[]} | {state:'error'}> {
  try {
    const pointer=await stores.primary.get(terminal);
    if (!pointer) return {state:'ok',rows:[]};
    const stored=await stores.overflow.get(pointer.digest);
    if (!stored || !same(stored,pointer) || pointer.terminal!==terminal
      || stored.payload.length>MAX_PAYLOAD_BYTES) return {state:'error'};
    const rows: Row[]=JSON.parse(stored.payload);
    if (!Array.isArray(rows) || rows.length!==pointer.count) return {state:'error'};
    const verified=await manifestFor({terminal,rows});
    if (!same(verified,pointer) || verified.payload!==stored.payload) return {state:'error'};
    return {state:'ok',rows};
  } catch { return {state:'error'}; }
}
