import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {panpanMonthlyRows,renderPanpanMonthlySummary} from '../scripts/panpan-monthly-summary.mjs';

const html = readFileSync('public/shopping-report/index.html', 'utf8');
const script = readFileSync('public/shopping-report/report.js', 'utf8');
const data = JSON.parse(readFileSync('data/shopping-briefing-panpan-2026.json', 'utf8'));

test('the bottom monthly summary covers all six stores using the same category and original month values',()=>{
 const rows=panpanMonthlyRows(data);
 assert.deepEqual(rows.map(row=>row.store),data.stores);
 for(const [index,row] of rows.entries()){
  const category=data.categories.indexOf(row.category);
  assert.equal(row.before,data.values[7][index][category]);
  assert.equal(row.after,data.values[8][index][category]);
  assert.equal(row.after,Math.max(...data.values[8][index]));
  assert.equal(row.delta,Number((row.after-row.before).toFixed(1)));
 }
 const summary=renderPanpanMonthlySummary(data);
 assert.ok(html.includes(summary));
 assert.match(html,/<section id="source"[\s\S]*<section id="monthly-mix"[\s\S]*<\/section><\/main>/);
 assert.equal((summary.match(/class="monthly-summary-store"/g)||[]).length,6);
 const missing=structuredClone(data);missing.values[7][1][3]=null;
 assert.equal(panpanMonthlyRows(missing)[1].available,false);
 assert.match(renderPanpanMonthlySummary(missing),/전월 비교 자료 없음/);
 assert.doesNotMatch(renderPanpanMonthlySummary(missing),/NaN|undefined|null/);
});

test('shopping report preserves source periods and separates survey, card index and store composition', () => {
  for (const source of ['bcIdx=311046', 'https://knto.or.kr/pressRelease/549938', 'https://www.data.go.kr/data/15084726/fileData.do']) assert.ok(html.includes(source));
  for (const fact of ['2026년 2분기', '조사 4–6월', '잠정치', '2025년 1~9월 / 2024년 같은 기간', '상대 지수', '매출 구성비', '전월 차이(%p)', '분모·표본수']) assert.ok(html.includes(fact), fact);
  assert.ok(!html.includes('bcIdx=310767'), 'restricted 2025 final report is not repackaged');
  for (const forbidden of ['로컬 시안', '제작 상황', '인천공항 전체 매출 1위']) assert.ok(!html.includes(forbidden));
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

test('all thirty store comparisons match disclosed August and September composition', () => {
  const rows = [...html.matchAll(/class="mix-comparison"><span>([\d.]+)% → ([\d.]+)%<\/span><strong>([+−]?[\d.]+)%p<\/strong>/g)];
  assert.equal(rows.length, 30);
  rows.forEach((row, i) => {
    const store = Math.floor(i / 5), category = i % 5;
    assert.equal(Number(row[1]), data.values[7][store][category]);
    assert.equal(Number(row[2]), data.values[8][store][category]);
    assert.equal(Number(row[3].replace('−', '-')), Number((Number(row[2]) - Number(row[1])).toFixed(1)));
  });
});

test('three-year card view preserves historical indices and leaves 2026 unknown', () => {
  const coverage = JSON.parse(readFileSync('data/shopping-card-year-coverage-2026.json', 'utf8'));
  assert.deepEqual(coverage.focusYears, [2025, 2026]);
  assert.equal(coverage.series.length, 6);
  for (const row of coverage.series) {
    assert.equal(row.indices['2024'], 100);
    assert.equal(row.indices['2025'], Number((100 + row.growth2025Vs2024Percent).toFixed(1)));
    assert.equal(row.indices['2026'], null);
  }
  assert.equal((html.match(/class="index-bar-row missing-year-row"/g) ?? []).length, 6);
  assert.doesNotMatch(html, /class="bar26"/);
  const outsideCard = html.replace(/<section id="card-trends"[\s\S]*?<\/section>/, '');
  assert.ok(!outsideCard.includes('미확보'), 'unavailable wording is restricted to the owner-requested 2026 comparison');
  assert.equal(coverage.excludedAlternative.metric, 'spending amount');
  assert.equal(coverage.revisionNotice.currentVersionRequiredForAmountComparisons, true);
});

test("latest spending uses the same-release nationwide amount pair without inventing 2024",()=>{const d=JSON.parse(readFileSync("data/shopping-tourism-card-spending-2026.json","utf8"));assert.equal(d.sameReleaseComparison[2024],null);assert.equal(d.sameReleaseComparison[2025],107940);assert.equal(d.sameReleaseComparison[2026],159416);assert.equal(d.monthly2026.reduce((a,b)=>a+b,0),159416);assert.equal(Math.round((159416/107940-1)*1000)/10,47.7);assert.ok(html.includes("온라인 소비 포함"));assert.ok(html.includes("pSeq=22790"));});
