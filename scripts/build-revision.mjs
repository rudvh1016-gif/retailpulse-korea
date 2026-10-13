import {execFileSync} from 'node:child_process';

// Build-time only. No Git command or environment enumeration is shipped to the Worker.
export function readBuildRevision(){
 try{
  const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  if(!/^[a-f0-9]{40}$/.test(sha))return {sha:null,dirty:null};
  const dirty=Boolean(execFileSync('git',['status','--porcelain','--untracked-files=normal'],{encoding:'utf8'}).trim());
  return {sha,dirty};
 }catch{return {sha:null,dirty:null};}
}
