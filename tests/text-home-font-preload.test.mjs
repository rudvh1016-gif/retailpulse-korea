import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('text-led Korean home experiments with only the existing shell-font helper',()=>{
 const home=readFileSync('app/[locale]/page.tsx','utf8');
 assert.match(home,/if \(locale === 'ko'\) preloadShellFont\('ko'\)/);
 assert.match(home,/preloadLiveSummary\(\)/);
 assert.doesNotMatch(home,/fetchPriority|font-display|\/fonts\//);
 const helper=readFileSync('app/shell-font-preload.ts','utf8');
 assert.match(helper,/ko:'\/fonts\/koretail-sans-variable\.woff2'/);
 assert.match(helper,/as:'font',type:'font\/woff2',crossOrigin:'anonymous'/);
});

test('the candidate preserves font bytes, swap policy and the exact matched budgets',()=>{
 const css=readFileSync('app/globals.css','utf8');
 assert.match(css,/@font-face\s*\{\s*font-family: "KORETAIL Sans Variable";[\s\S]*?font-display: swap;/);
 const budget=readFileSync('scripts/compare-airport-focus-lab.mjs','utf8');
 assert.match(budget,/b\.cls>0\.1/);
 assert.match(budget,/b\.fcpMs>a\.fcpMs\*1\.1\+100/);
 assert.match(budget,/b\.initialTransferBytes>a\.initialTransferBytes\*1\.05/);
});
