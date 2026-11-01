import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/** Inspect the actual server module graph, including plugin-vendored copies. */
export function rscSecurity(): Plugin {
  return {
    name: 'koretail-rsc-security',
    apply: 'build',
    generateBundle() {
      if (this.environment.name !== 'rsc') return;
      let checked = 0;
      for (const id of this.getModuleIds()) {
        const normalized = id.replaceAll('\\', '/');
        const marker = normalized.includes('/vendor/react-server-dom/')
          ? '/vendor/react-server-dom/' : '/react-server-dom-webpack/';
        const index = normalized.indexOf(marker);
        if (index < 0) continue;
        const packagePath = `${normalized.slice(0, index)}${marker}package.json`;
        const { version } = JSON.parse(readFileSync(packagePath, 'utf8'));
        // Future minor updates require a deliberate compatibility review.
        if (!/^19\.2\.\d+$/.test(version) || Number(version.split('.')[2]) < 8) {
          this.error(`Unsafe RSC implementation in server graph: ${version}`);
        }
        checked++;
      }
      if (!checked) this.error('RSC implementation missing from server graph; cannot verify safety.');
      this.info(`Verified ${checked} RSC modules from patched packages.`);
    },
  };
}
