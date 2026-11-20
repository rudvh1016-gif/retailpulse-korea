/**
 * Shared safe Production D1 connection/config path.
 *
 * Both the recurring collector (collect-production.ts) and the manual
 * one-shot import (import-oneshot.ts) must resolve the account/database the
 * same way: the account id always comes from the pinned
 * wrangler.production.jsonc, never from a CLOUDFLARE_ACCOUNT_ID secret. A
 * historical wrong-account-ID secret pointed at the wrong Cloudflare account
 * and surfaced as d1_http_403 (see PR #12). Reading the account id from the
 * committed config file makes that class of bug impossible to reintroduce.
 *
 * This module only resolves config; each caller still constructs its own
 * `CloudflareD1RestDatabase`, keeping that construction visibly gated behind
 * each script's own confirmation/enablement check.
 */
import { readFileSync } from "node:fs";
import { CloudflareD1RestDatabase } from "../lib/d1-rest";

interface WranglerConfig {
  account_id: string;
  env: Record<string, { d1_databases: Array<{ binding: string; database_id: string }> }>;
}

export interface ProductionDatabaseConfig {
  accountId: string;
  databaseId: string;
  apiToken: string;
  stage: string;
}

export function resolveProductionDatabaseConfig(stage?: string, binding = "DB"): ProductionDatabaseConfig {
  const resolvedStage = stage?.trim() || process.env.RPK_ONESHOT_STAGE?.trim() || "production";
  const wranglerConfig = JSON.parse(
    readFileSync(new URL("../wrangler.production.jsonc", import.meta.url), "utf8"),
  ) as WranglerConfig;
  const databaseId = wranglerConfig.env[resolvedStage]?.d1_databases?.find(entry => entry.binding === binding)?.database_id;
  if (!databaseId || databaseId.startsWith("00000000")) throw new Error(`oneshot_stage_unavailable_${resolvedStage}`);

  // Prefer the least-privilege dedicated write token when configured; the
  // deploy token already carries D1 edit rights as a fallback.
  const apiToken = process.env.CLOUDFLARE_D1_WRITE_TOKEN?.trim() || process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!apiToken) throw new Error("missing_cloudflare_api_token");

  return { accountId: wranglerConfig.account_id, databaseId, apiToken, stage: resolvedStage };
}

export function productionA4Overflow(primary: ProductionDatabaseConfig) {
  if (primary.stage !== 'production') return undefined;
  const overflow = resolveProductionDatabaseConfig(primary.stage, 'A4_OVERFLOW_DB');
  if (overflow.accountId !== primary.accountId || overflow.databaseId === primary.databaseId) {
    throw new Error('a4_requires_distinct_databases');
  }
  return new CloudflareD1RestDatabase(overflow.accountId, overflow.databaseId, overflow.apiToken);
}
