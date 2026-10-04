import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const catalog=JSON.parse(fs.readFileSync('config/approved-color-assets.json','utf8'));
test('reviewed color assets match their source hashes and remain small WebP images',()=>{
 for(const asset of catalog.assets){
  const file='public/airport-models/'+(asset.kind==='airport'?'v7/':'')+asset.name;
  const bytes=fs.readFileSync(file);
  assert.equal(bytes.subarray(0,4).toString(),'RIFF',file);assert.equal(bytes.subarray(8,12).toString(),'WEBP',file);
  assert.equal(bytes.length,asset.bytes,file);assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256,file);
  assert.ok(bytes.length<=64*1024,`${file} exceeds the reviewed lightweight asset budget`);
 }
});
test('v7 model coordinates and reserved dimensions preserve the approved v6c geometry',()=>{
 const v7=JSON.parse(fs.readFileSync('config/airport-concept-v7.json','utf8'));
 const approved=JSON.parse(fs.readFileSync('config/airport-concept-v6c.preview.json','utf8'));
 assert.deepEqual(v7.views,approved.views);
 for(const scope of ['T1','T2','CONCOURSE','OVERVIEW_2ROW'])for(const lighting of ['day','night']){
  const old=`public/airport-models/v5/${scope}_${lighting}.webp`;
  assert.ok(fs.existsSync(old),'Original V5 source assets are preserved');
 }
});
