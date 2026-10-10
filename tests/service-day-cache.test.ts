import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serviceDayCacheControl} from '../lib/service-day-cache';
test('fresh and stale windows both expire by KST midnight',()=>{
 const cache='public, max-age=120, stale-while-revalidate=600';
 assert.equal(serviceDayCacheControl(cache,'2026-10-09T23:59:50+09:00'),'public, max-age=10, stale-while-revalidate=0');
 assert.equal(serviceDayCacheControl(cache,'2026-10-09T23:55:00+09:00'),'public, max-age=120, stale-while-revalidate=180');
 for(const at of ['2026-10-10T00:02:00+09:00','2026-10-10T01:00:00+09:00','2026-10-10T01:02:00+09:00'])assert.equal(serviceDayCacheControl(cache,at),cache);
 assert.equal(serviceDayCacheControl('no-store','2026-10-09T23:59:50+09:00'),'no-store');
});
