/** Parameterized D1 adapter. PERSONAL_DB must not be the public collector DB. */
export class AccountRepository {
 constructor(private db:D1Database) {}
 /** Fixed keys roll over atomically. Optional owner check prevents a deleted account
  * from recreating its counter through an already in-flight request. */
 async consume(bucket:string,limit:number,now:number,expires:number,owner:string|null=null) {
  return Boolean(await this.db.prepare(`INSERT INTO account_quotas (bucket,count,expires_at)
   SELECT ?,1,? WHERE ? IS NULL OR EXISTS(SELECT 1 FROM accounts WHERE id=?)
   ON CONFLICT(bucket) DO UPDATE SET
    count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,
    expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END
   WHERE expires_at<=? OR count<? RETURNING count`).bind(bucket,expires,owner,owner,now,now,now,limit).first());
 }
 async prune(now:number) {
  // Bounded housekeeping, never a new scheduled job.
  await this.db.batch([
   this.db.prepare('DELETE FROM account_oauth_flows WHERE state_hash IN (SELECT state_hash FROM account_oauth_flows WHERE expires_at<=? LIMIT 20)').bind(now),
   this.db.prepare('DELETE FROM account_sessions WHERE token_hash IN (SELECT token_hash FROM account_sessions WHERE expires_at<=? LIMIT 20)').bind(now),
   this.db.prepare('DELETE FROM account_quotas WHERE bucket IN (SELECT bucket FROM account_quotas WHERE expires_at<=? LIMIT 20)').bind(now),
  ]);
 }
 async putFlow(state:string,cookie:string,verifier:string,expires:number) {
  await this.db.prepare('INSERT INTO account_oauth_flows VALUES (?,?,?,?)').bind(state,cookie,verifier,expires).run();
 }
 takeFlow(state:string,cookie:string,now:number) {
  return this.db.prepare('DELETE FROM account_oauth_flows WHERE state_hash=? AND cookie_hash=? AND expires_at>? RETURNING encrypted_verifier').bind(state,cookie,now).first<{encrypted_verifier:string}>();
 }
 async account(subject:string,now:number):Promise<string|null> {
  const existing=await this.db.prepare('SELECT id FROM accounts WHERE google_sub=?').bind(subject).first<{id:string}>();
  if(existing)return existing.id;
  // A conservative finite cap; increasing it requires real D1/CPU/storage evidence.
  const id=crypto.randomUUID();
  await this.db.prepare('INSERT INTO accounts(id,google_sub,created_at) SELECT ?,?,? WHERE (SELECT count(*) FROM accounts)<100 ON CONFLICT(google_sub) DO NOTHING').bind(id,subject,now).run();
  return (await this.db.prepare('SELECT id FROM accounts WHERE google_sub=?').bind(subject).first<{id:string}>())?.id??null;
 }
 async putSession(hash:string,account:string,now:number,expires:number) {
  await this.db.batch([
   this.db.prepare('DELETE FROM account_sessions WHERE token_hash IN (SELECT token_hash FROM account_sessions WHERE account_id=? ORDER BY issued_at DESC LIMIT -1 OFFSET 19)').bind(account),
   this.db.prepare('INSERT INTO account_sessions VALUES (?,?,?,?)').bind(hash,account,now,expires),
  ]);
 }
 session(hash:string,now:number) {
  return this.db.prepare('SELECT account_id,issued_at FROM account_sessions WHERE token_hash=? AND expires_at>?').bind(hash,now).first<{account_id:string;issued_at:number}>();
 }
 async logout(hash:string) {await this.db.prepare('DELETE FROM account_sessions WHERE token_hash=?').bind(hash).run();}
 document(account:string) {
  return this.db.prepare('SELECT revision,encrypted_state FROM account_documents WHERE account_id=?').bind(account).first<{revision:string;encrypted_state:string}>();
 }
 async revision(account:string) {
  return (await this.db.prepare('SELECT revision FROM account_documents WHERE account_id=?')
    .bind(account).first<{revision:string}>())?.revision ?? 'empty';
 }
 async save(account:string,expected:string,revision:string,encrypted:string) {
  const result=expected==='empty'
   ?await this.db.prepare('INSERT INTO account_documents VALUES (?,?,?) ON CONFLICT(account_id) DO NOTHING RETURNING revision').bind(account,revision,encrypted).first()
   :await this.db.prepare('UPDATE account_documents SET revision=?,encrypted_state=? WHERE account_id=? AND revision=? RETURNING revision').bind(revision,encrypted,account,expected).first();
  return Boolean(result);
 }
 async deleteAccount(account:string,expected:string) {
  return Boolean(await this.db.prepare("DELETE FROM accounts WHERE id=? AND (EXISTS(SELECT 1 FROM account_documents WHERE account_id=? AND revision=?) OR (?='empty' AND NOT EXISTS(SELECT 1 FROM account_documents WHERE account_id=?))) RETURNING id").bind(account,account,expected,expected,account).first());
 }
}
