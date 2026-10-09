import assert from 'node:assert/strict';import test from 'node:test';
import {assertCommercialAuditReadOnly,commercialAuditContextSql,commercialAuditCategoriesSql} from '../lib/commercial-coverage-audit';
test('the production diagnostic rejects mutation and multi-statement paths before D1 access',()=>{
 for(const sql of [commercialAuditContextSql,commercialAuditCategoriesSql,'EXPLAIN QUERY PLAN '+commercialAuditContextSql])assert.doesNotThrow(()=>assertCommercialAuditReadOnly(sql));
 for(const sql of ['DELETE FROM seoul_context','SELECT 1; DELETE FROM seoul_context','WITH x AS (UPDATE seoul_context SET payload=\'{}\') SELECT * FROM x','PRAGMA writable_schema=1','SELECT 1 -- trailing injected SQL'])assert.throws(()=>assertCommercialAuditReadOnly(sql),/NOT_READ_ONLY/);
});
