import {defineConfig,devices} from '@playwright/test';
process.env.TRAVEL_STANDALONE='true';
export default defineConfig({
 testDir:'../../e2e',testMatch:'travel-records-deletion.spec.ts',timeout:30_000,expect:{timeout:8_000},workers:2,
 outputDir:'../../test-results/travel-client',reporter:'list',
 use:{baseURL:'http://127.0.0.1:4187',...devices['Desktop Chrome'],...(process.env.TRAVEL_CHROME_CHANNEL?{channel:'chrome'}:{}),screenshot:'only-on-failure'},
 webServer:{command:'node node_modules/vite/bin/vite.js preview --config native/travel-client/vite.config.mjs --host 127.0.0.1 --port 4187 --strictPort',url:'http://127.0.0.1:4187',cwd:'../..',reuseExistingServer:!process.env.CI},
});
