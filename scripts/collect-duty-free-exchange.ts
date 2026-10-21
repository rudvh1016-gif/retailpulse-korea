import { CloudflareD1RestDatabase } from '../lib/d1-rest';
import { readDutyFreeSnapshot } from '../lib/duty-free-exchange-store';
import { dutyFreeCoverage, dutyFreeRunStatus } from '../lib/duty-free-exchange';
import { collectDutyFreeExchange } from '../lib/duty-free-exchange-collector';
import { resolveProductionDatabaseConfig } from './production-database';

if(process.env.ENABLE_PRODUCTION_COLLECTOR!=='true')throw new Error('production_collector_not_enabled');
if(!process.env.CLOUDFLARE_D1_WRITE_TOKEN?.trim())throw new Error('missing_dedicated_d1_write_token');
const {accountId,databaseId,apiToken}=resolveProductionDatabaseConfig('production');
const db=new CloudflareD1RestDatabase(accountId,databaseId,apiToken);
const outcomes=await collectDutyFreeExchange(db as unknown as D1Database);
for(const outcome of outcomes)console.log(JSON.stringify({source:'DUTY_FREE_EXCHANGE',...outcome}));
// A cooldown skip is not proof that today's rate exists. Witness the actual stored day.
const checkedAt=new Date();
const coverage=dutyFreeCoverage(await readDutyFreeSnapshot(db as unknown as D1Database,checkedAt),checkedAt.getTime());
for(const row of coverage)console.log(JSON.stringify({source:'DUTY_FREE_EXCHANGE_COVERAGE',...row}));
console.log(JSON.stringify({usageSource:'D1_RESPONSE_META_INVOCATION_ONLY',...db.usageSnapshot()}));
const runStatus=dutyFreeRunStatus(outcomes,coverage);
// Preserve visible stale/next-due evidence without a failed workflow every 15 minutes during a guard.
for(const warning of runStatus.warnings)console.warn(`::warning title=Duty-free data not current::${warning.replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A')}`);
process.exitCode=runStatus.exitCode;
