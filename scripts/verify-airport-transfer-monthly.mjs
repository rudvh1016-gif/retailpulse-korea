import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

// Offline verification only. Never calls providers or writes D1/daily profiles.
const root = new URL('../', import.meta.url);
const archive = JSON.parse(readFileSync(new URL('public/data/airport-transfer-monthly.json', root), 'utf8'));
assert.equal(archive.basis, 'OFFICIAL_MONTHLY_ACTUAL');
assert.equal(archive.dailyComparisonUsable, false);
assert.equal(archive.observations.length, 9);
const identities = new Set();
for (const row of archive.observations) {
  const identity = `${row.airline}:${row.month}:${row.terminal}`;
  assert(!identities.has(identity), `duplicate ${identity}`);
  identities.add(identity);
  const raw = gunzipSync(readFileSync(new URL(row.evidencePath, root)));
  assert.equal(row.evidenceType, 'VERBATIM_STATISTICS_MODULE_EXCERPT');
  assert.equal(createHash('sha256').update(raw).digest('hex'), row.evidenceSha256);
  const html = raw.toString('utf8');
  const [year, month] = row.month.split('-');
  for (const [id, value] of [['S_YEAR',year],['E_YEAR',year],['S_MONTH',month],['E_MONTH',month]]) {
    assert(html.includes(`$('#${id}').val('${value}')`), `${identity}: incorrect month`);
  }
  const selected = (id, value) => {
    const select = html.match(new RegExp(`<select[^>]*id="${id}"[^>]*>([\\s\\S]*?)</select>`))?.[1];
    assert(select?.includes(`value="${value}"  selected="selected"`), `${identity}: ${id} selection`);
  };
  selected('AIRLINE',row.airline);
  selected('ARPLN_SE','Y');
  if(row.terminal !== 'ALL') selected('TERMINAL_ID', row.terminal === 'T1' ? 'P01' : 'P03');
  const table = html.match(/<div class="func-table4 center mt20">([\s\S]*?)<\/table>/)?.[1];
  assert(table, `${identity}: missing official table`);
  const first = table.match(/<tbody>[\s\S]*?<tr>([\s\S]*?)<\/tr>/)?.[1];
  assert(first?.includes(row.airlineName), `${identity}: incorrect airline`);
  const numbers = [...first.matchAll(/<td[^>]*>\s*([\d,]+)\s*<\/td>/g)].map(match => Number(match[1].replaceAll(',','')));
  assert.equal(numbers.length, row.terminal === 'ALL' ? 9 : 6);
  assert.deepEqual(numbers.slice(0,6), [row.flights.arrivals,row.flights.departures,row.flights.total,row.passengers.arrivals,row.passengers.departures,row.passengers.total]);
  for (const metric of ['flights','passengers']) {
    assert.equal(row[metric].arrivals + row[metric].departures, row[metric].total);
    assert(Object.values(row[metric]).every(value => Number.isSafeInteger(value) && value >= 0));
  }
  assert(Number.isFinite(Date.parse(row.retrievedAt)));
  assert.equal(new URL(row.sourceUrl).hostname,'airinfo.airport.kr');
}
for (const airline of ['BX','RS','OZ']) {
  const rows = archive.observations.filter(row => row.airline === airline);
  const all = rows.find(row => row.terminal === 'ALL');
  const terminals = rows.filter(row => row.terminal !== 'ALL');
  for (const metric of ['flights','passengers']) for (const direction of ['arrivals','departures','total']) {
    assert.equal(terminals.reduce((sum,row) => sum + row[metric][direction],0), all[metric][direction], `${airline}: terminal reconciliation`);
  }
}
console.log('Verified 9 official monthly observations: raw hashes, selected months/airlines/terminals, units, direction totals and T1 + T2 = ALL. Daily comparison remains unavailable.');
