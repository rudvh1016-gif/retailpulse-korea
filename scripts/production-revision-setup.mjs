import fs from 'node:fs';import path from 'node:path';
import {inspectPublicRevision,isRevision} from '../lib/deployment-verification.mjs';

export function expectedRevision(){
 const value=process.env.KORETAIL_EXPECTED_BUILD_SHA??JSON.parse(fs.readFileSync('deployment-revision.json','utf8')).sha;
 if(!isRevision(value))throw Error('Deployment artifact does not contain a full Git SHA.');
 return value;
}
export default async function revisionSetup(){
 const expected=expectedRevision(),origin=process.env.PLAYWRIGHT_BASE_URL??'https://koretaildata.com';
 const inspect=async phase=>{const result=await inspectPublicRevision(origin,expected);fs.mkdirSync('production-visual-results',{recursive:true});fs.writeFileSync(path.join('production-visual-results',`revision-${phase}.json`),JSON.stringify(result,null,2));console.log(`PUBLIC_REVISION ${phase}: ${expected}; operational evidence ${result.operation.state}; full recovery not inferred.`);};
 await inspect('before');
 // A deployment changing during the screen suite invalidates the comparison.
 return async()=>inspect('after');
}
