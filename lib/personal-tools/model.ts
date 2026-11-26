import { minutesOf, type AirportSide, type PrepTerminal } from '../business-hours';
import { isValidKstDay, kstDayOf, shiftKstDay } from '../kst';
import type { ShiftAvailability, ShiftReason } from '../shift-briefing';

export const MAX_PERSONAL_STATE_BYTES = 256 * 1024;
export interface ShiftPattern { id: string; label: string; terminal: PrepTerminal; side: AirportSide | null; open: string; close: string }
export interface ShiftAssignment { date: string; patternId: string }
export interface BriefingSnapshot {
  capturedAt: string; day: string; terminal: PrepTerminal; side: AirportSide | null; open: string; close: string;
  status: ShiftAvailability; reason: ShiftReason | null; total: number | null; confirmed: number | null;
  retrievedAt: string | null; checkedAt: string | null;
  basis: 'COLLECTED_FLIGHT_RECORDS' | 'OFFICIAL_DEPARTURE_SCHEDULE' | null;
  provisional: boolean; topDestinations: Array<{ country: string; flights: number }> | null;
}
export interface JournalNote { id: string; date: string; body: string; createdAt: string; updatedAt: string; snapshot: BriefingSnapshot | null }
export type GuideId = 'allowance' | 'facilities' | 'routes';
export interface GuideFavorite { guideId: GuideId; checkedDate: string | null }
export const GUIDE_LANGUAGES = ['ko', 'en', 'zh', 'ja', 'other'] as const;
export type GuideLanguage = typeof GUIDE_LANGUAGES[number];
export interface GuideSnippet { id: string; label: string; body: string; language?: GuideLanguage }
export interface ChecklistItem { id: string; text: string }
export interface ChecklistTemplate { id: string; label: string; items: ChecklistItem[] }
export interface ChecklistRun { id: string; date: string; patternId: string; templateId: string; pattern: ShiftPattern; templateLabel: string; items: Array<ChecklistItem & { done: boolean }> }
export const DEPARTURE_WAIT_THRESHOLDS = [0, 15, 20, 30, 45, 60] as const;
export type DepartureWaitThreshold = typeof DEPARTURE_WAIT_THRESHOLDS[number];
export interface NotificationPreferences {
  beforeShiftMinutes: 0 | 15 | 30 | 60;
  briefingChanges: boolean;
  guideChanges: boolean;
  departureWaitMinutes?: DepartureWaitThreshold;
}
export interface SyncSelection { calendar: boolean; journal: boolean; favorites: boolean; checklists: boolean; notifications: boolean }
export interface PersonalState {
  version: 1; revision: string; updatedAt: string; patterns: ShiftPattern[]; assignments: ShiftAssignment[];
  notes: JournalNote[]; favorites: GuideFavorite[]; templates: ChecklistTemplate[]; runs: ChecklistRun[];
  guideSnippets?: GuideSnippet[];
  notificationPreferences: NotificationPreferences; syncSelection: SyncSelection;
}
export type PersonalCommand =
  | { type: 'pattern.upsert'; pattern: ShiftPattern } | { type: 'pattern.remove'; id: string }
  | { type: 'assignment.set'; date: string; patternId: string } | { type: 'assignment.remove'; date: string }
  | { type: 'assignment.repeat'; start: string; end: string; weekdays: number[]; patternId: string }
  | { type: 'note.add'; id: string; date: string; body: string; snapshot: BriefingSnapshot | null }
  | { type: 'note.update'; id: string; body: string } | { type: 'note.remove'; id: string }
  | { type: 'favorites.set'; favorites: GuideFavorite[] }
  | { type: 'snippet.upsert'; snippet: GuideSnippet } | { type: 'snippet.remove'; id: string }
  | { type: 'template.upsert'; template: ChecklistTemplate } | { type: 'template.remove'; id: string }
  | { type: 'run.start'; id: string; date: string; templateId: string }
  | { type: 'run.toggle'; id: string; itemId: string; done: boolean } | { type: 'run.remove'; id: string }
  | { type: 'notifications.set'; preferences: NotificationPreferences } | { type: 'sync.set'; selection: SyncSelection };
