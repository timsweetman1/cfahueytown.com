// Run only against the production destination after source writes are paused.
// Export JSON stays outside the repository. Never print record contents.
import fs from 'node:fs';
import {database} from '../server/storage.js';
if(!process.env.MIGRATION_INPUT||process.env.MIGRATION_CONFIRM!=='source-frozen')throw Error('Require MIGRATION_INPUT and MIGRATION_CONFIRM=source-frozen');
const data=JSON.parse(fs.readFileSync(process.env.MIGRATION_INPUT,'utf8'));
const tables={care_requests:['id','created','updated','name','contact','topic','timing','details','status','owner','revision','email_state','email_id','email_to','is_test'],care_audit:['id','request_id','at','actor','action'],care_usage:['day','page','views'],care_ai_budget:['day','calls'],care_leaders:['email','active']};
const db=database(process.env.DATABASE_URL);
await db.transaction(async c=>{
 await c.query('SELECT pg_advisory_xact_lock(6123)');
 for(const [table,cols] of Object.entries(tables)){
  if(!Array.isArray(data[table]))throw Error('Missing table '+table);
  const existing=await c.query(`SELECT count(*) AS n FROM ${table}`);if(Number(existing.rows[0].n))throw Error('Destination must be empty: '+table);
  for(const row of data[table]){
   if(cols.some(k=>!Object.hasOwn(row,k)))throw Error('Incomplete record in '+table);
   await c.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map((_,i)=>'$'+(i+1)).join(',')})`,cols.map(k=>row[k]));
  }
  const result=await c.query(`SELECT count(*) AS n FROM ${table}`);if(Number(result.rows[0].n)!==data[table].length)throw Error('Count mismatch');
  // Compare all values, not just row counts, before committing.
  const actual=(await c.query(`SELECT ${cols.join(',')} FROM ${table}`)).rows;
  const canonical=rows=>rows.map(row=>JSON.stringify(cols.map(k=>row[k]))).sort();
  if(JSON.stringify(canonical(actual))!==JSON.stringify(canonical(data[table])))throw Error('Value mismatch in '+table);
 }
 const orphan=await c.query('SELECT id FROM care_audit WHERE request_id NOT IN (SELECT id FROM care_requests) LIMIT 1');if(orphan.rowCount)throw Error('Orphan audit record');
});
console.log('Imported and verified all table values in one transaction. No notifications sent.');process.exit(0);
