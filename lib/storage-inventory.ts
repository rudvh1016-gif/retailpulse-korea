/**
 * What each D1 table is, how long it is kept today, and how to measure it
 * without spending the budget it is meant to protect.
 *
 * This file deletes nothing and no production path imports it. It exists so
 * that three questions have one answer in the repository instead of three
 * different answers in three documents:
 *
 *   1. Which record class is a table (A–G below)?
 *   2. Is it pruned today, by what, and after how many days?
 *   3. How can its size and growth be measured with bounded, indexed reads?
 *
 * The classes follow the owner's 2026-09-28 instruction:
 *   A CURRENT              latest state, overwritten in place
 *   B OBSERVATION_DETAIL   detailed observations and official publications
 *   C AGGREGATE            hourly/daily/periodic official or derived summaries
 *   D PREDICTION           immutable prediction records (ours or official)
 *   E OUTCOME              later actuals matched against predictions
 *   F OPERATIONAL_EVIDENCE collector/recovery evidence
 *   G REBUILDABLE          derived state that can be recomputed
 *
 * D and E are never pruning candidates here, whatever their size:
 * docs/ZERO_COST_HYBRID_AUDIT.md forbids deleting prospective predictions or
 * their outcomes to recover free-tier space.
 */

export type RecordClass =
  | "A_CURRENT"
  | "B_OBSERVATION_DETAIL"
  | "C_AGGREGATE"
  | "D_PREDICTION"
  | "E_OUTCOME"
  | "F_OPERATIONAL_EVIDENCE"
  | "G_REBUILDABLE";

/** How rows per day can be counted through an existing index. */
export interface DailyCountPlan {
  /** Column holding a `+09:00` ISO instant or a `YYYY-MM-DD` day. */
  column: string;
  kind: "instant" | "day";
  /**
   * Leading index column that must be pinned for the range to use an index,
   * with every value it takes. Counting per key keeps each statement a SEARCH
   * and shows each key's share (Itaewon's, for example).
   */
  leading?: { column: string; values: readonly string[] };
}

export interface TableInventory {
  table: string;
  recordClass: RecordClass;
  /** Implemented pruning window in days, or null when nothing prunes it. */
  retentionDays: number | null;
  /** Where the implemented pruning lives. */
  prunedBy: string | null;
  /** How far back product features read, in days (null = only the latest). */
  readWindowDays: number | null;
  /** The features that read it — what a shorter retention would break. */
  readers: string;
  /** Column read on the lowest and highest rowid, to date the first and last insert. */
  insertedAt?: string;
  daily?: DailyCountPlan;
  /** Personal data: nothing but the rowid span is ever read. */
  personal?: true;
}

const AREAS = ["myeongdong", "hongdae", "seongsu", "itaewon"] as const;
const BY_AREA = { column: "area", values: AREAS } as const;

