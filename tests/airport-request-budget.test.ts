import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {reserveAirportRequestBudget,settleAirportRequestBudget} from '../lib/airport-request-budget';
function database(){const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE collector_runs(run_id TEXT PRIMARY KEY,source_id TEXT,started_at TEXT,finished_at TEXT,status TEXT,records_read INTEGER,records_written INTEGER,detail TEXT,UNIQUE(source_id,started_at))');return {sql,db:{prepare(query:string){return {bind(...values:(string|number)[]){return {async run(){return {results:sql.prepare(query).all(...values)}}}}}}} as unknown as Pick<D1Database,'prepare'>};}
test('concurrent scans cannot reserve more than 500 calls in rolling 24 hours',async()=>{
 const {sql,db}=database();try{const at='2026-10-09T16:00:00Z';const results=await Promise.all(Array.from({length:5},(_,i)=>reserveAirportRequestBudget(db,at,125,'r'+i)));assert.equal(results.filter(Boolean).length,4);assert.equal(await reserveAirportRequestBudget(db,'2026-10-10T16:29:59Z',1),false);assert.equal(await reserveAirportRequestBudget(db,'2026-10-10T16:30:01Z',125),true);}finally{sql.close();}
});

test('exact completed attempts release unused capacity, while an unfinished job retains its full ceiling',async()=>{
 const {sql,db}=database();try{const at='2026-10-09T16:00:00Z';assert.equal(await reserveAirportRequestBudget(db,at,125,'completed'),true);await settleAirportRequestBudget(db,'completed',1);assert.equal(sql.prepare('SELECT records_read FROM collector_runs WHERE run_id=?').get('completed')!.records_read,1);for(let i=0;i<3;i++)assert.equal(await reserveAirportRequestBudget(db,at,125,'unfinished'+i),true);assert.equal(await reserveAirportRequestBudget(db,at,125,'excess'),false);await settleAirportRequestBudget(db,'unfinished0',126);assert.equal(sql.prepare('SELECT records_read FROM collector_runs WHERE run_id=?').get('unfinished0')!.records_read,125);}finally{sql.close();}
});
test('existing complete scans count before the first reservation and are not counted twice later',async()=>{
 const {sql,db}=database();try{sql.prepare('INSERT INTO collector_runs(run_id,source_id,started_at,status,records_read,detail) VALUES(?,?,?,?,?,?)').run('legacy','INCHEON_FLIGHT_DETAIL','2026-10-09T15:00:00Z','SUCCESS',12000,'recent 2026-10-07..2026-10-10; pages 120; requests 120; population 12000');
 assert.equal(await reserveAirportRequestBudget(db,'2026-10-09T16:00:00Z',125,'r1'),true);sql.prepare('INSERT INTO collector_runs(run_id,source_id,started_at,status,detail) VALUES(?,?,?,?,?)').run('new-success','INCHEON_FLIGHT_DETAIL','2026-10-09T16:05:00Z','SUCCESS','recent 2026-10-07..2026-10-10; requests 120;');assert.equal(await reserveAirportRequestBudget(db,'2026-10-09T16:10:00Z',125,'r2'),true);assert.equal(await reserveAirportRequestBudget(db,'2026-10-09T16:15:00Z',125,'r3'),true);assert.equal(await reserveAirportRequestBudget(db,'2026-10-09T16:20:00Z',125,'r4'),false);}finally{sql.close();}
});