export interface PersonalSyncPreview {
  version: 1; calendar?: { patterns: ShiftPattern[]; assignments: ShiftAssignment[] }; journal?: { notes: JournalNote[] };
  favorites?: { favorites: GuideFavorite[]; guideSnippets?: GuideSnippet[] }; checklists?: { templates: ChecklistTemplate[]; runs: ChecklistRun[] };
  notifications?: { notificationPreferences: NotificationPreferences };
}
export class PersonalToolsError extends Error { constructor(public readonly code: string) { super(code); this.name = 'PersonalToolsError'; } }

const fail = (code: string): never => { throw new PersonalToolsError(code); };
const patternKeys = ['id', 'label', 'terminal', 'side', 'open', 'close'];
const syncKeys = ['calendar', 'journal', 'favorites', 'checklists', 'notifications'];
const reasons: readonly ShiftReason[] = ['INVALID_SELECTION', 'PENDING', 'READ_FAILED', 'MISSING_RECORDS',
  'TRUNCATED_RECORDS', 'INVALID_RECORDS', 'STALE_RECORDS', 'CURRENT_UNVERIFIED', 'UNVERIFIED_LOCATION',
  'UNSUPPORTED_SIDE_HISTORY', 'UNSUPPORTED_MINUTE_HISTORY', 'UNSUPPORTED_OVERNIGHT', 'MINUTE_HISTORY_MISSING',
  'BASELINE_MISSING', 'BASELINE_INVALID', 'PARTIAL_MONTH'];

