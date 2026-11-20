-- A second fixed range in the retired Seoul Citydata context feed.
-- Reapplying this statement cannot move the retention boundary.
DELETE FROM seoul_context
WHERE rowid BETWEEN 12001 AND 30000
  AND area IN ('myeongdong', 'hongdae', 'seongsu', 'itaewon')
  AND observed_at < '2026-11-18';
