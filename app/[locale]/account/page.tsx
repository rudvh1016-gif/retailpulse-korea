import {notFound} from 'next/navigation';
import {accountConfigurationAvailable} from '../../../lib/account/service';
import Account from '../../personal-tools/account';
export const dynamic='force-dynamic';
export const metadata={title:'KORETAIL · 내 계정',robots:{index:false,follow:false,noarchive:true},alternates:{canonical:'/ko/account'}};
export default async function Page({params}:{params:Promise<{locale:string}>}){
 if((await params).locale!=='ko')notFound();
 try{const {env}=await import('cloudflare:workers');if(!accountConfigurationAvailable(env))notFound();}catch{notFound();}
 return <Account/>;
}