/** Reject unknown fields rather than silently dropping potentially private data. */
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return fail('INVALID_SHAPE');
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))
    || keys.some(key => !Object.hasOwn(value, key) || !('value' in Object.getOwnPropertyDescriptor(value, key)!))) return fail('INVALID_SHAPE');
  return value as Record<string, unknown>;
}
function list<T>(value: unknown, maximum: number, read: (value: unknown) => T): T[] {
  if (!Array.isArray(value)) return fail('INVALID_SHAPE');
  if (value.length > maximum) return fail('LIMIT_EXCEEDED');
  if (Reflect.ownKeys(value).length !== value.length + 1) return fail('INVALID_SHAPE');
  const result: T[] = [];
  for (let i = 0; i < value.length; i++) {
    if (!Object.hasOwn(value, i) || !('value' in Object.getOwnPropertyDescriptor(value, String(i))!)) return fail('INVALID_SHAPE');
    result.push(read(value[i]));
  }
  return result;
}
function text(value: unknown, maximum: number, blank = false): string {
  if (typeof value !== 'string') return fail('INVALID_VALUE');
  if (value.length > maximum * 2 || [...value].length > maximum) return fail('LIMIT_EXCEEDED');
  // Reject lone UTF-16 surrogates, while treating a valid emoji as one codepoint.
  if ([...value].some(char => char.length === 1 && char.charCodeAt(0) >= 0xd800 && char.charCodeAt(0) <= 0xdfff)
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
    || (!blank && (!value.trim() || /[\n\r\t]/.test(value)))) return fail('INVALID_VALUE');
  return value;
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(value)
    || ['constructor', 'prototype', '__proto__'].includes(value)) return fail('INVALID_ID');
  return value;
}
function revision(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) return fail('INVALID_REVISION');
  return value;
}
function day(value: unknown): string { return isValidKstDay(value) ? value : fail('INVALID_DATE'); }
function time(value: unknown): string { return minutesOf(value) !== null ? value as string : fail('INVALID_TIME'); }
function instant(value: unknown): string {
  if (typeof value !== 'string') return fail('INVALID_TIMESTAMP');
  const match = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,3})?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(value);
  if (!match || !isValidKstDay(match[1]) || !Number.isFinite(Date.parse(value))
    || /[+-]14:(?!00)/.test(value)) return fail('INVALID_TIMESTAMP');
  return value;
}
function chronology(earlier: string, later: string): void {
  if (Date.parse(earlier) > Date.parse(later)) fail('INVALID_CHRONOLOGY');
}
function choice<T extends string | number | null>(value: unknown, allowed: readonly T[]): T {
  return allowed.includes(value as T) ? value as T : fail('INVALID_VALUE');
}
function bool(value: unknown): boolean { return typeof value === 'boolean' ? value : fail('INVALID_VALUE'); }
function count(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fail('INVALID_VALUE');
}
function unique<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  for (const value of values) { const id = key(value); if (seen.has(id)) fail('DUPLICATE_ID'); seen.add(id); }
  return values;
}
function readPattern(value: unknown): ShiftPattern {
  const row = object(value, patternKeys);
  return { id: identifier(row.id), label: text(row.label, 60), terminal: choice(row.terminal, ['T1', 'T2']),
    side: choice(row.side, [null, 'EAST', 'WEST']), open: time(row.open), close: time(row.close) };
}
function readSnapshot(value: unknown): BriefingSnapshot {
  const row = object(value, ['capturedAt', 'day', 'terminal', 'side', 'open', 'close', 'status', 'reason',
    'total', 'confirmed', 'retrievedAt', 'checkedAt', 'basis', 'provisional', 'topDestinations']);
  const result: BriefingSnapshot = {
    capturedAt: instant(row.capturedAt), day: day(row.day), terminal: choice(row.terminal, ['T1', 'T2']),
    side: choice(row.side, [null, 'EAST', 'WEST']), open: time(row.open), close: time(row.close),
    status: choice(row.status, ['READY', 'PARTIAL', 'LOADING', 'UNAVAILABLE']), reason: choice(row.reason, [null, ...reasons]),
    total: row.total === null ? null : count(row.total), confirmed: row.confirmed === null ? null : count(row.confirmed),
    retrievedAt: row.retrievedAt === null ? null : instant(row.retrievedAt), checkedAt: row.checkedAt === null ? null : instant(row.checkedAt),
    basis: choice(row.basis, [null, 'COLLECTED_FLIGHT_RECORDS', 'OFFICIAL_DEPARTURE_SCHEDULE']), provisional: bool(row.provisional),
    topDestinations: row.topDestinations === null ? null : unique(list(row.topDestinations, 8, value => {
      const destination = object(value, ['country', 'flights']);
      return { country: text(destination.country, 80), flights: count(destination.flights) };
    }), item => item.country),
  };
  if (result.retrievedAt) chronology(result.retrievedAt, result.capturedAt);
  if (result.checkedAt) chronology(result.checkedAt, result.capturedAt);
  if (result.retrievedAt && result.checkedAt) chronology(result.retrievedAt, result.checkedAt);
  if (result.status === 'READY') {
    if (result.total === null || result.total !== result.confirmed || result.reason !== null) fail('INVALID_VALUE');
  } else if (result.total !== null || result.reason === null) fail('INVALID_VALUE');
  if ((result.status === 'UNAVAILABLE' || result.status === 'LOADING') && result.confirmed !== null) fail('INVALID_VALUE');
  if (result.topDestinations !== null && (result.confirmed === null
    || result.topDestinations.reduce((sum, item) => sum + item.flights, 0) > result.confirmed)) fail('INVALID_VALUE');
  // Store overnight selections, but never claim the current single-day briefing supports them.
  const overnight = minutesOf(result.close)! < minutesOf(result.open)!;
  if (overnight && (result.status !== 'UNAVAILABLE' || result.reason !== 'UNSUPPORTED_OVERNIGHT')
    || !overnight && result.reason === 'UNSUPPORTED_OVERNIGHT') fail('INVALID_VALUE');
  return result;
}
function readTemplate(value: unknown): ChecklistTemplate {
  const row = object(value, ['id', 'label', 'items']);
  return { id: identifier(row.id), label: text(row.label, 60), items: unique(list(row.items, 64, value => {
    const item = object(value, ['id', 'text']); return { id: identifier(item.id), text: text(item.text, 160) };
  }), item => item.id) };
}
function readGuideSnippet(value: unknown): GuideSnippet {
  const tagged = Boolean(value && typeof value === 'object' && Object.hasOwn(value, 'language'));
  const row = object(value, tagged ? ['id', 'label', 'body', 'language'] : ['id', 'label', 'body']);
  return { id: identifier(row.id), label: text(row.label, 60), body: text(row.body, 1000, true),
    ...(tagged ? { language: choice(row.language, GUIDE_LANGUAGES) } : {}) };
}
function readNotifications(value: unknown): NotificationPreferences {
  const keys = ['beforeShiftMinutes', 'briefingChanges', 'guideChanges'];
  const hasDeparture = Boolean(value && typeof value === 'object' && Object.hasOwn(value, 'departureWaitMinutes'));
  if (hasDeparture) keys.push('departureWaitMinutes');
  const row = object(value, keys);
  return { beforeShiftMinutes: choice(row.beforeShiftMinutes, [0, 15, 30, 60]), briefingChanges: bool(row.briefingChanges), guideChanges: bool(row.guideChanges),
    ...(hasDeparture ? { departureWaitMinutes: choice(row.departureWaitMinutes, DEPARTURE_WAIT_THRESHOLDS) } : {}) };
}
function readSync(value: unknown): SyncSelection {
  const row = object(value, syncKeys);
  const result = { calendar: bool(row.calendar), journal: bool(row.journal), favorites: bool(row.favorites), checklists: bool(row.checklists), notifications: bool(row.notifications) };
  if (result.checklists && !result.calendar) fail('DANGLING_REFERENCE');
  return result;
}
function sizeCheck(raw: string): void {
  if (raw.length > MAX_PERSONAL_STATE_BYTES || new TextEncoder().encode(raw).byteLength > MAX_PERSONAL_STATE_BYTES) fail('STATE_TOO_LARGE');
}

