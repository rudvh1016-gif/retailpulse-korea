import {CUSTOMS_NEWS_COLLECTION_REVIEWED,collectCustomsNews} from '../lib/customs-news-collector';
import {CloudflareD1RestDatabase} from '../lib/d1-rest';
import {resolveProductionDatabaseConfig} from './production-database';
/** Prepared only, no workflow or schedule. Review gate is closed before config,
 * provider reads or any database write. Production never uses the test override. */
if(!CUSTOMS_NEWS_COLLECTION_REVIEWED||process.env.RPK_CUSTOMS_NEWS_COLLECTION_ENABLED!=='true'){
 console.log(JSON.stringify({source:'CUSTOMS_NEWS',state:'DORMANT',requests:0,writes:0}));
}else{
 if(process.env.ENABLE_PRODUCTION_COLLECTOR!=='true')throw Error('production_collector_not_enabled');
 if(!process.env.CLOUDFLARE_D1_WRITE_TOKEN?.trim())throw Error('missing_dedicated_d1_write_token');
 const {accountId,databaseId,apiToken}=resolveProductionDatabaseConfig('production');
 const db=new CloudflareD1RestDatabase(accountId,databaseId,apiToken);
 console.log(JSON.stringify(await collectCustomsNews(db as unknown as D1Database)));
}
