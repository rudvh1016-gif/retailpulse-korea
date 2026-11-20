/** Shared adapter for the Worker bindings and the Actions D1 REST client. */
import { A4_PUBLISH_POINTER } from './a4-overflow-publication';
import type { A4Pointer, A4Stores } from './a4-overflow-publication';

type Database = Pick<D1Database, 'prepare' | 'batch'>;
type StoredPointer = { terminal: A4Pointer['terminal']; observed_at: string; digest: string; row_count: number };
const project = (row: StoredPointer): A4Pointer =>
  ({terminal:row.terminal,observedAt:row.observed_at,digest:row.digest,count:row.row_count});

export function createA4D1Stores(config: {
  primary: Database; overflow: Database;
  /** Evidence must require this exact pointer inside the publication transaction. */
  preparePrimaryEvidence?: (db: Database, p: A4Pointer) => D1PreparedStatement[];
  preparePrimaryPointer?: (db: Database, p: A4Pointer) => D1PreparedStatement;
}): A4Stores {
  const {primary,overflow}=config;
  if (!primary || !overflow || primary===overflow) throw new Error('a4_requires_distinct_bindings');
  return {
    primary:{
      get:async terminal=>{
        const row=await primary.prepare('SELECT terminal,observed_at,digest,row_count FROM a4_pointer WHERE terminal=?')
          .bind(terminal).first<StoredPointer>();
        return row ? project(row) : undefined;
      },
      publish:async p=>{
        const pointer=config.preparePrimaryPointer?.(primary,p)??primary.prepare(A4_PUBLISH_POINTER).bind(p.terminal,p.observedAt,p.digest,p.count);
        const evidence=config.preparePrimaryEvidence?.(primary,p) ?? [];
        if (evidence.length>8) throw new Error('a4_primary_evidence_budget_exceeded');
        const results=await primary.batch([pointer,...evidence]);
        if (results.length!==evidence.length+1 || results.some(r=>!r.success)) throw new Error('a4_primary_batch_unverified');
        const changes=results[0].meta?.changes;
        if (changes!==0 && changes!==1) throw new Error('a4_primary_pointer_change_unverified');
        return changes===1;
      },
    },
    overflow:{
      put:async m=>{
        const result=await overflow.prepare(
          'INSERT INTO a4_generation(digest,terminal,observed_at,row_count,payload) VALUES (?,?,?,?,?) ON CONFLICT(digest) DO NOTHING',
        ).bind(m.digest,m.terminal,m.observedAt,m.count,m.payload).run();
        if (!result.success) throw new Error('a4_overflow_write_unverified');
      },
      get:async digest=>{
        const row=await overflow.prepare('SELECT terminal,observed_at,digest,row_count,payload FROM a4_generation WHERE digest=?')
          .bind(digest).first<StoredPointer & {payload:string}>();
        return row ? {...project(row),payload:row.payload} : undefined;
      },
    },
  };
}
