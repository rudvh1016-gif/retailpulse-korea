import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonDateMembership} from '../lib/comparison-date-membership';
test('comparison dates retain gaps and normalize unordered duplicate membership',()=>{
 assert.equal(comparisonDateMembership(['2026-09-10','2026-09-05','2026-09-06','2026-09-08','2026-09-06']),'9/5 ~ 9/6, 9/8, 9/10');
 assert.equal(comparisonDateMembership(['2026-09-05','2026-09-06','2026-09-07']),'9/5 ~ 9/7');
});
test('comparison dates distinguish empty, invalid, leap-day and cross-year membership',()=>{
 assert.equal(comparisonDateMembership([]),'');
 assert.equal(comparisonDateMembership(['2026-02-29']),null);
 assert.equal(comparisonDateMembership(['2026-13-01']),null);
 assert.equal(comparisonDateMembership(['2024-02-28','2024-02-29','2024-03-01']),'2/28 ~ 3/1');
 assert.equal(comparisonDateMembership(['2025-12-31','2026-01-01'],true),'2025/12/31 ~ 2026/1/1');
});
