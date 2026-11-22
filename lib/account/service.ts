import {createLocalJWKSet,jwtVerify} from 'jose';
import {AccountRepository} from './repository';
import {applyPersonalCommand,emptyPersonalState,parsePersonalBackup,parsePersonalState,PersonalToolsError, type PersonalCommand} from '../personal-tools/model';

export interface AccountEnvironment {
 ACCOUNTS_ENABLED?:string;ACCOUNT_ORIGIN?:string;ACCOUNT_PRIVACY_VERSION?:string;GOOGLE_CLIENT_ID?:string;
 GOOGLE_CLIENT_SECRET?:string;PERSONAL_DATA_KEY?:string;PERSONAL_DB?:D1Database;
}
const SESSION='__Host-koretail_session', FLOW='__Host-koretail_oauth', FLOW_MS=600_000, SESSION_MS=7*86400_000;
const encoder=new TextEncoder();
const headers={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'};
function json(body:unknown,status=200){return Response.json(body,{status,headers});}
function fail(code:string):never {throw new PersonalToolsError(code);}
function random(){return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');}
async function hash(value:string){return Buffer.from(await crypto.subtle.digest('SHA-256',encoder.encode(value))).toString('hex');}
function cookie(request:Request,name:string):string|null {
 const values=(request.headers.get('cookie')??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(name+'='));
 if(values.length!==1)return null;const value=values[0].slice(name.length+1);return /^[A-Za-z0-9_-]{43}$/.test(value)?value:null;
}
function setCookie(response:Response,name:string,value:string,seconds:number){response.headers.append('Set-Cookie',name+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+seconds);}
async function key(hex:string){return crypto.subtle.importKey('raw',Buffer.from(hex,'hex'),'AES-GCM',false,['encrypt','decrypt']);}
async function encrypt(text:string,aad:string,hex:string){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(aad)},await key(hex),encoder.encode(text));
 return Buffer.from(iv).toString('base64url')+'.'+Buffer.from(cipher).toString('base64url');
}
async function decrypt(value:string,aad:string,hex:string){
 const [iv,cipher,...extra]=value.split('.');
 if(extra.length||!iv||!cipher||value.length>400000)fail('STORAGE');
 try{return new TextDecoder('utf-8',{fatal:true}).decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(iv,'base64url'),additionalData:encoder.encode(aad)},await key(hex),Buffer.from(cipher,'base64url')));}
 catch{fail('STORAGE');}
}
function configuration(env:AccountEnvironment){
 if(env.ACCOUNTS_ENABLED!=='true'||!env.PERSONAL_DB||!env.ACCOUNT_ORIGIN||!env.ACCOUNT_PRIVACY_VERSION
 ||!/^[A-Za-z0-9._-]{1,80}$/.test(env.ACCOUNT_PRIVACY_VERSION)||!env.GOOGLE_CLIENT_ID?.endsWith('.apps.googleusercontent.com')
 ||!env.GOOGLE_CLIENT_SECRET||!env.PERSONAL_DATA_KEY||!/^[a-f0-9]{64}$/i.test(env.PERSONAL_DATA_KEY))return null;
 try{const origin=new URL(env.ACCOUNT_ORIGIN);if(origin.protocol!=='https:'||origin.origin!==env.ACCOUNT_ORIGIN||origin.username||origin.password)return null;}catch{return null;}
 return {db:env.PERSONAL_DB,origin:env.ACCOUNT_ORIGIN,privacy:env.ACCOUNT_PRIVACY_VERSION,client:env.GOOGLE_CLIENT_ID,secret:env.GOOGLE_CLIENT_SECRET,encryption:env.PERSONAL_DATA_KEY};
}
export function accountConfigurationAvailable(env:AccountEnvironment){return configuration(env)!==null;}
async function boundedJson(response:Response,maximum:number):Promise<unknown>{
 if(Number(response.headers.get('content-length')??0)>maximum)fail('PAYLOAD_TOO_LARGE');
 if(!response.body)fail('INVALID_SHAPE');
 const reader=response.body.getReader();let bytes=0;const chunks:Uint8Array[]=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maximum){await reader.cancel();fail('PAYLOAD_TOO_LARGE');}chunks.push(value);}}
 finally{reader.releaseLock();}
 const all=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));}catch{fail('INVALID_SHAPE');}
}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))fail('INVALID_SHAPE');return value as Record<string,unknown>;}
function exact(value:Record<string,unknown>,keys:string[]){if(Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))fail('INVALID_SHAPE');}
function revision(value:unknown):string {if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value))fail('INVALID_REVISION');return value;}
/** No request body, upstream response, exception detail or credential is logged. */
export async function handleAccountRequest(request:Request,env:AccountEnvironment,fetcher:typeof fetch=fetch,clock:()=>number=Date.now):Promise<Response>{
 const config=configuration(env);if(!config)return json({error:'ACCOUNT_DISABLED'},404);
 const url=new URL(request.url),repo=new AccountRepository(config.db),now=clock();
 if(url.origin!==config.origin)return json({error:'INVALID_ORIGIN'},403);
 const path=url.pathname.slice('/api/account/'.length);
 const callback=path==='google/callback'&&request.method==='GET';
 const redirect=(ok:boolean)=>new Response(null,{status:303,headers:{...headers,Location:config.origin+'/ko/account'+(ok?'':'?auth=failed')}});
 try{
  if(request.method!=='GET'&&(request.method!=='POST'||request.headers.get('origin')!==config.origin||request.headers.get('sec-fetch-site')==='cross-site'))return json({error:'INVALID_ORIGIN'},403);
  if(path==='google/start'&&request.method==='POST'){
   const day=Math.floor(now/86400_000);
   if(!await repo.consume('oauth',1000,now,(day+1)*86400_000))return json({error:'RATE_LIMITED'},429);
   await repo.prune(now);
   const state=random(),binding=random(),verifier=random(),nonce=random(),stateHash=await hash(state);
   await repo.putFlow(stateHash,await hash(binding),await encrypt(JSON.stringify({verifier,nonce}),'oauth:'+stateHash,config.encryption),now+FLOW_MS);
   const target=new URL('https://accounts.google.com/o/oauth2/v2/auth');
   target.search=new URLSearchParams({client_id:config.client,redirect_uri:config.origin+'/api/account/google/callback',response_type:'code',scope:'openid email',state,nonce,code_challenge:Buffer.from(await crypto.subtle.digest('SHA-256',encoder.encode(verifier))).toString('base64url'),code_challenge_method:'S256',access_type:'online',prompt:'select_account'}).toString();
   const result=json({url:target.href});setCookie(result,FLOW,binding,600);return result;
  }
  if(callback){
   const state=url.searchParams.get('state'),code=url.searchParams.get('code'),binding=cookie(request,FLOW);
   const bad=()=>{const r=redirect(false);setCookie(r,FLOW,'',0);return r;};
   if(url.href.length>8192||url.searchParams.has('error')||url.searchParams.getAll('state').length!==1||url.searchParams.getAll('code').length!==1||!state||!/^[A-Za-z0-9_-]{43}$/.test(state)||!code||code.length>4096||!binding)return bad();
   const stateHash=await hash(state),flow=await repo.takeFlow(stateHash,await hash(binding),now);if(!flow)return bad();
   const flowData=object(JSON.parse(await decrypt(flow.encrypted_verifier,'oauth:'+stateHash,config.encryption)));
   const verifier=String(flowData.verifier),nonce=String(flowData.nonce);
   const signal=AbortSignal.timeout(10000);
   // workerd supports follow/manual, not error. Refuse every 3xx via !ok below;
   // never forward the authorization code, client secret or bearer to a redirect.
   const tokenResponse=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',redirect:'manual',signal,headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.client,client_secret:config.secret,code,code_verifier:verifier,grant_type:'authorization_code',redirect_uri:config.origin+'/api/account/google/callback'}).toString()});
   if(!tokenResponse.ok)return bad();const token=object(await boundedJson(tokenResponse,16384));
   if(typeof token.access_token!=='string'||!token.access_token||token.access_token.length>4096||token.token_type!=='Bearer'||/[\r\n]/.test(token.access_token))return bad();
   // Verify Google signature and claims using pinned endpoints and a mature JOSE implementation.
   if(typeof token.id_token!=='string'||token.id_token.length>16384)return bad();
   const certResponse=await fetcher('https://www.googleapis.com/oauth2/v3/certs',{redirect:'manual',signal});
   if(!certResponse.ok)return bad();const certs=object(await boundedJson(certResponse,32768));
   if(!Array.isArray(certs.keys)||certs.keys.length>10)return bad();
   const verified=await jwtVerify(token.id_token,createLocalJWKSet(certs as {keys: import('jose').JWK[]}),{issuer:['https://accounts.google.com','accounts.google.com'],audience:config.client,algorithms:['RS256'],currentDate:new Date(now),clockTolerance:30,maxTokenAge:'10m',requiredClaims:['sub','iat','exp','nonce']});
   if(verified.payload.aud!==config.client||verified.payload.nonce!==nonce||(verified.payload.azp!==undefined&&verified.payload.azp!==config.client))return bad();
   const identityResponse=await fetcher('https://openidconnect.googleapis.com/v1/userinfo',{redirect:'manual',signal,headers:{authorization:'Bearer '+token.access_token}});
   if(!identityResponse.ok)return bad();const identity=object(await boundedJson(identityResponse,16384));
   if(typeof identity.sub!=='string'||!/^[A-Za-z0-9_-]{1,255}$/.test(identity.sub)||identity.sub!==verified.payload.sub)return bad();
   const account=await repo.account(identity.sub,now);if(!account)return bad();
   const session=random();await repo.putSession(await hash(session),account,now,now+SESSION_MS);
   const result=redirect(true);setCookie(result,FLOW,'',0);setCookie(result,SESSION,session,SESSION_MS/1000);return result;
  }
  const rawSession=cookie(request,SESSION),sessionHash=rawSession?await hash(rawSession):null;
  const session=sessionHash?await repo.session(sessionHash,now):null;
  if(path==='status'&&request.method==='GET')return json({enabled:true,authenticated:Boolean(session),privacyVersion:config.privacy,...(session?{accountId:session.account_id}:{})});
  if(!session)return json({error:'UNAUTHENTICATED'},401);
  if(request.headers.get('x-koretail-account')!==session.account_id)return json({error:'ACCOUNT_CHANGED'},409);
  if(path==='logout'&&request.method==='POST'){await repo.logout(sessionHash!);const r=json({ok:true});setCookie(r,SESSION,'',0);return r;}
  if(path!=='state'&&path!=='delete')return json({error:'NOT_FOUND'},404);
  const read=async()=>{const row=await repo.document(session.account_id);if(!row)return emptyPersonalState();const state=parsePersonalBackup(await decrypt(row.encrypted_state,'state:'+session.account_id,config.encryption));if(state.revision!==row.revision)fail('STORAGE');return state;};
  if(path==='state'&&request.method==='GET')return json(await read());
  if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return json({error:'INVALID_CONTENT_TYPE'},415);
  // Admission precedes body parsing, decryption and full-document validation. Rejected
  // account requests never spend the shared budget. Fixed buckets cannot grow per minute.
  if(path==='state'){
   const minute=Math.floor(now/60000),day=Math.floor(now/86400_000);
   if(!await repo.consume('account:'+session.account_id,60,now,(minute+1)*60000,session.account_id)
    ||!await repo.consume('write',5000,now,(day+1)*86400_000))return json({error:'RATE_LIMITED'},429);
  }
  const input=object(await boundedJson(new Response(request.body,{headers:request.headers}),528384)),expected=revision(input.expectedRevision);
  if(path==='delete'){
   exact(input,['expectedRevision','confirmation']);if(input.confirmation!=='DELETE KORETAIL ACCOUNT')return json({error:'CONFIRMATION'},400);
   if(now-session.issued_at>300000)return json({error:'REAUTH_REQUIRED'},403);
   if(!await repo.deleteAccount(session.account_id,expected))return json({error:'CONFLICT'},409);
   const r=json({ok:true});setCookie(r,SESSION,'',0);return r;
  }
  const current=await read();if(current.revision!==expected)return json({error:'CONFLICT'},409);
  const context={now:new Date(now).toISOString(),revision:crypto.randomUUID()};
  if(Date.parse(current.updatedAt)>now)fail('INVALID_CHRONOLOGY');
  let next;
  if(input.type==='command'){exact(input,['type','expectedRevision','command']);next=applyPersonalCommand(current,input.command as PersonalCommand,context);}
  else if(input.type==='restore'){
   exact(input,['type','expectedRevision','raw']);if(typeof input.raw!=='string')fail('INVALID_SHAPE');const imported=parsePersonalBackup(input.raw);if(Date.parse(imported.updatedAt)>now)fail('INVALID_CHRONOLOGY');
   next={...imported,updatedAt:context.now,revision:context.revision};
  }else if(input.type==='clear'){
   exact(input,['type','expectedRevision','confirmation']);if(input.confirmation!=='DELETE PERSONAL TOOLS')fail('CONFIRMATION');next={...emptyPersonalState(),updatedAt:context.now,revision:context.revision};
  }else fail('INVALID_SHAPE');
  next=parsePersonalState(next);
  if(!await repo.save(session.account_id,expected,next.revision,await encrypt(JSON.stringify(next),'state:'+session.account_id,config.encryption)))return json({error:'CONFLICT'},409);
  return json(next);
 }catch(error){
  if(callback){const r=redirect(false);setCookie(r,FLOW,'',0);return r;}
  if(error instanceof PersonalToolsError){const code=error.code;return json({error:code},code==='STORAGE'?503:code==='PAYLOAD_TOO_LARGE'||code==='STATE_TOO_LARGE'?413:400);}
  return json({error:'ACCOUNT_UNAVAILABLE'},503);
 }
}
