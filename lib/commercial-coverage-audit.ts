/** Fixed, bounded diagnostics for existing Seoul commercial observations. */
export const COMMERCIAL_AUDIT_AREAS = ['myeongdong','seongsu','hongdae','itaewon'] as const;
export const COMMERCIAL_AUDIT_ROW_CAP = 12_000;
export function assertCommercialAuditReadOnly(sql:string) {
  if(!/^(?:SELECT|WITH|EXPLAIN QUERY PLAN)\b/i.test(sql.trim()) || /;|--|\/\*/.test(sql)
    || /\b(?:INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE|PRAGMA|ATTACH|DETACH|VACUUM|REINDEX)\b/i.test(sql)) {
    throw new Error('COMMERCIAL_AUDIT_NOT_READ_ONLY');
  }
}
const bounded=`SELECT observed_at,payload FROM seoul_context
  WHERE area=? AND observed_at>=? AND observed_at<? ORDER BY observed_at LIMIT ${COMMERCIAL_AUDIT_ROW_CAP+1}`;
export const commercialAuditObservationsSql=bounded;
export const commercialAuditContextSql=`WITH raw AS (${bounded})
 SELECT COUNT(*) AS rawRows,MIN(observed_at) AS firstContextAt,MAX(observed_at) AS lastContextAt,
 MIN(json_extract(payload,'$.commercialAt')) AS firstCommercialAt,
 MAX(json_extract(payload,'$.commercialAt')) AS lastCommercialAt,
 COUNT(DISTINCT json_extract(payload,'$.commercialAt')) AS uniqueCommercialClocks,
 SUM(CASE WHEN json_extract(payload,'$.commercialAt') IS NULL THEN 1 ELSE 0 END) AS missingCommercialClock,
 SUM(CASE WHEN COALESCE(json_array_length(payload,'$.categories'),0)=0 THEN 1 ELSE 0 END) AS emptyCategories,
 MAX(COALESCE(json_array_length(payload,'$.categories'),0)) AS largestCategoryList
 FROM raw`;
export const commercialAuditCategoriesSql=`WITH raw AS (${bounded}),
 entries AS (SELECT observed_at,json_extract(payload,'$.commercialAt') AS commercialAt,
   json_extract(c.value,'$.category') AS category,json_extract(c.value,'$.group') AS categoryGroup,
   json_extract(c.value,'$.payments') AS payments,json_extract(c.value,'$.amountMin') AS amountMin,
   json_extract(c.value,'$.amountMax') AS amountMax
   FROM raw,json_each(raw.payload,'$.categories') AS c
   WHERE json_type(raw.payload,'$.commercialAt')='text' AND json_type(c.value,'$.category')='text'),
 ranked AS (SELECT *,COUNT(*) OVER(PARTITION BY commercialAt,category) AS copies,
   ROW_NUMBER() OVER(PARTITION BY commercialAt,category ORDER BY observed_at DESC) AS versionRank FROM entries),
 canonical AS (SELECT * FROM ranked WHERE versionRank=1)
 SELECT category,MAX(categoryGroup) AS categoryGroup,SUBSTR(commercialAt,1,7) AS month,
   MIN(commercialAt) AS firstAt,MAX(commercialAt) AS lastAt,COUNT(*) AS uniqueObservations,
   SUM(copies-1) AS duplicateCopies,
   SUM(CASE WHEN payments IS NULL THEN 1 ELSE 0 END) AS unavailablePayments,
   SUM(CASE WHEN payments=0 THEN 1 ELSE 0 END) AS publishedZeroPayments,
   SUM(CASE WHEN amountMin IS NULL OR amountMax IS NULL THEN 1 ELSE 0 END) AS unavailableAmountRange,
   COUNT(DISTINCT SUBSTR(commercialAt,1,10)) AS observedDays,
   COUNT(DISTINCT SUBSTR(commercialAt,1,13)) AS observedHours,
   json_group_array(DISTINCT CASE WHEN CAST(SUBSTR(commercialAt,9,2) AS INTEGER)<=?
     AND payments IS NOT NULL THEN SUBSTR(commercialAt,9,5) ELSE NULL END) AS completedPrefixHours
 FROM canonical GROUP BY category,month ORDER BY category,month`;
