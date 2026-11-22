import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPersonalCommand, emptyPersonalState, exportPersonalState, parsePersonalBackup,
  parsePersonalState, personalSyncPreview, type PersonalState, type PersonalCommand,
  type BriefingSnapshot, type ShiftPattern,
} from '../lib/personal-tools/model';

const now = '2026-11-12T12:00:00+09:00';
const pattern: ShiftPattern = { id: 'morning', label: '오전 근무', terminal: 'T1', side: 'EAST', open: '07:30', close: '15:00' };
const snapshot: BriefingSnapshot = { capturedAt: now, day: '2026-11-12', terminal: 'T1', side: 'EAST', open: '07:30', close: '15:00', status: 'PARTIAL', reason: 'CURRENT_UNVERIFIED', total: null, confirmed: 3, retrievedAt: '2026-11-12T11:00:00+09:00', checkedAt: '2026-11-12T11:30:00+09:00', basis: 'COLLECTED_FLIGHT_RECORDS', provisional: true, topDestinations: [{ country: '일본', flights: 2 }] };
function command(state: PersonalState, value: PersonalCommand): PersonalState {
  return applyPersonalCommand(state, value, { revision: `${state.revision}.n`, now });
}
function withPattern(): PersonalState { return command(emptyPersonalState(), { type: 'pattern.upsert', pattern }); }
function withNote(): PersonalState { return command(withPattern(), { type: 'note.add', id: 'note', date: '2026-11-12', body: '출근 전 확인', snapshot }); }
function withRun(): PersonalState {
  let state = command(withPattern(), { type: 'assignment.set', date: '2026-11-12', patternId: pattern.id });
  state = command(state, { type: 'template.upsert', template: { id: 'opening', label: '개점', items: [{ id: 'stock', text: '재고 확인' }] } });
  return command(state, { type: 'run.start', id: 'run', date: '2026-11-12', templateId: 'opening' });
}
function rejects(value: unknown, code?: string): void {
  if (code) assert.throws(() => parsePersonalState(value), { code });
  else assert.throws(() => parsePersonalState(value));
}

test('empty state opts out of all sync and persists no notification delivery claim', () => {
  const state = emptyPersonalState();
  assert.equal(state.version, 1);
  assert.equal(state.revision, 'empty');
  assert.equal(state.updatedAt, '1970-01-01T00:00:00.000Z');
  assert.deepEqual(state.syncSelection, { calendar: false, journal: false, favorites: false, checklists: false, notifications: false });
  assert.deepEqual(state.notificationPreferences, { beforeShiftMinutes: 0, briefingChanges: false, guideChanges: false });
  assert.deepEqual(personalSyncPreview(state), { version: 1 });
  assert.notEqual(state.patterns, emptyPersonalState().patterns);
});

test('pattern updates are immutable and preserve exact minute, all-day and overnight hours', () => {
  const old = withPattern();
  const next = command(old, { type: 'pattern.upsert', pattern: { ...pattern, label: '밤 근무', open: '23:30', close: '02:00' } });
  assert.equal(old.patterns[0].open, '07:30');
  assert.deepEqual(next.patterns[0], { ...pattern, label: '밤 근무', open: '23:30', close: '02:00' });
  assert.equal(command(next, { type: 'pattern.upsert', pattern: { ...pattern, close: '07:30' } }).patterns[0].close, '07:30');
});

test('calendar assigns at most one pattern per actual KST date', () => {
  let state = command(withPattern(), { type: 'pattern.upsert', pattern: { ...pattern, id: 'other' } });
  state = command(state, { type: 'assignment.set', date: '2026-11-12', patternId: 'morning' });
  state = command(state, { type: 'assignment.set', date: '2026-11-12', patternId: 'other' });
  assert.deepEqual(state.assignments, [{ date: '2026-11-12', patternId: 'other' }]);
  assert.deepEqual(command(state, { type: 'assignment.remove', date: '2026-11-12' }).assignments, []);
  assert.throws(() => command(state, { type: 'assignment.set', date: '2026-02-29', patternId: 'morning' }), { code: 'INVALID_DATE' });
  assert.throws(() => command(state, { type: 'assignment.set', date: '2026-11-12', patternId: 'missing' }), { code: 'DANGLING_REFERENCE' });
});