export const STORAGE_TABLES: readonly TableInventory[] = [
  // Prepared METAR storage: one RKSI current row and one bounded attempt row.
  { table: "airport_metar_current", recordClass: "A_CURRENT", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "Stored RKSI ground observation API; no raw snapshot history", insertedAt: "retrieved_at" },
  { table: "airport_metar_attempt", recordClass: "A_CURRENT", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "Prepared hourly request budget and latest attempt; collector not activated", insertedAt: "claimed_at" },
  // Bounded latest state: two vendors per table, no retained HTML or history.
  { table: "duty_free_exchange_current", recordClass: "A_CURRENT", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "Stored official duty-free exchange snapshot API", insertedAt: "first_verified_at" },
  { table: "duty_free_exchange_attempt", recordClass: "A_CURRENT", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "Collector due guard, lease and latest attempt status", insertedAt: "attempt_at" },
  { table: "duty_free_exchange_daily", recordClass: "C_AGGREGATE", retentionDays: null, prunedBy: null, readWindowDays: 1,
    readers: "Yesterday/today/explicitly published tomorrow exchange rates; one changed-only row per vendor/day", insertedAt: "first_verified_at",
    daily: { column: "service_date_kst", kind: "day", leading: { column: "vendor", values: ["shilla", "shinsegae"] } } },
  // B — detailed observations, the tables that grow with every collection.
  { table: "seoul_realtime_area", recordClass: "B_OBSERVATION_DETAIL", retentionDays: null, prunedBy: null, readWindowDays: 29,
    readers: "현재 인구, 오늘 관측 흐름, 7일·28일 전 비교, 내일 참고 예상 입력(28일)",
    insertedAt: "retrieved_at", daily: { column: "observed_at", kind: "instant", leading: BY_AREA } },
  { table: "seoul_realtime_commercial", recordClass: "B_OBSERVATION_DETAIL", retentionDays: null, prunedBy: null, readWindowDays: 28,
    readers: "현재 소비 활동, 7일·28일 전 비교",
    insertedAt: "retrieved_at", daily: { column: "observed_at", kind: "instant", leading: BY_AREA } },
  { table: "seoul_realtime_forecast", recordClass: "B_OBSERVATION_DETAIL", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "최신 발표본의 12시간 공식 예측만 화면에 사용",
    insertedAt: "retrieved_at", daily: { column: "issued_at", kind: "instant", leading: BY_AREA } },
  { table: "seoul_context", recordClass: "B_OBSERVATION_DETAIL", retentionDays: 90, prunedBy: "lib/population-predictions.ts (하루 최대 400행)", readWindowDays: 62,
    readers: "최신 업종별 소비·대기질 맥락, 완료된 현재·전월의 월별 관측 평균 요약",
    insertedAt: "retrieved_at", daily: { column: "observed_at", kind: "instant", leading: BY_AREA } },
  { table: "weather_forecast", recordClass: "B_OBSERVATION_DETAIL", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "최신 발표본의 기상청 단기예보만 화면에 사용",
    insertedAt: "retrieved_at", daily: { column: "issued_at", kind: "instant", leading: BY_AREA } },
  { table: "airport_flights", recordClass: "B_OBSERVATION_DETAIL", retentionDays: null, prunedBy: null, readWindowDays: 31,
    readers: "항공편 목록, 날짜 선택 가능 여부, 과거 운항 수",
    insertedAt: "retrieved_at", daily: { column: "scheduled_at", kind: "instant", leading: { column: "direction", values: ["departure", "arrival"] } } },
  { table: "airport_flight_changes", recordClass: "B_OBSERVATION_DETAIL", retentionDays: 30, prunedBy: "lib/collector.ts pruneOperationalHistory (하루 최대 1,500행)", readWindowDays: null,
    readers: "변경 이력 보관 (화면 직접 사용 없음)", insertedAt: "observed_at" },
  { table: "airport_congestion", recordClass: "B_OBSERVATION_DETAIL", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "현재 출국장 대기",
    insertedAt: "retrieved_at", daily: { column: "observed_at", kind: "instant", leading: { column: "terminal", values: ["T1", "T2"] } } },
  { table: "airport_passenger_forecast", recordClass: "B_OBSERVATION_DETAIL", retentionDays: null, prunedBy: null, readWindowDays: 62,
    readers: "공항 공식 예상 승객, 이번 달·지난달 같은 기간 합계",
    insertedAt: "retrieved_at", daily: { column: "target_date", kind: "day" } },
  { table: "airport_transfer_forecast", recordClass: "B_OBSERVATION_DETAIL", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "환승 보안검색 공식 예고", insertedAt: "retrieved_at" },
  { table: "airport_flow", recordClass: "B_OBSERVATION_DETAIL", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "초기 보조 흐름 기록", insertedAt: "retrieved_at" },
  { table: "weather_actual", recordClass: "B_OBSERVATION_DETAIL", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "초기 관측 날씨 기록", insertedAt: "collected_at" },
  { table: "foreign_presence", recordClass: "B_OBSERVATION_DETAIL", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "초기 외국인 체류 기록", insertedAt: "retrieved_at" },
  { table: "tourism_events", recordClass: "B_OBSERVATION_DETAIL", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "오늘부터 30일 안의 행사 (행사별 1행, 변경 시 갱신)", insertedAt: "retrieved_at" },
  // C — official periodic aggregates and compact daily facts.
  { table: "seoul_commercial_months", recordClass: "C_AGGREGATE", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "지역·월별 소비 관측 평균 비교, 과거 요약 보존 (최신 2개월 내부 시간 배열만 유지)", insertedAt: "calculated_at" },
  { table: "seoul_subway_ridership", recordClass: "C_AGGREGATE", retentionDays: null, prunedBy: null, readWindowDays: 35,
    readers: "대표역 승하차 추세 (전일·지난주 같은 요일·4주 평균)", insertedAt: "retrieved_at" },
  { table: "seoul_estimated_sales", recordClass: "C_AGGREGATE", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "분기 추정매출", insertedAt: "retrieved_at" },
  { table: "seoul_store_dynamics", recordClass: "C_AGGREGATE", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "분기 점포 증감", insertedAt: "retrieved_at" },
  { table: "seoul_foreign_presence_dong", recordClass: "C_AGGREGATE", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "행정동 외국인 생활인구 원자료", insertedAt: "retrieved_at" },
  { table: "seoul_foreign_presence_area", recordClass: "C_AGGREGATE", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "지역 외국인 생활인구", insertedAt: "retrieved_at" },
  { table: "seoul_foreign_purpose_mobility", recordClass: "C_AGGREGATE", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "월간 목적별 이동", insertedAt: "retrieved_at" },
  { table: "airport_daily_composition", recordClass: "C_AGGREGATE", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "공항 출발편 구성 이력", insertedAt: "calculated_at" },
  // D/E — immutable prediction evidence. Never pruned for space.
  { table: "predictions", recordClass: "D_PREDICTION", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "내일 인구 참고 예상과 검증 기록",
    insertedAt: "created_at", daily: { column: "target_at", kind: "instant", leading: BY_AREA } },
  { table: "prediction_inputs", recordClass: "D_PREDICTION", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "예측 당시 입력 원본 (재현·검증, 삭제 금지 트리거)" },
  { table: "forecast_runs", recordClass: "D_PREDICTION", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "예측 실행 기록", insertedAt: "created_at" },
  { table: "baseline_predictions", recordClass: "D_PREDICTION", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "비교 기준 예측", insertedAt: "created_at" },
  { table: "model_versions", recordClass: "D_PREDICTION", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "모델 버전", insertedAt: "created_at" },
  { table: "airport_forecast_versions", recordClass: "D_PREDICTION", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "공항 공식 예고 발표본 원본 (수정·삭제 금지 트리거)",
    insertedAt: "archived_at", daily: { column: "target_at", kind: "instant" } },
  { table: "outcomes", recordClass: "E_OUTCOME", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "예측 대조 실제값", insertedAt: "collected_at" },
  // F — operational evidence.
  { table: "collector_runs", recordClass: "F_OPERATIONAL_EVIDENCE", retentionDays: 90, prunedBy: "lib/collector.ts pruneOperationalHistory (하루 최대 100행)", readWindowDays: null,
    readers: "수집 실행 기록", insertedAt: "started_at" },
  { table: "operational_incidents", recordClass: "F_OPERATIONAL_EVIDENCE", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "장애 기록", insertedAt: "first_seen" },
  { table: "operational_incident_events", recordClass: "F_OPERATIONAL_EVIDENCE", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "장애 사건", insertedAt: "at" },
  { table: "operational_recovery_attempts", recordClass: "F_OPERATIONAL_EVIDENCE", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "복구 시도", insertedAt: "started_at" },
  { table: "operational_usage_daily", recordClass: "F_OPERATIONAL_EVIDENCE", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "수집 사용량 기록", insertedAt: "day" },
  { table: "forecast_maintenance", recordClass: "F_OPERATIONAL_EVIDENCE", retentionDays: null, prunedBy: null, readWindowDays: null,
    readers: "일일 유지보수 표시", insertedAt: "completed_at" },
  // A — current state, overwritten in place.
  { table: "source_health", recordClass: "A_CURRENT", retentionDays: null, prunedBy: null, readWindowDays: null, readers: "공급원 상태", insertedAt: "updated_at" },
  { table: "operational_source_state", recordClass: "A_CURRENT", retentionDays: null, prunedBy: null, readWindowDays: null, readers: "공급원 운영 상태", insertedAt: "checked_at" },
  { table: "airport_facility", recordClass: "A_CURRENT", retentionDays: null, prunedBy: null, readWindowDays: null, readers: "공항 시설 목록", insertedAt: "retrieved_at" },
  { table: "airport_scheduled_flights", recordClass: "A_CURRENT", retentionDays: null, prunedBy: null, readWindowDays: null, readers: "정기 운항 계획", insertedAt: "retrieved_at" },
  { table: "airport_departure_schedule", recordClass: "A_CURRENT", retentionDays: 0, prunedBy: "lib/departure-schedule.ts (발표본 교체)", readWindowDays: null, readers: "공식 출발 일정", insertedAt: "retrieved_at" },
  { table: "holiday_months", recordClass: "A_CURRENT", retentionDays: null, prunedBy: null, readWindowDays: null, readers: "월별 공휴일", insertedAt: "retrieved_at" },
  { table: "tourapi_category_codes", recordClass: "A_CURRENT", retentionDays: null, prunedBy: null, readWindowDays: null, readers: "행사 분류 코드", insertedAt: "retrieved_at" },
  { table: "seoul_subway_collection_checkpoint", recordClass: "A_CURRENT", retentionDays: null, prunedBy: null, readWindowDays: null, readers: "지하철 수집 확인점", insertedAt: "retrieved_at" },
  { table: "seoul_foreign_purpose_publications", recordClass: "A_CURRENT", retentionDays: null, prunedBy: null, readWindowDays: null, readers: "목적별 이동 발표본 목록", insertedAt: "retrieved_at" },
  { table: "beta_signups", recordClass: "A_CURRENT", retentionDays: null, prunedBy: null, readWindowDays: null, readers: "사전 신청 (개인정보, 행 수만 셈)", personal: true },
  // G — recomputed on the next run.
  { table: "area_data_coverage", recordClass: "G_REBUILDABLE", retentionDays: null, prunedBy: null, readWindowDays: null, readers: "예측 준비 상태 (다시 계산)", insertedAt: "calculated_at" },
];

