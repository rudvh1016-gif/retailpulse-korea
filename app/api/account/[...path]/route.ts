import {handleAccountRequest} from '../../../../lib/account/service';
export const dynamic='force-dynamic';
async function route(request:Request){
 try{const {env}=await import('cloudflare:workers');return handleAccountRequest(request,env);}
 catch{return Response.json({error:'ACCOUNT_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});}
}
export const GET=route;
export const POST=route;