test('journal captures an independent bounded briefing and editing body preserves its clocks and values', () => {
  const input = structuredClone(snapshot);
  const old = command(withPattern(), { type: 'note.add', id: 'note', date: '2026-11-12', body: '첫 기록', snapshot: input });
  input.topDestinations![0].flights = 99;
  const next = applyPersonalCommand(old, { type: 'note.update', id: 'note', body: '수정 기록' }, { revision: 'later', now: '2026-11-13T00:00:00+09:00' });
  assert.equal(old.notes[0].body, '첫 기록');
  assert.equal(next.notes[0].body, '수정 기록');
  assert.equal(next.notes[0].createdAt, now);
  assert.equal(next.notes[0].updatedAt, '2026-11-13T00:00:00+09:00');
  assert.deepEqual(next.notes[0].snapshot, snapshot);
  next.notes[0].snapshot!.topDestinations![0].flights = 88;
  assert.equal(old.notes[0].snapshot!.topDestinations![0].flights, 2);
});

test('journal accepts unavailable, loading, zero and no-snapshot states without manufacturing totals', () => {
  const absent = { ...snapshot, status: 'UNAVAILABLE' as const, reason: 'UNSUPPORTED_OVERNIGHT' as const, open: '23:30', close: '02:00', total: null, confirmed: null, retrievedAt: null, checkedAt: null, basis: null, topDestinations: null };
  const state = command(emptyPersonalState(), { type: 'note.add', id: 'overnight', date: '2026-11-12', body: '', snapshot: absent });
  assert.deepEqual(state.notes[0].snapshot, absent);
  const noSnapshot = command(state, { type: 'note.add', id: 'none', date: '2026-11-12', body: '메모', snapshot: null });
  assert.equal(noSnapshot.notes[1].snapshot, null);
  const loading = { ...absent, open: '07:30', close: '15:00', status: 'LOADING' as const, reason: 'PENDING' as const };
  assert.equal(command(state, { type: 'note.add', id: 'loading', date: '2026-11-12', body: '', snapshot: loading }).notes[1].snapshot!.total, null);
  const zero = { ...snapshot, status: 'READY' as const, reason: null, total: 0, confirmed: 0, topDestinations: [] };
  assert.equal(command(state, { type: 'note.add', id: 'zero', date: '2026-11-12', body: '', snapshot: zero }).notes[1].snapshot!.total, 0);
});

test('ordered favorites allow only internal guide identities and manually entered real dates', () => {
  const state = command(emptyPersonalState(), { type: 'favorites.set', favorites: [{ guideId: 'routes', checkedDate: null }, { guideId: 'allowance', checkedDate: '2024-02-29' }] });
  assert.deepEqual(state.favorites, [{ guideId: 'routes', checkedDate: null }, { guideId: 'allowance', checkedDate: '2024-02-29' }]);
  assert.deepEqual(command(state, { type: 'favorites.set', favorites: [...state.favorites].reverse() }).favorites.map(item => item.guideId), ['allowance', 'routes']);
  rejects({ ...state, favorites: [{ guideId: 'https://evil.invalid', checkedDate: null }] });
  rejects({ ...state, favorites: [state.favorites[0], state.favorites[0]] }, 'DUPLICATE_ID');
  rejects({ ...state, favorites: [{ guideId: 'routes', checkedDate: '2026-02-29' }] }, 'INVALID_DATE');
});

test('checklist runs freeze template labels and assigned pattern while allowing independent completion', () => {
  const old = withRun();
  let next = command(old, { type: 'template.upsert', template: { id: 'opening', label: '새 개점', items: [{ id: 'stock', text: '바뀐 확인' }] } });
  next = command(next, { type: 'pattern.upsert', pattern: { ...pattern, label: '새 근무', terminal: 'T2' } });
  next = command(next, { type: 'run.toggle', id: 'run', itemId: 'stock', done: true });
  assert.equal(old.runs[0].items[0].done, false);
  assert.deepEqual(next.runs[0], { id: 'run', date: '2026-11-12', patternId: 'morning', templateId: 'opening', pattern, templateLabel: '개점', items: [{ id: 'stock', text: '재고 확인', done: true }] });
  assert.throws(() => command(next, { type: 'run.start', id: 'bad', date: '2026-11-13', templateId: 'opening' }), { code: 'DANGLING_REFERENCE' });
  assert.throws(() => command(next, { type: 'run.toggle', id: 'run', itemId: 'missing', done: true }), { code: 'NOT_FOUND' });
});

