import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('public/shopping-report/index.html', 'utf8');
const script = readFileSync('public/shopping-report/report.js', 'utf8');
const data = JSON.parse(readFileSync('data/shopping-briefing-panpan-2026.json', 'utf8'));

test('shopping report preserves source periods and separates survey, card index and store composition', () => {
  for (const source of ['bcIdx=311046', 'https://knto.or.kr/pressRelease/549938', 'https://www.data.go.kr/data/15084726/fileData.do']) assert.ok(html.includes(source));
  for (const fact of ['2026년 2분기', '조사 4–6월', '잠정치', '2025년 1~9월 / 2024년 같은 기간', '상대 지수', '매출 구성비', '전월 차이(%p)', '분모·표본수']) assert.ok(html.includes(fact), fact);
  assert.ok(!html.includes('bcIdx=310767'), 'restricted 2025 final report is not repackaged');
  for (const forbidden of ['미확보', '로컬 시안', '제작 상황', '인천공항 전체 매출 1위']) assert.ok(!html.includes(forbidden));
  assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|setInterval/);
  assert.equal((html.match(/class="store-overview"/g) ?? []).length, 6);
});

test('monthly gate identity and composition remain complete without manufacturing revenue changes', () => {
  assert.equal(data.stores.length, 6);
  assert.equal(data.categories.length, 5);
  assert.equal(data.values.length, 9);
  for (const month of data.values) for (const store of month) {
    assert.equal(store.length, 5);
    assert.ok(store.every(value => Number.isFinite(value) && value >= 0 && value <= 100));
    assert.ok(Math.abs(store.reduce((a, b) => a + b, 0) - 100) < 0.21);
  }
  assert.equal(Number((data.values[8][0][3] - data.values[7][0][3]).toFixed(1)), -3.5);
  assert.equal(Number((data.values[8][3][0] - data.values[7][3][0]).toFixed(1)), 1.5);
  assert.ok(html.includes('실제 건수·매출액이 아닌 기준지수'));
});
