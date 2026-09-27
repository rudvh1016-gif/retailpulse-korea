import test from 'node:test';
import assert from 'node:assert/strict';
import { allAreaIds, areaBySeoulPoi, uniqueKmaGrids } from '../lib/areas.ts';
import { locations } from '../lib/personal-briefing.ts';
import { tourismDeskAreas, standaloneSeoSlugs } from '../app/seo-config.ts';

test('loading Itaewon preparation cannot register a live area or expand weather collection', async () => {
  const before = uniqueKmaGrids();
  const { itaewonPreparation } = await import('../lib/prepared-areas/itaewon.ts');
  assert.equal(itaewonPreparation.seoulPoiCode, 'POI004');
  assert.deepEqual(allAreaIds, ['myeongdong', 'hongdae', 'seongsu']);
  assert.equal(areaBySeoulPoi('POI004'), null);
  assert.deepEqual(uniqueKmaGrids(), before);
  assert.equal(locations.includes('itaewon'), false);
  assert.equal(tourismDeskAreas.includes('itaewon'), false);
  assert.equal(standaloneSeoSlugs.includes('itaewon'), false);
});
