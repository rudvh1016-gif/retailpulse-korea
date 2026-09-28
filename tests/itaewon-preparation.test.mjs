import test from 'node:test';
import assert from 'node:assert/strict';
import { allAreaIds, areaBySeoulPoi, areaMappings, publicAreaIds, uniqueKmaGrids } from '../lib/areas.ts';
import { itaewonPreparation } from '../lib/prepared-areas/itaewon.ts';
import { locations } from '../lib/personal-briefing.ts';
import { tourismDeskAreas, standaloneSeoSlugs } from '../app/seo-config.ts';
import { SUBWAY_AREA_STATIONS, SUBWAY_STATION_REQUESTS } from '../lib/subway-ridership.ts';
import { storeDynamicsMappings } from '../lib/store-dynamics.ts';

// Every Itaewon value below was returned by the real provider in the
// 2026-09-28 read-only probes (docs/ITAEWON_PREPARATION.md); none is guessed.
test('Itaewon is a full area like the other three', () => {
  assert.deepEqual(publicAreaIds, ['myeongdong', 'hongdae', 'seongsu', 'itaewon']);
  assert.deepEqual(allAreaIds, [...publicAreaIds]);
  assert.equal(areaBySeoulPoi('POI004')?.id, 'itaewon');
  assert.equal(areaMappings.itaewon.seoulPoiCode, itaewonPreparation.seoulPoiCode);
});

test('each Itaewon source uses its verified official identifier', () => {
  const itaewon = areaMappings.itaewon;
  assert.deepEqual(itaewon.salesTradeArea, { code: '3001491', name: '이태원 관광특구', seCd: 'U' });
  assert.deepEqual(itaewon.seoulAdministrativeDongCodes, ['11170650', '11170660']);
  assert.deepEqual(uniqueKmaGrids().find((cell) => cell.areas.includes('itaewon')), { nx: 60, ny: 126, areas: ['itaewon'] });
  // TourAPI 이태원 관광특구 (contentId 126999), same radius as the others.
  assert.deepEqual(itaewon.center, { lat: 37.5339, lng: 126.9907 });
  assert.equal(itaewon.eventRadiusM, areaMappings.myeongdong.eventRadiusM);
  assert.deepEqual(SUBWAY_AREA_STATIONS.itaewon, [{ stationCode: '2631', stationNumber: '630', stationName: '이태원', lineName: '6호선' }]);
  assert.equal(SUBWAY_STATION_REQUESTS.filter((request) => request.area === 'itaewon').length, 1);
  assert.equal(storeDynamicsMappings.itaewon.tradeAreaCode, '3001491');
});

test('Itaewon is public on every surface the other areas use', () => {
  assert.equal(locations.includes('itaewon'), true);
  assert.equal(tourismDeskAreas.includes('itaewon'), true);
  assert.equal(standaloneSeoSlugs.includes('itaewon'), true);
});
