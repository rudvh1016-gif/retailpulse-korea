import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
export class SqliteD1 {
  constructor(path=':memory:',migrate=true) {
    this.raw=new DatabaseSync(path);this.calls=[];
    if(migrate)for(const name of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())this.raw.exec(readFileSync(`drizzle/${name}`,'utf8'));
  }
  prepare(sql) {
    const raw=this.raw,calls=this.calls;let params=[];
    return {bind(...values){params=values;return this;},
      execute(){calls.push(sql);const stmt=raw.prepare(sql);const results=stmt.all(...params);return {success:true,results,meta:{changes:Number(raw.prepare('SELECT changes() n').get().n)}};},
      async all(){return this.execute();},async run(){return this.execute();},async first(){return this.execute().results[0]??null;}};
  }
  async batch(statements) {
    this.raw.exec('BEGIN IMMEDIATE');
    try {const output=statements.map(s=>s.execute());this.raw.exec('COMMIT');return output;}
    catch(error){this.raw.exec('ROLLBACK');throw error;}
  }
}