/** D1/SQLite internals that are not product data and are never measured. */
export function isSystemTable(name: string): boolean {
  return /^(sqlite_|_cf_|d1_)/.test(name);
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/** Every table and column name reaches SQL only through this check. */
export function identifier(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error("invalid_storage_identifier");
  return name;
}

/** Complete KST days, oldest first, ending the day before `todayKst`. */
export function completeKstDays(todayKst: string, count: number): string[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayKst);
  if (!match || !Number.isInteger(count) || count < 1 || count > 31) throw new Error("invalid_storage_day_window");
  return Array.from({ length: count }, (_, index) =>
    new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) - count + index)).toISOString().slice(0, 10));
}

function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

export interface Statement { sql: string; binds: string[] }

/**
 * Lowest and highest rowid, and the insert time stored on each row. Every
 * part is a rowid seek or SQLite's single-aggregate MIN/MAX shortcut, so the
 * statement reads a handful of rows whatever the table size. (A combined
 * `SELECT MIN(rowid), MAX(rowid)` would lose the shortcut and scan.)
 */
export function rowidBoundsStatement(entry: Pick<TableInventory, "table" | "insertedAt" | "personal">): Statement {
  const table = identifier(entry.table);
  const parts = [`(SELECT MIN(rowid) FROM ${table}) AS lo`, `(SELECT MAX(rowid) FROM ${table}) AS hi`];
  if (entry.insertedAt && !entry.personal) {
    const column = identifier(entry.insertedAt);
    parts.push(
      `(SELECT ${column} FROM ${table} WHERE rowid = (SELECT MIN(rowid) FROM ${table})) AS firstAt`,
      `(SELECT ${column} FROM ${table} WHERE rowid = (SELECT MAX(rowid) FROM ${table})) AS lastAt`,
    );
  }
  return { sql: `SELECT ${parts.join(", ")}`, binds: [] };
}