export function emptyPersonalState(): PersonalState {
  return { version: 1, revision: 'empty', updatedAt: '1970-01-01T00:00:00.000Z', patterns: [], assignments: [], notes: [], favorites: [], templates: [], runs: [],
    notificationPreferences: { beforeShiftMinutes: 0, briefingChanges: false, guideChanges: false },
    syncSelection: { calendar: false, journal: false, favorites: false, checklists: false, notifications: false } };
}

/** Validate and deep-copy the complete preview document, including all references. */
export function parsePersonalState(value: unknown): PersonalState {
  const keys = ['version', 'revision', 'updatedAt', 'patterns', 'assignments', 'notes', 'favorites', 'templates', 'runs', 'notificationPreferences', 'syncSelection'];
  const hasSnippets = Boolean(value && typeof value === 'object' && Object.hasOwn(value, 'guideSnippets'));
  const row = object(value, hasSnippets ? [...keys, 'guideSnippets'] : keys);
  if (row.version !== 1) return fail('UNSUPPORTED_VERSION');
  const updatedAt = instant(row.updatedAt);
  const patterns = unique(list(row.patterns, 32, readPattern), item => item.id);
  const templates = unique(list(row.templates, 32, readTemplate), item => item.id);
  const patternsById = new Set(patterns.map(item => item.id)), templatesById = new Set(templates.map(item => item.id));
  const result: PersonalState = {
    version: 1, revision: revision(row.revision), updatedAt, patterns, templates,
    ...(hasSnippets ? { guideSnippets: unique(list(row.guideSnippets, 32, readGuideSnippet), item => item.id) } : {}),
    assignments: unique(list(row.assignments, 400, value => {
      const item = object(value, ['date', 'patternId']); const patternId = identifier(item.patternId);
      if (!patternsById.has(patternId)) fail('DANGLING_REFERENCE');
      return { date: day(item.date), patternId };
    }), item => item.date),
    notes: unique(list(row.notes, 200, value => {
      const item = object(value, ['id', 'date', 'body', 'createdAt', 'updatedAt', 'snapshot']);
      const note: JournalNote = { id: identifier(item.id), date: day(item.date), body: text(item.body, 2000, true),
        createdAt: instant(item.createdAt), updatedAt: instant(item.updatedAt), snapshot: item.snapshot === null ? null : readSnapshot(item.snapshot) };
      chronology(note.createdAt, note.updatedAt); chronology(note.updatedAt, updatedAt);
      if (note.snapshot) { chronology(note.snapshot.capturedAt, note.createdAt); if (note.snapshot.day !== note.date) fail('INVALID_VALUE'); }
      return note;
    }), item => item.id),
    favorites: unique(list(row.favorites, 3, value => {
      const item = object(value, ['guideId', 'checkedDate']);
      const checkedDate = item.checkedDate === null ? null : day(item.checkedDate);
      if (checkedDate && checkedDate > kstDayOf(updatedAt)) fail('INVALID_CHRONOLOGY');
      return { guideId: choice<GuideId>(item.guideId, ['allowance', 'facilities', 'routes']), checkedDate };
    }), item => item.guideId),
    runs: unique(list(row.runs, 400, value => {
      const item = object(value, ['id', 'date', 'patternId', 'templateId', 'pattern', 'templateLabel', 'items']);
      const patternId = identifier(item.patternId), templateId = identifier(item.templateId);
      if (!patternsById.has(patternId) || !templatesById.has(templateId)) fail('DANGLING_REFERENCE');
      const pattern = readPattern(item.pattern);
      if (pattern.id !== patternId) fail('INVALID_VALUE');
      return { id: identifier(item.id), date: day(item.date), patternId, templateId, pattern, templateLabel: text(item.templateLabel, 60),
        items: unique(list(item.items, 64, value => { const check = object(value, ['id', 'text', 'done']);
          return { id: identifier(check.id), text: text(check.text, 160), done: bool(check.done) }; }), check => check.id) };
    }), item => item.id),
    notificationPreferences: readNotifications(row.notificationPreferences), syncSelection: readSync(row.syncSelection),
  };
  sizeCheck(JSON.stringify(result));
  return result;
}

