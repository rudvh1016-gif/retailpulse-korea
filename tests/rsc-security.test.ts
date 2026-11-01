import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { rscSecurity } from '../build/rsc-security-plugin';

test('server graph gate rejects a vulnerable vendored RSC even with a patched direct dependency', () => {
  const root = mkdtempSync(join(tmpdir(), 'koretail-rsc-'));
  try {
    const direct = join(root, 'node_modules/react-server-dom-webpack');
    const vendor = join(root, 'node_modules/plugin/vendor/react-server-dom');
    for (const [path, version] of [[direct, '19.2.8'], [vendor, '19.2.6']]) {
      mkdirSync(path, { recursive: true });
      writeFileSync(join(path, 'package.json'), JSON.stringify({ version }));
    }
    const hook = rscSecurity().generateBundle as (...args: unknown[]) => unknown;
    const context = (ids: string[]) => ({
      environment: { name: 'rsc' },
      getModuleIds: () => ids.values(),
      error: (message: string) => { throw new Error(message); },
      info: () => {},
    });
    const patched = join(direct, 'server.edge.js');
    assert.doesNotThrow(() => hook.call(context([patched])));
    assert.throws(() => hook.call(context([patched, join(vendor, 'server.edge.js')])), /Unsafe RSC.*19\.2\.6/);
    assert.throws(() => hook.call(context([])), /missing from server graph/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