test('unsafe deletion cannot create dangling patterns or templates; explicit run removal permits later deletion', () => {
  let state = withRun();
  assert.throws(() => command(state, { type: 'pattern.remove', id: 'morning' }), { code: 'REFERENCE_IN_USE' });
  assert.throws(() => command(state, { type: 'template.remove', id: 'opening' }), { code: 'REFERENCE_IN_USE' });
  state = command(state, { type: 'assignment.remove', date: '2026-11-12' });
  assert.throws(() => command(state, { type: 'pattern.remove', id: 'morning' }), { code: 'REFERENCE_IN_USE' });
  state = command(state, { type: 'run.remove', id: 'run' });
  state = command(state, { type: 'template.remove', id: 'opening' });
  state = command(state, { type: 'pattern.remove', id: 'morning' });
  assert.equal(state.patterns.length + state.templates.length + state.runs.length, 0);
});

test('notification prefs persist only supported opt-ins and never imply delivery', () => {
  const state = command(emptyPersonalState(), { type: 'notifications.set', preferences: { beforeShiftMinutes: 30, briefingChanges: true, guideChanges: true } });
  assert.deepEqual(state.notificationPreferences, { beforeShiftMinutes: 30, briefingChanges: true, guideChanges: true });
  rejects({ ...state, notificationPreferences: { ...state.notificationPreferences, permission: 'granted' } }, 'INVALID_SHAPE');
  rejects({ ...state, notificationPreferences: { ...state.notificationPreferences, beforeShiftMinutes: 10 } });
});

test('sync preview contains exactly selected categories, with checklist calendar dependency enforced', () => {
  let state = withRun();
  assert.throws(() => command(state, { type: 'sync.set', selection: { ...state.syncSelection, checklists: true } }), { code: 'DANGLING_REFERENCE' });
  state = command(state, { type: 'sync.set', selection: { ...state.syncSelection, calendar: true, checklists: true } });
  const payload = personalSyncPreview(state);
  assert.deepEqual(Object.keys(payload).sort(), ['calendar', 'checklists', 'version']);
  assert.deepEqual(payload.calendar, { patterns: [pattern], assignments: [{ date: '2026-11-12', patternId: 'morning' }] });
  assert.deepEqual(payload.checklists, { templates: state.templates, runs: state.runs });
  payload.calendar!.patterns[0].label = 'mutated preview';
  assert.equal(state.patterns[0].label, '오전 근무');
});

test('backup round-trip is strict and preserves missingness, source clocks and Unicode', () => {
  const state = withNote();
  const raw = exportPersonalState(state);
  assert.deepEqual(parsePersonalBackup(raw), state);
  assert.throws(() => parsePersonalBackup('{broken'), { code: 'INVALID_JSON' });
  assert.throws(() => parsePersonalBackup(JSON.stringify({ ...state, version: 2 })), { code: 'UNSUPPORTED_VERSION' });
  assert.throws(() => parsePersonalBackup(' '.repeat(262145)), { code: 'STATE_TOO_LARGE' });
});

test('successful commands require a fresh nonempty revision and chronological valid clock', () => {
  const state = withPattern();
  const value: PersonalCommand = { type: 'pattern.upsert', pattern };
  for (const revision of ['', state.revision, ' ', 'x'.repeat(129)]) assert.throws(() => applyPersonalCommand(state, value, { revision, now }), { code: 'INVALID_REVISION' });
  for (const time of ['2026-02-29T12:00:00Z', '2026-11-12', '2026-11-12T12:00:00', '2026-11-12T24:00:00Z']) assert.throws(() => applyPersonalCommand(state, value, { revision: 'next', now: time }), { code: 'INVALID_TIMESTAMP' });
  assert.throws(() => applyPersonalCommand(state, value, { revision: 'next', now: '2026-11-11T12:00:00+09:00' }), { code: 'INVALID_CHRONOLOGY' });
  assert.equal(applyPersonalCommand(state, value, { revision: 'next', now }).updatedAt, now);
});

