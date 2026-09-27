import test from 'node:test';
import assert from 'node:assert/strict';
import { allAreaIds, areaBySeoulPoi, areaMappings, publicAreaIds, realtimeAreaIds, uniqueKmaGrids } from '../lib/areas.ts';
import { itaewonPreparation } from '../lib/prepared-areas/itaewon.ts';
import { locations } from '../lib/personal-briefing.ts';
import { tourismDeskAreas, standaloneSeoSlugs } from '../app/seo-config.ts';
import { SUBWAY_STATION_REQUESTS } from '../lib/subway-ridership.ts';
import { storeDynamicsMappings } from '../lib/store-dynamics.ts';

// Stage A (docs/ITAEWON_PREPARATION.md): Itaewon is collected from Seoul
// real-time city data only, after the 2026-09-28 contract probe of POI004.
// Every other source, and every public surface, still covers three areas.
test('Itaewon is collected from Seoul real-time city data only', () => {
  assert.deepEqual(publicAreaIds, ['myeongdong', 'hongdae', 'seongsu']);
  assert.deepEqual(realtimeAreaIds, ['myeongdong', 'hongdae', 'seongsu', 'itaewon']);
  assert.deepEqual(allAreaIds, ['myeongdong', 'hongdae', 'seongsu', 'itaewon']);
  assert.equal(areaBySeoulPoi('POI004')?.id, 'itaewon');
  assert.equal(areaMappings.itaewon.seoulPoiCode, itaewonPreparation.seoulPoiCode);
});

test('no guessed Itaewon geography reaches any other collector', () => {
  // No verified event centre or radius: events are never mapped to it.
  assert.equal(areaMappings.itaewon.center, null);
  assert.equal(areaMappings.itaewon.eventRadiusM, null);
  // Weather keeps the three existing grids; 60,126 is not requested yet.
  assert.equal(uniqueKmaGrids().some(({ nx, ny }) => nx === 60 && ny === 126), false);
  assert.equal(uniqueKmaGrids().flatMap((cell) => cell.areas).includes('itaewon'), false);
  assert.equal(SUBWAY_STATION_REQUESTS.some((request) => request.area === 'itaewon'), false);
  assert.equal(Object.keys(storeDynamicsMappings).includes('itaewon'), false);
});

test('Itaewon is not public yet', () => {
  assert.equal(locations.includes('itaewon'), false);
  assert.equal(tourismDeskAreas.includes('itaewon'), false);
  assert.equal(standaloneSeoSlugs.includes('itaewon'), false);
});
