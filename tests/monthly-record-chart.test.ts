import assert from 'node:assert/strict';
import test from 'node:test';
import { recordChartIndexAt, recordChartKeyIndex } from '../lib/monthly-record-chart';

test('pointer date slots match the existing SVG at desktop and narrow mobile widths', () => {
  for (const width of [264, 320, 880]) for (const days of [28, 29, 30, 31]) {
    for (let i = 0; i < days; i++) {
      const x = 4 + (i + .5) * 608 / days;
      assert.equal(recordChartIndexAt(20 + x / 620 * width, 20, width, days), i);
    }
    assert.equal(recordChartIndexAt(0, 20, width, days), 0);
    assert.equal(recordChartIndexAt(width + 100, 20, width, days), days - 1);
  }
});
test('invalid pointer geometry cannot select an invented date', () => {
  for (const args of [[0, 0, 0, 31], [0, 0, -1, 31], [NaN, 0, 100, 31], [0, Infinity, 100, 31], [0, 0, 100, 0], [0, 0, 100, 2.5]]) {
    assert.equal(recordChartIndexAt(...args as [number, number, number, number]), null);
  }
});
test('keyboard dates use bounded arrows, Home and End without intercepting other keys', () => {
  assert.equal(recordChartKeyIndex('ArrowRight', 0, 31), 1);
  assert.equal(recordChartKeyIndex('ArrowUp', 0, 31), 1);
  assert.equal(recordChartKeyIndex('ArrowLeft', 1, 31), 0);
  assert.equal(recordChartKeyIndex('ArrowDown', 1, 31), 0);
  assert.equal(recordChartKeyIndex('ArrowLeft', 0, 31), 0);
  assert.equal(recordChartKeyIndex('ArrowRight', 30, 31), 30);
  assert.equal(recordChartKeyIndex('Home', 12, 31), 0);
  assert.equal(recordChartKeyIndex('End', 12, 31), 30);
  for (const key of ['Tab', 'Escape', 'Enter', 'a']) assert.equal(recordChartKeyIndex(key, 12, 31), null);
  assert.equal(recordChartKeyIndex('End', 0, 0), null);
});