function find<T extends { id: string }>(values: T[], id: unknown): T {
  const key = identifier(id); return values.find(item => item.id === key) ?? fail('NOT_FOUND');
}
function put<T extends { id: string }>(values: T[], item: T): void {
  const index = values.findIndex(value => value.id === item.id);
  if (index < 0) values.push(item); else values[index] = item;
}
function remove<T extends { id: string }>(values: T[], id: unknown): T[] {
  find(values, id); return values.filter(item => item.id !== id);
}

/** Used by the UI and by the authoritative reducer. Existing assignments win. */
export function planRepeatedAssignments(assignments: readonly ShiftAssignment[], start: string, end: string, weekdays: readonly number[]) {
  day(start); day(end);
  const chosen = new Set(list(weekdays, 7, value => choice(value, [0, 1, 2, 3, 4, 5, 6])));
  const days = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  if (days < 1 || days > 31 || !chosen.size || chosen.size !== weekdays.length) fail('INVALID_VALUE');
  const occupied = new Set(assignments.map(item => item.date));
  const dates: string[] = [];
  let skipped = 0;
  for (let offset = 0; offset < days; offset++) {
    const date = shiftKstDay(start, offset);
    if (!chosen.has(new Date(date).getUTCDay())) continue;
    if (occupied.has(date)) skipped++;
    else dates.push(date);
  }
  if (assignments.length + dates.length > 400) fail('LIMIT_EXCEEDED');
  return { dates, skipped };
}

