/** Owner-authorized daily calendar task. Existing workflow, no new scheduler. */
import {CloudflareD1RestDatabase} from '../lib/d1-rest';
import {resolveProductionDatabaseConfig} from './production-database';
import {refreshOfficialCalendars} from '../lib/official-calendar-runtime';
if(process.env.ENABLE_PRODUCTION_COLLECTOR!=='true')throw Error('production_collector_not_enabled');
const {accountId,databaseId,apiToken}=resolveProductionDatabaseConfig('production');
const database=new CloudflareD1RestDatabase(accountId,databaseId,apiToken);
const result=await refreshOfficialCalendars(database as unknown as D1Database);
console.log(JSON.stringify(result));
if(result.results.some(row=>['ERROR','REVIEW_REQUIRED'].includes(row.status)))process.exitCode=1;
