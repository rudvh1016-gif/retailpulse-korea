import { randomUUID } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { CloudflareD1RestDatabase } from '../lib/d1-rest';
import { applySeoulCleanup, planSeoulCleanup, seoulCleanupDecision, type SeoulCleanupUsage } from '../lib/retired-seoul-cleanup';
import { SEOUL_ENABLED } from '../lib/product-scope';
import { reportProductionD1StorageHeadroom } from './report-d1-storage-headroom';
import { resolveProductionDatabaseConfig } from './production-database';
import { renderSeoulCleanupSummary, type SeoulCleanupSummary } from './retired-seoul-cleanup-summary';

type ProductionDatabase = ReturnType<typeof resolveProductionDatabaseConfig>;
const responseTimeout = 10_000;
const fetchOnce: typeof fetch = async (input, init) => {
  const timeout = AbortSignal.timeout(responseTimeout);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  const response = await fetch(input, { ...init, signal, redirect: 'manual' });
  // Never let the collector adapter retry a delete after an ambiguous HTTP failure.
  if (!response.ok) throw Error('SEOUL_D1_REQUEST_FAILED');
  return response;
};

async function accountUsage(day: string, { accountId, apiToken }: ProductionDatabase): Promise<SeoulCleanupUsage | null> {
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
      const usage = groups?.[0]?.sum;
      if (!body?.errors?.length && accounts?.length === 1 && groups?.length === 1
        && Number.isSafeInteger(usage?.rowsRead) && usage.rowsRead >= 0
        && Number.isSafeInteger(usage?.rowsWritten) && usage.rowsWritten >= 0) {
        return { rowsRead: usage.rowsRead, rowsWritten: usage.rowsWritten };
      }
    } catch { /* Missing usage always prevents deletion. */ }
  }
  return null;
}

async function recoveryBookmark({ accountId, databaseId, apiToken }: ProductionDatabase) {
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
const summary: SeoulCleanupSummary = {
  utcDay, status: 'STOPPED', reason: null, accountUsage: null, maximumBillableWrites: null,
  deleted: 0, rowsWritten: 0, storageBefore: null, storageAfter: null, remaining: null,
};
try {
  const config = resolveProductionDatabaseConfig('production');
  const { accountId, databaseId, apiToken } = config;
  const db = new CloudflareD1RestDatabase(accountId, databaseId, apiToken, fetchOnce);
  const usage = await accountUsage(utcDay, config);
  summary.accountUsage = usage;
  const { allowance, reason: blockedBy } = seoulCleanupDecision(usage, {
    seoulEnabled: SEOUL_ENABLED,
    cleanupEnabled: process.env.RPK_RETIRED_SEOUL_CLEANUP === 'true',
    scheduled: process.env.GITHUB_EVENT_NAME === 'schedule',
  });
  summary.maximumBillableWrites = allowance;
  summary.storageBefore = await reportProductionD1StorageHeadroom();
  const { plans, inventory } = await planSeoulCleanup(db, allowance);
  summary.remaining = inventory;
  console.log(JSON.stringify({ utcDay, mode: allowance ? 'APPLY' : 'INVENTORY', accountUsage: usage,
    maximumBillableWrites: allowance, tablesWithPendingRows: inventory,
    status: inventory.length ? 'PENDING' : 'COMPLETE' }));
  if (plans.length) {
    const bookmark = await recoveryBookmark(config);
    if (!new Date().toISOString().startsWith(utcDay)) throw Error('SEOUL_BILLING_DAY_CHANGED');
    summary.deleted = null;
    summary.rowsWritten = null;
    summary.remaining = null;
    const result = await applySeoulCleanup(db, utcDay, randomUUID(), bookmark, plans, allowance);
    console.log(JSON.stringify(result));
    summary.deleted = result.deleted;
    summary.rowsWritten = result.rowsWritten;
    summary.status = result.status === 'ALREADY_PROCESSED' ? 'ALREADY_PROCESSED' : 'PROCESSED';
    summary.reason = result.status === 'ALREADY_PROCESSED' ? 'SEOUL_DAILY_BATCH_ALREADY_APPLIED' : null;
    summary.storageAfter = await reportProductionD1StorageHeadroom().catch(() => null);

    // The batch receipt stays valid if this separately bounded, read-only sample fails.
    const sampleDeadline = AbortSignal.timeout(20_000);
    const sampleDb = new CloudflareD1RestDatabase(accountId, databaseId, apiToken,
      (input, init) => fetchOnce(input, { ...init, signal: sampleDeadline }));
    const sample = await planSeoulCleanup(sampleDb, 0).catch(() => null);
    summary.remaining = sample?.inventory ?? null;
  } else {
    summary.reason = blockedBy ?? (inventory.length ? 'SEOUL_INSUFFICIENT_BATCH_ALLOWANCE' : null);
    summary.status = summary.reason ? 'SKIPPED' : 'COMPLETE';
  }
} catch (error) {
  const reason = error instanceof Error && /^SEOUL_[A-Z_]+$/.test(error.message) ? error.message : 'SEOUL_CLEANUP_UNVERIFIED';
  summary.reason = reason;
  console.error(JSON.stringify({ status: 'STOPPED', reason }));
  process.exitCode = 1;
}
console.log(JSON.stringify({ cleanupSummary: summary }));
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n${renderSeoulCleanupSummary(summary)}\n`).catch(() => {
    console.warn('::warning title=Seoul cleanup summary::GitHub job summary unavailable; use the structured cleanup log');
  });
}
