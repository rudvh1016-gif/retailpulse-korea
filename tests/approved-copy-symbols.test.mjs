import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Seoul no-quieter copy states current grade and limits the comparison to published future forecasts',()=>{
 const source=readFileSync(new URL('../app/seoul-comparison.tsx',import.meta.url),'utf8');
 assert.ok(source.includes("currentFresh=freshGlanceObservation(current,now,refreshing)"));
 assert.ok(source.includes("{currentFresh&&<p>"));
 assert.ok(source.includes("현재 제공된 예상에서는 지금이 가장 덜 붐벼요."));
 assert.ok(source.includes("sameLevel&&<>"));
 assert.ok(source.includes("같은 혼잡 단계의 시간도 있어요."));
 assert.ok(source.includes("공식 혼잡 단계로 제공된 향후 예상만 비교해요."));
 assert.ok(source.includes("!currentFresh?t(lang,'최신 혼잡 관측이 없어"));
 assert.ok(!source.includes('제공된 예상 중 지금보다 덜 붐빌 시간 없음'));
 assert.ok(!source.includes('오늘 하루 중 가장 덜 붐빔'));
});

test('passenger arithmetic operators are gated by the validated reference sum and retain dynamic values',()=>{
 const source=readFileSync(new URL('../app/airport-glance-preview.tsx',import.meta.url),'utf8');
 for(const operator of ['+','=']) assert.ok(source.includes(`{referenceSum&&<span className="glance-sum-operator">${operator} </span>}`));
 for(const value of ['forecastPassengers','transferPassengers','referenceSum.total']) assert.ok(source.includes(`integer.format(${value})`));
 assert.ok(source.includes('passengerReferenceCopy.arithmeticNote[lang]'));
 assert.ok(!source.includes('47,917'));
});