function keysOf(plan: DailyCountPlan): Array<string | null> {
  return plan.leading ? [...plan.leading.values] : [null];
}

function keyed(plan: DailyCountPlan, key: string | null): { clause: string; binds: string[] } {
  return plan.leading && key !== null
    ? { clause: `${identifier(plan.leading.column)} = ? AND `, binds: [key] }
    : { clause: "", binds: [] };
}

export interface KeyedStatement extends Statement { key: string | null }
export interface DayStatement extends KeyedStatement { day: string }

/**
 * One bounded COUNT per (day, leading key). Each pins the leading index
 * column and ranges the time column, so each is a SEARCH on an existing
 * index and reads about as many rows as it counts.
 */
export function dailyCountStatements(entry: TableInventory, days: readonly string[]): DayStatement[] {
  const plan = entry.daily;
  if (!plan || entry.personal) return [];
  const table = identifier(entry.table), column = identifier(plan.column);
  return days.flatMap((day) => keysOf(plan).map((key) => {
    const lead = keyed(plan, key);
    const range = plan.kind === "day"
      ? { clause: `${column} = ?`, binds: [day] }
      : { clause: `${column} >= ? AND ${column} < ?`, binds: [`${day}T00:00:00+09:00`, `${nextDay(day)}T00:00:00+09:00`] };
    return { day, key, sql: `SELECT COUNT(*) AS rows FROM ${table} WHERE ${lead.clause}${range.clause}`, binds: [...lead.binds, ...range.binds] };
  }));
}

