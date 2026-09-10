import {test} from 'node:test';import assert from 'node:assert/strict';import worker from '../dist/server/index.js';
const origin='https://hueytown-team-care.agenttimblog.chatgpt.site';const env={TEAM_PASSWORD:'test-only-pass',TEAM_SESSION_SECRET:'test-only-signing-key'};
const request=(path,opts={})=>new Request(origin+path,opts);
async function login(){const r=await worker.fetch(request('/team-login',{method:'POST',headers:{Origin:origin},body:'password=test-only-pass'}),env);assert.equal(r.status,303);return r.headers.get('set-cookie').split(';')[0]}
test('all page and asset routes require password, including guessed source paths',async()=>{for(const p of ['/','/index.html','/uniforms.html','/benefits.html','/app.js','/uniforms.js','/uniform-images/polo.jpg','/server/index.js','/.openai/hosting.json']){const r=await worker.fetch(request(p),env);assert.equal(r.status,401,p);const t=await r.text();assert.ok(!t.includes('test-only-pass'));assert.ok(!t.includes('Shae polo'));assert.equal(r.headers.get('cache-control'),'private, no-store')}});
test('wrong password and cross-origin login fail',async()=>{let r=await worker.fetch(request('/team-login',{method:'POST',headers:{Origin:origin},body:'password=wrong'}),env);assert.equal(r.status,401);r=await worker.fetch(request('/team-login',{method:'POST',headers:{Origin:'https://other.example'},body:'password=test-only-pass'}),env);assert.equal(r.status,403)});
test('authenticated routes and images work; secrets and source files are not served',async()=>{const cookie=await login();for(const p of ['/','/uniforms.html','/benefits.html','/uniform-images/polo.jpg']){const r=await worker.fetch(request(p,{headers:{Cookie:cookie}}),env);assert.equal(r.status,200,p)}for(const p of ['/server/index.js','/.openai/hosting.json','/resources.json'])assert.equal((await worker.fetch(request(p,{headers:{Cookie:cookie}}),env)).status,404);});
test('tampered cookies and password rotation invalidate sessions',async()=>{const cookie=await login();assert.equal((await worker.fetch(request('/',{headers:{Cookie:cookie+'x'}}),env)).status,401);assert.equal((await worker.fetch(request('/',{headers:{Cookie:cookie}}),{...env,TEAM_PASSWORD:'changed'})).status,401)});
test('logout clears secure cookie and missing configuration fails closed',async()=>{const r=await worker.fetch(request('/team-logout',{method:'POST',headers:{Origin:origin}}),env);assert.equal(r.status,303);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);assert.equal((await worker.fetch(request('/'),{})).status,503)});
test('uniform handoff uses verified mailbox and offers download fallback',async()=>{const cookie=await login();const js=await (await worker.fetch(request('/uniforms.js',{headers:{Cookie:cookie}}),env)).text();assert.ok(js.includes('mailto:06123@chick-fil-a.com?subject='));assert.ok(!js.includes('mailto:t@'));assert.ok(js.includes('download-request'));});

test('Safari null-origin same-origin submissions work without allowing external forms',async()=>{
 for(const path of ['/team-login','/team-logout']){
  const post=(headers)=>worker.fetch(request(path,{method:'POST',headers,body:'password=test-only-pass'}),env);
  assert.equal((await post({Origin:'null','Sec-Fetch-Site':'same-origin'})).status,303);
  assert.equal((await post({'Sec-Fetch-Site':'same-origin'})).status,303);
  for(const site of ['cross-site','same-site','none'])assert.equal((await post({Origin:'null','Sec-Fetch-Site':site})).status,403);
  assert.equal((await post({Origin:'null'})).status,403);
  assert.equal((await post({Origin:'https://other.example','Sec-Fetch-Site':'same-origin'})).status,403);
 }
 assert.equal((await worker.fetch(request('/'),env)).headers.get('referrer-policy'),'same-origin');
});
