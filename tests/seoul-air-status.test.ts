import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSeoulContext,seoulAirReading} from '../lib/seoul-context';
for(const grade of ['점검중','점검 중','미제공','미수신'])for(const value of [0,35])test(`${grade} masks ${value} in raw and stored readings`,()=>{
 assert.equal(seoulAirReading(value,grade).value,null);
 const context=normalizeSeoulContext({WEATHER_STTS:[{WEATHER_TIME:'2026-10-13 19:20',PM10:String(value),PM10_INDEX:grade,PM25:'0',PM25_INDEX:'좋음'}]});
 assert.equal(context.weather?.pm10,null);assert.equal(context.weather?.pm10Grade,grade);assert.equal(context.weather?.pm25,0);
});
test('valid zero and empty concentrations remain distinct',()=>{
 assert.equal(seoulAirReading(0,'좋음').value,0);assert.equal(seoulAirReading('0','보통').value,0);
 for(const value of ['',null,undefined,'*','-'])assert.equal(seoulAirReading(value,'좋음').value,null);
});
