import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
const catalog=JSON.parse(fs.readFileSync('public/airport-models/v8/manifest.json','utf8'));
test('restored airport uses the original terminal geometry, camera dimensions and conceptual labels',()=>{
 const original=JSON.parse(fs.readFileSync('config/airport-concept-v5.json','utf8')),restored=JSON.parse(fs.readFileSync('config/airport-concept-v8.json','utf8'));
 assert.equal(catalog.geographic_layout,false);assert.equal(catalog.terminal_geometry_preserved,true);
 for(const [key,view] of Object.entries(restored.views)){
  assert.deepEqual(view,original.views[key]);
  for(const lighting of ['day','night']){const proof=catalog.views[key].restoration[lighting];assert.equal(proof.geometry_before,proof.geometry_after);assert.equal(proof.identical,true);}
 }
});
test('responsive airport WebP files match their render hashes and fit the reviewed asset budget',()=>{
 let files=0;
 for(const view of Object.values(catalog.views))for(const [name,asset] of Object.entries(view.responsive_files)){
  const bytes=fs.readFileSync('public/airport-models/v8/'+name);assert.equal(bytes.length,asset.bytes);assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);assert.ok(bytes.length<=64*1024);assert.ok([480,900,1240,1440].includes(asset.width));files++;
 }
 assert.equal(files,24);
});
