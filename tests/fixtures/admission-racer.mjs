import {LocalAdmissionAuthority,executeWithAuthority} from '../../scripts/authoritative-admission.ts';
import {DatabaseSync} from 'node:sqlite';
const [authorityPath,targetPath,mode,requestId,databaseId='active',epoch='epoch-1',source='airport_congestion',commit='a'.repeat(40)]=process.argv.slice(2);
const authority=new LocalAdmissionAuthority(authorityPath);
process.send?.('ready');
process.once('message',async()=>{
 try{
  await executeWithAuthority({enabled:true,authority,scope:{databaseId,epoch,source,commit},requestId},async()=>{
   if(mode==='die-before-write')process.exit(17);
   if(mode==='capacity-die'){
    const full=new DatabaseSync(targetPath);
    full.exec("CREATE TRIGGER full_database BEFORE INSERT ON writes BEGIN SELECT RAISE(ABORT,'D1_HTTP_400_7500: Exceeded maximum DB size'); END");
    try{full.prepare('INSERT INTO writes(request_id) VALUES(?)').run(requestId);process.exit(99);}
    catch(error){if(!String(error).includes('Exceeded maximum DB size'))process.exit(98);process.exit(18);}
   } // actual SQL rejection, killed before wrapper classification/state save
   const target=new DatabaseSync(targetPath);
   target.prepare('INSERT INTO writes(request_id) VALUES(?)').run(requestId);target.close();
   if(mode==='die-after-write')process.exit(19);
   if(mode==='hold'){process.send?.('entered');await new Promise(resolve=>process.once('message',resolve));}
   return {status:'SUCCESS'};
  });process.send?.('success');process.exit(0);
 }catch{process.send?.('denied');process.exit(2);}
});
