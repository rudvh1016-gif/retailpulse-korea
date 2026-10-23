import assert from 'node:assert/strict';
import test from 'node:test';
import {groupShare,groupShareDisplay} from '../lib/airport-departure-map-copy';

test('map share display rounds raw percentages, retaining calculation precision and missing denominators',()=>{
 const group=(flights:number)=>({group:'JP' as const,flights,bySide:{EAST:0,WEST:0,CENTER:0,UNVERIFIED:0},concourse:0});
 assert.equal(groupShare(group(1),3),33.3);
 assert.equal(groupShareDisplay(group(1),3),'33');
 assert.equal(groupShareDisplay(group(1),8),'13');
 assert.equal(groupShareDisplay(group(1249),10000),'12'); // Do not double-round 12.49 via old 12.5.
 assert.equal(groupShareDisplay(group(1250),10000),'13');
 assert.equal(groupShareDisplay(group(0),3),'0');
 assert.equal(groupShareDisplay(group(0),0),null);
});
