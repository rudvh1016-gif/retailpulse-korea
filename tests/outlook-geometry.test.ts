import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OUTLOOK_PILL, edgesStayOrdered, nearestIndex, outlookBand, outlookGrid, pillCenter, type BandVertex } from '../lib/outlook-geometry';

// SVG positions only: y of each published maximum (upper) and minimum (lower).
const base = 184;
const y = (value: number) => base - value / 92_000 * 152;
const hours: Array<[number, number]> = [[86_000, 88_000], [84_000, 86_000], [80_000, 82_000], [72_000, 74_000], [62_000, 64_000], [46_000, 48_000], [30_000, 32_000], [20_000, 22_000]];
const vertices: BandVertex[] = hours.map(([min, max], index) => ({ x: 10 + index * 40, upper: y(max), lower: y(min) }));

const numbers = (d: string) => (d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
/** Anchor points of an M/C path: the start, then every segment end. */
const anchors = (d: string) => { const n = numbers(d), out = [[n[0], n[1]]]; for (let i = 2; i + 5 < n.length; i += 6) out.push([n[i + 4], n[i + 5]]); return out; };
const point = (d: string, t: number) => {
  const n = numbers(d), count = (n.length - 2) / 6, s = Math.min(count - 1, Math.floor(t * count)), u = t * count - s;
  const p = [n[s * 6], n[s * 6 + 1]], c1 = [n[s * 6 + 2], n[s * 6 + 3]], c2 = [n[s * 6 + 4], n[s * 6 + 5]], e = [n[s * 6 + 6], n[s * 6 + 7]];
  const f = (k: number) => (1 - u) ** 3 * p[k] + 3 * (1 - u) ** 2 * u * c1[k] + 3 * (1 - u) * u * u * c2[k] + u ** 3 * e[k];
  return [f(0), f(1)];
};

test('each edge passes exactly through every published bound and nothing else', () => {
  const band = outlookBand(vertices, base)!;
  assert.equal(band.smooth, true);
  assert.deepEqual(anchors(band.upper), vertices.map(v => [v.x, v.upper]));
  assert.deepEqual(anchors(band.lower), vertices.map(v => [v.x, v.lower]));
  // No midpoint: no anchor of either edge sits halfway between a published minimum and maximum.
  for (const [ax, ay] of [...anchors(band.upper), ...anchors(band.lower)]) {
    const v = vertices.find(vertex => vertex.x === ax)!;
    assert.notEqual(ay, (v.upper + v.lower) / 2);
  }
});

test('the smooth edges never leave the two values they join, and never cross', () => {
  const band = outlookBand(vertices, base)!;
  for (const [d, key] of [[band.upper, 'upper'], [band.lower, 'lower']] as const) {
    for (let i = 0; i < 400; i += 1) {
      const [px, py] = point(d, i / 400);
      const right = vertices.findIndex(v => v.x >= px), a = vertices[Math.max(0, right - 1)], b = vertices[Math.max(0, right)];
      assert.ok(py >= Math.min(a[key], b[key]) - 0.06 && py <= Math.max(a[key], b[key]) + 0.06, `${key} at ${px}`);
    }
  }
  assert.equal(edgesStayOrdered(band.upper, band.lower), true);
});

test('a run whose two curves would cross keeps straight edges instead', () => {
  // The maximum falls early and the minimum falls late between the 2nd and 3rd hour.
  const crossing: BandVertex[] = [[20, 110], [100, 110], [180, 181], [180, 182]].map(([upper, lower], index) => ({ x: index * 10, upper, lower }));
  const band = outlookBand(crossing, base)!;
  assert.equal(band.smooth, false);
  assert.equal(band.upper, 'M0,20 L10,100 L20,180 L30,180');
  assert.equal(band.lower, 'M0,110 L10,110 L20,181 L30,182');
  assert.equal(band.range, 'M0,20 L10,100 L20,180 L30,180 L30,182 L20,181 L10,110 L0,110 Z');
});

test('the range is closed along the same two edges; the fade sits under the minimum down to zero', () => {
  const band = outlookBand(vertices, base)!;
  assert.ok(band.range.startsWith(`${band.upper} L${vertices.at(-1)!.x},${vertices.at(-1)!.lower} C`));
  assert.ok(band.range.endsWith(` ${vertices[0].x},${vertices[0].lower} Z`));
  // The return trip is the minimum edge itself, traced backwards.
  const back = `M${vertices.at(-1)!.x},${vertices.at(-1)!.lower}${band.range.slice(band.upper.length + ` L${vertices.at(-1)!.x},${vertices.at(-1)!.lower}`.length, -2)}`;
  for (let i = 0; i <= 50; i += 1) {
    const [ax, ay] = point(back, i / 50), [bx, by] = point(band.lower, 1 - i / 50);
    assert.ok(Math.abs(ax - bx) < 1e-9 && Math.abs(ay - by) < 1e-9);
  }
  assert.equal(band.fade, `${band.lower} L${vertices.at(-1)!.x},${base} L${vertices[0].x},${base} Z`);
  assert.equal(outlookBand(vertices.slice(0, 1), base), null, 'a lone hour is drawn by the caller, never stretched into a band');
});

test('pointer picks the nearest published hour, the pill stays inside, the grid keeps zero and the ceiling', () => {
  assert.equal(nearestIndex([10, 50, 90], 31), 1);
  assert.equal(nearestIndex([10, 50, 90], 30), 0, 'a tie keeps the earlier hour');
  assert.equal(nearestIndex([10, 50, 90], -40), 0);
  assert.equal(nearestIndex([10, 50, 90], 400), 2);
  assert.equal(nearestIndex([], 5), -1);
  assert.equal(pillCenter(4, 354), OUTLOOK_PILL.width / 2 + 1);
  assert.equal(pillCenter(352, 354), 354 - OUTLOOK_PILL.width / 2 - 1);
  assert.equal(pillCenter(120, 354), 120);
  const grid = outlookGrid(92_000, y);
  assert.deepEqual(grid.map(line => line.value), [0, 50_000, 92_000]);
  assert.deepEqual(grid.map(line => line.y), [y(0), y(50_000), y(92_000)]);
  // 40,000 would sit 4px under the 41,000 ceiling label: that round step is left out.
  assert.deepEqual(outlookGrid(41_000, value => base - value / 41_000 * 152).map(line => line.value), [0, 20_000, 41_000]);
});
