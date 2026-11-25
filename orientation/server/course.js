import {readFileSync} from 'node:fs';
import {digest,requireValue} from './accounts.js';
import {transaction} from './store.js';
export const config=JSON.parse(readFileSync(new URL('./release.json',import.meta.url),'utf8'));
export const version='2026-11-16.1';
export const total=61;
export const baseline=async(db,email)=>Number((await db.query('SELECT coalesce(max(step)+1,0) AS pos FROM orientation.activity WHERE email=$1 AND version=$2 AND passed',[email,version])).rows[0].pos);
export async function released(db){return !!(await db.query('SELECT 1 FROM orientation.release WHERE version=$1',[version])).rows.length}
export async function importFile(db,token,name,bytes){
  requireValue(typeof token==='string'&&digest(token)===config.importHash&&Date.now()<Date.parse(config.expires),403,'Import authorization expired.');
  requireValue(!await released(db),409,'Course already imported.');
  if(name==='finish'){
    return transaction(db,async client=>{
      await client.query('SELECT pg_advisory_xact_lock(61723092)');
      if(await released(client))return;
      const required=await client.query('SELECT name FROM orientation.files');
      const present=new Set(required.rows.map(row=>row.name));
      requireValue(Object.keys(config.files).every(key=>present.has(key)),409,'Upload all the course files first.');
      const history=await fetchBytes(client,'history.json');
      for(const row of JSON.parse(history.toString())){
        await client.query(`INSERT INTO orientation.activity(email,version,request_id,step,passed,response,at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,[row.email.toLowerCase(),row.version,row.request_id,row.step,!!row.passed,row.response,row.at]);
      }
      await client.query('INSERT INTO orientation.release(version) VALUES($1)',[version]);
    });
  }
  requireValue(Object.hasOwn(config.files,name)&&digest(bytes)===config.files[name],400,'File does not match the course release.');
  await db.query('INSERT INTO orientation.files VALUES ($1,$2) ON CONFLICT DO NOTHING',[name,bytes]);
}
export async function fetchBytes(db,name) {
  const row=(await db.query('SELECT bytes FROM orientation.files WHERE name=$1',[name])).rows[0];
  requireValue(row,404,'Course file unavailable.');
  return Buffer.from(row.bytes);
}
let cached;
export async function course(db){
  if(cached)return cached;
  requireValue(await released(db),503,'The course is being prepared. Please try again shortly.');
  const [slides,bank]=await Promise.all(['course.json','assessment.json'].map(async name=>JSON.parse((await fetchBytes(db,name)).toString())));
  const ends=[6,15,24,28,35,42],steps=[];
  bank.modules.forEach((module,i)=>{
    slides.slice(i?ends[i-1]:0,ends[i]).forEach(slide=>steps.push({kind:'slide',module:i,slide}));
    module.questions.forEach((q,j)=>steps.push({kind:'quiz',module:i,question:j,prompt:q.prompt,choices:q.choices}));
  });
  steps.push({kind:'finish',module:bank.modules.length-1});
  if(steps.length!==total)throw new Error('Unexpected course length');
  cached={bank,public:{steps,names:bank.modules.map(m=>m.title),ack:bank.acknowledgments}};
  return cached;
}
export async function progress(db,email,input){
  const {bank,public:material}=await course(db), step=material.steps[input.step];
  requireValue(Number.isInteger(input.step)&&step&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(input.id),400,'Invalid course step.');
  let passed=true,response='',explanation='';
  if(step.kind==='quiz'){
    const q=bank.modules[step.module].questions[step.question];
    requireValue(Number.isInteger(input.answer)&&input.answer>=0&&input.answer<q.choices.length,400,'Choose an answer.');
    passed=input.answer===q.answer;response=String(input.answer);explanation=q.explanation;
  }else if(step.kind==='finish'){
    requireValue(Array.isArray(input.agreed)&&input.agreed.length===material.ack.length&&input.agreed.every(a=>a===true),400,'Review each acknowledgment.');
    response=JSON.stringify(material.ack);
  }else if(step.slide.display[0].startsWith('FOLLOW-ALONG')){
    requireValue(['A','B','C'].includes(input.answer),400,'Choose an answer.');response=input.answer;
  }
  return transaction(db,async client=>{
    await client.query('SELECT 1 FROM orientation.accounts WHERE email=$1 FOR UPDATE',[email]);
    const current=await baseline(client,email);
    requireValue(input.step<=current,409,'Complete the previous step first.');
    const previous=await client.query('SELECT step,passed FROM orientation.activity WHERE email=$1 AND version=$2 AND request_id=$3',[email,version,input.id]);
    if(previous.rows.length){
      requireValue(previous.rows[0].step===input.step,409,'Refresh the course and retry.');
      return {next:current,passed:previous.rows[0].passed,explanation};
    }
    if(input.step<current)return {next:current,passed:true,explanation};
    await client.query('INSERT INTO orientation.activity(email,version,request_id,step,passed,response) VALUES($1,$2,$3,$4,$5,$6)',[email,version,input.id,input.step,passed,response]);
    if(step.kind==='finish'){
      await client.query(`INSERT INTO orientation.completion_alerts(id,email,version,completed_at)
        VALUES ($1,$2,$3,now()) ON CONFLICT (email,version) DO NOTHING`,[input.id,email,version]);
    }
    return {next:current+Number(passed),passed,explanation};
  });
}
export async function roster(db){
  return (await db.query(`SELECT a.email,a.active,a.manager,a.password_hash IS NOT NULL AS enrolled,
    coalesce(max(p.step+1) FILTER (WHERE p.passed),0) AS progress,count(*) FILTER (WHERE NOT p.passed) AS retries,
    max(p.at) AS updated FROM orientation.accounts a LEFT JOIN orientation.activity p ON a.email=p.email AND p.version=$1
    GROUP BY a.email ORDER BY a.created_at DESC`,[version])).rows;
}
