import {CUSTOMS_NEWS_COLLECTION_REVIEWED,CUSTOMS_RSS_LINK_PUBLICATION_REVIEWED,collectCustomsNews} from '../lib/customs-news-collector';
import {CloudflareD1RestDatabase} from '../lib/d1-rest';
import {resolveProductionDatabaseConfig} from './production-database';
/** Existing daily workflow only. Review and runtime switches are checked
 * before config, provider reads or database writes. No AI calls or visitor work. */
if(!CUSTOMS_NEWS_COLLECTION_REVIEWED||process.env.RPK_CUSTOMS_NEWS_COLLECTION_ENABLED!=='true'){
 console.log(JSON.stringify({source:'CUSTOMS_NEWS',state:'DORMANT',requests:0,writes:0}));
}else{
 if(process.env.ENABLE_PRODUCTION_COLLECTOR!=='true')throw Error('production_collector_not_enabled');
 if(!process.env.CLOUDFLARE_D1_WRITE_TOKEN?.trim())throw Error('missing_dedicated_d1_write_token');
 const {accountId,databaseId,apiToken}=resolveProductionDatabaseConfig('production');
 const db=new CloudflareD1RestDatabase(accountId,databaseId,apiToken);
 try{
  console.log(JSON.stringify(await collectCustomsNews(db as unknown as D1Database,{activation:CUSTOMS_NEWS_COLLECTION_REVIEWED,metadataLinks:CUSTOMS_RSS_LINK_PUBLICATION_REVIEWED&&process.env.RPK_CUSTOMS_RSS_LINKS_ENABLED==='true'})));
 }finally{
  // Measured statement metadata, not a claim about account-wide free-tier headroom.
  console.log(JSON.stringify({source:'CUSTOMS_NEWS',d1Usage:db.usageSnapshot()}));
 }
}

