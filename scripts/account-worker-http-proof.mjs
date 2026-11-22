/** Synthetic, local-only workerd HTTP + D1 proof. No real Google or production calls. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {generateKeyPair,SignJWT,exportJWK} from 'jose';
const root=fileURLToPath(new URL('../',import.meta.url));
const origin='https://account-proof.invalid',client='synthetic.apps.googleusercontent.com';
const now=Date.parse('2026-11-13T00:00:00Z');
const pair=await generateKeyPair('RS256');
let nonce='',challenge='',subject='synthetic-user-a',badNonce=false,redirectProvider=null;
const providerCalls=[];
// All Worker outbound requests terminate here; no network forwarding is possible.
async function provider(request){
 const url=request.url;providerCalls.push(url);
 if(redirectProvider===url)return new Response(null,{status:302,headers:{location:'https://unapproved-provider.invalid/blocked'}});
 if(url==='https://oauth2.googleapis.com/token'){
  assert.equal(request.method,'POST');const body=new URLSearchParams(await request.text());
  assert.equal(body.get('client_id'),client);assert.equal(body.get('redirect_uri'),origin+'/api/account/google/callback');
  assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'),challenge);
  const token=await new SignJWT({nonce:badNonce?'invalid':nonce,iss:'https://accounts.google.com',aud:client,sub:subject,iat:now/1000,exp:now/1000+3600}).setProtectedHeader({alg:'RS256',kid:'ephemeral-proof'}).sign(pair.privateKey);
  return Response.json({access_token:'synthetic-token',token_type:'Bearer',id_token:token});
 }
 if(url==='https://www.googleapis.com/oauth2/v3/certs')return Response.json({keys:[{...await exportJWK(pair.publicKey),kid:'ephemeral-proof',alg:'RS256'}]});
 if(url==='https://openidconnect.googleapis.com/v1/userinfo'){assert.equal(request.headers.get('authorization'),'Bearer synthetic-token');return Response.json({sub:subject});}
 throw Error('Unexpected outbound request blocked');
}
const bundled=await build({stdin:{contents:`import {handleAccountRequest} from './lib/account/service.ts'; export default {fetch(request,env){return handleAccountRequest(request,env,fetch,()=>${now});}};`,resolveDir:root,sourcefile:'synthetic-account-worker.ts',loader:'ts'},bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022',conditions:['worker','browser'],external:['node:*']});
const mf=new Miniflare(convertV4MiniflareOptions({telemetry:{enabled:false},workers:[{name:'synthetic-account-http',modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-08-24',compatibilityFlags:['nodejs_compat'],outboundService:provider,d1Databases:{PERSONAL_DB:'synthetic-local-account-http'},bindings:{ACCOUNTS_ENABLED:'true',ACCOUNT_ORIGIN:origin,ACCOUNT_PRIVACY_VERSION:'synthetic-only-not-approved-policy',GOOGLE_CLIENT_ID:client,GOOGLE_CLIENT_SECRET:'synthetic-only',PERSONAL_DATA_KEY:randomBytes(32).toString('hex')}}]}));
const checks=[];
const cookie=(r,name)=>r.headers.getSetCookie().find(v=>v.startsWith(name+'='))?.split(';')[0];
async function call(path,{method='GET',body,session,actor,headers={}}={}){
 const r=await mf.dispatchFetch(origin+'/api/account/'+path,{method,redirect:'manual',headers:{...(method==='POST'?{origin,'content-type':'application/json'}:{}),...(session?{cookie:session}:{}),...(actor?{'x-koretail-account':actor}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(r.headers.get('referrer-policy'),'no-referrer');return r;
}
async function begin(){
 const start=await call('google/start',{method:'POST'});assert.equal(start.status,200);
 const url=new URL((await start.json()).url);assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('scope'),'openid email');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 nonce=url.searchParams.get('nonce');challenge=url.searchParams.get('code_challenge');assert.match(nonce,/^[A-Za-z0-9_-]{43}$/);
 const raw=start.headers.getSetCookie()[0];for(const flag of ['Secure','HttpOnly','SameSite=Lax','Path=/'])assert.ok(raw.includes(flag));
 return {path:'google/callback?state='+url.searchParams.get('state')+'&code=synthetic-code',flow:cookie(start,'__Host-koretail_oauth')};
}
async function login(){
 const flow=await begin();const callback=await call(flow.path,{session:flow.flow});assert.equal(callback.status,303);assert.equal(callback.headers.get('location'),origin+'/ko/account','synthetic provider endpoints reached: '+JSON.stringify(providerCalls));
 const session=cookie(callback,'__Host-koretail_session');assert.ok(session);
 const status=await (await call('status',{session})).json();assert.equal(status.authenticated,true);return {...flow,session,actor:status.accountId};
}
try{
 const db=await mf.getD1Database('PERSONAL_DB');
 const schema=readFileSync(new URL('../db/account-migrations/0001.sql',import.meta.url),'utf8').replace(/--[^\n]*/g,'').replace(/CREATE TRIGGER[\s\S]+?END;/g,v=>v.replace(/\n/g,' ')).split('\n').map(v=>v.trim()).filter(Boolean).join('\n');await db.exec(schema);checks.push('original migration on local D1');
 assert.equal((await call('state')).status,401);checks.push('anonymous private read rejected');
 assert.equal((await call('google/start',{method:'POST',headers:{origin:'https://wrong.invalid'}})).status,403);assert.equal(providerCalls.length,0);checks.push('cross-origin start rejected without provider');
 const a=await login();checks.push('PKCE/browser-bound flow and RS256 callback in workerd');
 const callsBefore=providerCalls.length;const replay=await call(a.path,{session:a.flow});assert.match(replay.headers.get('location'),/auth=failed/);assert.equal(providerCalls.length,callsBefore);checks.push('callback replay rejected without provider');
 assert.equal((await (await call('state',a)).json()).revision,'empty');
 const savedResponse=await call('state',{...a,method:'POST',body:{type:'command',expectedRevision:'empty',command:{type:'note.add',id:'note',date:'2026-11-13',body:'synthetic-private-note',snapshot:null}}});assert.equal(savedResponse.status,200);const saved=await savedResponse.json();assert.equal(saved.notes[0].body,'synthetic-private-note');
 assert.equal((await (await call('state',a)).json()).notes[0].body,'synthetic-private-note');
 const row=await db.prepare('SELECT encrypted_state FROM account_documents WHERE account_id=?').bind(a.actor).first();assert.ok(!row.encrypted_state.includes('synthetic-private-note'));checks.push('HTTP save/read with Worker AES-GCM and encrypted D1');
 const stale=await call('state',{...a,method:'POST',body:{type:'clear',expectedRevision:'empty',confirmation:'DELETE PERSONAL TOOLS'}});assert.equal(stale.status,409);checks.push('stale revision rejected');
 assert.equal((await call('state',{...a,actor:'different-account'})).status,409);checks.push('actor binding rejected');
 subject='synthetic-user-b';const b=await login();assert.notEqual(b.actor,a.actor);assert.equal((await (await call('state',b)).json()).revision,'empty');checks.push('second account cannot read first document');
 const invalid=await begin();badNonce=true;const rejected=await call(invalid.path,{session:invalid.flow});badNonce=false;assert.match(rejected.headers.get('location'),/auth=failed/);assert.equal(cookie(rejected,'__Host-koretail_session'),undefined);checks.push('valid RSA token with wrong nonce rejected in workerd');
 const endpoints=['https://oauth2.googleapis.com/token','https://www.googleapis.com/oauth2/v3/certs','https://openidconnect.googleapis.com/v1/userinfo'];
 for(const [index,endpoint] of endpoints.entries()){
  const redirected=await begin();const beforeRedirect=providerCalls.length;redirectProvider=endpoint;
  const redirectFailure=await call(redirected.path,{session:redirected.flow});redirectProvider=null;
  assert.match(redirectFailure.headers.get('location'),/auth=failed/);assert.equal(cookie(redirectFailure,'__Host-koretail_session'),undefined);
  assert.deepEqual(providerCalls.slice(beforeRedirect),endpoints.slice(0,index+1));
  checks.push('provider redirect rejected without forwarding: '+new URL(endpoint).hostname);
 }
 assert.equal((await call('logout',{...b,method:'POST'})).status,200);assert.equal((await call('state',b)).status,401);assert.equal((await call('state',a)).status,200);checks.push('logout revokes only matching session');
 assert.equal((await call('delete',{...a,method:'POST',body:{expectedRevision:saved.revision,confirmation:'DELETE KORETAIL ACCOUNT'}})).status,200);assert.equal((await call('state',a)).status,401);
 for(const table of ['account_sessions','account_documents'])assert.equal(await db.prepare(`SELECT count(*) AS n FROM ${table} WHERE account_id=?`).bind(a.actor).first('n'),0);
 assert.equal(await db.prepare('SELECT count(*) AS n FROM account_quotas WHERE bucket=?').bind('account:'+a.actor).first('n'),0);checks.push('fresh delete cascades document sessions and account quota');
 console.log(JSON.stringify({status:'PASS',runtime:'actual local workerd fetch handler + local D1; synthetic provider callback',checks,check_count:checks.length,synthetic_provider_calls:providerCalls.length,real_provider_calls:0,remote_D1:false,real_OAuth:false,official_CPU_measurement:false,production_deployment:false},null,2));
}finally{await mf.dispose();}
