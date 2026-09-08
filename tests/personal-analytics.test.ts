import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {safeAnalyticsParams,validMeasurementId,trackPersonalEvent} from '../lib/personal-analytics';
test('analytics accepts only public values and no arbitrary personal data',()=>{
  assert.deepEqual(safeAnalyticsParams({role:'manager',location:'airport',terminal:'T1',email:'secret@example.invalid',name:'private',company:'private',url:'?email=private',interests:['weather','private'],day:'invalid'}),{role:'manager',location:'airport',terminal:'T1',interests:'weather'});
  assert.equal(validMeasurementId(undefined),undefined);
  assert.equal(validMeasurementId('bad<script>'),undefined);
  assert.equal(validMeasurementId('G-XXXXXXXXXX'),undefined);
  assert.doesNotThrow(()=>trackPersonalEvent('onboarding_started'));
});
test('configured analytics stays silent until consent, then uses the Google tag queue and stops on withdrawal',()=>{
  const script = `
    import assert from 'node:assert/strict';
    process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID='G-TEST1234';
    process.env.NEXT_PUBLIC_GA4_ENABLED='true';
    const scripts=[];
    globalThis.window={location:{origin:'https://example.invalid',href:'https://example.invalid/?email=private'}};
    globalThis.document={createElement:()=>({dataset:{}}),head:{append:s=>scripts.push(s)}};
    const {setAnalyticsConsent,trackPersonalEvent}=await import('./lib/personal-analytics.ts');
    trackPersonalEvent('briefing_viewed',{role:'manager',email:'private'});
    assert.equal(scripts.length,0);
    setAnalyticsConsent(true);
    assert.equal(scripts.length,1);
    let commands=window.dataLayer.map(x=>Array.from(x));
    assert.equal(commands.filter(x=>x[0]==='event').length,1);
    assert.equal(commands.find(x=>x[0]==='config')[2].send_page_view,false);
    assert.ok(!JSON.stringify(commands).includes('private'));
    setAnalyticsConsent(false);
    const length=window.dataLayer.length;
    trackPersonalEvent('briefing_helpful_yes');
    assert.equal(window.dataLayer.length,length);
    assert.equal(window['ga-disable-G-TEST1234'],true);
  `;
  const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',script],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
