import assert from 'node:assert/strict';
import test from 'node:test';
import { SqliteD1 } from './helpers/operational-sqlite.mjs';
import { measureSource } from '../lib/operational-evidence.ts';
import { verifyAirportRecoveryToday } from '../lib/airport-recovery-verification.ts';
import { OperationalMemory } from '../lib/operational-memory.ts';
import { runSelectedProductionSources } from '../lib/production-runner.ts';
import { executeAirportMidnightDirect } from '../lib/airport-midnight-direct-recovery.ts';
import { readAirportTodayCoverage } from '../lib/airport-today-coverage.ts';
import { airportMidnightSourceBlocked } from '../lib/airport-recovery-protection.ts';
import { airportRequestBudgetAvailable } from '../lib/airport-request-budget.ts';

const NOW = '2026-10-10T16:22:00.000Z', DAY = '2026-10-11';
const SOURCE = 'INCHEON_FLIGHT_DETAIL';
const ENV = {
  ENABLE_PRODUCTION_COLLECTOR: 'true', RPK_A1_MIDNIGHT_RECOVERY: 'true',
  RPK_A1_MIDNIGHT_CALLER: 'airport_midnight_recovery', RPK_PRODUCTION_SOURCES: 'airport_recent',
  RPK_A1_MAX_REQUESTS: '125', RPK_A1_RESCAN_TODAY: 'false', RPK_OPERATIONAL_ATTEMPT: '1',
  RPK_A1_EXPECTED_TARGET_DATE: DAY, GITHUB_REPOSITORY: 'rudvh1016-gif/retailpulse-korea',
  GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_WORKFLOW: 'Collect Realtime Signals',
  GITHUB_JOB: 'collect', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: 'a'.repeat(40),
  RPK_CENTRAL_RECOVERY_OWNER_APPROVED: 'true', RPK_CENTRAL_RECOVERY_RUNTIME_ENABLED: 'true',
};
const flight = date => ({ fid: `KE1-${date}`, flightId: 'KE1', masterFlightId: 'KE1', codeshare: 'N',
  scheduleDatetime: `${date}0900`, estimatedDatetime: `${date}0900`, terminalId: 'P01',
  gateNumber: '29', airline: 'KE', airport: 'NRT' });
const payload = date => ({ response: { header: { resultCode: '00' }, body: { items: [flight(date)], totalCount: 1 } } });

function scenario(t, options = {}) {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(NOW) });
  const db = new SqliteD1(), memory = new OperationalMemory(db);
  t.after(() => db.raw.close());
  db.raw.prepare("INSERT INTO source_health(source_id,status,detail,schema_version) VALUES(?,'STALE','','airport-v1')").run(SOURCE);
  const calls = { provider: 0, child: 0, verify: 0 }, results = [];
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(new URL(url).hostname, 'apis.data.go.kr');
    calls.provider++;
    return options.response?.() ?? new Response(JSON.stringify(payload('20261011')), { status: 200 });
  });
  const productionEnv = { DB: db, DATA_GO_KR_SERVICE_KEY: options.noKey ? undefined : 'fixture-key',
    A1_SHARED_REQUEST_BUDGET: true, A1_MAX_REQUESTS: 125, A1_RESCAN_TODAY: false, A1_EXPECTED_TARGET_DATE: DAY };
  const deps = { memory, env: { ...ENV }, now: () => new Date().toISOString(),
    readCoverage: now => readAirportTodayCoverage(db, now),
    readSnapshot: async () => ({ complete: true, early: [], active: [] }),
    sourceBlocked: () => airportMidnightSourceBlocked(db), budgetAvailable: now => airportRequestBudgetAvailable(db, now),
    collectA1: async () => {
      calls.child++;
      await options.beforeCollect?.(db);
      // Default production runner and real collector; only the HTTP transport is mocked.
      const [result] = await runSelectedProductionSources(productionEnv, ['airport_recent'], new Date());
      results.push(result);
      return result;
    },
    verifyToday: async (_day, now) => {
      calls.verify++;
      if (options.verifyThrows) throw Error('verification unavailable');
      const current = (await readAirportTodayCoverage(db, now)).state === 'CURRENT';
      return { dataValid: current, storageValid: current, publicValid: options.publicValid === undefined ? true : options.publicValid };
    },
  };
  return { db, memory, deps, calls, results };
}

