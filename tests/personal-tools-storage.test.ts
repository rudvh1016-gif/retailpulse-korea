import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBDatabase, IDBObjectStore } from 'fake-indexeddb';
import { openPersonalStore, PERSONAL_TOOLS_DB } from '../lib/personal-tools/storage';
import { emptyPersonalState, type PersonalCommand } from '../lib/personal-tools/model';

const NOW = '2026-11-12T09:00:00.000Z';
const mutation: PersonalCommand = {
  type: 'notifications.set',
  preferences: { beforeShiftMinutes: 15, briefingChanges: false, guideChanges: false },
};

function openRaw(factory: IDBFactory, name = PERSONAL_TOOLS_DB, version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, version);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function rows(factory: IDBFactory, name = PERSONAL_TOOLS_DB): Promise<unknown[]> {
  const db = await openRaw(factory, name);
  try {
    assert.equal(db.objectStoreNames.length, 1, 'the preview has exactly one state store');
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(db.objectStoreNames[0], 'readonly');
      const request = tx.objectStore(db.objectStoreNames[0]).getAll();
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

async function setup() {
  const factory = new IDBFactory();
  let token = 0;
  const options = { indexedDB: factory, now: () => NOW, revision: () => `revision-${++token}` };
  const store = await openPersonalStore(options);
  return { factory, options, store };
}

test('opening and repeated reads never initialize a state document', async () => {
  const { factory, store } = await setup();
  try {
    const first = await store.read();
    assert.equal(first.revision, 'empty');
    assert.equal(first.updatedAt, '1970-01-01T00:00:00.000Z');
    assert.equal(first.patterns.length, 0);
    first.notificationPreferences.beforeShiftMinutes = 60;
    assert.equal((await store.read()).notificationPreferences.beforeShiftMinutes, 0);
    assert.deepEqual(await rows(factory), []);
  } finally { store.close(); }
});

test('successful writes persist across connections and return detached state', async () => {
  const { factory, options, store } = await setup();
  try {
    const next = await store.dispatch(mutation, 'empty');
    assert.equal(next.revision, 'revision-1');
    assert.equal(next.updatedAt, NOW);
    assert.equal(next.notificationPreferences.beforeShiftMinutes, 15);
    next.notificationPreferences.beforeShiftMinutes = 60;
    store.close();
    const reopened = await openPersonalStore(options);
    try {
      assert.equal((await reopened.read()).notificationPreferences.beforeShiftMinutes, 15);
      assert.equal((await rows(factory)).length, 1);
    } finally { reopened.close(); }
  } finally { store.close(); }
});

test('two tabs atomically compare revisions so exactly one concurrent stale write wins', async () => {
  const { options, store } = await setup();
  const other = await openPersonalStore(options);
  try {
    const results = await Promise.allSettled([
      store.dispatch(mutation, 'empty'),
      other.dispatch({ ...mutation, preferences: { ...mutation.preferences, beforeShiftMinutes: 30 } }, 'empty'),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const failure = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    assert.equal(failure.reason.code, 'CONFLICT');
    const current = await other.read();
    assert.equal(current.revision, 'revision-1');
    assert.ok([15, 30].includes(current.notificationPreferences.beforeShiftMinutes));
    const next = await other.dispatch(mutation, current.revision);
    assert.equal(next.revision, 'revision-2');
    assert.equal((await store.read()).revision, 'revision-2');
  } finally { store.close(); other.close(); }
});

test('database namespace rejection prevents access to business or travel databases', async () => {
  const factory = new IDBFactory();
  for (const name of ['koretail-travel-local-v1', 'business', '', `${PERSONAL_TOOLS_DB}-${'x'.repeat(100)}`, `${PERSONAL_TOOLS_DB}/bad`]) {
    await assert.rejects(openPersonalStore({ indexedDB: factory, name }));
  }
  assert.deepEqual(await factory.databases(), []);
  const name = `${PERSONAL_TOOLS_DB}-isolated-test`;
  const store = await openPersonalStore({ indexedDB: factory, name });
  store.close();
  assert.deepEqual((await factory.databases()).map(db => db.name), [name]);
});

test('clearing requires exact confirmation, replaces contents with a tombstone, and prevents ABA writes', async () => {
  const { factory, options, store } = await setup();
  const other = await openPersonalStore(options);
  try {
    const previous = await store.dispatch(mutation, 'empty');
    await assert.rejects(store.clear(previous.revision, 'delete personal tools'));
    assert.equal((await store.read()).revision, previous.revision);
    await assert.rejects(store.clear('empty', 'DELETE PERSONAL TOOLS'), { code: 'CONFLICT' });
    const cleared = await store.clear(previous.revision, 'DELETE PERSONAL TOOLS');
    assert.equal(cleared.revision, 'revision-2');
    assert.equal(cleared.updatedAt, NOW);
    assert.equal(cleared.notificationPreferences.beforeShiftMinutes, 0);
    assert.equal((await rows(factory)).length, 1, 'wipe retains a new revision, not an absent row');
    await assert.rejects(other.dispatch(mutation, previous.revision), { code: 'CONFLICT' });
    await assert.rejects(other.dispatch(mutation, 'empty'), { code: 'CONFLICT' });
    const clearedAgain = await store.clear(cleared.revision, 'DELETE PERSONAL TOOLS');
    assert.equal(clearedAgain.revision, 'revision-3');
  } finally { store.close(); other.close(); }
});

test('restore replaces state and never reuses an exported revision', async () => {
  const { store } = await setup();
  try {
    const first = await store.dispatch(mutation, 'empty');
    const backup = JSON.stringify(first);
    const cleared = await store.clear(first.revision, 'DELETE PERSONAL TOOLS');
    await assert.rejects(store.restore(backup, first.revision), { code: 'CONFLICT' });
    const restored = await store.restore(backup, cleared.revision);
    assert.equal(restored.revision, 'revision-3');
    assert.equal(restored.notificationPreferences.beforeShiftMinutes, 15);
    assert.notEqual(restored.revision, first.revision);
    await assert.rejects(store.dispatch(mutation, first.revision), { code: 'CONFLICT' });
    const replaced = await store.restore(JSON.stringify(emptyPersonalState()), restored.revision);
    assert.equal(replaced.revision, 'revision-4');
    assert.equal(replaced.notificationPreferences.beforeShiftMinutes, 0);
  } finally { store.close(); }
});

test('malformed, oversized, future and chronologically invalid restores preserve the saved document', async () => {
  const { store } = await setup();
  try {
    const current = await store.dispatch(mutation, 'empty');
    const invalid = [
      '{',
      JSON.stringify({ ...current, version: 2 }),
      JSON.stringify({ ...current, unknown: true }),
      JSON.stringify({ ...current, assignments: [{ date: '2026-11-12', patternId: 'missing' }] }),
      JSON.stringify({ ...current, favorites: [{ guideId: 'javascript:alert(1)', checkedDate: null }] }),
      JSON.stringify({ ...current, updatedAt: '2026-11-12T09:00:00.001Z' }),
      JSON.stringify({ ...current, updatedAt: '2026-02-30T00:00:00.000Z' }),
      JSON.stringify({ ...current, notes: [{ id: 'bad', date: '2026-11-12', body: 'test', createdAt: NOW, updatedAt: '2026-11-11T09:00:00.000Z', snapshot: null }] }),
    ];
    for (const raw of invalid) {
      await assert.rejects(store.restore(raw, current.revision));
      assert.deepEqual(await store.read(), current);
    }
    const oversized = JSON.stringify({ text: '한'.repeat(90_000) });
    assert.ok(oversized.length < 256 * 1024);
    assert.ok(new TextEncoder().encode(oversized).byteLength > 256 * 1024);
    await assert.rejects(store.restore(oversized, current.revision), { code: 'STATE_TOO_LARGE' });
    assert.deepEqual(await store.read(), current);
  } finally { store.close(); }
});

test('corrupt saved data is rejected by every operation and is never overwritten with defaults', async () => {
  const { factory, store } = await setup();
  await store.dispatch(mutation, 'empty');
  const db = await openRaw(factory);
  const corrupt = { version: 999, revision: 'untrusted', keep: 'for recovery' };
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(db.objectStoreNames[0], 'readwrite');
      const objectStore = tx.objectStore(db.objectStoreNames[0]);
      const keys = objectStore.getAllKeys();
      keys.onsuccess = () => { objectStore.put(corrupt, keys.result[0]); };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    for (const operation of [
      () => store.read(),
      () => store.dispatch(mutation, 'untrusted'),
      () => store.restore(JSON.stringify(emptyPersonalState()), 'untrusted'),
      () => store.clear('untrusted', 'DELETE PERSONAL TOOLS'),
    ]) await assert.rejects(operation());
    assert.deepEqual(await rows(factory), [corrupt]);
  } finally { db.close(); store.close(); }
});

test('a successful request followed by transaction abort never resolves a mutation or changes saved state', async context => {
  const { store } = await setup();
  try {
    const before = await store.dispatch(mutation, 'empty');
    const put = IDBObjectStore.prototype.put;
    context.mock.method(IDBObjectStore.prototype, 'put', function (this: IDBObjectStore, ...args: Parameters<typeof put>) {
      const request = put.apply(this, args);
      request.addEventListener('success', () => this.transaction.abort());
      return request;
    });
    await assert.rejects(store.dispatch(mutation, before.revision), { name: 'AbortError' });
    context.mock.restoreAll();
    assert.deepEqual(await store.read(), before);
  } finally { context.mock.restoreAll(); store.close(); }
});

test('synchronous quota failures abort and leave the previous document intact', async context => {
  const { store } = await setup();
  try {
    const before = await store.dispatch(mutation, 'empty');
    context.mock.method(IDBObjectStore.prototype, 'put', () => {
      throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
    });
    await assert.rejects(store.clear(before.revision, 'DELETE PERSONAL TOOLS'), { name: 'QuotaExceededError' });
    context.mock.restoreAll();
    assert.deepEqual(await store.read(), before);
  } finally { context.mock.restoreAll(); store.close(); }
});

test('asynchronous request errors reject restoration and preserve existing data', async context => {
  const { store } = await setup();
  try {
    const before = await store.dispatch(mutation, 'empty');
    context.mock.method(IDBObjectStore.prototype, 'put', function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      // Force an actual IndexedDB ConstraintError after queuing the request.
      return this.add(value, key);
    });
    await assert.rejects(store.restore(JSON.stringify(emptyPersonalState()), before.revision), { name: 'ConstraintError' });
    context.mock.restoreAll();
    assert.deepEqual(await store.read(), before);
  } finally { context.mock.restoreAll(); store.close(); }
});

test('all write operations reject backwards or invalid clocks without changing saved state', async () => {
  const { options, store } = await setup();
  const before = await store.dispatch(mutation, 'empty');
  store.close();
  for (const now of ['2026-11-11T00:00:00.000Z', 'invalid', '2026-02-30T00:00:00.000Z']) {
    const other = await openPersonalStore({ ...options, now: () => now });
    try {
      await assert.rejects(other.dispatch(mutation, before.revision));
      await assert.rejects(other.restore(JSON.stringify(emptyPersonalState()), before.revision));
      await assert.rejects(other.clear(before.revision, 'DELETE PERSONAL TOOLS'));
      assert.deepEqual(await other.read(), before);
    } finally { other.close(); }
  }
});

test('missing or reused revisions fail instead of weakening cross-tab conflict protection', async () => {
  const { options, store } = await setup();
  const before = await store.dispatch(mutation, 'empty');
  store.close();
  for (const revision of ['empty', before.revision, '', 'bad revision', 'x'.repeat(129)]) {
    const other = await openPersonalStore({ ...options, revision: () => revision });
    try {
      await assert.rejects(other.dispatch(mutation, before.revision));
      await assert.rejects(other.restore(JSON.stringify(emptyPersonalState()), before.revision));
      await assert.rejects(other.clear(before.revision, 'DELETE PERSONAL TOOLS'));
      assert.deepEqual(await other.read(), before);
    } finally { other.close(); }
  }
});

test('explicit close and versionchange make old handles unusable', async () => {
  const { factory, options, store } = await setup();
  store.close();
  await assert.rejects(store.read());
  await assert.rejects(store.dispatch(mutation, 'empty'));
  const reopened = await openPersonalStore(options);
  const upgraded = await openRaw(factory, PERSONAL_TOOLS_DB, 2);
  upgraded.close();
  await assert.rejects(reopened.read());
  reopened.close();
  await assert.rejects(openPersonalStore(options), { name: 'VersionError' });
});

test('unavailable or denied storage rejects rather than pretending to save', async context => {
  await assert.rejects(openPersonalStore());
  const factory = new IDBFactory();
  context.mock.method(factory, 'open', () => { throw new DOMException('Denied', 'SecurityError'); });
  await assert.rejects(openPersonalStore({ indexedDB: factory }), { name: 'SecurityError' });
});

test('an incompatible preview database schema is rejected without mutation', async () => {
  const factory = new IDBFactory();
  const request = factory.open(PERSONAL_TOOLS_DB, 1);
  request.onupgradeneeded = () => { request.result.createObjectStore('unexpected'); };
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  await assert.rejects(openPersonalStore({ indexedDB: factory }));
  const unchanged = await openRaw(factory);
  assert.deepEqual([...unchanged.objectStoreNames], ['unexpected']);
  unchanged.close();
});

test('blocked opens reject promptly and do not create a lingering connection after the blocker closes', async context => {
  const { factory, store } = await setup();
  store.close();
  const blocker = await openRaw(factory);
  const open = factory.open.bind(factory);
  let pending: IDBOpenDBRequest | undefined;
  context.mock.method(factory, 'open', (name: string) => {
    // Force an upgrade on a real request so an existing connection blocks it.
    pending = open(name, 2);
    return pending;
  });
  try {
    await assert.rejects(openPersonalStore({ indexedDB: factory }), { code: 'BLOCKED' });
    const finished = new Promise<void>(resolve => {
      pending!.addEventListener('error', () => resolve());
      pending!.addEventListener('success', () => resolve());
    });
    blocker.close();
    await finished;
  } finally { blocker.close(); context.mock.restoreAll(); }
  await new Promise<void>((resolve, reject) => {
    const deletion = factory.deleteDatabase(PERSONAL_TOOLS_DB);
    deletion.onsuccess = () => resolve();
    deletion.onerror = () => reject(deletion.error);
    deletion.onblocked = () => reject(new Error('Rejected open leaked a live connection'));
  });
});

test('a late open success after rejection is closed instead of leaking a database handle', async context => {
  const { factory, store } = await setup();
  store.close();
  const open = factory.open.bind(factory);
  let finished: Promise<void> | undefined;
  context.mock.method(factory, 'open', (name: string, version?: number) => {
    const request = open(name, version);
    finished = new Promise<void>(resolve => request.addEventListener('success', () => resolve()));
    // Some browser event schedules can deliver success after a rejected blocked event.
    queueMicrotask(() => request.onblocked?.call(request, new Event('blocked') as IDBVersionChangeEvent));
    return request;
  });
  await assert.rejects(openPersonalStore({ indexedDB: factory }), { code: 'BLOCKED' });
  await finished;
  context.mock.restoreAll();
  await new Promise<void>((resolve, reject) => {
    const deletion = factory.deleteDatabase(PERSONAL_TOOLS_DB);
    deletion.onsuccess = () => resolve();
    deletion.onerror = () => reject(deletion.error);
    deletion.onblocked = () => reject(new Error('Late success leaked a live connection'));
  });
});

test('preview writes, restore and wipe leave existing travel records unchanged', async () => {
  const { factory, store } = await setup();
  const name = 'koretail-travel-local-v1';
  const request = factory.open(name, 1);
  request.onupgradeneeded = () => { request.result.createObjectStore('records'); };
  const travel = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result); });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = travel.transaction('records', 'readwrite');
      tx.objectStore('records').put({ content: 'leave untouched', revision: 'travel-1' }, 'travel-row');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    const initial = await store.dispatch(mutation, 'empty');
    const restored = await store.restore(JSON.stringify(emptyPersonalState()), initial.revision);
    await store.clear(restored.revision, 'DELETE PERSONAL TOOLS');
    const saved = await new Promise<unknown>((resolve, reject) => {
      const tx = travel.transaction('records');
      const read = tx.objectStore('records').getAll();
      tx.oncomplete = () => resolve(read.result);
      tx.onabort = () => reject(tx.error);
    });
    assert.deepEqual(saved, [{ content: 'leave untouched', revision: 'travel-1' }]);
    assert.deepEqual((await factory.databases()).map(db => db.name).sort(), [PERSONAL_TOOLS_DB, name].sort());
  } finally { travel.close(); store.close(); }
});
