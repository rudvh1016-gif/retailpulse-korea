import test from 'node:test';
import assert from 'node:assert/strict';
import {desktopCountryLimit} from '../app/use-desktop-country-limit';
test('desktop country display uses measured rows with a bounded prefix, not flight arithmetic',()=>{
 assert.equal(desktopCountryLimit(300,30,false),20);
 assert.equal(desktopCountryLimit(300,30,true),19);
 assert.equal(desktopCountryLimit(900,30,false),24);
 assert.equal(desktopCountryLimit(30,30,true),6);
 for(const value of [NaN,Infinity,-Infinity])assert.equal(desktopCountryLimit(value,30,false),6);
 assert.equal(desktopCountryLimit(300,0,false),6);
});
