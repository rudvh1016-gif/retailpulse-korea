import fs from 'node:fs/promises';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const source=new URL('../lib/airport-period/',import.meta.url),out=new URL('../public/airport-period/',import.meta.url);
await fs.mkdir(out,{recursive:true});
await build({entryPoints:[fileURLToPath(new URL('start.mjs',source))],outfile:fileURLToPath(new URL('runtime.js',out)),bundle:true,minify:true,format:'esm',target:'es2022',logLevel:'warning'});
// Windows checkout line endings must not change the version of identical assets.
const readText=async name=>(await fs.readFile(new URL(name,source),'utf8')).replaceAll('\r\n','\n');
const styles=(await readText('fonts.css'))+'\n'+await readText('style.css');
const html=await readText('frame.html');
const version=createHash('sha256').update(await fs.readFile(new URL('runtime.js',out))).update(styles).update(html).digest('hex').slice(0,12);
await fs.writeFile(new URL('frame.html',out),html.replace('./style.css','./style.css?v='+version).replace('./runtime.js','./runtime.js?v='+version));
await fs.writeFile(new URL('style.css',out),styles);
await fs.writeFile(new URL('../airport-period-version.ts',source),`// Generated with the comparison assets to prevent stale browser caches.\nexport const AIRPORT_PERIOD_VERSION='${version}';\n`);
console.log('Built lazy airport period UI without embedded records or fonts');
