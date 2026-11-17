import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export async function getDb() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

/** Default off. Binding is deliberately not added to production config by this PR. */
export async function getRecoveryDb():Promise<D1Database|undefined> {
 const {env}=await import('cloudflare:workers');
 const recovery=env as unknown as {DB?:D1Database;RECOVERY_DB?:D1Database;RPK_RECOVERY_READS?:string;RPK_RECOVERY_DATABASE_ID?:string;RPK_RECOVERY_ARCHIVE_DATABASE_ID?:string};
 if(recovery.RPK_RECOVERY_READS!=='true')return undefined;
 if(!recovery.RPK_RECOVERY_DATABASE_ID||!recovery.RPK_RECOVERY_ARCHIVE_DATABASE_ID||recovery.RPK_RECOVERY_DATABASE_ID===recovery.RPK_RECOVERY_ARCHIVE_DATABASE_ID||!recovery.RECOVERY_DB||recovery.RECOVERY_DB===recovery.DB)throw Error('recovery_binding_not_isolated');
 return recovery.RECOVERY_DB;
}

/** Independent, default-off forecast bindings; never silently alias realtime or archived DB. */
export async function getForecastRecoveryDbs():Promise<import('../lib/forecast-recovery').ForecastReadClients> {
 const {env}=await import('cloudflare:workers');const values=env as unknown as Record<string,unknown>;
 const output:import('../lib/forecast-recovery').ForecastReadClients={unavailable:[]};
 for(const [family,key,binding] of [['A5','a5','A5_RECOVERY_DB'],['WEATHER','weather','WEATHER_RECOVERY_DB']] as const){
  if(values[`RPK_${family}_RECOVERY_READS`]!=='true')continue;
  const id=values[`RPK_${family}_RECOVERY_DATABASE_ID`],archive=values.RPK_RECOVERY_ARCHIVE_DATABASE_ID;
  const others=['RPK_RECOVERY_DATABASE_ID',`RPK_${family==='A5'?'WEATHER':'A5'}_RECOVERY_DATABASE_ID`].map(name=>values[name]);
  if(typeof id!=='string'||!archive||id===archive||others.includes(id)||!values[binding]||values[binding]===values.DB){output.unavailable!.push(family);continue;}
  output[key]=values[binding] as D1Database;
 }
 return output;
}
