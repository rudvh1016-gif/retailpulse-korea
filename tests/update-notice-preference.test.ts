import test from 'node:test';
import assert from 'node:assert/strict';
import {noticeDeadline,NOTICE_WEEK_MS,UPDATE_NOTICE_SESSION_KEY,UPDATE_NOTICE_UNTIL_KEY} from '../lib/update-notice-preference';
import {noticeDismissedState} from '../scripts/update-notice-test-state.mjs';
test('notice expires at the exact clicked instant plus seven days',()=>{
 const clicked=Date.UTC(2026,9,19,2,23,45,123),until=String(clicked+NOTICE_WEEK_MS);
 assert.equal(NOTICE_WEEK_MS,604800000);
 assert.equal(noticeDeadline(until,clicked),clicked+604800000);
 assert.equal(noticeDeadline(until,clicked+604799999),clicked+604800000);
 assert.equal(noticeDeadline(until,clicked+604800000),null);
});
test('invalid preferences cannot break first display and keys are isolated',()=>{
 for(const value of [null,'','bad','NaN','-1','Infinity','1.5','9007199254740992'])assert.equal(noticeDeadline(value,100),null);
 assert.notEqual(UPDATE_NOTICE_SESSION_KEY,UPDATE_NOTICE_UNTIL_KEY);
 assert.match(UPDATE_NOTICE_SESSION_KEY,/airport-period-20261028-v1/);
 assert.notEqual(UPDATE_NOTICE_SESSION_KEY,'koretail-notice:airport-comparison-20261019-v1:closed');
 assert.notEqual(UPDATE_NOTICE_UNTIL_KEY,'koretail-notice:airport-comparison-20261019-v1:until');
 assert.doesNotMatch(UPDATE_NOTICE_UNTIL_KEY,/analytics-consent|airport-scope/);
});
test('returning-reader test state preserves analytics choice and uses the actual notice key',()=>{
 const state={cookies:[],origins:[{origin:'https://example.org',localStorage:[{name:'koretail-analytics-consent-v1',value:'false'}]}]};
 const result=noticeDismissedState('https://example.org',state);
 assert.equal(state.origins[0].localStorage.length,1);
 assert.deepEqual(result.origins[0].localStorage[0],state.origins[0].localStorage[0]);
 assert.equal(result.origins[0].localStorage[1].name,UPDATE_NOTICE_UNTIL_KEY);
});
