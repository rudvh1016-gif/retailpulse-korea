import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const assets = [
  ['T2_day-390.webp', 15_256, 'a53ddaaa274b0951d59362d8cbbc53f0bb8d4ebae38b423663e0b20ac2f421b9'],
  ['T2_day-900.webp', 50_118, 'c5dda556d2155de780515ec64c62d3f4d9d0e3aa112e1c15b9a5643ccf682024'],
  ['T2_day.webp', 99_784, '43933001f0d1f8c4924ef75064a2baa8c5e3f7441e26678180bb72bcf6c98ef8'],
];

test('reviewed T2 day WebP exports are present and byte-identical', async () => {
  for (const [name, size, sha256] of assets) {
    const file = await readFile(new URL(`../public/airport-models/v12/${name}`, import.meta.url));
    assert.equal(file.length, size, name);
    assert.equal(file.subarray(0, 4).toString(), 'RIFF', name);
    assert.equal(file.subarray(8, 12).toString(), 'WEBP', name);
    assert.equal(createHash('sha256').update(file).digest('hex'), sha256, name);
  }
  const views = JSON.parse(await readFile(new URL('../config/airport-concept-v8.json', import.meta.url)));
  assert.deepEqual(views.views.T2.labels, {
    WEST: [456.2850487232208, 23.642836093902588],
    CENTER: [692.562096118927, 343.7863116264343],
    EAST: [1043.994197845459, 92.07354474067688],
  });
  assert.equal(views.views.T2.width, 1440);
  assert.equal(views.views.T2.height, 760);
});
