/** Deployment-only schema gate. No writes, providers, or public request imports. */
export const OPERATIONAL_MIGRATION = '0020_operational_memory.sql';
export const OPERATIONAL_OBJECTS = {
  operational_incidents: 'table', operational_incident_events: 'table',
  operational_recovery_attempts: 'table', operational_source_state: 'table', operational_usage_daily: 'table',
  operational_incident_source_idx: 'index', operational_event_incident_idx: 'index',
  operational_attempt_budget_idx: 'index', operational_attempt_execution_idx: 'index',
  operational_attempt_inflight_idx: 'index', operational_event_fold: 'trigger',
} as const;
export interface SchemaObject { name: string; type: string; sql: string | null }
type Classification = 'STATE_A_EMPTY_PENDING' | 'STATE_B_PARTIAL_PENDING' | 'STATE_C_FULL_PENDING'
  | 'STATE_D_FULL_APPLIED' | 'STATE_E_APPLIED_INCOMPLETE' | 'STATE_F_UNKNOWN';
export interface MigrationGate {
  classification: Classification; action: 'SAFE_TO_APPLY' | 'ALREADY_VALID' | 'UNSAFE';
  reason: string; present: string[]; missing: string[]; incompatible: string[];
}

/** Compare tokens, not whitespace. Quoted values remain case-sensitive. Unknown equivalence is rejected. */
export function normalizedDefinition(sql: string): string {
  const tokens = sql.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|--[^\n]*|\/\*[\s\S]*?\*\/|[A-Za-z_][A-Za-z_0-9]*|\d+|[^\s]/g) ?? [];
  const clean = tokens.filter(t => !t.startsWith('--') && !t.startsWith('/*'))
    .map(t => /^[A-Za-z_]/.test(t) ? t.toUpperCase() : t);
  const typeIndex = clean[1] === 'UNIQUE' ? 2 : 1;
  if (clean.slice(typeIndex + 1, typeIndex + 4).join(' ') === 'IF NOT EXISTS') clean.splice(typeIndex + 1, 3);
  while (clean.at(-1) === ';') clean.pop();
  return JSON.stringify(clean);
}

export function migrationGate(applied: boolean | null, actual: SchemaObject[] | null,
  expected: SchemaObject[]): MigrationGate {
  const names = Object.keys(OPERATIONAL_OBJECTS).sort();
  const unknown = (reason: string): MigrationGate => ({classification:'STATE_F_UNKNOWN',action:'UNSAFE',reason,present:[],missing:names,incompatible:[]});
  if (applied === null || actual === null) return unknown('migration_or_schema_unmeasured');
  if (expected.length !== names.length || names.some(name => expected.filter(r => r.name === name && r.type === OPERATIONAL_OBJECTS[name as keyof typeof OPERATIONAL_OBJECTS]).length !== 1)) return unknown('canonical_schema_unmeasured');
  const present = names.filter(name => actual.some(r => r.name === name));
  const missing = names.filter(name => !present.includes(name));
  const incompatible = actual.filter(row => {
    const canonical = expected.find(r => r.name === row.name);
    return !canonical || !row.sql || !canonical.sql || row.type !== canonical.type
      || actual.filter(r => r.name === row.name).length !== 1
      || normalizedDefinition(row.sql) !== normalizedDefinition(canonical.sql);
  }).map(r => r.name).sort();
  const classification: Classification = applied ? (missing.length ? 'STATE_E_APPLIED_INCOMPLETE' : 'STATE_D_FULL_APPLIED')
    : present.length === 0 ? 'STATE_A_EMPTY_PENDING' : missing.length ? 'STATE_B_PARTIAL_PENDING' : 'STATE_C_FULL_PENDING';
  const unsafe = incompatible.length > 0 || (applied && missing.length > 0);
  return {classification,action:unsafe ? 'UNSAFE' : applied ? 'ALREADY_VALID' : 'SAFE_TO_APPLY',
    reason:incompatible.length ? 'incompatible_or_unexpected_object' : unsafe ? 'applied_migration_has_missing_objects' : 'canonical_definitions_match',
    present,missing,incompatible};
}

/** Wrangler --json must prove each SELECT succeeded; an empty/failed response is not an empty DB. */
export function readWranglerResults(text: string, count: number): Record<string, unknown>[][] {
  const result: unknown = JSON.parse(text);
  if (!Array.isArray(result) || result.length !== count || result.some(r => !r || r.success !== true || !Array.isArray(r.results)
    || r.results.some((row: unknown) => !row || typeof row !== 'object' || Array.isArray(row)))) throw new Error('remote_read_unmeasured');
  return result.map(r => r.results);
}

/** Targeted, read-only checks for data that would make an additive resume unsafe. */
export function checkResumeEvidence(gate: MigrationGate, read: (sql: string) => Record<string, unknown>[]): MigrationGate {
  const result = {...gate};
  if (result.action !== 'SAFE_TO_APPLY') return result;
  if (result.present.includes('operational_incident_events') && result.missing.includes('operational_event_fold')) {
    const rows = read('SELECT EXISTS(SELECT 1 FROM operational_incident_events LIMIT 1) AS has_events;');
    if (rows.length !== 1 || ![0,1].includes(rows[0].has_events as number)) throw new Error('remote_read_unmeasured');
    if (rows[0].has_events === 1) return {...result,action:'UNSAFE',reason:'event_history_without_trigger_requires_review'};
  }
  if (result.present.includes('operational_recovery_attempts') && result.missing.includes('operational_attempt_inflight_idx')) {
    const rows = read("SELECT source_id FROM operational_recovery_attempts WHERE completed_at IS NULL AND mode='CONTROLLED' GROUP BY source_id,logical_job HAVING COUNT(*)>1 LIMIT 1;");
    if (rows.length) return {...result,action:'UNSAFE',reason:'conflicting_inflight_locks_require_review'};
  }
  return result;
}
