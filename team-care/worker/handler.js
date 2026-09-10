const encoder=new TextEncoder();
const COOKIE='__Host-teamcare';
const TTL=60*60*12;
const attempts=new Map();
const baseHeaders={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow, noarchive','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com"};
function response(body,status=200,headers={}){return new Response(body,{status,headers:{...baseHeaders,...headers}})}
function hex(bytes){return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('')}
async function sign(value,secret){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(value)))}
async function equal(a,b){const da=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(a)));const db=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(b)));let n=0;for(let i=0;i<da.length;i++)n|=da[i]^db[i];return n===0}
async function authorized(req,env){const token=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);if(!token)return false;const parts=token.split('.');if(parts.length!==3)return false;const [exp,nonce,sig]=parts;if(!/^\d+$/.test(exp)||Number(exp)<=Date.now()/1000||Number(exp)>Date.now()/1000+TTL+60)return false;return equal(sig,await sign(exp+'.'+nonce,env.TEAM_SESSION_SECRET+env.TEAM_PASSWORD));}
// Safari can omit Origin under restrictive referrer policies. Fetch Metadata
// is browser-controlled and provides a same-origin fallback, never same-site.
function sameOriginRequest(req,url){
 const origin=req.headers.get('origin');
 if(origin&&origin!=='null')return origin===url.origin;
 return req.headers.get('sec-fetch-site')==='same-origin';
}
function login(error=''){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Welcome · Hueytown Team Care</title><style>body{font:18px/1.6 system-ui;margin:0;background:#f6f6f6;color:#252525}main{max-width:420px;margin:10vh auto;padding:32px;background:white;border-radius:24px;border-top:8px solid #dd0031}h1{line-height:1.2}label{display:block;font-weight:600}input,button{box-sizing:border-box;width:100%;padding:14px;font:inherit;border-radius:12px;border:1px solid #888}button{margin-top:18px;background:#dd0031;color:white;border:0;font-weight:700;cursor:pointer}small{display:block;margin-top:24px;color:#555}.error{color:#a00020}@media(max-width:520px){main{margin:24px 16px;padding:24px}}</style></head><body><main><p>Chick-fil-A Hueytown</p><h1>Welcome to Team Care.</h1><p>Enter the team password to find benefits, local help, and uniform requests.</p>${error?'<p class="error" role="alert">'+error+'</p>':''}<form method="post" action="/team-login"><label for="password">Team password</label><input id="password" name="password" type="password" required maxlength="128" autocomplete="current-password"><button>Open Team Care</button></form><small>Ask your restaurant leader if you need the password. This is a shared resource hub, not a private employee account.</small></main></body></html>`}
export default {async fetch(req,env){
const url=new URL(req.url);
if(url.pathname==='/robots.txt')return response('User-agent: *\nDisallow: /\n',200,{'Content-Type':'text/plain'});
if(!env.TEAM_PASSWORD||!env.TEAM_SESSION_SECRET)return response('Team Care is temporarily unavailable. Please use your usual restaurant contact.',503,{'Content-Type':'text/plain'});
if(url.pathname==='/team-login'&&req.method==='POST'){
 if(!sameOriginRequest(req,url))return response('Please sign in from the Team Care page.',403);
 if(Number(req.headers.get('content-length')||0)>2048)return response('Request too large',413);
 const ip=req.headers.get('cf-connecting-ip')||'unknown';const now=Date.now();
 for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);
 if(attempts.size>10000)attempts.clear();
 const state=attempts.get(ip)||{count:0,until:now+600000};
 if(state.count>=10)return response(login('Too many attempts. Please try again in 10 minutes.'),429,{'Content-Type':'text/html; charset=utf-8','Retry-After':'600'});
 const text=await req.text();if(text.length>2048)return response('Request too large',413);
 const password=new URLSearchParams(text).get('password')||'';
 if(!await equal(password,env.TEAM_PASSWORD)){state.count++;attempts.set(ip,state);return response(login('That password did not match. Please try again.'),401,{'Content-Type':'text/html; charset=utf-8'})}
 attempts.delete(ip);const exp=String(Math.floor(Date.now()/1000)+TTL),nonce=crypto.randomUUID();const value=exp+'.'+nonce;const sig=await sign(value,env.TEAM_SESSION_SECRET+env.TEAM_PASSWORD);
 return response(null,303,{'Location':'/','Set-Cookie':`${COOKIE}=${value}.${sig}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${TTL}`});
}
if(url.pathname==='/team-logout'&&req.method==='POST'){
 if(!sameOriginRequest(req,url))return response('Invalid request',403);
 return response(null,303,{'Location':'/','Set-Cookie':`${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`});
}
const aiResult=await groqRoute(req,env,url);if(aiResult)return aiResult;
const careResult=await careAPI(req,env,url);if(careResult)return careResult;
if(url.pathname==='/leaders.html'){
 if(!req.headers.get('oai-authenticated-user-id'))return response('<a href="/signin-with-chatgpt?return_to=%2Fleaders.html" target="_top">Sign in with ChatGPT to open the leader dashboard</a>',401,{'Content-Type':'text/html'});
 if(!careLeader(req,env))return response('This account has not been approved for leader access. Contact Tim.',403);
}
if(!careLeader(req,env)&&!await authorized(req,env))return response(req.method==='HEAD'?null:login(),401,{'Content-Type':'text/html; charset=utf-8'});
if(!['GET','HEAD'].includes(req.method))return response('Method not allowed',405,{'Allow':'GET, HEAD'});
const name=url.pathname==='/'?'/index.html':url.pathname;
const asset=Object.hasOwn(ASSETS,name)?ASSETS[name]:null;
if(!asset)return response('Page not found. Return to Team Care.',404,{'Content-Type':'text/plain'});
if(req.method==='GET'&&['/index.html','/uniforms.html','/benefits.html'].includes(name))await careCount(env,name);
const bytes=Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0));
return response(req.method==='HEAD'?null:bytes,200,{'Content-Type':asset.type});
}};
