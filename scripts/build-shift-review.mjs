/** Export the same React review component as a self-contained, non-live HTML deliverable. */
import {build} from 'esbuild';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const destination=resolve(process.argv[2]??resolve(root,'artifacts/shift-review/koretail-shift-review.html'));
// The review HTML carries the same existing flag assets without a web server.
const flagRoot=resolve(root,'public/images/airport-flags');
const flagSources={};
for(const [folder,pattern,mime] of [['fallback',/^[a-z]{2}\.svg$/,'image/svg+xml'],['',/^[A-Z]{2}\.webp$/,'image/webp']]){
 for(const file of (await readdir(resolve(flagRoot,folder))).filter(name=>pattern.test(name))){
  flagSources[file.slice(0,2).toUpperCase()]=`data:${mime};base64,${(await readFile(resolve(flagRoot,folder,file))).toString('base64')}`;
 }
}
const inlineFlags={name:'inline-review-flags',setup(builder){builder.onLoad({filter:/\/app\/airport-country-flag\.tsx$/},async args=>({contents:(await readFile(args.path,'utf8')).replace(/const flag=.*;\n/,`const flag=(code:string)=>(${JSON.stringify(flagSources)} as Record<string,string>)[code];\n`),loader:'tsx',resolveDir:dirname(args.path)}));}};
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import ShiftBriefingPreview from './app/shift-briefing-preview';const q=new URLSearchParams(location.search);const state=['first','saved','unchanged','missing','partial'].includes(q.get('state'))?q.get('state'):'saved';const size=[320,360,390,430].includes(Number(q.get('size')))?Number(q.get('size')):390;const lang=['ko','en','zh','ja'].includes(q.get('lang'))?q.get('lang'):'ko';createRoot(document.getElementById('root')).render(<ShiftBriefingPreview lang={lang} initialState={state} initialWidth={q.get('width')==='mobile'?'mobile':'desktop'} initialFocus={q.get('focus')==='briefing'} initialMobileSize={size} initialLongDestinations={q.get('names')==='long'}/>);`;
const bundled=await build({absWorkingDir:root,stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,platform:'browser',format:'iife',minify:true,write:false,outfile:'review.js',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},plugins:[inlineFlags],logLevel:'warning'});
const js=bundled.outputFiles.find(file=>file.path.endsWith('.js'))?.text;
const css=bundled.outputFiles.find(file=>file.path.endsWith('.css'))?.text??'';
if(!js)throw new Error('Review JavaScript was not generated');
const font=(await readFile(resolve(root,'public/fonts/koretail-sans-variable.woff2'))).toString('base64');
const base=`@font-face{font-family:'KORETAIL Sans Variable';src:url(data:font/woff2;base64,${font}) format('woff2');font-style:normal;font-weight:45 920;font-display:swap}*{box-sizing:border-box}body{margin:0;background:white;color:#111;font:14px/1.6 'KORETAIL Sans Variable',system-ui,sans-serif;letter-spacing:-.012em;word-break:keep-all;overflow-wrap:anywhere}button,input,select,textarea{font:inherit}a{color:inherit}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}`;
const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>KORETAIL · 내 근무 브리핑 최종 시안</title><style>${base}\n${css}</style></head><body><div id="root"></div><script>${js.replaceAll('</script','<\\/script')}</script></body></html>`;
await mkdir(dirname(destination),{recursive:true});
await writeFile(destination,html);
console.log(JSON.stringify({file:destination,bytes:Buffer.byteLength(html),data:'design examples only',externalDependencies:0}));
