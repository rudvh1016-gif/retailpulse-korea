import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

for (const reference of [false, true]) test(`initial HTML references cannot prove analytics collection: ${reference}`, () => {
  const script = `
    import assert from 'node:assert/strict';
    const calls=[];
    globalThis.fetch=async input=>{
      const url=new URL(input);calls.push(url.href);
      assert.equal(url.origin,'https://example.invalid');
      assert.ok(['/ko','/robots.txt','/sitemap.xml'].includes(url.pathname));
      const html=${JSON.stringify(reference ? '<script src="https://www.googletagmanager.com/gtag/js?id=G-TEST1234"></script>' : '<html><body>Consent required</body></html>')};
      return new Response(url.pathname==='/ko'?html:'',{status:200,headers:${JSON.stringify(reference ? {'content-security-policy':"img-src https://static.cloudflareinsights.com"} : {})}});
    };
    process.argv.push('--origin=https://example.invalid');
    await import('./scripts/check-analytics.ts');
    assert.equal(calls.length,3);
  `;
  const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',script],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,new RegExp(`INITIAL_HTML: ${reference?'REFERENCES_PRESENT':'NO_REFERENCES_FOUND'}`));
  assert.match(result.stdout,/HYDRATED_OR_CONSENT_GATED_COLLECTION: UNKNOWN/);
  assert.match(result.stdout,/GA4_ACCOUNT_RECEIPT: UNKNOWN/);
  assert.doesNotMatch(result.stdout,/nothing is measuring|something is already measuring|host allowed: YES|needs no code change/);
});