test('strict parser rejects unknown fields, prototypes, invalid versions and invalid primitives', () => {
  const state = emptyPersonalState();
  for (const value of [null, [], 'state', 1, { ...state, unexpected: true }, Object.assign(Object.create({ inherited: true }), state)]) rejects(value, 'INVALID_SHAPE');
  rejects({ ...state, version: 0 }, 'UNSUPPORTED_VERSION');
  rejects({ ...withPattern(), patterns: [{ ...pattern, nationality: 'made up' }] }, 'INVALID_SHAPE');
  rejects({ ...state, updatedAt: '2026-02-30T12:00:00Z' }, 'INVALID_TIMESTAMP');
  rejects({ ...state, syncSelection: { ...state.syncSelection, calendar: 'false' } });
  rejects({ ...state, patterns: new Array(1) }, 'INVALID_SHAPE');
});

test('IDs, duplicate entries, references, text and array counts are validated', () => {
  const state = withPattern();
  for (const id of ['', '../escape', '__proto__', 'x'.repeat(65)]) rejects({ ...state, patterns: [{ ...pattern, id }] }, 'INVALID_ID');
  rejects({ ...state, patterns: [pattern, pattern] }, 'DUPLICATE_ID');
  rejects({ ...state, assignments: [{ date: '2026-11-12', patternId: 'missing' }] }, 'DANGLING_REFERENCE');
  rejects({ ...state, assignments: [{ date: '2026-11-12', patternId: 'morning' }, { date: '2026-11-12', patternId: 'morning' }] }, 'DUPLICATE_ID');
  rejects({ ...state, patterns: [{ ...pattern, label: '😀'.repeat(61) }] }, 'LIMIT_EXCEEDED');
  rejects({ ...state, patterns: [{ ...pattern, label: '\ud800' }] }, 'INVALID_VALUE');
  rejects({ ...state, patterns: [{ ...pattern, open: '24:00' }] }, 'INVALID_TIME');
  rejects({ ...state, patterns: Array.from({ length: 33 }, (_, i) => ({ ...pattern, id: `p${i}` })) }, 'LIMIT_EXCEEDED');
  rejects({ ...state, templates: [{ id: 't', label: 'T', items: [{ id: 'i', text: 'Item' }, { id: 'i', text: 'Other' }] }] }, 'DUPLICATE_ID');
});

test('snapshot imports reject misleading metrics, unsafe extra data and invalid chronology', () => {
  const state = withNote();
  const alter = (change: Record<string, unknown>) => ({ ...state, notes: [{ ...state.notes[0], snapshot: { ...snapshot, ...change } }] });
  for (const confirmed of [-1, 1.5, NaN, Infinity]) rejects(alter({ confirmed }), 'INVALID_VALUE');
  rejects(alter({ passengerNationality: 'never' }), 'INVALID_SHAPE');
  rejects(alter({ total: 3 }), 'INVALID_VALUE');
  rejects(alter({ reason: 'invented' }), 'INVALID_VALUE');
  rejects(alter({ capturedAt: '2026-11-13T12:00:00+09:00' }), 'INVALID_CHRONOLOGY');
  rejects(alter({ retrievedAt: '2026-11-13T12:00:00+09:00' }), 'INVALID_CHRONOLOGY');
  rejects(alter({ checkedAt: '2026-11-12T10:00:00+09:00' }), 'INVALID_CHRONOLOGY');
  rejects(alter({ day: '2026-11-13' }), 'INVALID_VALUE');
  rejects(alter({ topDestinations: [{ country: '일본', flights: 4 }] }), 'INVALID_VALUE');
  rejects(alter({ open: '23:30', close: '02:00' }), 'INVALID_VALUE');
});

