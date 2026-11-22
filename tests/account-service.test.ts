import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {generateKeyPair,SignJWT,exportJWK} from 'jose';
import {AccountRepository} from '../lib/account/repository';
const signing=generateKeyPair('RS256');
import {handleAccountRequest, type AccountEnvironment} from '../lib/account/service';
const ORIGIN='https://koretaildata.com', NOW=Date.parse('2026-11-13T00:00:00Z');
function fixture() {
 const sql=new DatabaseSync(':memory:'); sql.exec('PRAGMA foreign_keys=ON');
 sql.exec(readFileSync(new URL('../db/account-migrations/0001.sql',import.meta.url),'utf8'));
 const db={prepare(query:string){let values:unknown[]=[]; const q={bind(...v:unknown[]){values=v;return q;},async first(){return sql.prepare(query).get(...values as [])??null;},async all(){return {success:true,results:sql.prepare(query).all(...values as [])};},async run(){const r=sql.prepare(query).run(...values as []);return {success:true,meta:{changes:Number(r.changes)}};}};return q;},async batch(statements:{run:()=>Promise<unknown>}[]){sql.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
 const env:AccountEnvironment={ACCOUNTS_ENABLED:'true',ACCOUNT_ORIGIN:ORIGIN,ACCOUNT_PRIVACY_VERSION:'2026-11-13-reviewed',GOOGLE_CLIENT_ID:'local-test.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'synthetic-test-only',PERSONAL_DATA_KEY:'12'.repeat(32),PERSONAL_DB:db};
 let nonce='',subject='google-test-user-a'; let tokenOverrides:Record<string,unknown>={}; const calls:Array<{url:string;init?:RequestInit}>=[];
 const fetcher=async(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input);calls.push({url,init});if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'synthetic-access-token',token_type:'Bearer',expires_in:3600,id_token:await new SignJWT({nonce,iss:'https://accounts.google.com',aud:env.GOOGLE_CLIENT_ID!,sub:subject,iat:NOW/1000,exp:NOW/1000+3600,...tokenOverrides}).setProtectedHeader({alg:'RS256',kid:'fixture'}).sign((await signing).privateKey)});if(url==='https://www.googleapis.com/oauth2/v3/certs')return Response.json({keys:[{...await exportJWK((await signing).publicKey),kid:'fixture',alg:'RS256'}]});if(url==='https://openidconnect.googleapis.com/v1/userinfo')return Response.json({sub:subject});throw Error('unexpected upstream');};
 const call=async(path:string,method='GET',body?:unknown,cookie?:string,now=NOW,headers:Record<string,string>={})=>{const response=await handleAccountRequest(new Request(ORIGIN+'/api/account/'+path,{method,headers:{...(cookie?{'x-koretail-account':String(sql.prepare('SELECT account_id FROM account_sessions WHERE token_hash=?').get(createHash('sha256').update(cookie.split('=')[1]).digest('hex'))?.account_id??'')}:{}),...(method!=='GET'?{origin:ORIGIN,'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,fetcher,()=>now);if(path==='google/start'&&response.ok)nonce=new URL((await response.clone().json()).url).searchParams.get('nonce')??'';return response;};
 const cookie=(r:Response,name:string)=>r.headers.getSetCookie().find(v=>v.startsWith(name+'='))!.split(';')[0];
 async function login(){const start=await call('google/start','POST');assert.equal(start.status,200);const data=await start.json();const state=new URL(data.url).searchParams.get('state');const flowCookie=cookie(start,'__Host-koretail_oauth');const callback=await call('google/callback?state='+state+'&code=synthetic-code','GET',undefined,flowCookie);assert.equal(callback.status,303);return {session:cookie(callback,'__Host-koretail_session'),state,flowCookie,start,callback};}
 return {sql,env,calls,call,login,cookie,fetcher,setToken:(v:Record<string,unknown>)=>{tokenOverrides=v;},setSubject:(s:string)=>{subject=s;}};
}
test('disabled or incomplete account config fails closed and never reaches provider',async()=>{
 const f=fixture();for(const key of ['ACCOUNTS_ENABLED','ACCOUNT_ORIGIN','ACCOUNT_PRIVACY_VERSION','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','PERSONAL_DATA_KEY','PERSONAL_DB'] as const){const old=f.env[key];delete f.env[key];assert.equal((await f.call('google/start','POST')).status,404);Object.assign(f.env,{[key]:old});}assert.equal(f.calls.length,0);
});
test('OAuth start requires exact origin and returns minimal-scope PKCE with secure cookie',async()=>{
 const f=fixture();for(const origin of ['', 'https://evil.invalid'])assert.equal((await f.call('google/start','POST',undefined,undefined,NOW,{origin})).status,403);
 const r=await f.call('google/start','POST');const u=new URL((await r.json()).url);assert.equal(u.origin,'https://accounts.google.com');assert.equal(u.searchParams.get('scope'),'openid email');assert.match(u.searchParams.get('nonce')!,/^[A-Za-z0-9_-]{43}$/);assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.equal(u.searchParams.get('redirect_uri'),ORIGIN+'/api/account/google/callback');assert.match(r.headers.get('set-cookie')!,/HttpOnly/);assert.match(r.headers.get('set-cookie')!,/Secure/);assert.match(r.headers.get('set-cookie')!,/SameSite=Lax/);assert.match(r.headers.get('cache-control')!,/no-store/);
 const rows=f.sql.prepare('SELECT * FROM account_oauth_flows').all();assert.equal(rows.length,1);assert.doesNotMatch(JSON.stringify(rows),/code_verifier|synthetic-test-only/);
});
test('callback is browser-bound, one-use, and cannot expose provider tokens',async()=>{
 const f=fixture(), x=await f.login();assert.equal(f.calls.length,3);assert.equal(f.calls[0].url,'https://oauth2.googleapis.com/token');assert.equal(f.calls[1].url,'https://www.googleapis.com/oauth2/v3/certs');assert.equal(f.calls[2].url,'https://openidconnect.googleapis.com/v1/userinfo');
 const form=new URLSearchParams(String(f.calls[0].init?.body));assert.equal(form.get('grant_type'),'authorization_code');assert.ok(form.get('code_verifier')!.length>=43);
 assert.equal(x.callback.headers.get('location'),ORIGIN+'/ko/account');assert.doesNotMatch([...x.callback.headers].join(''),/synthetic-access-token|synthetic-test-only/);
 const repeat=await f.call('google/callback?state='+x.state+'&code=another','GET',undefined,x.flowCookie);assert.equal(repeat.status,303);assert.match(repeat.headers.get('location')!,/auth=failed/);assert.equal(f.calls.length,3);
 const rows=f.sql.prepare('SELECT * FROM account_sessions').all();assert.equal(rows.length,1);assert.doesNotMatch(JSON.stringify(rows),new RegExp(x.session.split('=')[1]));
});
test('wrong cookie, expired flow and duplicate callback parameters cannot authenticate',async()=>{
 for(const kind of ['cookie','expired','duplicate']){const f=fixture(),start=await f.call('google/start','POST'),state=new URL((await start.json()).url).searchParams.get('state');const cookie=kind==='cookie'?'__Host-koretail_oauth=wrong':f.cookie(start,'__Host-koretail_oauth');const r=await f.call('google/callback?state='+state+'&code=x'+(kind==='duplicate'?'&code=y':''),'GET',undefined,cookie,kind==='expired'?NOW+601000:NOW);assert.match(r.headers.get('location')!,/auth=failed/);assert.equal(f.calls.length,0);}
});
test('private state requires session, encrypts stored data and rejects stale revisions',async()=>{
 const f=fixture();assert.equal((await f.call('state')).status,401);const {session}=await f.login();
 const initial=await (await f.call('state','GET',undefined,session)).json();assert.equal(initial.revision,'empty');
 const body={type:'command',expectedRevision:'empty',command:{type:'note.add',id:'note-a',date:'2026-11-13',body:'private canary note',snapshot:null}};
 const saved=await f.call('state','POST',body,session);assert.equal(saved.status,200);const state=await saved.json();assert.equal(state.notes[0].body,'private canary note');
 assert.doesNotMatch(JSON.stringify(f.sql.prepare('SELECT * FROM account_documents').all()),/private canary note|note-a/);
 assert.equal((await f.call('state','POST',body,session)).status,409);
 assert.equal((await f.call('state','POST',{...body,expectedRevision:state.revision},session,NOW,{origin:''})).status,403);
 assert.equal((await f.call('state','GET',undefined,session,NOW+8*86400000)).status,401);
});
test('separate Google subjects cannot read or write each others account data',async()=>{
 const f=fixture(),a=await f.login();const saved=await (await f.call('state','POST',{type:'command',expectedRevision:'empty',command:{type:'note.add',id:'a',date:'2026-11-13',body:'only A',snapshot:null}},a.session)).json();
 f.setSubject('google-test-user-b');const b=await f.login();assert.equal((await (await f.call('state','GET',undefined,b.session)).json()).notes.length,0);
 assert.equal((await f.call('state','POST',{type:'clear',expectedRevision:saved.revision,confirmation:'DELETE PERSONAL TOOLS'},b.session)).status,409);
 assert.equal((await (await f.call('state','GET',undefined,a.session)).json()).notes[0].body,'only A');
});
test('whole clear leaves tombstone and restore rejects malformed or future state',async()=>{
 const f=fixture(),{session}=await f.login();const start=await (await f.call('state','GET',undefined,session)).json();
 assert.equal((await f.call('state','POST',{type:'restore',expectedRevision:'empty',raw:'{"version":99}'},session)).status,400);
 const cleared=await (await f.call('state','POST',{type:'clear',expectedRevision:'empty',confirmation:'DELETE PERSONAL TOOLS'},session)).json();assert.notEqual(cleared.revision,'empty');
 assert.equal((await f.call('state','POST',{type:'restore',expectedRevision:'empty',raw:JSON.stringify(start)},session)).status,409);
 const restored=await f.call('state','POST',{type:'restore',expectedRevision:cleared.revision,raw:JSON.stringify(start)},session);assert.equal(restored.status,200);
});
test('logout revokes only current session and privacy API never returns secret data',async()=>{
 const f=fixture(),x=await f.login();const status=await f.call('status','GET',undefined,x.session);const statusBody=await status.json();assert.match(statusBody.accountId,/^[0-9a-f-]{36}$/);assert.deepEqual(statusBody,{enabled:true,authenticated:true,privacyVersion:'2026-11-13-reviewed',accountId:statusBody.accountId});
 assert.equal((await f.call('logout','POST',undefined,x.session)).status,200);assert.equal((await f.call('state','GET',undefined,x.session)).status,401);
});
test('account deletion requires fresh login, phrase and current revision then revokes all sessions',async()=>{
 const f=fixture(),a=await f.login(),b=await f.login();
 const body={expectedRevision:'empty',confirmation:'DELETE KORETAIL ACCOUNT'};
 assert.equal((await f.call('delete','POST',{...body,confirmation:'no'},a.session)).status,400);
 assert.equal((await f.call('delete','POST',body,a.session,NOW+301000)).status,403);
 assert.equal((await f.call('delete','POST',body,b.session)).status,200);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM accounts').get()!.n,0);
 assert.equal((await f.call('state','GET',undefined,a.session)).status,401);
});
test('oversized and unknown mutation bodies do not touch existing state',async()=>{
 const f=fixture(),{session}=await f.login();assert.equal((await f.call('state','POST',{type:'x',blob:'x'.repeat(600000)},session)).status,413);
 assert.equal((await f.call('state','POST',{type:'command',expectedRevision:'empty',command:{type:'made.up'}},session)).status,400);
 assert.equal((await (await f.call('state','GET',undefined,session)).json()).revision,'empty');
});
test('private endpoints send no-store/no-referrer and provider failures expose only safe error',async()=>{
 const f=fixture(),start=await f.call('google/start','POST'),state=new URL((await start.json()).url).searchParams.get('state');
 const request=new Request(ORIGIN+'/api/account/google/callback?state='+state+'&code=test',{headers:{cookie:f.cookie(start,'__Host-koretail_oauth')}});
 const r=await handleAccountRequest(request,f.env,async()=>{throw Error('secret upstream diagnostic');},()=>NOW);assert.equal(r.status,303);assert.match(r.headers.get('location')!,/auth=failed/);assert.match(r.headers.get('cache-control')!,/no-store/);assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.doesNotMatch(await r.text(),/secret upstream/);
});

for(const [name,claims] of Object.entries({audience:{aud:'other-client'},nonce:{nonce:'wrong-nonce'},issuer:{iss:'https://evil.invalid'},expiry:{exp:NOW/1000-31},issued:{iat:NOW/1000+1000},age:{iat:NOW/1000-631},subject:{sub:'different-subject'},presenter:{azp:'other-client'},missingExpiry:{exp:undefined}}))test('validly signed fixture with wrong '+name+' cannot create a session',async()=>{
 const f=fixture();f.setToken(claims);const start=await f.call('google/start','POST'),u=new URL((await start.json()).url);
 const response=await f.call('google/callback?state='+u.searchParams.get('state')+'&code=x','GET',undefined,f.cookie(start,'__Host-koretail_oauth'));
 assert.match(response.headers.get('location')!,/auth=failed/);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM account_sessions').get()!.n,0);
});
test('stale tab identity is rejected on both read, write, and delete',async()=>{
 const f=fixture(),a=await f.login(),id=(await (await f.call('status','GET',undefined,a.session)).json()).accountId;
 f.setSubject('google-test-user-b');const b=await f.login();
 for(const [path,method,body] of [['state','GET',undefined],['state','POST',{type:'clear',expectedRevision:'empty',confirmation:'DELETE PERSONAL TOOLS'}],['delete','POST',{expectedRevision:'empty',confirmation:'DELETE KORETAIL ACCOUNT'}]] as const){
  assert.equal((await f.call(path,method,body,b.session,NOW,{'x-koretail-account':id})).status,409);
 }
});
test('per-account denial cannot spend global budget or decrypt private state',async()=>{
 const f=fixture(),{session}=await f.login(),id=String(f.sql.prepare('SELECT id FROM accounts').get()!.id);
 f.sql.prepare('INSERT INTO account_quotas VALUES (?,60,?)').run('account:'+id,NOW+60000);
 f.sql.prepare('INSERT INTO account_quotas VALUES (?,4999,?)').run('write',NOW+86400000);
 f.sql.prepare('INSERT INTO account_documents VALUES (?,?,?)').run(id,'broken','not-valid-ciphertext');
 const r=await f.call('state','POST',{type:'clear',expectedRevision:'broken',confirmation:'DELETE PERSONAL TOOLS'},session);
 assert.equal(r.status,429);assert.equal(f.sql.prepare("SELECT count FROM account_quotas WHERE bucket='write'").get()!.count,4999);
});
test('fixed quota bucket resets atomically and does not grow with time',async()=>{
 const f=fixture(),repo=new AccountRepository(f.env.PERSONAL_DB!);
 assert.equal(await repo.consume('account:test',2,NOW,NOW+60000),true);
 assert.equal(await repo.consume('account:test',2,NOW,NOW+60000),true);
 assert.equal(await repo.consume('account:test',2,NOW,NOW+60000),false);
 const outcomes=await Promise.all(Array.from({length:4},()=>repo.consume('account:test',2,NOW+60000,NOW+120000)));
 assert.equal(outcomes.filter(Boolean).length,2);
 for(let day=1;day<=30;day++)for(let minute=0;minute<100;minute++){
  const time=NOW+day*86400000+minute*60000;assert.equal(await repo.consume('account:test',2,time,time+60000),true);
 }
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM account_quotas').get()!.n,1);
});
test('deleting an account also removes its fixed quota bucket',async()=>{
 const f=fixture(),{session}=await f.login(),id=String(f.sql.prepare('SELECT id FROM accounts').get()!.id);
 f.sql.prepare('INSERT INTO account_quotas VALUES (?,1,?)').run('account:'+id,NOW+60000);
 assert.equal((await f.call('delete','POST',{expectedRevision:'empty',confirmation:'DELETE KORETAIL ACCOUNT'},session)).status,200);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM account_quotas WHERE bucket=?').get('account:'+id)!.n,0);
});
test('concurrent stale writes commit at most once through SQL CAS',async()=>{
 const f=fixture(),{session}=await f.login();
 const body={type:'clear',expectedRevision:'empty',confirmation:'DELETE PERSONAL TOOLS'};
 const replies=await Promise.all([f.call('state','POST',body,session),f.call('state','POST',body,session)]);
 assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);
});
test('valid quote-heavy backups within 256KiB remain importable',async()=>{
 const f=fixture(),{session}=await f.login();const state=await (await f.call('state','GET',undefined,session)).json();
 state.updatedAt=new Date(NOW).toISOString();state.notes=Array.from({length:90},(_,i)=>({id:'note-'+i,date:'2026-11-13',body:'"'.repeat(1000),snapshot:null,createdAt:state.updatedAt,updatedAt:state.updatedAt}));
 const raw=JSON.stringify(state);assert.ok(Buffer.byteLength(raw)<262144);assert.ok(Buffer.byteLength(JSON.stringify({raw}))>280000);
 assert.equal((await f.call('state','POST',{type:'restore',expectedRevision:'empty',raw},session)).status,200);
});

test('OAuth fixed daily limit resets without accumulating date buckets',async()=>{
 const f=fixture();f.sql.prepare('INSERT INTO account_quotas VALUES (?,1000,?)').run('oauth',NOW+86400000);
 assert.equal((await f.call('google/start','POST')).status,429);assert.equal(f.calls.length,0);
 assert.equal((await f.call('google/start','POST',undefined,undefined,NOW+86400000)).status,200);
 assert.equal(f.sql.prepare("SELECT count(*) AS n FROM account_quotas WHERE bucket='oauth'").get()!.n,1);
 assert.equal(f.sql.prepare("SELECT count FROM account_quotas WHERE bucket='oauth'").get()!.count,1);
});
test('fixed global write limit stops before decrypting and resets the next UTC day',async()=>{
 const f=fixture(),{session}=await f.login();
 f.sql.prepare('INSERT INTO account_quotas VALUES (?,5000,?)').run('write',NOW+86400000);
 const body={type:'clear',expectedRevision:'empty',confirmation:'DELETE PERSONAL TOOLS'};
 assert.equal((await f.call('state','POST',body,session)).status,429);
 assert.equal((await f.call('state','POST',body,session,NOW+86400000)).status,200);
 assert.equal(f.sql.prepare("SELECT count FROM account_quotas WHERE bucket='write'").get()!.count,1);
});
test('deleted accounts cannot recreate counters, documents or sessions from in-flight operations',async()=>{
 const f=fixture(),{session}=await f.login(),repo=new AccountRepository(f.env.PERSONAL_DB!);
 const id=String(f.sql.prepare('SELECT id FROM accounts').get()!.id);
 assert.equal((await f.call('delete','POST',{expectedRevision:'empty',confirmation:'DELETE KORETAIL ACCOUNT'},session)).status,200);
 assert.equal(await repo.consume('account:'+id,60,NOW,NOW+60000,id),false);
 await assert.rejects(repo.save(id,'empty','new-revision','synthetic-ciphertext'),/FOREIGN KEY/);
 await assert.rejects(repo.putSession('synthetic-session-hash',id,NOW,NOW+60000),/FOREIGN KEY/);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM accounts').get()!.n,0);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM account_sessions').get()!.n,0);
 assert.equal(f.sql.prepare("SELECT count(*) AS n FROM account_quotas WHERE bucket LIKE 'account:%'").get()!.n,0);
});
test('registration cap still permits previously registered accounts',async()=>{
 const f=fixture();for(let i=0;i<100;i++)f.sql.prepare('INSERT INTO accounts VALUES (?,?,?)').run('account-'+i,'existing-'+i,NOW);
 const start=await f.call('google/start','POST'),state=new URL((await start.json()).url).searchParams.get('state');
 const rejected=await f.call('google/callback?state='+state+'&code=x','GET',undefined,f.cookie(start,'__Host-koretail_oauth'));
 assert.match(rejected.headers.get('location')!,/auth=failed/);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM accounts').get()!.n,100);
 f.setSubject('existing-0');await f.login();assert.equal(f.sql.prepare('SELECT count(*) AS n FROM accounts').get()!.n,100);
});
test('encrypted state cannot be transplanted to a different account',async()=>{
 const f=fixture(),a=await f.login();
 await f.call('state','POST',{type:'command',expectedRevision:'empty',command:{type:'note.add',id:'a',date:'2026-11-13',body:'only A',snapshot:null}},a.session);
 const doc=f.sql.prepare('SELECT * FROM account_documents').get()!;f.setSubject('google-test-user-b');const b=await f.login();
 const id=String(f.sql.prepare("SELECT id FROM accounts WHERE google_sub='google-test-user-b'").get()!.id);
 f.sql.prepare('INSERT INTO account_documents VALUES (?,?,?)').run(id,doc.revision,doc.encrypted_state);
 assert.equal((await f.call('state','GET',undefined,b.session)).status,503);
});
for(const kind of ['bad-signature','malformed-token-body','oversized-token-body','malformed-jwks','missing-id-token','mismatched-userinfo'])test('rejects '+kind+' without creating an account or leaking credentials',async()=>{
 const f=fixture(),start=await f.call('google/start','POST'),url=new URL((await start.json()).url);
 const req=new Request(ORIGIN+'/api/account/google/callback?state='+url.searchParams.get('state')+'&code=test',{headers:{cookie:f.cookie(start,'__Host-koretail_oauth')}});
 const result=await handleAccountRequest(req,f.env,async(input,init)=>{
  const endpoint=String(input);
  if(endpoint.endsWith('/token')){
   if(kind==='malformed-token-body')return new Response('not-json');
   if(kind==='oversized-token-body')return new Response('x'.repeat(20000));
   const body=await (await f.fetcher(input,init)).json();
   if(kind==='missing-id-token')delete body.id_token;
   if(kind==='bad-signature'){const parts=body.id_token.split('.');const bytes=Buffer.from(parts[2],'base64url');bytes[0]^=1;parts[2]=bytes.toString('base64url');body.id_token=parts.join('.');}
   return Response.json(body);
  }
  if(endpoint.endsWith('/certs')&&kind==='malformed-jwks')return Response.json({keys:[null]});
  if(endpoint.endsWith('/userinfo')&&kind==='mismatched-userinfo')return Response.json({sub:'other-subject'});
  return f.fetcher(input,init);
 },()=>NOW);
 assert.match(result.headers.get('location')!,/auth=failed/);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM accounts').get()!.n,0);
 assert.doesNotMatch(await result.text(),/synthetic-access-token|synthetic-test-only/);
});

test('old account tab cannot log out a newly selected different account',async()=>{
 const f=fixture(),a=await f.login();const accountA=(await (await f.call('status','GET',undefined,a.session)).json()).accountId;
 f.setSubject('other-login');const b=await f.login();
 assert.equal((await f.call('logout','POST',undefined,b.session,NOW,{'x-koretail-account':accountA})).status,409);
 assert.equal((await (await f.call('status','GET',undefined,b.session)).json()).authenticated,true);
});

test('provider requests use workerd-compatible manual redirect mode',async()=>{
 const f=fixture();await f.login();assert.equal(f.calls.length,3);
 for(const call of f.calls)assert.equal(call.init?.redirect,'manual');
});
for(const [index,endpoint] of ['https://oauth2.googleapis.com/token','https://www.googleapis.com/oauth2/v3/certs','https://openidconnect.googleapis.com/v1/userinfo'].entries())test('provider redirect at step '+(index+1)+' is rejected without session or forwarding',async()=>{
 const f=fixture(),start=await f.call('google/start','POST'),state=new URL((await start.json()).url).searchParams.get('state');let calls=0;
 const request=new Request(ORIGIN+'/api/account/google/callback?state='+state+'&code=synthetic',{headers:{cookie:f.cookie(start,'__Host-koretail_oauth')}});
 const response=await handleAccountRequest(request,f.env,async(input,init)=>{calls++;if(String(input)===endpoint)return new Response(null,{status:302,headers:{location:'https://unapproved.invalid/blocked'}});return f.fetcher(input,init);},()=>NOW);
 assert.equal(response.status,303);assert.match(response.headers.get('location')!,/auth=failed/);assert.equal(calls,index+1);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM account_sessions').get()!.n,0);
});
