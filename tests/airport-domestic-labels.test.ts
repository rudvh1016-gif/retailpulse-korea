import test from 'node:test';import assert from 'node:assert/strict';
import {domesticFlightKind} from '../lib/airport-domestic-labels';
import {destinationOf} from '../lib/airport-destinations';
const kind=(flightNumber:string,destination:string)=>domesticFlightKind({flightNumber,destination:destinationOf(destination)});
test('verified domestic-transit examples require both the flight number and actual destination',()=>{
 for(const flight of ['KE1401','KE1403','KE1405','KE1407','KE1409'])assert.equal(kind(flight,'PUS'),'transit');
 assert.equal(kind('KE1431','대구'),'transit');assert.equal(kind('ke 1401','김해'),'transit');
 assert.equal(kind('KE1401','TAE'),'domestic');assert.equal(kind('KE1431','PUS'),'domestic');
});
test('other KR flights and unknown routes are never generalized as transit-only',()=>{
 for(const [number,destination]of[['7C167','CJU'],['KE1401','CJU'],['KE9999','PUS'],['XX1401','PUS']])assert.equal(kind(number,destination),'domestic');
 assert.equal(kind('KE1401','NRT'),null);assert.equal(kind('KE1401','not-mapped'),null);
});
