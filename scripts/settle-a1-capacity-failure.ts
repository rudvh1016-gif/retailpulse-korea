import { CloudflareD1RestDatabase } from '../lib/d1-rest';
import { OperationalMemory } from '../lib/operational-memory';
import { readAirportTodayCoverage } from '../lib/airport-today-coverage';
import { knownA1Failure, settleKnownA1CapacityFailure } from '../lib/a1-capacity-failure-settlement';
import { resolveProductionDatabaseConfig } from './production-database';

const repository='rudvh1016-gif/retailpulse-korea';
const mode=process.env.RPK_A1_CAPACITY_SETTLEMENT;
const token=process.env.GITHUB_TOKEN;
if ((mode!=='preview_a1_capacity_failure'&&mode!=='settle_a1_capacity_failure')||!token
  ||process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_REPOSITORY!==repository
  ||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch') throw Error('A1_CAPACITY_CONTEXT_UNVERIFIED');
const now=new Date().toISOString();
const config=resolveProductionDatabaseConfig('production');
const database=new CloudflareD1RestDatabase(config.accountId,config.databaseId,config.apiToken);
const memory=new OperationalMemory(database as unknown as D1Database);
const root='https://api.github.com/repos/'+repository+'/actions';
async function read(path:string) {
  const response=await fetch(root+path,{redirect:'error',signal:AbortSignal.timeout(10_000),
    headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json'}});
  if(!response.ok)throw Error('A1_GITHUB_PROOF_UNAVAILABLE');
  return response.json();
}
try {
  const [run,job,coverage]=await Promise.all([
    read('/runs/'+knownA1Failure.run+'/attempts/'+knownA1Failure.attempt),
    read('/jobs/'+knownA1Failure.job),
    readAirportTodayCoverage(database,now),
  ]);
  const status=await settleKnownA1CapacityFailure(memory,{run,job},now,coverage.state==='CURRENT',mode==='settle_a1_capacity_failure');
  console.log(JSON.stringify({status,currentCoverage:coverage.state,providerRequestsThisRun:0,
    confirmedHistoricalRun:knownA1Failure.run,confirmedHistoricalJob:knownA1Failure.job}));
  if(!['READY_TO_RECORD_FAILED_ATTEMPT','RECORDED_FAILED_ATTEMPT','ALREADY_RECORDED'].includes(status))process.exitCode=1;
} catch {
  console.error('A1_CAPACITY_RECONCILIATION_UNVERIFIED');
  process.exitCode=1;
}
