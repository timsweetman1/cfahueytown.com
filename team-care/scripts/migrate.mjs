import fs from 'node:fs';
import {database} from '../server/storage.js';
const db=database(process.env.DATABASE_URL);
await db.transaction(async client=>{
 await client.query('SELECT pg_advisory_xact_lock(6123)');
 const exists=await client.query("SELECT to_regclass('public.care_migrations') AS present");
 if(exists.rows[0].present){const prior=await client.query("SELECT id FROM care_migrations WHERE id='001-postgres'");if(prior.rowCount)return;throw Error('Unrecognized schema; review before migration')}
 await client.query(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 await client.query("INSERT INTO care_migrations(id) VALUES ('001-postgres')");
});
console.log('Postgres schema ready.');process.exit(0);
