/**
 * The denominator is a claim, and it has to be checkable.
 *
 * On 2026-09-14 the harness reported "16/16 sources covered" while
 * KASI_PUBLIC_HOLIDAYS was collecting and failing in Production, unseen.
 * Counting over sources SEEN rather than sources TABULATED immediately exposed
 * a second, INCHEON_TRANSFER_FORECAST. Both were written by real collectors and
 * absent from the table those collectors were supposed to appear in.
 *
 * What makes that dangerous is not the missing entry. It is that every source
 * the harness DID know about was fine, so the report was green — true about its
 * eighteen, and wrong about Production. These tests exist so a nineteenth can
 * never be invisible again.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  SOURCE_CENSUS, CENSUSED_SOURCE_IDS, DIRECT_COLLECTORS, COMPANION_SOURCE_IDS,
  UNMAPPED_RUNNER_NAMES, censusSources, censusSeverity,
} from '../lib/source-census.ts';
import { SOURCE_RECOVERY_CAPABILITIES } from '../lib/recovery-capability.ts';
import { PRODUCTION_SOURCE_NAMES } from '../lib/production-runner.ts';
import { DIAGNOSTIC_SOURCE_IDS } from '../lib/production-diagnostics.ts';
import { canonicalOperationalJob } from '../lib/operational-evidence.ts';
import { buildHealthReport } from '../lib/operational-health.ts';
import { buildWatchdogReport } from '../lib/watchdog.ts';

const classifiedIds = SOURCE_RECOVERY_CAPABILITIES.map((entry) => entry.sourceId);
const ownedIds = CENSUSED_SOURCE_IDS.filter((id) => Boolean(canonicalOperationalJob(id)));
const census = (observed) => censusSources({ observed, classifiedIds, ownedIds });

test('the census is derived from the collectors, not hand-listed', () => {
  // Every runner key contributes its canonical id, so adding a runner adds a
  // censused source without anyone editing a count.
  for (const name of PRODUCTION_SOURCE_NAMES) {
    const sourceId = DIAGNOSTIC_SOURCE_IDS[name];
    if (!sourceId) continue;
    assert.ok(CENSUSED_SOURCE_IDS.includes(sourceId), `${name} -> ${sourceId} must be censused`);
  }
  // A runner key with no canonical id is a hole on the derivation side and is
  // reported rather than skipped — EXCEPT the two recovery windows, which are
  // repair passes over an existing source and share its id, job and budget.
  assert.deepEqual(UNMAPPED_RUNNER_NAMES, []);
  const variants = PRODUCTION_SOURCE_NAMES.filter((name) => name.endsWith('_recovery'));
  assert.deepEqual(variants, ['airport_passenger_forecast_recovery', 'weather_recovery']);
  for (const name of variants) assert.equal(DIAGNOSTIC_SOURCE_IDS[name], undefined, `${name} must not be a source of its own`);
  assert.equal(new Set(CENSUSED_SOURCE_IDS).size, CENSUSED_SOURCE_IDS.length, 'one entry per source');
  // Provenance travels with every entry.
  for (const entry of SOURCE_CENSUS) {
    assert.ok(['PRODUCTION_RUNNER', 'DIRECT_COLLECTOR', 'COMPANION'].includes(entry.origin), entry.sourceId);
    assert.ok(entry.declaredBy.length > 5, `${entry.sourceId} must say what declares it`);
  }
});

test('every direct collector names a file that really writes it', () => {
  for (const entry of DIRECT_COLLECTORS) {
    const source = readFileSync(entry.declaredBy, 'utf8');
    assert.ok(source.includes(entry.sourceId),
      `${entry.sourceId} must actually appear in ${entry.declaredBy}, not merely be asserted here`);
    assert.ok(CENSUSED_SOURCE_IDS.includes(entry.sourceId));
  }
  // The two that were found missing in Production are both covered now.
  for (const id of ['KASI_PUBLIC_HOLIDAYS', 'INCHEON_TRANSFER_FORECAST']) {
    assert.ok(CENSUSED_SOURCE_IDS.includes(id), `${id} was invisible once and must stay censused`);
  }
  assert.deepEqual([...COMPANION_SOURCE_IDS], ['SEOUL_CITYDATA_CMRCL']);
});

test('a source Production has and the census does not is SOURCE_COVERAGE_GAP', () => {
  const clean = census(CENSUSED_SOURCE_IDS);
  assert.equal(clean.verdict, 'COMPLETE');
  assert.deepEqual(clean.unregistered, []);

  const withStranger = census([...CENSUSED_SOURCE_IDS, 'SOME_NEW_PROVIDER_SOURCE']);
  assert.equal(withStranger.verdict, 'SOURCE_COVERAGE_GAP');
  assert.deepEqual(withStranger.unregistered, ['SOME_NEW_PROVIDER_SOURCE']);
  assert.match(withStranger.detail, /SOME_NEW_PROVIDER_SOURCE/);
});

test('an unread source list is UNMEASURED, never COMPLETE', () => {
  const offline = census(null);
  assert.equal(offline.verdict, 'UNMEASURED');
  assert.equal(censusSeverity('UNMEASURED'), 'UNKNOWN');
  assert.match(offline.detail, /cannot claim to be complete/);
  // Reading an EMPTY list is different from not reading one, and both are
  // non-green: an empty Production list means nothing is registered at all.
  assert.notEqual(census([]).verdict, 'UNMEASURED');
});

test('a coverage gap blocks HEALTHY; nothing else about the report can rescue it', () => {
  // A report where every other area is perfect...
  const perfect = {
    nowIso: '2026-09-15T00:00:00Z',
    scheduler: { entries: [], duplicateSchedulers: [], unroutedWorkerCrons: [], missingRoutedWorkflows: [], undispatchableRoutes: [], manualOnly: [] },
    docDrift: [],
    sources: [{ sourceId: 'X', job: 'j', severity: 'HEALTHY', walk: { reached: 'HEALTHY', state: 'HEALTHY', blockedAt: null, unknown: false, trail: [] } }],
    incidents: [],
    incidentMemoryAvailable: true,
    watchdog: buildWatchdogReport([{ name: 'w', lastSeenAt: '2026-09-15T00:00:00Z', expectedIntervalMs: 3600_000, observedByIndependentPlatform: true }], '2026-09-15T00:00:00Z'),
    quota: [],
    forecast: [],
    runtimeLlm: { offendingDependencies: [], offendingFiles: [], scannedFileCount: 10, scannedDependencyCount: 1 },
    unwiredDefences: [],
  };
  const complete = buildHealthReport({ ...perfect, sourceCensus: census(CENSUSED_SOURCE_IDS) });
  assert.equal(complete.areas.sourceCensus, 'HEALTHY');

  // ...still cannot be HEALTHY while a source is collecting unseen.
  const gapped = buildHealthReport({ ...perfect, sourceCensus: census([...CENSUSED_SOURCE_IDS, 'UNSEEN_SOURCE']) });
  assert.equal(gapped.areas.sourceCensus, 'ERROR');
  assert.equal(gapped.overall, 'ERROR', 'an unregistered live source must block HEALTHY');
  assert.equal(gapped.sourceCensus.unregistered[0], 'UNSEEN_SOURCE');

  // And a report built without a census at all is UNKNOWN, not HEALTHY: a
  // census nobody ran is not a census that passed.
  const uncensused = buildHealthReport(perfect);
  assert.equal(uncensused.areas.sourceCensus, 'UNKNOWN');
  assert.notEqual(uncensused.overall, 'HEALTHY');
  assert.equal(uncensused.sourceCensus, null);
});

test('an unclassified or unowned censused source is also a gap', () => {
  const unclassified = censusSources({ observed: CENSUSED_SOURCE_IDS, classifiedIds: [], ownedIds });
  assert.equal(unclassified.verdict, 'SOURCE_COVERAGE_GAP');
  assert.equal(unclassified.unclassified.length, CENSUSED_SOURCE_IDS.length);
  assert.match(unclassified.detail, /no recovery classification/);

  const unowned = censusSources({ observed: CENSUSED_SOURCE_IDS, classifiedIds, ownedIds: [] });
  assert.equal(unowned.verdict, 'SOURCE_COVERAGE_GAP');
  assert.match(unowned.detail, /no scheduler owner/);
});

test('today every censused source is classified and owned', () => {
  const result = census(CENSUSED_SOURCE_IDS);
  assert.deepEqual(result.unclassified, [], 'a censused source with no recovery classification');
  assert.deepEqual(result.unowned, [], 'a censused source with no scheduler owner');
  assert.equal(result.verdict, 'COMPLETE');
  // The capability matrix and the census must describe the same world.
  assert.deepEqual([...classifiedIds].sort(), [...CENSUSED_SOURCE_IDS].sort());
});

test('health separates the checker running from the system being well', () => {
  const source = readFileSync('scripts/health.ts', 'utf8');
  assert.ok(source.includes('HARNESS EXECUTION'), 'the checker must report its own execution status');
  assert.ok(source.includes('SYSTEM VERDICT'), 'and separately what it found');
  assert.ok(/harnessExecution/.test(source));
});
