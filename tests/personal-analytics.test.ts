import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {safeAnalyticsParams,safeAnalyticsPath,validMeasurementId,trackPersonalEvent} from '../lib/personal-analytics';
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
    globalThis.window={location:{origin:'https://koretaildata.com',href:'https://koretaildata.com/?email=private'}};
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
    assert.equal(commands.find(x=>x[0]==='event')[2].page_location,'https://koretaildata.com');
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
for (const [value, marked] of [['true', true], ['false', false], ['internal', false], [null, false], ['throws', false]] as const) test(`operator marker ${value} is strictly opt-in and does not override consent`, () => {
  const script = `
    import assert from 'node:assert/strict';
    process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID='G-TEST1234';
    process.env.NEXT_PUBLIC_GA4_ENABLED='true';
    const scripts=[];
    globalThis.window={location:{origin:'https://koretaildata.com'},sessionStorage:{getItem:key=>{
      assert.equal(key,'koretail-analytics-operator-v1');
      if (${JSON.stringify(value)}==='throws') throw new Error('storage blocked');
      return ${JSON.stringify(value)};
    }}};
    globalThis.document={createElement:()=>({dataset:{}}),head:{append:s=>scripts.push(s)}};
    const {setAnalyticsConsent,trackPageView,trackPersonalEvent}=await import('./lib/personal-analytics.ts');
    setAnalyticsConsent(false); trackPageView('/ko'); trackPersonalEvent('briefing_viewed');
    assert.equal(scripts.length,0);
    setAnalyticsConsent(true); trackPageView('/ko'); trackPersonalEvent('briefing_viewed');
    const config=window.dataLayer.map(x=>Array.from(x)).find(x=>x[0]==='config')[2];
    assert.equal(config.traffic_type,${marked ? "'internal'" : 'undefined'});
    assert.equal(scripts.length,1);
    setAnalyticsConsent(false);
    const count=window.dataLayer.length;
    trackPageView('/ko/more'); trackPersonalEvent('briefing_viewed');
    assert.equal(window.dataLayer.length,count);
  `;
  const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',script],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
for(const enabled of [undefined,'false']) test(`measurement ID alone cannot enable collection (${enabled})`,()=>{
  const script=`
    import assert from 'node:assert/strict';
    globalThis.window={location:{origin:'https://koretaildata.com'}};
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
    globalThis.window={location:{origin:'https://koretaildata.com',href:'https://koretaildata.com/ko?email=private#private'}};
    globalThis.document={createElement:()=>({dataset:{}}),head:{append:s=>scripts.push(s)}};
    const {setAnalyticsConsent,trackPageView,safeAnalyticsPath}=await import('./lib/personal-analytics.ts');
    const views=()=> (window.dataLayer??[]).map(x=>Array.from(x)).filter(x=>x[0]==='event'&&x[1]==='page_view');
    trackPageView('/ko'); assert.equal(views().length,0); assert.equal(scripts.length,0);
    setAnalyticsConsent(false);trackPageView('/ko');assert.equal(views().length,0);
    setAnalyticsConsent(true);trackPageView('/ko');trackPageView('/ko');
    assert.equal(views().length,1);
    assert.equal(views()[0][2].page_location,'https://koretaildata.com/ko');
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

test('new public airport routes are allowlisted in all locales without accepting arbitrary path data', () => {
  for (const locale of ['ko','en','zh','ja']) {
    for (const slug of ['airport-countries','airport-prepare']) {
      const path = `/${locale}/${slug}`;
      assert.equal(safeAnalyticsPath(path),path);
      assert.equal(safeAnalyticsPath(`${path}/`),path);
      for (const suffix of ['?email=private','#private','/private','-private','//','%2Fprivate']) {
        assert.equal(safeAnalyticsPath(`${path}${suffix}`),null);
      }
    }
    assert.equal(safeAnalyticsPath(`/${locale}/private`),null);
  }
  for (const path of ['/fr/airport-countries','/de/airport-prepare','/airport-countries','/api/airport-prepare','//ko/airport-countries']) {
    assert.equal(safeAnalyticsPath(path),null);
  }
});

for (const origin of [
  'http://localhost:3000', 'https://localhost:3000', 'http://127.0.0.1:3000',
  'http://[::1]:3000', 'https://preview.koretail.workers.dev',
  'https://preview.koretail.pages.dev', 'https://example.invalid',
  'http://koretaildata.com', 'https://www.koretaildata.com',
  'https://koretaildata.com:3000', 'https://koretaildata.com.evil.invalid',
  'https://koretaildata.com.',
]) test(`production analytics never loads or sends from ${origin}`, () => {
  const script = `
    import assert from 'node:assert/strict';
    process.env.NEXT_PUBLIC_GA4_ENABLED='true';
    process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID='G-TEST1234';
    // Even a production canonical build setting cannot authorize a preview.
    process.env.NEXT_PUBLIC_SITE_ORIGIN='https://koretaildata.com';
    const commands=[];
    globalThis.window={location:new URL(${JSON.stringify(origin)}),gtag:(...args)=>commands.push(args)};
    globalThis.document={createElement:()=>{throw new Error('must not load a tag');}};
    const {setAnalyticsConsent,trackPersonalEvent,trackPageView}=await import('./lib/personal-analytics.ts');
    trackPersonalEvent('briefing_viewed');
    setAnalyticsConsent(true);
    for(const locale of ['ko','en','zh','ja']) for(const slug of ['airport','airport-countries','airport-prepare']) trackPageView('/'+locale+'/'+slug);
    trackPersonalEvent('briefing_viewed');
    setAnalyticsConsent(false);
    setAnalyticsConsent(true);
    assert.equal(window.dataLayer,undefined);
    assert.deepEqual(commands,[]);
  `;
  const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',script],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});

test('canonical HTTPS collection preserves all locales, privacy defaults and one tag', () => {
  const script = `
    import assert from 'node:assert/strict';
    process.env.NEXT_PUBLIC_GA4_ENABLED='true';
    process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID='G-TEST1234';
    const scripts=[];
    globalThis.window={location:new URL('https://koretaildata.com:443/ko?email=private#private')};
    globalThis.document={createElement:()=>({dataset:{}}),head:{append:s=>scripts.push(s)}};
    const {setAnalyticsConsent,trackPageView,trackPersonalEvent}=await import('./lib/personal-analytics.ts');
    setAnalyticsConsent(true);
    const publicPaths=['ko','en','zh','ja'].flatMap(l=>['airport','airport-countries','airport-prepare'].map(s=>'/'+l+'/'+s));
    for(const path of publicPaths) {
      trackPageView(path);
      trackPageView(path);
      trackPageView(path+'/');
    }
    for(const path of publicPaths) {
      for(const suffix of ['?email=private','#private','/private','-private']) trackPageView(path+suffix);
    }
    const commands=window.dataLayer.map(x=>Array.from(x));
    const views=commands.filter(x=>x[0]==='event'&&x[1]==='page_view');
    assert.deepEqual(views.map(x=>x[2].page_location),publicPaths.map(path=>'https://koretaildata.com'+path));
    assert.equal(scripts.length,1);
    assert.deepEqual(commands.find(x=>x[0]==='consent')[2],{
      analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'
    });
    assert.equal(commands.find(x=>x[0]==='config')[2].send_page_view,false);
    assert.ok(!JSON.stringify(commands).includes('private'));
    // Check the guard on sends as well as first initialization.
    window.location=new URL('https://preview.koretail.workers.dev');
    const count=window.dataLayer.length;
    trackPageView('/ko/more');
    trackPersonalEvent('briefing_viewed');
    setAnalyticsConsent(false);
    setAnalyticsConsent(true);
    assert.equal(window.dataLayer.length,count);
    assert.equal(scripts.length,1);
  `;
  const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',script],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