test('real A1 collector result crosses production runner and direct recovery with measured success and settled budget', async t => {
  const { db, memory, deps, calls, results } = scenario(t);
  const result = await executeAirportMidnightDirect(deps);
  assert.equal(result.state, 'RECOVERED');
  assert.equal(results[0].providerRequests, 1); assert.match(results[0].detail, /; requests 1;/);
  assert.equal(calls.provider, 1); assert.equal(calls.verify, 1);
  const [attempt] = await memory.attempts(SOURCE, DAY);
  assert.equal(attempt.providerRequests, 1); assert.equal(attempt.verified, true); assert.ok(attempt.completedAt);
  assert.equal((await memory.inFlightControlled()).length, 0);
  assert.deepEqual(db.raw.prepare("SELECT status,records_read FROM collector_runs WHERE source_id='INCHEON_FLIGHT_REQUEST_BUDGET'").get(),
    Object.assign(Object.create(null), { status: 'SETTLED', records_read: 1 }));
  assert.equal((await executeAirportMidnightDirect(deps)).state, 'DAILY_ATTEMPT_ALREADY_SPENT');
  assert.equal(calls.child, 1); assert.equal(calls.provider, 1);
});

for (const mode of ['not-published', 'budget-skip', 'missing-key', 'provider403']) {
  test(`real A1 ${mode} is a measured failed completion, with no public lookup or same-day retry`, async t => {
    const { db, memory, deps, calls, results } = scenario(t, {
      noKey: mode === 'missing-key',
      response: () => mode === 'provider403' ? new Response('', { status: 403 })
        : new Response(JSON.stringify(payload(mode === 'not-published' ? '20261012' : '20261011')), { status: 200 }),
      beforeCollect: mode === 'budget-skip' ? db => {
        db.raw.prepare('INSERT INTO collector_runs(run_id,source_id,started_at,status,records_read) VALUES(?,?,?,?,?)')
          .run('other-reservation', 'INCHEON_FLIGHT_REQUEST_BUDGET', NOW, 'RESERVED', 500);
      } : undefined,
      verifyThrows: true,
    });
    const expected = { 'not-published': ['NOT_YET_PUBLISHED', 1], 'budget-skip': ['SKIPPED_REQUEST_BUDGET', 0],
      'missing-key': ['NEEDS_KEY', 0], provider403: ['ERROR', 1] }[mode];
    assert.equal((await executeAirportMidnightDirect(deps)).state, 'HUMAN_REVIEW_RECOVERY_UNVERIFIED');
    assert.equal(results[0].status, expected[0]); assert.equal(results[0].providerRequests, expected[1]);
    assert.notEqual(results[0].executionUncertain, true);
    assert.equal(calls.provider, expected[1]); assert.equal(calls.verify, 0);
    const [attempt] = await memory.attempts(SOURCE, DAY);
    assert.ok(attempt.completedAt); assert.equal(attempt.verified, false); assert.equal(attempt.providerRequests, expected[1]);
    assert.equal((await memory.inFlightControlled()).length, 0);
    assert.equal((await executeAirportMidnightDirect(deps)).state, 'DAILY_ATTEMPT_ALREADY_SPENT');
    assert.equal(calls.child, 1);
    if (expected[1]) assert.equal(db.raw.prepare("SELECT records_read FROM collector_runs WHERE source_id='INCHEON_FLIGHT_REQUEST_BUDGET'").get().records_read, 1);
  });
}

