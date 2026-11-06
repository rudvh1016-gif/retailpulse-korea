/** Read-only schedule evidence. Never authorizes a collector or a retry. */
export const SCHEDULE_NOTICE_MS = 30 * 60_000;

/** Latest nominal UTC slot, for the repository's daily/weekly cron shapes only. */
export function previousScheduleSlot(cron: string, at: string): string | null {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5 || fields[2] !== '*' || fields[3] !== '*') return null;
  const parse = (field: string, max: number): number[] | null => {
    if (field === '*') return Array.from({length: max + 1}, (_, i) => i);
    if (!/^\d+(,\d+)*$/.test(field)) return null;
    const values = field.split(',').map(Number);
    return values.every(value => value <= max) ? values : null;
  };
  const minutes = parse(fields[0], 59), hours = parse(fields[1], 23), days = parse(fields[4], 6);
  const time = Date.parse(at);
  if (!minutes || !hours || !days || !Number.isFinite(time)) return null;
  const midnight = new Date(time);
  midnight.setUTCHours(0, 0, 0, 0);
  // A full weekly cycle, including today's already elapsed slots.
  for (let offset = 0; offset <= 7; offset++) {
    const day = new Date(midnight.getTime() - offset * 86_400_000);
    if (!days.includes(day.getUTCDay())) continue;
    let latest: number | null = null;
    for (const hour of hours) for (const minute of minutes) {
      const slot = day.getTime() + (hour * 60 + minute) * 60_000;
      if (slot <= time && (latest === null || slot > latest)) latest = slot;
    }
    if (latest !== null) return new Date(latest).toISOString();
  }
  return null;
}

export interface ScheduleRun {
  id: number;
  event: string;
  created_at: string;
  run_started_at: string | null;
  status: string;
  conclusion: string | null;
  html_url: string;
}

export function evaluateScheduleTimeliness(cron: string | readonly string[], runs: readonly ScheduleRun[], now: string) {
  const crons = typeof cron === 'string' ? [cron] : [...cron];
  // A run record lacks the schedule expression that produced it. Treat all of
  // one workflow's expressions as a union, never credit one run to each alarm.
  const previousSlot = (at: string) => {
    const slots = crons.map(expression => previousScheduleSlot(expression, at));
    return !slots.length || slots.some(slot => slot === null) ? null : slots.sort().at(-1)!;
  };
  const expectedSlot = previousSlot(now);
  const base = {crons, expectedSlot, noticeAfterMinutes: SCHEDULE_NOTICE_MS / 60_000};
  const run = runs.filter(row => row.event === 'schedule' && Number.isFinite(Date.parse(row.created_at))
    && Date.parse(row.created_at) <= Date.parse(now))
    .sort((a,b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  if (!expectedSlot || !run) return {...base, state: 'UNKNOWN', reason: 'schedule or scheduled execution evidence unavailable'};
  const created = Date.parse(run.created_at), slotAtCreation = previousSlot(run.created_at);
  if (!slotAtCreation) return {...base, state: 'UNKNOWN', reason: 'nominal slot cannot be derived'};
  const creationDelayLowerBoundMs = created - Date.parse(slotAtCreation);
  const overdueMs = Date.parse(now) - Date.parse(expectedSlot);
  const pendingSlot = created < Date.parse(expectedSlot);
  const started = run.run_started_at ? Date.parse(run.run_started_at) : NaN;
  const runStartDelayMs = Number.isFinite(started) && started >= created ? started - created : null;
  // GitHub does not expose the originating nominal slot. A delay beyond a full
  // cycle can alias to a later slot: this is a LOWER BOUND, never exact latency.
  return {...base,
    state: pendingSlot ? (overdueMs > SCHEDULE_NOTICE_MS ? 'OVERDUE' : 'AWAITING_SLOT')
      : creationDelayLowerBoundMs > SCHEDULE_NOTICE_MS ? 'LATE_CREATED' : 'RECENT_SCHEDULE_RUN',
    pendingSlot, overdueMs: pendingSlot ? overdueMs : null,
    creationDelayLowerBoundMs, runStartDelayMs,
    runId: run.id, runUrl: run.html_url, createdAt: run.created_at,
    runStartedAt: run.run_started_at, runStatus: run.status, runConclusion: run.conclusion,
    triggerOrigin: 'GITHUB_SCHEDULE',
    limitation: 'nominal slot inferred from current config; delay is a lower bound; execution and data health are separate',
  };
}
