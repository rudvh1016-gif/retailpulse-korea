import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=(path)=>readFile(new URL('../'+path,import.meta.url));
const pngSize=(bytes)=>{assert.equal(bytes.subarray(1,4).toString('ascii'),'PNG');assert.equal(bytes[25],2,'icons have an opaque RGB background');return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;};
test('the new icon family keeps the installed app identity and distinct raster roles',async()=>{
 const manifest=JSON.parse(await read('public/manifest.webmanifest'));
 assert.equal(manifest.name,'KORETAIL');assert.equal(manifest.short_name,'KORETAIL');assert.equal(manifest.id,'/');assert.equal(manifest.start_url,'/ko');assert.equal(manifest.scope,'/');assert.equal(manifest.display,'standalone');
 const png=manifest.icons.filter(icon=>icon.type==='image/png');assert.equal(png.length,3);
 assert.deepEqual(png.map(icon=>[icon.sizes,icon.purpose]),[['192x192','any'],['512x512','any'],['512x512','maskable']]);
 for(const icon of png){assert.match(icon.src,/-20261007\.png$/);assert.equal(pngSize(await read('public'+icon.src)),icon.sizes);}
 assert.deepEqual(await read('public/manifest.webmanifest'),await read('public/manifest-20261007.webmanifest'));
});
test('fresh icon URLs avoid reusing the captured old icon URL, while legacy aliases match',async()=>{
 for(const [legacy,fresh]of [['apple-touch-icon.png','apple-touch-icon-20261007.png'],['favicon.svg','favicon-20261007.svg'],['favicon.ico','favicon-20261007.ico'],['icon-192.png','icon-192-20261007.png'],['icon-512.png','icon-512-20261007.png'],['icon-maskable-512.png','icon-maskable-512-20261007.png']]){
  assert.notEqual(legacy,fresh);assert.deepEqual(await read('public/'+legacy),await read('public/'+fresh));
 }
 const layout=(await read('app/layout.tsx')).toString('utf8');
 assert.match(layout,/apple: \[\{ url: "\/apple-touch-icon-20261007\.png"/);assert.equal(pngSize(await read('public/apple-touch-icon-20261007.png')),'180x180');
 assert.match(layout,/manifest: "\/manifest-20261007\.webmanifest"/);assert.match(layout,/appleWebApp: \{ capable: true, title: "KORETAIL"/);
});
test('favicon has real small raster frames and an embedded Blender raster fallback',async()=>{
 const ico=await read('public/favicon-20261007.ico');assert.equal(ico.readUInt16LE(0),0);assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),3);
 assert.deepEqual([0,1,2].map(i=>ico[6+i*16]),[16,32,48]);
 const svg=(await read('public/favicon-20261007.svg')).toString('utf8');assert.doesNotMatch(svg,/<script|<text|https?:\/\/(?!www\.w3\.org)/);const raster=svg.match(/href="data:image\/png;base64,([^"]+)"/);assert.ok(raster);assert.equal(pngSize(Buffer.from(raster[1],'base64')),'128x128');
});
