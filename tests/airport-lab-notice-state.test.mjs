import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadLabNoticeDismissal} from '../scripts/airport-lab-notice-state.mjs';
import {noticeDismissedState} from '../scripts/update-notice-test-state.mjs';

const origin='http://127.0.0.1:4174';
const state={cookies:[],origins:[{origin,localStorage:[{name:'analytics-consent',value:'false'}]}]};
test('candidate defaults to its own notice helper without mutating analytics preferences',async()=>{
 const dismiss=await loadLabNoticeDismissal();
 assert.deepEqual(dismiss(origin,state),noticeDismissedState(origin,state));
 assert.equal(state.origins[0].localStorage.length,1);
});
test('baseline uses its measured revision notice key, not the candidate version',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'airport-lab-notice-'));
 try{
  const helper=await readFile(new URL('../scripts/update-notice-test-state.mjs',import.meta.url),'utf8');
  const baselineKey='koretail-notice:airport-comparison-20261019-v1:until';
  const modulePath=join(dir,'baseline.mjs');
  await writeFile(modulePath,helper.replace(/koretail-notice:[^']+:until/,baselineKey));
  const dismiss=await loadLabNoticeDismissal(modulePath),result=dismiss(origin,state);
  assert.equal(result.origins[0].localStorage.at(-1).name,baselineKey);
  assert.deepEqual(result.origins[0].localStorage[0],state.origins[0].localStorage[0]);
  assert.notEqual(result.origins[0].localStorage.at(-1).name,noticeDismissedState(origin,state).origins[0].localStorage.at(-1).name);
  await writeFile(join(dir,'missing.mjs'),'export const unrelated=true;\n');
  await assert.rejects(loadLabNoticeDismissal(join(dir,'missing.mjs')),/LAB_NOTICE_HELPER_MISSING/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('CI supplies the baseline checkout helper and rejects an open notice measurement',async()=>{
 const workflow=await readFile(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
 const lab=await readFile(new URL('../scripts/measure-airport-focus-lab.mjs',import.meta.url),'utf8');
 assert.match(workflow,/before\.json" BEFORE "\$PWD\/\.benchmark-main\/scripts\/update-notice-test-state\.mjs"/);
 assert.match(lab,/loadLabNoticeDismissal\(noticeStateModule\)/);
 assert.match(lab,/r\.hydrated&&r\.noticeOpen===false&&!r\.overflow/);
});