/** Oldest and newest value of the daily column per key: two index seeks each. */
export function timeBoundsStatements(entry: TableInventory): KeyedStatement[] {
  const plan = entry.daily;
  if (!plan || entry.personal) return [];
  const table = identifier(entry.table), column = identifier(plan.column);
  return keysOf(plan).map((key) => {
    const lead = keyed(plan, key);
    const where = lead.clause ? ` WHERE ${lead.clause.replace(/ AND $/, "")}` : "";
    return {
      key,
      sql: `SELECT (SELECT MIN(${column}) FROM ${table}${where}) AS oldest, (SELECT MAX(${column}) FROM ${table}${where}) AS newest`,
      binds: [...lead.binds, ...lead.binds],
    };
  });
}

/** The value a retention cutoff compares against, in the column's own format. */
export function cutoffValue(plan: DailyCountPlan, todayKst: string, days: number): string {
  const cutoffDay = new Date(Date.parse(`${todayKst}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
  return plan.kind === "day" ? cutoffDay : `${cutoffDay}T00:00:00+09:00`;
}

/**
 * First rowid at or after a cutoff, per key: one index seek each. For an
 * append-only table the rows below that rowid are the rows older than the
 * cutoff, so a deletion dry-run can size its candidates without reading them.
 */
export function retentionBoundaryStatements(entry: TableInventory, cutoff: string): KeyedStatement[] {
  const plan = entry.daily;
  if (!plan || entry.personal) return [];
  const table = identifier(entry.table), column = identifier(plan.column);
  return keysOf(plan).map((key) => {
    const lead = keyed(plan, key);
    return {
      key,
      sql: `SELECT rowid AS boundary FROM ${table} WHERE ${lead.clause}${column} >= ? ORDER BY ${column} LIMIT 1`,
      binds: [...lead.binds, cutoff],
    };
  });
}

/** Stored bytes of the newest rows, from SQLite's own LENGTH of each value. */
export const BYTE_SAMPLE_ROWS = 100;

export function byteSampleStatement(table: string, columns: readonly string[]): Statement {
  if (!columns.length) throw new Error("invalid_storage_identifier");
  const safeTable = identifier(table);
  const names = columns.map(identifier);
  const width = names.map((name) => `COALESCE(LENGTH(CAST(${name} AS BLOB)), 0)`).join(" + ");
  return {
    sql: `SELECT COUNT(*) AS sampled, AVG(${width}) AS avgBytes FROM (SELECT ${names.join(", ")} FROM ${safeTable} ORDER BY rowid DESC LIMIT ${BYTE_SAMPLE_ROWS})`,
    binds: [],
  };
}

/**
 * True when a plan never walks a whole table or index of `table`. Only
 * SEARCH, the constant row and the MIN/MAX shortcut qualify. The byte sample
 * is the one planned exception: it walks rowids backwards under a LIMIT, and
 * the caller checks its rows_read against that LIMIT instead.
 */
export function planIsBounded(plan: readonly string[], table: string): boolean {
  return !plan.some((line) => {
    const scanned = /^SCAN\s+([A-Za-z_][A-Za-z0-9_]*)\b/i.exec(line.trim())?.[1];
    return scanned === table;
  });
}

/** Cloudflare meta and our counts are only trusted as safe non-negative integers. */
export function countOf(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

export interface StorageLimit { perDatabaseBytes: number; accountBytes: number; basis: string }

/**
 * Planning limits as recorded in docs/ENGINEERING_DIRECTION.md §2, NOT a live
 * reading of Cloudflare's page: the official limits page was not reachable
 * from the 2026-09-28 work environment, so `basis` says exactly that.
 */
export const D1_FREE_PLANNING_LIMITS: StorageLimit = {
  perDatabaseBytes: 500 * 1024 * 1024,
  accountBytes: 5 * 1024 * 1024 * 1024,
  basis: "docs/ENGINEERING_DIRECTION.md §2 planning limit (Workers Free); official page unreachable from the work environment on 2026-09-28",
};

export const GUARDRAIL_STEPS = [
  { level: "NOTICE", ratio: 0.7 },
  { level: "PROTECT", ratio: 0.85 },
  { level: "EMERGENCY", ratio: 0.95 },
] as const;

/** Per-row cell overhead added to sampled value bytes before allocation. */
const ROW_OVERHEAD_BYTES = 16;

export interface AllocationInput { table: string; rows: number | null; sampleBytes: number | null }

/**
 * Splits one official database size across tables in proportion to
 * rows × (sampled value bytes + cell overhead). Index pages and free pages are
 * spread in the same proportion, which is why the result is an estimate: it is
 * calibrated to a real total, not measured per table. Tables without a row
 * count or a sample get null rather than a share.
 */
export function allocateBytes(totalBytes: number | null, inputs: readonly AllocationInput[]) {
  const weights = inputs.map((input) => ({
    table: input.table,
    rows: input.rows,
    weight: input.rows !== null && input.sampleBytes !== null ? input.rows * (input.sampleBytes + ROW_OVERHEAD_BYTES) : null,
  }));
  const known = weights.reduce((sum, entry) => sum + (entry.weight ?? 0), 0);
  return weights.map((entry) => {
    const bytes = totalBytes === null || entry.weight === null || known <= 0 ? null : Math.round(totalBytes * (entry.weight / known));
    return {
      table: entry.table,
      estimatedBytes: bytes,
      estimatedBytesPerRow: bytes === null || !entry.rows ? null : Math.round(bytes / entry.rows),
    };
  });
}

export interface MeasuredDay { day: string; rows: number | null; byKey: Record<string, number | null> }

/**
 * Rows per measured day for a keyed table, as the steady state it is heading
 * to rather than the partial state it passed through:
 *
 *   - a key that started inside the window counts at its own active-day mean
 *     on the days before it started;
 *   - a key with no rows on any complete day but rows today (Itaewon's
 *     realtime collection started on 2026-09-28) is estimated as the other
 *     keys' mean full day × (its rows so far today ÷ their mean so far today),
 *     and named in `estimatedKeys`;
 *   - a key that drops to zero after it started is left as measured.
 */
export function steadyDailyRows(byDay: readonly MeasuredDay[], today: Readonly<Record<string, number | null>> = {}) {
  const keys = Object.keys(byDay[0]?.byKey ?? {});
  const started = new Map(keys.map((key) => [key, byDay.findIndex((day) => (day.byKey[key] ?? 0) > 0)]));
  const activeMean = new Map(keys.map((key) => {
    const active = byDay.map((day) => day.byKey[key]).filter((value): value is number => typeof value === "number" && value > 0);
    return [key, active.length ? active.reduce((sum, value) => sum + value, 0) / active.length : null];
  }));
  const established = keys.filter((key) => activeMean.get(key) !== null);
  const estimatedKeys: string[] = [];
  const unestimatedKeys: string[] = [];
  for (const key of keys.filter((candidate) => activeMean.get(candidate) === null)) {
    const mine = today[key];
    const others = established.map((other) => today[other]).filter((value): value is number => typeof value === "number" && value > 0);
    if (typeof mine !== "number" || mine <= 0) continue;
    if (!established.length || others.length !== established.length) {
      unestimatedKeys.push(key);
      continue;
    }
    const fullDay = established.reduce((sum, other) => sum + (activeMean.get(other) ?? 0), 0) / established.length;
    const todayMean = others.reduce((sum, value) => sum + value, 0) / others.length;
    activeMean.set(key, fullDay * (mine / todayMean));
    started.set(key, byDay.length);
    estimatedKeys.push(key);
  }
  const series = byDay.flatMap((day, index) => {
    if (day.rows === null) return [];
    return [keys.reduce((sum, key) => {
      const first = started.get(key) ?? -1;
      const backfill = first === -1 || first > index ? activeMean.get(key) ?? 0 : null;
      return sum + (backfill ?? day.byKey[key] ?? 0);
    }, 0)];
  });
  return { series, estimatedKeys, unestimatedKeys };
}

export interface DailyGrowth {
  table: string;
  rowsPerDay: readonly number[];
  /** Where the daily rows came from; carried through to the output unchanged. */
  basis?: string;
}

/**
 * Days until each guardrail, from a measured size and measured daily row
 * growth. Returns nulls — never a guess — when either input is missing, when
 * fewer than two complete days were counted, or when a growing table has no
 * bytes-per-row estimate.
 */
export function projectStorage(input: {
  sizeBytes: number | null;
  limitBytes: number;
  growth: readonly DailyGrowth[];
  bytesPerRow: Readonly<Record<string, number | null>>;
}) {
  const perTable = input.growth.map((entry) => {
    const complete = entry.rowsPerDay.filter((value) => Number.isFinite(value) && value >= 0);
    const average = complete.length >= 2 ? complete.reduce((sum, value) => sum + value, 0) / complete.length : null;
    const bytes = input.bytesPerRow[entry.table] ?? null;
    return {
      table: entry.table,
      basis: entry.basis ?? "MEASURED_DAILY_COUNT",
      measuredDays: complete.length,
      averageRowsPerDay: average === null ? null : Math.round(average),
      estimatedBytesPerDay: average === null || bytes === null ? null : Math.round(average * bytes),
    };
  });
  const missing = perTable.filter((row) => row.averageRowsPerDay === null || (row.averageRowsPerDay > 0 && row.estimatedBytesPerDay === null));
  const bytesPerDay = missing.length || !perTable.length
    ? null
    : perTable.reduce((sum, row) => sum + (row.estimatedBytesPerDay ?? 0), 0);
  const size = input.sizeBytes;
  const guardrails = GUARDRAIL_STEPS.map((step) => {
    const threshold = step.ratio * input.limitBytes;
    const daysUntil = size === null ? null
      : size >= threshold ? 0
      : bytesPerDay === null || bytesPerDay <= 0 ? null
      : Math.floor((threshold - size) / bytesPerDay);
    return { level: step.level, thresholdBytes: Math.round(threshold), daysUntil };
  });
  return {
    perTable,
    estimatedBytesPerDay: bytesPerDay,
    usedRatio: size === null ? null : Number((size / input.limitBytes).toFixed(4)),
    guardrails,
    missing: missing.map((row) => row.table),
  };
}

export interface RetentionInput {
  entry: TableInventory;
  cutoffDays: number;
  /** Oldest value of the daily column across keys, or null when unknown. */
  oldest: string | null;
  cutoff: string;
  lowestRowid: number | null;
  /** First rowid at or after the cutoff per key; null when a key has none. */
  boundaries: ReadonlyArray<number | null>;
  bytesPerRow: number | null;
}

/**
 * A deletion dry-run for one table and one cutoff. It never deletes and it
 * never returns candidates for classes D and E, or for a cutoff shorter than
 * what a product feature reads.
 */
export function retentionDryRun(input: RetentionInput) {
  const { entry, cutoffDays } = input;
  const protectedClass = entry.recordClass === "D_PREDICTION" || entry.recordClass === "E_OUTCOME";
  const breaksReaders = entry.readWindowDays !== null && cutoffDays < entry.readWindowDays;
  const base = { table: entry.table, recordClass: entry.recordClass, cutoffDays, cutoff: input.cutoff };
  if (protectedClass) return { ...base, candidateRows: 0, basis: "PROTECTED_CLASS", breaksReaders: false, estimatedBytes: 0 };
  if (input.oldest !== null && input.oldest >= input.cutoff) {
    return { ...base, candidateRows: 0, basis: "MEASURED_OLDEST_IS_NEWER", breaksReaders, estimatedBytes: 0 };
  }
  const found = input.boundaries.filter((value): value is number => value !== null);
  if (input.oldest === null || input.lowestRowid === null || !found.length) {
    return { ...base, candidateRows: null, basis: "UNAVAILABLE", breaksReaders, estimatedBytes: null };
  }
  // Interleaved keys (four areas) share one rowid sequence; the earliest
  // boundary is the conservative one.
  const candidateRows = Math.max(0, Math.min(...found) - input.lowestRowid);
  return {
    ...base,
    candidateRows,
    basis: "INTERNAL_ESTIMATE_ROWID_BOUNDARY",
    breaksReaders,
    estimatedBytes: input.bytesPerRow === null ? null : candidateRows * input.bytesPerRow,
  };
}
