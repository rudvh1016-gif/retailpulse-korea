-- Reclaim primary D1 pages from the retired Seoul Citydata context feed.
-- The release workflow records a D1 recovery bookmark before migrations.
-- Bound this one-time repair to 12,000 rowids and leave the schema in place.
DELETE FROM seoul_context
WHERE rowid BETWEEN 1 AND 12000
  AND area IN ('myeongdong', 'hongdae', 'seongsu', 'itaewon')
  AND observed_at < '2026-11-18';
