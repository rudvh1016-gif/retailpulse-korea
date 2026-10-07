import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {cp,mkdir} from 'node:fs/promises';
const repo=fileURLToPath(new URL('../../',import.meta.url));
const root=fileURLToPath(new URL('./',import.meta.url));
export default defineConfig({
 root,base:'./',publicDir:false,
 build:{outDir:'dist',emptyOutDir:true},
 plugins:[{name:'bundle-selected-local-assets',async closeBundle(){
  await mkdir(`${root}/dist/visuals/travel-records/v1`,{recursive:true});
  await cp(`${repo}/public/visuals/travel-records/v1/departure.webp`,`${root}/dist/visuals/travel-records/v1/departure.webp`);
  await cp(`${repo}/public/fonts`,`${root}/dist/fonts`,{recursive:true});
  await cp(`${repo}/docs/licenses`,`${root}/dist/licenses`,{recursive:true});
 }}],
});