test('real A1 ambiguous canonical write preserves its measured count and the cross-day lock', async t => {
  const { db, memory, deps, calls, results } = scenario(t, { beforeCollect: db => {
    const batch = db.batch.bind(db);
    db.batch = async statements => {
      // Emulate a canonical commit whose response was lost.
      const result = await batch(statements);
      if (db.raw.prepare('SELECT COUNT(*) AS n FROM airport_flights').get().n > 0) throw Error('write acknowledgement lost');
      return result;
    };
  } });
  assert.equal((await executeAirportMidnightDirect(deps)).state, 'HUMAN_REVIEW_UNCERTAIN_CHILD');
  assert.equal(results[0].status, 'ERROR'); assert.equal(results[0].executionUncertain, true);
  assert.equal(results[0].providerRequests, 1); assert.equal(calls.provider, 1);
  assert.equal((await memory.attempts(SOURCE, DAY))[0].completedAt, null);
  assert.equal((await memory.inFlightControlled()).length, 1);
  assert.equal(db.raw.prepare("SELECT records_read FROM collector_runs WHERE source_id='INCHEON_FLIGHT_REQUEST_BUDGET'").get().records_read, 1);
  deps.env.RPK_A1_EXPECTED_TARGET_DATE = '2026-10-12';
  t.mock.timers.setTime(Date.parse('2026-10-11T16:22:00Z'));
  assert.equal((await executeAirportMidnightDirect(deps)).state, 'INFLIGHT_LOCK');
  assert.equal(calls.provider, 1);
});

for (const mode of ['unknown-status', 'unmeasured-failure']) {
  test(`A1 ${mode} cannot release its durable admission`, async t => {
    const { memory, deps, calls } = scenario(t);
    const collect = deps.collectA1;
    deps.collectA1 = async () => {
      const result = await collect();
      return mode === 'unknown-status' ? { ...result, status: 'UNRECOGNIZED' }
        : { ...result, status: 'ERROR', providerRequests: undefined, detail: 'unmeasured' };
    };
    assert.equal((await executeAirportMidnightDirect(deps)).state, mode === 'unknown-status'
      ? 'HUMAN_REVIEW_CHILD_STATUS_UNVERIFIED' : 'HUMAN_REVIEW_UNMEASURED_CHILD');
    assert.equal((await memory.inFlightControlled()).length, 1);
    assert.equal(calls.provider, 1); assert.equal(calls.verify, 0);
  });
}

test('runner converts a thrown A1 database failure to unknown execution without inventing zero requests', async t => {
  const { db, memory, deps, calls, results } = scenario(t, { beforeCollect: db => {
    const prepare = db.prepare.bind(db);
    db.prepare = sql => {
      if (sql.startsWith('SELECT detail FROM collector_runs')) throw Error('database unavailable');
      return prepare(sql);
    };
  } });
  assert.equal((await executeAirportMidnightDirect(deps)).state, 'HUMAN_REVIEW_UNCERTAIN_CHILD');
  assert.equal(results[0].executionUncertain, true); assert.equal(results[0].providerRequests, undefined);
  assert.equal(calls.provider, 0); assert.equal(calls.verify, 0);
  assert.equal((await memory.inFlightControlled()).length, 1);
  assert.equal((await memory.attempts(SOURCE, DAY))[0].completedAt, null);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM collector_runs WHERE source_id='INCHEON_FLIGHT_REQUEST_BUDGET'").get().n, 0);
});

for (const mode of ['public-false', 'public-unknown', 'verification-throw', 'finish-write-throw']) {
  test(`measured A1 success with ${mode} never becomes falsely recovered`, async t => {
    const { memory, deps, calls } = scenario(t, { publicValid: mode === 'public-false' ? false : null,
      verifyThrows: mode === 'verification-throw' });
    if (mode === 'finish-write-throw') memory.finish = async () => { throw Error('completion write unavailable'); };
    const result = await executeAirportMidnightDirect(deps);
    const uncertain = mode.endsWith('throw');
    assert.equal(result.state, uncertain ? 'HUMAN_REVIEW_READ_OR_WRITE_UNAVAILABLE' : 'HUMAN_REVIEW_RECOVERY_UNVERIFIED');
    const [attempt] = await memory.attempts(SOURCE, DAY);
    assert.equal(attempt.verified, false);
    assert.equal(attempt.completedAt === null, uncertain);
    assert.equal((await memory.inFlightControlled()).length, uncertain ? 1 : 0);
    assert.equal(calls.provider, 1);
    assert.equal((await executeAirportMidnightDirect(deps)).state, 'DAILY_ATTEMPT_ALREADY_SPENT');
    assert.equal(calls.provider, 1);
  });
}

