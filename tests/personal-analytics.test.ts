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
    assert.equal(scripts[0].src,'https://www.googletagmanager.com/gtag/js?id=G-TEST1234');
    let commands=window.dataLayer.map(x=>Array.from(x));
    assert.equal(commands.filter(x=>x[0]==='event').length,1);
    assert.equal(commands.find(x=>x[0]==='config')[2].send_page_view,false);
    assert.equal(commands.find(x=>x[0]==='config')[2].allow_google_signals,false);
    assert.equal(commands.find(x=>x[0]==='event')[2].page_referrer,'');
    assert.equal(commands.find(x=>x[0]==='event')[2].page_location,'https://example.invalid');
    assert.equal(commands.find(x=>x[0]==='event')[2].send_to,'G-TEST1234');
    assert.ok(!JSON.stringify(commands).includes('private'));
    setAnalyticsConsent(true);
    assert.equal(scripts.length,1);
    const beforeUnknown=window.dataLayer.length;
    trackPersonalEvent('unapproved_event',{email:'private'});
    assert.equal(window.dataLayer.length,beforeUnknown);
    setAnalyticsConsent(false);
    const length=window.dataLayer.length;
    trackPersonalEvent('briefing_helpful_yes');
    assert.equal(window.dataLayer.length,length);
    assert.equal(window['ga-disable-G-TEST1234'],true);
  `;
  const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',script],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
for(const enabled of [undefined,'false']) test(`measurement ID alone cannot enable collection (${enabled})`,()=>{
  const script=`
    import assert from 'node:assert/strict';
    globalThis.window={location:{origin:'https://example.invalid'}};
    globalThis.document={createElement:()=>{throw new Error('must not load a tag');}};
    const {setAnalyticsConsent,trackPersonalEvent}=await import('./lib/personal-analytics.ts');
    setAnalyticsConsent(true);
    trackPersonalEvent('briefing_viewed');
    assert.equal(window.dataLayer,undefined);
  `;
  const env={...process.env,NEXT_PUBLIC_GA4_MEASUREMENT_ID:'G-TEST1234',NEXT_PUBLIC_GA4_ENABLED:enabled};
  const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',script],{encoding:'utf8',env});
  assert.equal(result.status,0,result.stderr);
});

test('manual page views require consent, follow safe routes, deduplicate rerenders and stop on withdrawal',()=>{
  const script = `
    import assert from 'node:assert/strict';
    process.env.NEXT_PUBLIC_GA4_ENABLED='true';
    process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID='G-TEST1234';
    const scripts=[];
    globalThis.window={location:{origin:'https://example.invalid',href:'https://example.invalid/ko?email=private#private'}};
    globalThis.document={createElement:()=>({dataset:{}}),head:{append:s=>scripts.push(s)}};
    const {setAnalyticsConsent,trackPageView,safeAnalyticsPath}=await import('./lib/personal-analytics.ts');
    const views=()=> (window.dataLayer??[]).map(x=>Array.from(x)).filter(x=>x[0]==='event'&&x[1]==='page_view');
    trackPageView('/ko'); assert.equal(views().length,0); assert.equal(scripts.length,0);
    setAnalyticsConsent(false);trackPageView('/ko');assert.equal(views().length,0);
    setAnalyticsConsent(true);trackPageView('/ko');trackPageView('/ko');
    assert.equal(views().length,1);
    assert.equal(views()[0][2].page_location,'https://example.invalid/ko');
    trackPageView('/ko/airport');trackPageView('/ko');
    assert.equal(views().length,3);
    for(const path of ['/ko/private@example.invalid','/ko?email=private','/ko#private','/api/health','//evil.invalid','/ko/tourism-desk/private']) {
      assert.equal(safeAnalyticsPath(path),null);trackPageView(path);
    }
    assert.equal(views().length,3);
    for(const lang of ['ko','en','zh','ja']) assert.equal(safeAnalyticsPath('/'+lang+'/tourism-desk/hongdae'),'/'+lang+'/tourism-desk/hongdae');
    assert.ok(!JSON.stringify(window.dataLayer).includes('private'));
    setAnalyticsConsent(false);trackPageView('/ko/more');assert.equal(views().length,3);
    setAnalyticsConsent(true);trackPageView('/ko/more');trackPageView('/ko/more');assert.equal(views().length,4);
    assert.equal(scripts.length,1);
  `;
  const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',script],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
