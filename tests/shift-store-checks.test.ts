import assert from 'node:assert/strict';
import test from 'node:test';
import {buildShiftStoreChecks} from '../lib/shift-store-checks';

test('fashion stock checks explain saleable-stock FIFO and retain three steps in every locale',()=>{
 for(const [lang,term] of [['ko','선입선출'],['en','first-in, first-out'],['zh','先进先出'],['ja','先入れ先出し']] as const){
  const [stock,offer]=buildShiftStoreChecks('fashion',lang);
  assert.equal(stock.id,'display-stock');assert.equal(stock.details.length,3);
  assert.ok(stock.summary.includes(term));assert.ok(stock.details[0].includes(term));
  assert.equal(offer.id,'price-offer');
 }
 const [stock]=buildShiftStoreChecks('fashion','ko');
 assert.match(stock.details[0],/예약·불량 등 판매 제외/);
 assert.match(stock.details[0],/먼저 입고된 판매 가능 상품부터 진열·판매/);
 assert.match(stock.details[2],/기존 상품을 먼저 판매할 수 있도록/);
 assert.match(stock.details[2],/선입선출 점검·보충·포장 담당/);
});