test('note and run imports reject inconsistent dates, chronology and frozen identities', () => {
  const noteState = withNote();
  rejects({ ...noteState, notes: [{ ...noteState.notes[0], createdAt: '2026-11-13T00:00:00Z' }] }, 'INVALID_CHRONOLOGY');
  rejects({ ...noteState, notes: [{ ...noteState.notes[0], updatedAt: '2026-11-13T00:00:00Z' }] }, 'INVALID_CHRONOLOGY');
  const runState = withRun();
  rejects({ ...runState, runs: [{ ...runState.runs[0], patternId: 'missing' }] }, 'DANGLING_REFERENCE');
  rejects({ ...runState, runs: [{ ...runState.runs[0], pattern: { ...pattern, id: 'different' } }] }, 'INVALID_VALUE');
  rejects({ ...runState, runs: [{ ...runState.runs[0], templateId: 'missing' }] }, 'DANGLING_REFERENCE');
});

test('state byte bound counts Unicode UTF-8 bytes rather than JavaScript characters', () => {
  const note = withNote().notes[0];
  const state = { ...withNote(), notes: Array.from({ length: 50 }, (_, i) => ({ ...note, id: `note${i}`, body: '가'.repeat(2000) })) };
  assert.ok(JSON.stringify(state).length < 262144);
  rejects(state, 'STATE_TOO_LARGE');
});

test('invalid and duplicate commands cannot silently succeed or mutate their input', () => {
  const state = withNote(); const before = JSON.stringify(state);
  assert.throws(() => command(state, { type: 'note.add', id: 'note', date: '2026-11-12', body: 'new', snapshot: null }), { code: 'DUPLICATE_ID' });
  assert.throws(() => command(state, { type: 'note.update', id: 'missing', body: '' }), { code: 'NOT_FOUND' });
  assert.throws(() => command(state, { type: 'unknown' } as unknown as PersonalCommand), { code: 'INVALID_COMMAND' });
  assert.throws(() => command(state, { type: 'note.update', id: 'note', body: '', snapshot: null } as unknown as PersonalCommand), { code: 'INVALID_SHAPE' });
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(command(state, { type: 'note.remove', id: 'note' }).notes, []);
});

test('Unicode limits count codepoints and valid leap day, source offsets and empty arrays round-trip', () => {
  const state = command(emptyPersonalState(), { type: 'pattern.upsert', pattern: { ...pattern, label: '😀'.repeat(60), open: '00:00', close: '00:00' } });
  assert.equal(state.patterns[0].label, '😀'.repeat(60));
  const note = command(state, { type: 'note.add', id: 'leap', date: '2024-02-29', body: '😀'.repeat(2000), snapshot: null });
  assert.equal(parsePersonalBackup(exportPersonalState(note)).notes[0].body, '😀'.repeat(2000));
  const utcSnapshot = { ...snapshot, capturedAt: '2026-11-12T03:00:00Z' };
  assert.equal(command(state, { type: 'note.add', id: 'clock', date: '2026-11-12', body: '\t문단\n다음 줄', snapshot: utcSnapshot }).notes[0].snapshot!.capturedAt, '2026-11-12T03:00:00Z');
});

test('exact serialized 256 KiB boundary passes but one more byte is rejected', () => {
  const state: PersonalState = { ...emptyPersonalState(), revision: 'boundary', updatedAt: now,
    notes: Array.from({ length: 150 }, (_, i) => ({ id: `n${i}`, date: '2026-11-12', body: '', createdAt: now, updatedAt: now, snapshot: null })) };
  let remaining = 262144 - new TextEncoder().encode(JSON.stringify(state)).byteLength;
  for (const note of state.notes) { const length = Math.min(remaining, 2000); note.body = 'a'.repeat(length); remaining -= length; }
  assert.equal(remaining, 0);
  assert.equal(new TextEncoder().encode(exportPersonalState(state)).byteLength, 262144);
  state.notes.at(-1)!.body += 'b';
  rejects(state, 'STATE_TOO_LARGE');
});