/** Pure reducer: caller supplies a new opaque token and a clock; storage owns CAS. */
export function applyPersonalCommand(state: PersonalState, command: PersonalCommand, context: { revision: string; now: string }): PersonalState {
  const next = parsePersonalState(state);
  const clock = object(context, ['revision', 'now']);
  next.revision = revision(clock.revision); next.updatedAt = instant(clock.now);
  if (next.revision === state.revision || next.revision === 'empty') fail('INVALID_REVISION');
  chronology(state.updatedAt, next.updatedAt);
  if (!command || typeof command !== 'object') return fail('INVALID_COMMAND');
  const read = (keys: string[]) => object(command, ['type', ...keys]);
  switch (command.type) {
    case 'pattern.upsert': { read(['pattern']); put(next.patterns, readPattern(command.pattern)); break; }
    case 'pattern.remove': {
      read(['id']); find(next.patterns, command.id);
      if (next.assignments.some(item => item.patternId === command.id) || next.runs.some(item => item.patternId === command.id)) fail('REFERENCE_IN_USE');
      next.patterns = remove(next.patterns, command.id); break;
    }
    case 'assignment.set': {
      read(['date', 'patternId']); day(command.date); identifier(command.patternId);
      if (!next.patterns.some(item => item.id === command.patternId)) fail('DANGLING_REFERENCE');
      const index = next.assignments.findIndex(item => item.date === command.date);
      const assignment = { date: command.date, patternId: command.patternId };
      if (index < 0) next.assignments.push(assignment); else next.assignments[index] = assignment;
      break;
    }
    case 'assignment.repeat': {
      read(['start', 'end', 'weekdays', 'patternId']);
      const pattern = find(next.patterns, command.patternId);
      const { dates } = planRepeatedAssignments(next.assignments, command.start, command.end, command.weekdays);
      if (!dates.length) fail('INVALID_VALUE');
      next.assignments.push(...dates.map(date => ({ date, patternId: pattern.id })));
      break;
    }
    case 'assignment.remove': {
      read(['date']); day(command.date);
      if (!next.assignments.some(item => item.date === command.date)) fail('NOT_FOUND');
      next.assignments = next.assignments.filter(item => item.date !== command.date); break;
    }
    case 'note.add': {
      read(['id', 'date', 'body', 'snapshot']); identifier(command.id);
      if (next.notes.some(item => item.id === command.id)) fail('DUPLICATE_ID');
      next.notes.push({ id: command.id, date: command.date, body: command.body, snapshot: command.snapshot,
        createdAt: next.updatedAt, updatedAt: next.updatedAt }); break;
    }
    case 'note.update': {
      read(['id', 'body']); const note = find(next.notes, command.id);
      note.body = command.body; note.updatedAt = next.updatedAt; break;
    }
    case 'note.remove': { read(['id']); next.notes = remove(next.notes, command.id); break; }
    case 'favorites.set': { read(['favorites']); next.favorites = command.favorites; break; }
    case 'snippet.upsert': { read(['snippet']); put(next.guideSnippets ??= [], readGuideSnippet(command.snippet)); break; }
    case 'snippet.remove': { read(['id']); next.guideSnippets = remove(next.guideSnippets ?? [], command.id); break; }
    case 'template.upsert': { read(['template']); put(next.templates, readTemplate(command.template)); break; }
    case 'template.remove': {
      read(['id']); find(next.templates, command.id);
      if (next.runs.some(item => item.templateId === command.id)) fail('REFERENCE_IN_USE');
      next.templates = remove(next.templates, command.id); break;
    }
    case 'run.start': {
      read(['id', 'date', 'templateId']); identifier(command.id); day(command.date); identifier(command.templateId);
      if (next.runs.some(item => item.id === command.id || (item.date === command.date && item.templateId === command.templateId))) fail('DUPLICATE_ID');
      const assignment = next.assignments.find(item => item.date === command.date);
      const template = next.templates.find(item => item.id === command.templateId);
      if (!assignment || !template) return fail('DANGLING_REFERENCE');
      next.runs.push({ id: command.id, date: command.date, patternId: assignment.patternId, templateId: template.id,
        pattern: find(next.patterns, assignment.patternId), templateLabel: template.label,
        items: template.items.map(item => ({ ...item, done: false })) }); break;
    }
    case 'run.toggle': {
      read(['id', 'itemId', 'done']); const run = find(next.runs, command.id);
      find(run.items, command.itemId).done = bool(command.done); break;
    }
    case 'run.remove': { read(['id']); next.runs = remove(next.runs, command.id); break; }
    case 'notifications.set': { read(['preferences']); next.notificationPreferences = readNotifications(command.preferences); break; }
    case 'sync.set': { read(['selection']); next.syncSelection = readSync(command.selection); break; }
    default: return fail('INVALID_COMMAND');
  }
  return parsePersonalState(next);
}

export function exportPersonalState(state: PersonalState): string { return JSON.stringify(parsePersonalState(state)); }
export function parsePersonalBackup(raw: string): PersonalState {
  if (typeof raw !== 'string') return fail('INVALID_JSON');
  sizeCheck(raw);
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return fail('INVALID_JSON'); }
  return parsePersonalState(parsed);
}
/** A local review payload only. This does not transmit or authorize synchronization. */
export function personalSyncPreview(state: PersonalState): PersonalSyncPreview {
  const safe = parsePersonalState(state), selected = safe.syncSelection;
  const result: PersonalSyncPreview = { version: 1 };
  if (selected.calendar) result.calendar = { patterns: safe.patterns, assignments: safe.assignments };
  if (selected.journal) result.journal = { notes: safe.notes };
  if (selected.favorites) result.favorites = { favorites: safe.favorites, ...(safe.guideSnippets ? { guideSnippets: safe.guideSnippets } : {}) };
  if (selected.checklists) result.checklists = { templates: safe.templates, runs: safe.runs };
  if (selected.notifications) result.notifications = { notificationPreferences: safe.notificationPreferences };
  return result;
}
