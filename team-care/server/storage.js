import pg from 'pg';
let pool;
export function database(connectionString){
 if(!connectionString)throw Error('database_not_configured');
 pool??=new pg.Pool({connectionString,max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:5000});
 return storageFor(pool);
}
export function storageFor(pool){
 const transaction=async fn=>{const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}};
 function prepare(sql){let n=0;const query=sql.replace(/\?/g,()=>'$'+(++n));let args=[];return {bind(...a){args=a;return this},async first(){return (await pool.query(query,args)).rows[0]||null},async all(){return {results:(await pool.query(query,args)).rows}},async run(){const r=await pool.query(query,args);return {meta:{changes:r.rowCount}}},query,args:()=>args}}
 return {prepare,transaction,query:(...args)=>pool.query(...args),batch:statements=>transaction(async c=>{const results=[];for(const s of statements){const r=await c.query(s.query,s.args());results.push({meta:{changes:r.rowCount}})}return results})};
}
