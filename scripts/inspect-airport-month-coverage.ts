/** Bounded production diagnosis: SELECT only; no provider, collection or refresh. */
import {CloudflareD1RestDatabase} from '../lib/d1-rest';
import {resolveProductionDatabaseConfig} from './production-database';
import {kstDayOf,shiftKstDay} from '../lib/kst';
import {AIRPORT_MONTH_VERSION,previousFlightMonth} from '../lib/airport-monthly-flights';
import {AIRPORT_SIDES_VERSION} from '../lib/airport-sides';
import {DESTINATIONS_VERSION} from '../lib/airport-destinations';
const config=resolveProductionDatabaseConfig('production');
const db=new CloudflareD1RestDatabase(config.accountId,config.databaseId,config.apiToken);
const today=kstDayOf(new Date().toISOString());
const result=await db.prepare(`SELECT day,calculated_at AS calculatedAt,
 json_extract(payload,'$.monthlyRollups.version') AS version,
 json_extract(payload,'$.monthlyRollups.asOf') AS asOf,
 json_extract(payload,'$.monthlyRollups.preparedAt') AS preparedAt,
 json_extract(payload,'$.monthlyRollups.sidesVersion') AS sidesVersion,
 json_extract(payload,'$.monthlyRollups.destinationsVersion') AS destinationsVersion,
 json_extract(payload,'$.monthlyRollups.months[0].month') AS month0,
 json_extract(payload,'$.monthlyRollups.months[1].month') AS month1,
 json_extract(payload,'$.monthlyRollups.months[0].includedDays') AS included0,
 json_extract(payload,'$.monthlyRollups.months[1].includedDays') AS included1
 FROM airport_daily_composition WHERE day>=? AND day<=? ORDER BY day DESC LIMIT 63`)
 .bind(shiftKstDay(today,-62),today).all<Record<string,unknown>>();
if(!result.success)throw Error('AIRPORT_MONTH_DIAGNOSTIC_READ_FAILED');
const scans=await db.prepare(`SELECT started_at AS startedAt,status,
 substr(detail,1,300) AS detail FROM collector_runs
 WHERE source_id=? AND started_at>=? ORDER BY started_at DESC LIMIT 8`)
 .bind('INCHEON_FLIGHT_DETAIL',shiftKstDay(today,-3)).all<Record<string,unknown>>();
if(!scans.success)throw Error('AIRPORT_SCAN_DIAGNOSTIC_READ_FAILED');
const usage=db.usageSnapshot();
if(usage.rowsWritten!==0||usage.unmeasuredStatements!==0||usage.rowsRead>1000)throw Error('AIRPORT_MONTH_READ_ONLY_BOUND');
console.log(JSON.stringify({research:'stored-airport-month-coverage',at:new Date().toISOString(),today,
 expected:{version:AIRPORT_MONTH_VERSION,sidesVersion:AIRPORT_SIDES_VERSION,destinationsVersion:DESTINATIONS_VERSION,
 months:[today.slice(0,7),previousFlightMonth(today.slice(0,7))]},
 providerRequests:0,dbWrites:0,usage,rows:result.results,scans:scans.results}));
