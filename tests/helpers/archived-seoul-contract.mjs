/** Historical contract fixture only. Production imports always retain the disabled policy.
 * Bundle an isolated in-memory module: no runtime flag, credentials or persisted source changes.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const allowed = new Set(['collector','population-predictions','commercial-monthly-store']);
export async function archivedSeoulContract(entry) {
  assert.ok(allowed.has(entry), 'only reviewed historical contract modules');
  const result = await build({
    entryPoints:[fileURLToPath(new URL(`../../lib/${entry}.ts`,import.meta.url))],
    bundle:true, write:false, platform:'node', format:'esm', target:'node22',
    plugins:[{name:'isolated-retired-policy-fixture',setup(builder) {
      builder.onLoad({filter:/[/\\]product-scope\.ts$/},async args=>{
        const source=await readFile(args.path,'utf8');
        const declaration='export const SEOUL_ENABLED = false;';
        assert.equal(source.split(declaration).length,2,'exact disabled production declaration required');
        return {contents:source.replace(declaration,'export const SEOUL_ENABLED = true;'),loader:'ts'};
      });
    }}],
  });
  assert.equal(result.outputFiles.length,1);
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
