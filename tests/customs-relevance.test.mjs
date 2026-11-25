import test from 'node:test';
import assert from 'node:assert/strict';
import {airportCustomsScope} from '../lib/customs-news-collector.ts';
test('airport agency recruitment and routine procurement are not retail customs news',()=>{
 for(const title of [
  '2026년도 제3회 인천공항세관 공무직근로자(청소원) 채용 서류전형 합격자 공고 및 면접시험 안내',
  '인천공항세관 청소 용역 입찰 공고','인천공항 전산장비 구매 견적 공고',
  '면세점 공무직 채용 합격자 공고'
 ])assert.equal(airportCustomsScope(title),'unclassified',title);
});
test('duty-free concession and passenger customs guidance remain relevant',()=>{
 for(const title of [
  '인천국제공항 출국장면세점 특허심사 순서 공고','보세판매장 특허갱신 평가기준 적용 시점 공고',
  '출국장 면세점 사업자 선정 입찰 공고','여행자 휴대품 면세범위 안내','인천공항세관 휴대품 통관 안내'
 ])assert.equal(airportCustomsScope(title),'customs',title);
});
