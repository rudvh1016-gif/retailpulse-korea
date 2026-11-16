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
