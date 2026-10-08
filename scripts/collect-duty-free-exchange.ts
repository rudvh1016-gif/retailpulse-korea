import { CloudflareD1RestDatabase } from '../lib/d1-rest';
import { collectDutyFreeExchange } from '../lib/duty-free-exchange-collector';
import { resolveProductionDatabaseConfig } from './production-database';

if(process.env.ENABLE_PRODUCTION_COLLECTOR!=='true')throw new Error('production_collector_not_enabled');
if(!process.env.CLOUDFLARE_D1_WRITE_TOKEN?.trim())throw new Error('missing_dedicated_d1_write_token');
const {accountId,databaseId,apiToken}=resolveProductionDatabaseConfig('production');
const db=new CloudflareD1RestDatabase(accountId,databaseId,apiToken);
const outcomes=await collectDutyFreeExchange(db as unknown as D1Database);
for(const outcome of outcomes)console.log(JSON.stringify({source:'DUTY_FREE_EXCHANGE',...outcome}));
console.log(JSON.stringify({usageSource:'D1_RESPONSE_META_INVOCATION_ONLY',...db.usageSnapshot()}));
if(outcomes.some(outcome=>outcome.status==='ERROR'||outcome.status==='BLOCKED'))process.exitCode=1;
