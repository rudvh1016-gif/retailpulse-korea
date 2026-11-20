import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { publishA4Generation, readA4Generation, A4_POINTER_SCHEMA, A4_GENERATION_SCHEMA, A4_PUBLISH_POINTER } from '../lib/a4-overflow-publication.ts';

const source = 'INCHEON_DEPARTURE_CONGESTION';
const capture = (minute, zone = '1') => {
  const observedAt = `2026-11-19T08:${minute}:00.000Z`;
  return { terminal:'T1', rows:[{terminal:'T1',sourceId:source,zone,observedAt,waitingCount:12}] };
};
function fixture() {
  const overflowDb = new DatabaseSync(':memory:');
  const primaryDb = new DatabaseSync(':memory:');
  overflowDb.exec(A4_GENERATION_SCHEMA); primaryDb.exec(A4_POINTER_SCHEMA);
  const shape = v => v ? { terminal:v.terminal, observedAt:v.observed_at, digest:v.digest, count:v.row_count } : undefined;
  const overflow = {
    put: async m => overflowDb.prepare('INSERT INTO a4_generation VALUES (?,?,?,?,?) ON CONFLICT(digest) DO NOTHING').run(m.digest,m.terminal,m.observedAt,m.count,m.payload),
    get: async digest => {
      const m=overflowDb.prepare('SELECT * FROM a4_generation WHERE digest=?').get(digest);
      return m ? {...shape(m),payload:m.payload} : undefined;
    },
  };
  const primary = {
    get: async terminal => shape(primaryDb.prepare('SELECT * FROM a4_pointer WHERE terminal=?').get(terminal)),
    publish: async m => primaryDb.prepare(A4_PUBLISH_POINTER).run(m.terminal,m.observedAt,m.digest,m.count).changes===1,
  };
  return { primary,overflow,primaryDb,overflowDb };
}

test('confirmed shard commit precedes atomic monotonic publication; duplicate and late captures do not replace', async () => {
  const f=fixture();
  assert.equal(await publishA4Generation(capture('05'),f), 'published');
  assert.equal(await publishA4Generation(capture('05'),f), 'superseded');
  assert.equal(await publishA4Generation(capture('05','conflict'),f), 'superseded');
  assert.equal(await publishA4Generation(capture('04'),f), 'superseded');
  const read=await readA4Generation('T1',f);
  assert.deepEqual(read,{state:'ok',rows:capture('05').rows});
  assert.throws(() => f.overflowDb.exec("UPDATE a4_generation SET payload='{}'"));
});
test('lost shard commit acknowledgement can be read back; unverified or failed shard never publishes', async () => {
  const f=fixture();
  const actual=f.overflow.put;
  f.overflow.put=async m=>{await actual(m);throw Error('timeout');};
  assert.equal(await publishA4Generation(capture('05'),f),'published');
  f.overflow.put=async()=>{throw Error('403');};
  await assert.rejects(publishA4Generation(capture('06'),f),/unverified_generation/);
  assert.deepEqual(await readA4Generation('T1',f),{state:'ok',rows:capture('05').rows});
});
test('failed primary commit leaves old generation visible and retries publication idempotently', async () => {
  const f=fixture();
  await publishA4Generation(capture('05'),f);
  const actual=f.primary.publish;
  f.primary.publish=async()=>{throw Error('507');};
  await assert.rejects(publishA4Generation(capture('06'),f),/unverified_publication/);
  assert.deepEqual(await readA4Generation('T1',f),{state:'ok',rows:capture('05').rows});
  assert.equal(f.overflowDb.prepare('SELECT count(*) n FROM a4_generation').get().n,2);
  f.primary.publish=actual;
  assert.equal(await publishA4Generation(capture('06'),f),'published');
});
test('racing older publication cannot replace newer; torn/missing payload is a degraded read', async () => {
  const f=fixture(),actual=f.primary.publish;
  f.primary.publish=async m=>{
    if (m.observedAt.includes(':05:')) await publishA4Generation(capture('06'),f);
    return actual(m);
  };
  assert.equal(await publishA4Generation(capture('05'),f),'superseded');
  assert.deepEqual(await readA4Generation('T1',f),{state:'ok',rows:capture('06').rows});
  const get=f.overflow.get;
  f.overflow.get=async id=>({...await get(id),payload:'[]'});
  assert.deepEqual(await readA4Generation('T1',f),{state:'error'});
  f.overflow.get=async()=>undefined;
  assert.deepEqual(await readA4Generation('T1',f),{state:'error'});
  assert.deepEqual(await readA4Generation('T2',f),{state:'ok',rows:[]});
});
test('empty, oversized, mixed generation, wrong source, and oversized serialized rows do not write', async () => {
  const f=fixture(), a=capture('05');
  for (const rows of [[], Array.from({length:61},(_,i)=>({...a.rows[0],zone:String(i)})), [...a.rows,...capture('06','2').rows], [{...a.rows[0],sourceId:'other'}], [{...a.rows[0],zone:'x'.repeat(50000)}]]) {
    await assert.rejects(publishA4Generation({...a,rows},f),/invalid_capture/);
  }
  assert.equal(f.overflowDb.prepare('SELECT count(*) n FROM a4_generation').get().n,0);
});

test('rollback keeps shard observations visible over stale primary until both terminal streams catch up', async () => {
  const { selectA4Generation } = await import('../lib/a4-overflow-routing.ts');
  const f=fixture();
  const mkT2=minute=>{
    const a=capture(minute);
    return {terminal:'T2',rows:a.rows.map(r=>({...r,terminal:'T2',sourceId:`${source}_T2`}))};
  };
  await publishA4Generation(capture('05'),f);
  await publishA4Generation(mkT2('05'),f);
  const t1=await readA4Generation('T1',f), t2=await readA4Generation('T2',f);
  assert.equal(selectA4Generation('T1',capture('04').rows,t1).source,'overflow');
  assert.equal(selectA4Generation('T1',capture('06').rows,t1).source,'primary');
  assert.equal(selectA4Generation('T2',mkT2('04').rows,t2).source,'overflow');
  assert.equal(selectA4Generation('T2',mkT2('06').rows,t2).source,'primary');
});
test('lost primary commitment acknowledgement returns published only upon exact durable readback', async () => {
  const f=fixture(), actual=f.primary.publish;
  f.primary.publish=async m=>{await actual(m);throw Error('timeout');};
  assert.equal(await publishA4Generation(capture('05'),f),'published');
  assert.deepEqual(await readA4Generation('T1',f),{state:'ok',rows:capture('05').rows});
});
