import { randomUUID } from 'node:crypto';
import { CloudflareD1RestDatabase } from '../lib/d1-rest';
import { applySeoulCleanup, planSeoulCleanup, seoulDailyAllowance } from '../lib/retired-seoul-cleanup';
import { SEOUL_ENABLED } from '../lib/product-scope';
import { reportProductionD1StorageHeadroom } from './report-d1-storage-headroom';
import { resolveProductionDatabaseConfig } from './production-database';

const { accountId, databaseId, apiToken } = resolveProductionDatabaseConfig('production');
const responseTimeout = 10_000;
const fetchOnce: typeof fetch = async (input, init) => {
  const response = await fetch(input, { ...init, signal: AbortSignal.timeout(responseTimeout), redirect: 'manual' });
  // Never let the collector adapter retry a delete after an ambiguous HTTP failure.
  if (!response.ok) throw Error('SEOUL_D1_REQUEST_FAILED');
  return response;
};
const db = new CloudflareD1RestDatabase(accountId, databaseId, apiToken, fetchOnce);

async function accountUsage(day: string) {
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
      if (!body?.errors?.length && accounts?.length === 1 && groups?.length === 1) return groups[0]?.sum ?? null;
    } catch { /* Missing usage always prevents deletion. */ }
  }
  return null;
}

async function recoveryBookmark() {
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

try {
  const utcDay = new Date().toISOString().slice(0, 10);
  const usage = await accountUsage(utcDay);
  const enabled = !SEOUL_ENABLED && process.env.RPK_RETIRED_SEOUL_CLEANUP === 'true' && process.env.GITHUB_EVENT_NAME === 'schedule';
  const allowance = enabled ? seoulDailyAllowance(usage) : 0;
  await reportProductionD1StorageHeadroom();
  const { plans, inventory } = await planSeoulCleanup(db, allowance);
  console.log(JSON.stringify({ utcDay, mode: allowance ? 'APPLY' : 'INVENTORY', accountUsage: usage,
    maximumBillableWrites: allowance, tablesWithPendingRows: inventory,
    status: inventory.length ? 'PENDING' : 'COMPLETE' }));
  if (plans.length) {
    const bookmark = await recoveryBookmark();
    if (!new Date().toISOString().startsWith(utcDay)) throw Error('SEOUL_BILLING_DAY_CHANGED');
    const result = await applySeoulCleanup(db, utcDay, randomUUID(), bookmark, plans, allowance);
    console.log(JSON.stringify(result));
    await reportProductionD1StorageHeadroom();
  }
} catch (error) {
  const reason = error instanceof Error && /^SEOUL_[A-Z_]+$/.test(error.message) ? error.message : 'SEOUL_CLEANUP_UNVERIFIED';
  console.error(JSON.stringify({ status: 'STOPPED', reason }));
  process.exitCode = 1;
}
