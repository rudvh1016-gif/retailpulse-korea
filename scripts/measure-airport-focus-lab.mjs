/** Deterministic frontend lab only: public captured data, no live D1/provider calls. */
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {analyticsOptOutState,GOOGLE_TAG_BLOCK_ARGS} from './analytics-opt-out.mjs';
import {loadLabNoticeDismissal} from './airport-lab-notice-state.mjs';
import {installAirportLabObservers,collectAirportLabMeasurement} from './airport-lab-observers.mjs';
const [url,output,label,noticeStateModule]=process.argv.slice(2);
if(!url||!output||!['BEFORE','AFTER'].includes(label))throw Error('Usage: URL OUTPUT BEFORE|AFTER [MEASURED_NOTICE_STATE_MODULE]');
const noticeDismissedState=await loadLabNoticeDismissal(noticeStateModule);
const fixture=async name=>JSON.parse(await readFile(new URL(`../e2e/fixtures/airport-focus/${name}.json`,import.meta.url),'utf8'));
const summary=await fixture('summary'),flights=await fixture('flights'),months=await fixture('months'),stats=await fixture('passenger-stats');
const clock={mode:'live-summary',todayKst:summary.todayKst,serviceDateKst:summary.todayKst,generatedAt:summary.generatedAt,dayRelation:'TODAY',areas:{},airport:{},sources:[]};
const browser=await chromium.launch({args:GOOGLE_TAG_BLOCK_ARGS}),results=[];
for(const width of [390,1440])for(let run=1;run<=3;run++){
 const mobile=width===390,context=await browser.newContext({storageState:noticeDismissedState(url,analyticsOptOutState(url)),viewport:{width,height:mobile?844:1000},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
 const page=await context.newPage(),cdp=await context.newCDPSession(page),errors=[];
 await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:mobile?150:20,downloadThroughput:mobile?200000:2500000,uploadThroughput:mobile?93750:1250000});
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:mobile?4:1});
 await page.route('**/api/**',r=>r.fulfill({status:503,json:{status:'LAB_UNAVAILABLE'}}));
 for(const [path,json]of [['flights',flights],['airport-months',months],['airport-passenger-stats',stats]])await page.route(`**/api/live/${path}*`,r=>r.fulfill({json}));
 await page.route('**/api/live/summary*',r=>r.fulfill({json:new URL(r.request().url()).searchParams.get('date')?summary:clock}));
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(installAirportLabObservers);
 await page.goto(`${url}?date=2026-10-19`,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForTimeout(10000);
 const measured=await page.evaluate(collectAirportLabMeasurement);
 results.push({width,run,...measured,errors});await context.close();
}
await browser.close();await mkdir(new URL('.',`file://${output}`).pathname,{recursive:true});
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const summaries=[390,1440].map(width=>{const rows=results.filter(r=>r.width===width);const total=r=>r.resources.reduce((n,x)=>n+x.bytes,0)+(r.navigation??0);const images=r=>r.resources.filter(x=>/\.(webp|png|jpe?g|svg)(\?|$)/i.test(x.url)).reduce((n,x)=>n+x.bytes,0);return {width,lcpMs:median(rows.map(r=>r.lcp??NaN)),fcpMs:median(rows.map(r=>r.fcp??NaN)),cls:median(rows.map(r=>r.cls)),observedBlockingMs:median(rows.map(r=>r.blockingMs)),initialTransferBytes:median(rows.map(total)),imageTransferBytes:median(rows.map(images)),valid:rows.every(r=>r.hydrated&&r.noticeOpen===false&&!r.overflow&&!r.errors.length&&r.lcp!==null&&r.fcp!==null&&total(r)>0&&r.resources.length>0),lcpElements:[...new Set(rows.map(r=>r.lcpElement))]};});
const report={label,sourceDate:'2026-10-19',method:'Three cold browser contexts per width; same captured API data; production build; 10s after DOMContentLoaded. Mobile 390x844: 4x CPU, 150ms RTT, 1.6Mbps. Desktop 1440x1000: 1x CPU, 20ms RTT, 20Mbps. No live backend latency or real-user data. Observed blocking time is not Lighthouse TBT. LCP elements may differ after layout changes.',summaries,results};
await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({label,summaries}));
if(summaries.some(r=>!r.valid))process.exitCode=1;
