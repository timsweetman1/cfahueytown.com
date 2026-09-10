import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {storageFor} from '../server/storage.js';
import {hashPassword} from '../server/auth.js';
import {handle} from '../dist/app.js';
const origin='https://preview.example.test';
test('Postgres schema and signed login support requests, revisions, audit and role isolation',async()=>{
 const pg=new PGlite();await pg.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 const query=async(sql,args=[])=>{const r=await pg.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length}};
 const client={query,release(){}};const db=storageFor({query,connect:async()=>client});
 const env={APP_ORIGIN:origin,DATABASE_URL:'injected-local-postgres',TEAM_PASSWORD_HASH:await hashPassword('team-test'),TEAM_SESSION_SECRET:randomBytes(48).toString('hex'),LEADER_PASSWORD_HASHES:JSON.stringify({'owner@example.test':await hashPassword('leader-test')}),RESEND_API_KEY:'mock',NOTIFY_FROM:'test@example.test'};
 await query('INSERT INTO care_leaders(email) VALUES ($1)',['owner@example.test']);
 const run=(path,method='GET',body,token='',extra={})=>handle(new Request(origin+'/benefits'+path,{method,headers:{Origin:origin,Cookie:token,...extra},body}),env,{database:db});
 const login=async(path,body)=>{const r=await run(path,'POST',body);assert.equal(r.status,303);return r.headers.get('set-cookie').split(';')[0]};
 assert.equal((await run('/leaders.html','GET',undefined,'',{'oai-authenticated-user-id':'fake','oai-authenticated-user-email':'owner@example.test'})).status,401);
 const employee=await login('/team-login','password=team-test');const leader=await login('/leader-login','email=owner%40example.test&password=leader-test');
 assert.equal((await run('/api/care/admin','GET',undefined,employee)).status,403);
 assert.equal((await run('/leaders.html','GET',undefined,leader)).status,200);
 const oldFetch=globalThis.fetch;let sends=0;globalThis.fetch=async()=>{sends++;return new Response(JSON.stringify({id:'mock-email'}))};
 try{
 const body={id:crypto.randomUUID(),name:'TEST',contact:'test only',topic:'ride',timing:'Next week',details:'Synthetic test',consent:true};
 const request=()=>run('/api/care/requests','POST',JSON.stringify(body),employee);
 assert.equal((await request()).status,201);assert.equal((await (await request()).json()).duplicate,true);assert.equal(sends,1);
 const update={id:body.id,revision:0,owner:'owner@example.test',status:'in-progress'};
 assert.equal((await run('/api/care/admin/update','POST',JSON.stringify(update),leader)).status,200);
 assert.equal((await run('/api/care/admin/update','POST',JSON.stringify(update),leader)).status,409);
 assert.equal((await query('SELECT * FROM care_audit')).rows.length,1);
 assert.equal((await run('/api/care/admin/update','POST',JSON.stringify(update),leader,{Origin:'https://evil.test'})).status,403);
 const admin=await (await run('/api/care/admin','GET',undefined,leader)).json();assert.equal(admin.counts[0].total,1);
 assert.equal((await run('/api/care/requests','POST',JSON.stringify({...body,id:crypto.randomUUID(),topic:'cash'}),employee)).status,400);
 await query('UPDATE care_leaders SET active=false');assert.equal((await run('/leaders.html','GET',undefined,leader)).status,401);
 }finally{globalThis.fetch=oldFetch;await pg.close()}
});
