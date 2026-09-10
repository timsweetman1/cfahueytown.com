const careTopics=['ride','childcare','uniform','benefit-access','community'];
const careStates=['new','in-progress','waiting-on-employee','waiting-on-provider','resolved','closed'];
function careDB(env){if(!env.DB)throw Error('storage_unavailable');return env.DB}
function careLeaders(env){return (env.LEADER_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean)}
function careLeader(req,env){const id=req.headers.get('oai-authenticated-user-id'),email=req.headers.get('oai-authenticated-user-email')?.toLowerCase();return id&&email&&careLeaders(env).includes(email)?email:null}
function careReady(env){return !!(env.DB&&env.RESEND_API_KEY&&env.NOTIFY_FROM&&careLeaders(env).length)}
function careJSON(data,status=200){return response(JSON.stringify(data),status,{'Content-Type':'application/json'})}
async function careBody(req){if(Number(req.headers.get('content-length')||0)>8192)throw Error('invalid_input');const s=await req.text();if(s.length>8192)throw Error('invalid_input');return JSON.parse(s)}
async function careNotify(env,row){
 if(row.is_test)return "test-not-sent";
 // Retry within Resend's idempotency window only. Older unresolved attempts need review.
 if(Date.now()-Date.parse(row.created)>23*3600000)return 'needs-review';
 try{const recipients=JSON.parse(row.email_to);const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'care-'+row.id},body:JSON.stringify({from:env.NOTIFY_FROM,to:recipients,subject:'Team Care request '+row.id.slice(0,8)+' · '+row.topic,text:'A team member requested follow-up.\n\nRequest: '+row.id+'\nTopic: '+row.topic+'\nTiming: '+row.timing+'\n\nOpen the protected leader dashboard to view contact details and manage the request:\nhttps://hueytown-team-care.agenttimblog.chatgpt.site/leaders.html\n\nThis is a resource-navigation request, not a cash payment request. Email replies do not update the dashboard.'}),signal:AbortSignal.timeout(8000)});if(!r.ok)return 'failed';const data=await r.json();if(!data.id)return 'failed';await careDB(env).prepare('UPDATE care_requests SET email_state = ?, email_id = ? WHERE id = ?').bind('accepted',data.id,row.id).run();return 'accepted'}catch{return 'failed'}
}
async function careAPI(req,env,url){
 if(!url.pathname.startsWith('/api/care/'))return null;
 const leader=careLeader(req,env),admin=url.pathname.startsWith('/api/care/admin');
 if(admin&&!leader)return careJSON({error:'Leader sign-in required.'},403);
 if(!admin&&!await authorized(req,env))return careJSON({error:'Open Team Care and enter the team password.'},401);
 if(req.method!=='GET'&&!sameOriginRequest(req,url))return careJSON({error:'Open the form from Team Care.'},403);
 try{
 if(url.pathname==='/api/care/config'&&req.method==='GET')return careJSON({ready:careReady(env),aiReady:groqReady(env)});
 if(url.pathname==='/api/care/requests'&&req.method==='POST'){
  if(!careReady(env))return careJSON({error:'Leader email routing is not connected yet. Please use the direct contacts or your usual leader.'},503);
  const b=await careBody(req);const clean=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
  const row={id:clean(b.id,36),name:clean(b.name,80),contact:clean(b.contact,120),topic:clean(b.topic,30),timing:clean(b.timing,80),details:clean(b.details,4000)};
  if(!/^[0-9a-f-]{36}$/.test(row.id)||!row.name||!row.contact||!row.timing||!careTopics.includes(row.topic)||b.consent!==true)return careJSON({error:'Complete the required fields and sharing permission.'},400);
  const db=careDB(env),existing=await db.prepare('SELECT id, email_state FROM care_requests WHERE id = ?').bind(row.id).first();
  if(existing)return careJSON({id:existing.id,emailState:existing.email_state,duplicate:true});
  const recent=await db.prepare("SELECT count(*) AS n FROM care_requests WHERE contact = ? AND created >= ?").bind(row.contact,new Date(Date.now()-86400000).toISOString()).first();if(recent.n>=5)return careJSON({error:'You have submitted several requests today. Please contact your leader to follow up instead.'},429);
  row.created=new Date().toISOString();row.email_to=JSON.stringify(row.topic==='uniform'?['06123@chick-fil-a.com',...careLeaders(env)].filter((x,i,a)=>a.indexOf(x)===i):careLeaders(env));
  await db.prepare('INSERT INTO care_requests (id, created, updated, name, contact, topic, timing, details, email_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(row.id,row.created,row.created,row.name,row.contact,row.topic,row.timing,row.details,row.email_to).run();
  const emailState=await careNotify(env,row);if(emailState!=='accepted')await db.prepare('UPDATE care_requests SET email_state = ? WHERE id = ?').bind(emailState,row.id).run();
  return careJSON({id:row.id,emailState},201);
 }
 if(url.pathname==='/api/care/admin'&&req.method==='GET'){
  const db=careDB(env);const rows=await db.prepare('SELECT * FROM care_requests ORDER BY created DESC LIMIT 500').all();
  const counts=await db.prepare('SELECT status, count(*) AS total FROM care_requests WHERE is_test = 0 GROUP BY status').all();
  const usage=await db.prepare("SELECT page, sum(views) AS views FROM care_usage WHERE day >= date('now', '-29 days') GROUP BY page").all();
  return careJSON({rows:rows.results,counts:counts.results,usage:usage.results,leader,leaders:careLeaders(env),ready:careReady(env),aiReady:groqReady(env)});
 }
 if(url.pathname==='/api/care/admin/test'&&req.method==='POST'){
  const db=careDB(env),existing=await db.prepare('SELECT id FROM care_requests WHERE is_test = 1 LIMIT 1').first();if(existing)return careJSON({id:existing.id});
  const id=crypto.randomUUID(),at=new Date().toISOString();await db.prepare('INSERT INTO care_requests (id, created, updated, name, contact, topic, timing, details, email_to, email_state, is_test) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)').bind(id,at,at,'TEST — leader practice','No employee contact; practice only','ride','Practice: next week','Practice assigning an owner, moving to in-progress, then resolved. No ride is booked and no email is sent.','[]','test-not-sent').run();return careJSON({id},201);
 }
 if(url.pathname==='/api/care/admin/clear-tests'&&req.method==='POST'){
  await careDB(env).batch([careDB(env).prepare('DELETE FROM care_audit WHERE request_id IN (SELECT id FROM care_requests WHERE is_test = 1)'),careDB(env).prepare('DELETE FROM care_requests WHERE is_test = 1')]);return careJSON({ok:true});
 }
 if(url.pathname==='/api/care/admin/update'&&req.method==='POST'){
  const b=await careBody(req);if(!careStates.includes(b.status)||!Number.isInteger(b.revision)||typeof b.id!=='string'||(b.owner&&!careLeaders(env).includes(b.owner)))return careJSON({error:'Invalid request update.'},400);
  const db=careDB(env),now=new Date().toISOString();
  const results=await db.batch([
   db.prepare('UPDATE care_requests SET status = ?, owner = ?, updated = ?, revision = revision + 1 WHERE id = ? AND revision = ?').bind(b.status,b.owner||'',now,b.id,b.revision),
   db.prepare('INSERT INTO care_audit (id, request_id, at, actor, action) SELECT ?, ?, ?, ?, ? WHERE changes() = 1').bind(crypto.randomUUID(),b.id,now,leader,JSON.stringify({status:b.status,owner:b.owner||''}))
  ]);
  if(!results[0].meta.changes)return careJSON({error:'Another leader changed this request. Refresh before saving.'},409);
  return careJSON({ok:true});
 }
 if(url.pathname==='/api/care/admin/retry'&&req.method==='POST'){
  if(!careReady(env))return careJSON({error:'Connect email before retrying.'},503);
  const b=await careBody(req),db=careDB(env),row=await db.prepare('SELECT * FROM care_requests WHERE id = ?').bind(b.id).first();if(!row)return careJSON({error:'Request not found.'},404);
  if(row.email_state==='accepted')return careJSON({emailState:'accepted'});
  const state=await careNotify(env,row);if(state!=='accepted')await db.prepare('UPDATE care_requests SET email_state = ? WHERE id = ?').bind(state,row.id).run();return careJSON({emailState:state});
 }
 return careJSON({error:'Not found.'},404);
 }catch(e){console.error('care_api_failure',url.pathname,e?.message==='invalid_input'?'input':'operation');return careJSON({error:'Unable to complete that action. Your form is still here; please retry or contact your usual leader.'},503)}
}
async function careCount(env,page){if(!env.DB)return;try{await careDB(env).prepare('INSERT INTO care_usage (day, page, views) VALUES (?, ?, 1) ON CONFLICT(day, page) DO UPDATE SET views = views + 1').bind(new Date().toISOString().slice(0,10),page).run()}catch{console.error('usage_count_failed')}}
