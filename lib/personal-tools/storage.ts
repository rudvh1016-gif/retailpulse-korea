import {
  applyPersonalCommand, emptyPersonalState, parsePersonalBackup, parsePersonalState, PersonalToolsError,
  type PersonalCommand, type PersonalState,
} from './model';

export const PERSONAL_TOOLS_DB = 'koretail-personal-tools-preview-v1';
const STORE = 'personal-state';
const STATE_KEY = 'state';

export interface PersonalStore {
  read(): Promise<PersonalState>;
  dispatch(command: PersonalCommand, expectedRevision: string): Promise<PersonalState>;
  restore(raw: string, expectedRevision: string): Promise<PersonalState>;
  clear(expectedRevision: string, confirmation: string): Promise<PersonalState>;
  close(): void;
}
export interface PersonalStoreOptions {
  indexedDB?: IDBFactory;
  name?: string;
  now?: () => string;
  revision?: () => string;
}

function fail(code: string): never { throw new PersonalToolsError(code); }

export async function openPersonalStore(options: PersonalStoreOptions = {}): Promise<PersonalStore> {
  const name = options.name ?? PERSONAL_TOOLS_DB;
  // An override is only for isolated preview instances, never another product's database.
  if (typeof name !== 'string' || name.length > 96 ||
    (name !== PERSONAL_TOOLS_DB && !name.startsWith(`${PERSONAL_TOOLS_DB}-`)) ||
    !/^[A-Za-z0-9._-]+$/.test(name)) fail('STORAGE');
  const factory = options.indexedDB ?? globalThis.indexedDB;
  if (!factory) fail('STORAGE');
  const now = options.now ?? (() => new Date().toISOString());
  const revision = options.revision ?? (() => {
    if (!globalThis.crypto?.randomUUID) fail('STORAGE');
    return globalThis.crypto.randomUUID();
  });
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(name, 1);
    let rejected = false;
    function rejectOpen(error: unknown) { rejected = true; reject(error); }
    request.onblocked = () => rejectOpen(new PersonalToolsError('BLOCKED'));
    request.onerror = () => rejectOpen(request.error ?? new PersonalToolsError('STORAGE'));
    request.onupgradeneeded = event => {
      // A rejected open may still progress once another tab closes. Do not initialize it.
      if (rejected || event.oldVersion !== 0) { request.transaction?.abort(); return; }
      try { request.result.createObjectStore(STORE); }
      catch (error) { rejectOpen(error); request.transaction?.abort(); }
    };
    request.onsuccess = () => {
      const connection = request.result;
      if (rejected) { connection.close(); return; }
      try {
        if (connection.objectStoreNames.length !== 1 || !connection.objectStoreNames.contains(STORE)) fail('CORRUPT');
        const objectStore = connection.transaction(STORE, 'readonly').objectStore(STORE);
        if (objectStore.keyPath !== null || objectStore.autoIncrement || objectStore.indexNames.length !== 0) fail('CORRUPT');
        resolve(connection);
      } catch (error) { connection.close(); rejectOpen(error); }
    };
  });
  let closed = false;
  function close() { closed = true; db.close(); }
  db.onversionchange = close;
  db.onclose = () => { closed = true; };

  function transaction(mode: IDBTransactionMode, change?: (state: PersonalState) => PersonalState): Promise<PersonalState> {
    return new Promise((resolve, reject) => {
      if (closed) { reject(new PersonalToolsError('CLOSED')); return; }
      let tx: IDBTransaction;
      try { tx = db.transaction(STORE, mode); }
      catch (error) { reject(error); return; }
      let result: PersonalState | undefined;
      let problem: unknown;
      tx.oncomplete = () => {
        if (problem !== undefined) reject(problem);
        else if (result) resolve(result);
        else reject(new PersonalToolsError('STORAGE'));
      };
      tx.onabort = () => reject(problem ?? tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
      tx.onerror = event => { problem ??= (event.target as IDBRequest).error ?? tx.error; };
      function stop(error: unknown) {
        problem = error;
        try { tx.abort(); }
        catch { reject(error); }
      }
      try {
        const objectStore = tx.objectStore(STORE);
        // Read at most two rows to distinguish absent data, stored undefined, and corruption.
        const values = objectStore.getAll(undefined, 2);
        const keys = objectStore.getAllKeys(undefined, 2);
        let valuesReady = false;
        let keysReady = false;
        function finishRead() {
          if (!valuesReady || !keysReady) return;
          try {
            if (values.result.length > 1 || (keys.result.length === 1 && keys.result[0] !== STATE_KEY)) fail('CORRUPT');
            const current = values.result.length === 0 ? emptyPersonalState() : parsePersonalState(values.result[0]);
            result = change ? change(current) : current;
            if (change) objectStore.put(result, STATE_KEY);
          } catch (error) { stop(error); }
        }
        values.onsuccess = () => { valuesReady = true; finishRead(); };
        keys.onsuccess = () => { keysReady = true; finishRead(); };
      } catch (error) { stop(error); }
    });
  }

  function mutate(expectedRevision: string, reduce: (current: PersonalState, context: { revision: string; now: string }) => PersonalState) {
    return transaction('readwrite', current => {
      if (current.revision !== expectedRevision) fail('CONFLICT');
      const token = revision();
      if (token === 'empty' || token === current.revision) fail('INVALID_REVISION');
      const clock = now();
      if (Date.parse(clock) < Date.parse(current.updatedAt)) fail('INVALID_CHRONOLOGY');
      // The model validates token syntax, timestamp syntax and all resulting chronology.
      return parsePersonalState(reduce(current, { revision: token, now: clock }));
    });
  }

  return {
    read: () => transaction('readonly'),
    dispatch: (command, expectedRevision) => mutate(expectedRevision, (current, context) => applyPersonalCommand(current, command, context)),
    restore: (raw, expectedRevision) => mutate(expectedRevision, (_current, context) => {
      const imported = parsePersonalBackup(raw);
      if (Date.parse(imported.updatedAt) > Date.parse(context.now)) fail('INVALID_CHRONOLOGY');
      if (imported.revision === context.revision) fail('INVALID_REVISION');
      return { ...imported, revision: context.revision, updatedAt: context.now };
    }),
    clear: async (expectedRevision, confirmation) => {
      if (confirmation !== 'DELETE PERSONAL TOOLS') fail('CONFIRMATION');
      return mutate(expectedRevision, (_current, context) => ({ ...emptyPersonalState(), revision: context.revision, updatedAt: context.now }));
    },
    close,
  };
}
