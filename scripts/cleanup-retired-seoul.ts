import { randomUUID } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { CloudflareD1RestDatabase } from '../lib/d1-rest';
import { applySeoulCleanup, planSeoulCleanup, seoulCleanupSkipReason, seoulDailyAllowance } from '../lib/retired-seoul-cleanup';
import { SEOUL_ENABLED } from '../lib/product-scope';
import { reportProductionD1StorageHeadroom } from './report-d1-storage-headroom';
import { seoulCleanupSummary } from './retired-seoul-cleanup-summary';
import { resolveProductionDatabaseConfig, type ProductionDatabaseConfig } from './production-database';

const responseTimeout = 10_000;
const fetchOnce: typeof fetch = async (input, init) => {
  const response = await fetch(input, { ...init, signal: AbortSignal.timeout(responseTimeout), redirect: 'manual' });
  // Never let the collector adapter retry a delete after an ambiguous HTTP failure.
  if (!response.ok) throw Error('SEOUL_D1_REQUEST_FAILED');
  return response;
};
async function accountUsage(day: string, { accountId, apiToken }: ProductionDatabaseConfig) {
  const tokens = [...new Set([process.env.CLOUDFLARE_API_TOKEN?.trim(), apiToken].filter(Boolean))];
  const query = `query ($account: string!, $day: Date!) {
    viewer { accounts(filter: { accountTag: $account }) {
      d1AnalyticsAdaptiveGroups(limit: 1, filter: { date_geq: $day, date_leq: $day }) {
        sum { rowsRead rowsWritten }
      }
    } }
  }`;
  for (const token of tokens) {
    try {
      const response = await fetchOnce('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ query, variables: { account: accountId, day } }),
      });
      const body = await response.json();
      const accounts = body?.data?.viewer?.accounts;
      const groups = accounts?.[0]?.d1AnalyticsAdaptiveGroups;
      const sum = groups?.[0]?.sum;
      if (!body?.errors?.length && accounts?.length === 1 && groups?.length === 1
        && Number.isSafeInteger(sum?.rowsRead) && sum.rowsRead >= 0
        && Number.isSafeInteger(sum?.rowsWritten) && sum.rowsWritten >= 0) {
        return { rowsRead: sum.rowsRead as number, rowsWritten: sum.rowsWritten as number };
      }
    } catch { /* Missing usage always prevents deletion. */ }
  }
  return null;
}

async function recoveryBookmark({ accountId, databaseId, apiToken }: ProductionDatabaseConfig) {
  const response = await fetchOnce(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`,
    { headers: { authorization: `Bearer ${apiToken}` } },
  );
  const body = await response.json();
  if (body?.success !== true || typeof body.result?.bookmark !== 'string' || !body.result.bookmark) {
    throw Error('SEOUL_RECOVERY_BOOKMARK_UNAVAILABLE');
  }
  // The atomic batch records this in D1. Keep it out of public job logs.
  return body.result.bookmark as string;
}

const utcDay = new Date().toISOString().slice(0, 10);
const evidence: Parameters<typeof seoulCleanupSummary>[0] = { utcDay, reason: 'SEOUL_CLEANUP_UNVERIFIED' };
try {
  const config = resolveProductionDatabaseConfig('production');
  const db = new CloudflareD1RestDatabase(config.accountId, config.databaseId, config.apiToken, fetchOnce);
  const usage = evidence.usage = await accountUsage(utcDay, config);
  const gates = { retired: !SEOUL_ENABLED, enabled: process.env.RPK_RETIRED_SEOUL_CLEANUP === 'true',
    scheduled: process.env.GITHUB_EVENT_NAME === 'schedule', usage };
  const allowance = evidence.allowance = gates.retired && gates.enabled && gates.scheduled ? seoulDailyAllowance(usage) : 0;
  evidence.before = await reportProductionD1StorageHeadroom();
  const { plans, inventory } = await planSeoulCleanup(db, allowance);
  console.log(JSON.stringify({ utcDay, mode: allowance ? 'APPLY' : 'INVENTORY', accountUsage: usage,
    maximumBillableWrites: allowance, tablesWithPendingRows: inventory,
    status: inventory.length ? 'PENDING' : 'COMPLETE' }));
  if (plans.length) {
    const bookmark = await recoveryBookmark(config);
    if (!new Date().toISOString().startsWith(utcDay)) throw Error('SEOUL_BILLING_DAY_CHANGED');
    const result = evidence.result = await applySeoulCleanup(db, utcDay, randomUUID(), bookmark, plans, allowance);
    evidence.reason = result.status;
    console.log(JSON.stringify(result));
    evidence.after = await reportProductionD1StorageHeadroom();
    try {
      // Reuse the bounded read-only inventory, with at most one matching row per table.
      evidence.remaining = (await planSeoulCleanup(db, 0)).inventory;
    } catch {
      console.warn('::warning title=Seoul cleanup evidence::Post-run inventory unavailable');
    }
  } else {
    evidence.reason = inventory.length ? seoulCleanupSkipReason(gates) : 'COMPLETE';
    evidence.result = { deleted: 0, rowsWritten: 0 };
    evidence.remaining = inventory.map(row => ({ table: row.table, sampledRows: 1 }));
  }
} catch (error) {
  const reason = error instanceof Error && /^SEOUL_[A-Z_]+$/.test(error.message) ? error.message : 'SEOUL_CLEANUP_UNVERIFIED';
  console.error(JSON.stringify({ status: 'STOPPED', reason }));
  evidence.reason = reason;
  process.exitCode = 1;
} finally {
  console.log(JSON.stringify({ event: 'SEOUL_CLEANUP_SUMMARY', ...evidence }));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, seoulCleanupSummary(evidence));
}
