import pg from 'pg';
import {readFile} from 'node:fs/promises';
const schema = await readFile(new URL('./schema.sql',import.meta.url),'utf8');
let pool;
let initialized;
export async function database() {
  const url = process.env.ORIENTATION_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Orientation database is not configured');
  pool ??= new pg.Pool({connectionString:url, max:3, idleTimeoutMillis:15000, connectionTimeoutMillis:8000});
  initialized ??= initialize(pool).catch(error => {initialized=undefined;throw error});
  await initialized;
  return pool;
}
export async function initialize(db) {
  const check=await db.query("SELECT to_regclass('orientation.mail_delivery') AS installed");
  if(check.rows[0].installed) return;
  await transaction(db,async client=>{
    await client.query("SELECT pg_advisory_xact_lock(61723091)");
    await client.query(schema);
  });
}
export async function transaction(db,fn) {
  const client=await db.connect();
  try {
    await client.query('BEGIN');
    const result=await fn(client);
    await client.query('COMMIT');
    return result;
  } catch(error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {client.release()}
}
