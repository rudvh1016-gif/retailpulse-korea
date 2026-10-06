import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getPassengerGuideCopy,passengerGuideCopy} from '../app/passenger-guide-copy';
import type {Lang} from '../app/retailpulse-data';

test('unknown guide locale falls back to readable English',()=>{
 assert.equal(getPassengerGuideCopy('unsupported' as Lang),passengerGuideCopy.en);
 for(const lang of ['ko','en','zh','ja'] as const){const c=getPassengerGuideCopy(lang);assert.equal(c.titles.length,5);assert.equal(c.sentences.length,5);assert.ok(c.eligibility&&c.learning);}
});
test('seven shipped assets are real WebP files totaling the approved 37496 bytes',()=>{
 let bytes=0;for(const name of ['terminal','checkin','security','immigration','boarding','refund_register','refund_receive']){
  const file=readFileSync(new URL(`../public/passenger-guide/v1/${name}-128.webp`,import.meta.url));
  assert.equal(file.toString('ascii',0,4),'RIFF');assert.equal(file.toString('ascii',8,12),'WEBP');assert.equal(file.readUInt32LE(4)+8,file.length);bytes+=file.length;
 }assert.equal(bytes,37496);
});