test('nested frozen snapshots are accepted and all reducer outputs are independently writable', () => {
  const old = withRun();
  Object.freeze(old.runs[0].items[0]); Object.freeze(old.runs[0].items); Object.freeze(old.runs[0].pattern);
  Object.freeze(old.runs[0]); Object.freeze(old.runs); Object.freeze(old);
  const next = command(old, { type: 'run.toggle', id: 'run', itemId: 'stock', done: true });
  assert.equal(next.runs[0].items[0].done, true);
  assert.equal(old.runs[0].items[0].done, false);
  const source = withNote(); const parsed = parsePersonalState(source);
  parsed.notes[0].snapshot!.topDestinations![0].country = 'changed';
  assert.equal(source.notes[0].snapshot!.topDestinations![0].country, '일본');
});

test('all selected sync categories expose only their bounded state without an account identity', () => {
  const selected = command(withNote(), { type: 'sync.set', selection: { calendar: true, journal: true, favorites: true, checklists: true, notifications: true } });
  const preview = personalSyncPreview(selected);
  assert.deepEqual(Object.keys(preview).sort(), ['calendar', 'checklists', 'favorites', 'journal', 'notifications', 'version']);
  assert.deepEqual(preview.journal, { notes: selected.notes });
  assert.deepEqual(preview.favorites, { favorites: [] });
  assert.deepEqual(preview.notifications, { notificationPreferences: { beforeShiftMinutes: 0, briefingChanges: false, guideChanges: false } });
  selected.syncSelection.calendar = false;
  assert.throws(() => personalSyncPreview(selected), { code: 'DANGLING_REFERENCE' });
});

test('malformed nested arrays, clocks and excessive snapshot retention are rejected', () => {
  const state = withNote();
  const change = (value: Record<string, unknown>) => ({ ...state, notes: [{ ...state.notes[0], snapshot: { ...snapshot, ...value } }] });
  rejects(change({ topDestinations: Array.from({ length: 9 }, (_, i) => ({ country: `c${i}`, flights: 0 })) }), 'LIMIT_EXCEEDED');
  rejects(change({ topDestinations: [{ country: '일본', flights: 1 }, { country: '일본', flights: 1 }] }), 'DUPLICATE_ID');
  rejects(change({ status: 'READY', reason: null, total: null }), 'INVALID_VALUE');
  rejects(change({ status: 'READY', reason: null, total: 2 }), 'INVALID_VALUE');
  for (const timestamp of ['2026-11-12T12:00:00+14:01', '2026-11-12T12:00:60Z', '2026-11-12T12:00:00+25:00']) rejects({ ...state, updatedAt: timestamp }, 'INVALID_TIMESTAMP');
  rejects({ ...state, favorites: [{ guideId: 'routes', checkedDate: '2026-11-13' }] }, 'INVALID_CHRONOLOGY');
  const array = [pattern]; Object.assign(array, { hiddenExtra: true });
  rejects({ ...state, patterns: array }, 'INVALID_SHAPE');
  rejects({ ...state, templates: [{ id: 't', label: 'Template', items: [{ id: 'i', text: '' }] }] }, 'INVALID_VALUE');
});

test('missing deletion targets and duplicate run IDs reject while preserving existing context', () => {
  const state = withRun();
  for (const value of [
    { type: 'run.remove', id: 'missing' }, { type: 'note.remove', id: 'missing' },
    { type: 'pattern.remove', id: 'missing' }, { type: 'template.remove', id: 'missing' },
    { type: 'assignment.remove', date: '2026-11-13' },
  ] as PersonalCommand[]) assert.throws(() => command(state, value), { code: 'NOT_FOUND' });
  assert.throws(() => command(state, { type: 'run.start', id: 'run', date: '2026-11-12', templateId: 'opening' }), { code: 'DUPLICATE_ID' });
  const reassigned = command(command(state, { type: 'pattern.upsert', pattern: { ...pattern, id: 'second' } }), { type: 'assignment.set', date: '2026-11-12', patternId: 'second' });
  assert.equal(reassigned.runs[0].patternId, 'morning');
  assert.deepEqual(reassigned.runs[0].pattern, pattern);
});

test('mutations never reuse the initial empty revision token after the first edit', () => {
  const state = withPattern();
  assert.throws(() => applyPersonalCommand(state, { type: 'pattern.upsert', pattern }, { revision: 'empty', now }), { code: 'INVALID_REVISION' });
});
