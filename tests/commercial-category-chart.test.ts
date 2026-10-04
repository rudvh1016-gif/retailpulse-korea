import assert from 'node:assert/strict';
import test from 'node:test';
import type {CategoryActivity} from '../lib/seoul-context';
import {commercialChartAxes,commercialPrismRange,publishedAmountRange,publishedPaymentCount} from '../lib/commercial-category-chart';
const row=(overrides:Partial<CategoryActivity>={}):CategoryActivity=>({group:'음식·음료',category:'한식',level:'분주한',payments:2,amountMin:100,amountMax:300,...overrides});

test('zero payments and zero amount are published values, while withheld values remain missing',()=>{
 assert.equal(publishedPaymentCount(0),0);assert.equal(publishedPaymentCount(null),null);
 assert.deepEqual(publishedAmountRange(0,0),[0,0]);assert.equal(publishedAmountRange(null,100),null);
 for(const value of [-1,1.5,NaN,Infinity])assert.equal(publishedPaymentCount(value),null);
 for(const [min,max] of [[200,100],[-1,100],[0,Infinity],[NaN,100]])assert.equal(publishedAmountRange(min,max),null);
});
test('the full category list determines the common axis, including rows hidden by the initial disclosure',()=>{
 const rows=[row(),row({payments:1}),row({payments:null}),row({payments:20,amountMax:400})];
 const axes=commercialChartAxes(rows);
 assert.deepEqual(axes,{payments:20,amount:400,hasPayments:true,hasAmounts:true});
 assert.deepEqual(commercialPrismRange(rows[0],'payments',axes),{lower:10,upper:10,zero:false});
 assert.deepEqual(commercialPrismRange(rows[0],'amount',axes),{lower:25,upper:75,zero:false});
});
test('changing an ordinal grade never changes either metric geometry',()=>{
 const axes=commercialChartAxes([row({payments:20,amountMax:400})]);
 for(const metric of ['amount','payments'] as const)assert.deepEqual(commercialPrismRange(row({level:'한산한'}),metric,axes),commercialPrismRange(row({level:'분주한'}),metric,axes));
});
test('all-zero, all-missing and partial ranges remain distinguishable',()=>{
 const zero=row({payments:0,amountMin:0,amountMax:0}),missing=row({payments:null,amountMin:null,amountMax:null});
 const zeroAxes=commercialChartAxes([zero]),missingAxes=commercialChartAxes([missing]);
 assert.equal(zeroAxes.hasPayments,true);assert.equal(zeroAxes.hasAmounts,true);
 assert.equal(missingAxes.hasPayments,false);assert.equal(missingAxes.hasAmounts,false);
 assert.deepEqual(commercialPrismRange(zero,'payments',zeroAxes),{lower:0,upper:0,zero:true});
 assert.equal(commercialPrismRange(missing,'payments',zeroAxes),null);
 assert.equal(commercialPrismRange(row({amountMin:null,amountMax:500}),'amount',zeroAxes),null);
 const partialAxes=commercialChartAxes([row(),row({amountMin:null,amountMax:500})]);
 assert.equal(partialAxes.amount,500);
 assert.deepEqual(commercialPrismRange(row(),'amount',partialAxes),{lower:20,upper:60,zero:false});
});
test('new categories and new API values recompute the axis without a fixed top-five or pre-render limit',()=>{
 const rows=Array.from({length:31},(_,i)=>row({category:`업종 ${i}`,payments:i,amountMin:i*10,amountMax:i*10+5}));
 const axes=commercialChartAxes(rows);
 assert.equal(axes.payments,30);assert.equal(axes.amount,305);
 assert.equal(commercialPrismRange(rows[30],'payments',axes)?.upper,100);
 rows[30]=row({category:'새 업종',payments:60,amountMin:500,amountMax:600});
 const next=commercialChartAxes(rows);
 assert.equal(next.payments,60);assert.equal(next.amount,600);
 assert.equal(commercialPrismRange(rows[15],'payments',next)?.upper,25);
});
test('geometry rejects an invalid or smaller external axis instead of silently clipping the published maximum',()=>{
 const axes=commercialChartAxes([row()]);
 assert.equal(commercialPrismRange(row(),'amount',{...axes,amount:200}),null);
 assert.equal(commercialPrismRange(row(),'amount',{...axes,amount:NaN}),null);
});