// Real production verification wiring, not a stubbed boolean success.
for (const mode of ['matching','wrong-date','wrong-count','stale-public','partial-scan','stale-health','invalid-row','public-error','capped','health-error','partial-terminal','scope-mismatch']) {
  test(`A1 real verifier and collector: ${mode}`, async t => {
    const { db, deps, calls } = scenario(t);
    let publicRequests = 0;
    deps.verifyToday = async (day, now) => {
      if (mode === 'partial-scan') db.raw.prepare("UPDATE collector_runs SET detail='partial' WHERE source_id=?").run(SOURCE);
      if (mode === 'stale-health') db.raw.prepare("UPDATE source_health SET last_retrieved_at='2026-10-09T00:00:00Z' WHERE source_id=?").run(SOURCE);
      if (mode === 'health-error') db.raw.prepare("UPDATE source_health SET status='ERROR' WHERE source_id=?").run(SOURCE);
      if (mode === 'partial-terminal') db.raw.prepare("UPDATE airport_flights SET terminal=NULL, gate=NULL, quality_status='PARTIAL'").run();
      if (mode === 'capped') {
        const row = db.raw.prepare('SELECT * FROM airport_flights LIMIT 1').get();
        const keys = Object.keys(row);
        const insert = db.raw.prepare(`INSERT INTO airport_flights (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`);
        for(let i=1;i<2000;i++) insert.run(...keys.map(key=>key==='id'||key==='physical_flight_id'||key==='flight_number' ? `${row[key]}-${i}` : row[key]));
      }
      if (mode === 'invalid-row') db.raw.prepare("UPDATE airport_flights SET quality_status='INVALID'").run();
      return verifyAirportRecoveryToday(db, day, now, async url => {
        publicRequests++;
        assert.equal(url, 'https://koretaildata.com/api/live/summary');
        if (mode === 'public-error') return new Response('', {status:503});
        return Response.json({ mode:'live-summary', serviceDateKst:mode === 'wrong-date' ? '2026-10-10' : DAY,
          airport: {departuresTrackedToday: mode === 'wrong-count' ? 2 : 1,
            departuresTrackedTodayByTerminal:mode==='partial-terminal'?{}:{T1:1},
            departuresTrackedTodayRetrievedAt:mode === 'stale-public' ? '2026-10-09T00:00:00Z' : NOW,
            flightScope:{total:1,T1:mode==='partial-terminal'?0:1,T2:mode==='scope-mismatch'?1:0,CONCOURSE:0,other:0,unassigned:mode==='partial-terminal'?1:0,conflicting:0,capped:false}} });
      });
    };
    const result = await executeAirportMidnightDirect(deps);
    assert.equal(result.state, ['matching','partial-terminal'].includes(mode) ? 'RECOVERED' : mode === 'public-error'
      ? 'HUMAN_REVIEW_READ_OR_WRITE_UNAVAILABLE' : 'HUMAN_REVIEW_RECOVERY_UNVERIFIED');
    assert.equal(publicRequests, ['partial-scan','stale-health','invalid-row','capped','health-error'].includes(mode) ? 0 : 1);
    assert.equal(calls.provider,1);
  });
}

test('ordinary A1 measurement remains a bounded presence probe, not a 2000-row health-poll multiplier', async t => {
  const {db} = scenario(t);
  await measureSource(db,SOURCE,NOW);
  assert.ok(db.calls.some(sql=>sql.includes('physical_flight_id')&&sql.includes('LIMIT 1')));
  assert.ok(!db.calls.some(sql=>sql.includes('LIMIT 2000')));
});
