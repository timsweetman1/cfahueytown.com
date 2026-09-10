import {database} from './storage.js';
import {identityFor,checkPassword,signSession,sessionCookie,fingerprint,loginAttempt} from './auth.js';
function sameOriginRequest(req,url){return req.headers.get('origin')===url.origin}
async function authorized(req,env){return !!env.identity}
function leaderLogin(error='') {return login(error).replace('Welcome to Team Care.','Leader sign in').replace('Enter the team password to find benefits, local help, and uniform requests.','Use your individual leader credentials.').replace('action="/benefits/team-login"','action="/benefits/leader-login"').replace('<label for="password">Team password</label>','<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required><label for="password">Password</label>').replace('Open Team Care','Sign in').replace('Ask your restaurant leader if you need the password. This is a shared resource hub, not a private employee account.','Contact Tim if you need a leader account.')}
export async function handle(req,source=process.env,dependencies={}){
 const env={...source};const url=new URL(req.url);const originalPath=url.pathname;
 if(originalPath==='/benefits'&&req.method==='GET')return response(null,308,{'Location':'/benefits/'});
 if(!originalPath.startsWith('/benefits/')&&originalPath!=='/benefits')return response('Not found',404);
 url.pathname=originalPath.slice('/benefits'.length)||'/';
 if(!env.APP_ORIGIN||!env.TEAM_PASSWORD_HASH||!env.TEAM_SESSION_SECRET||env.TEAM_SESSION_SECRET.length<32||!env.DATABASE_URL)return response('Team Care setup is not complete. Please contact your usual leader.',503);
 if(url.origin!==env.APP_ORIGIN)return response('Incorrect application address.',400);
 try{
 env.DB=dependencies.database||database(env.DATABASE_URL);
 env.identity=await identityFor(req,env);
 const leaders=await env.DB.prepare('SELECT email FROM care_leaders WHERE active = true').all();env.LEADER_EMAILS=leaders.results.map(x=>x.email).join(',');
 if(url.pathname==='/leader-login'&&req.method==='GET')return response(leaderLogin(),200,{'Content-Type':'text/html; charset=utf-8'});
 if(['/team-login','/leader-login'].includes(url.pathname)&&req.method==='POST'){
  if(req.headers.get('origin')!==env.APP_ORIGIN)return response('Open sign-in from Team Care.',403);
  const raw=await req.text();if(raw.length>2048)return response('Request too large',413);
  const form=new URLSearchParams(raw);const isLeader=url.pathname==='/leader-login';const email=(form.get('email')||'').trim().toLowerCase();
  // Account-scoped durable throttling cannot be bypassed by spoofing IP headers.
  if(!await loginAttempt(env.DB,isLeader?'leader:'+email:'employee'))return response(isLeader?leaderLogin('Too many attempts. Try again in 10 minutes.'):login('Too many attempts. Try again in 10 minutes.'),429,{'Content-Type':'text/html','Retry-After':'600'});
  const hash=isLeader?JSON.parse(env.LEADER_PASSWORD_HASHES||'{}')[email]:env.TEAM_PASSWORD_HASH;
  const passwordValid=await checkPassword(form.get('password')||'',hash);
  if(!passwordValid||(isLeader&&!careLeaders(env).includes(email)))return response(isLeader?leaderLogin('Sign-in details did not match.'):login('Sign-in details did not match.'),401,{'Content-Type':'text/html'});
  const token=signSession({role:isLeader?'leader':'employee',...(isLeader?{email}:{}),version:fingerprint(hash)},env);
  return response(null,303,{'Location':isLeader?'/benefits/leaders.html':'/benefits/','Set-Cookie':sessionCookie(token)});
 }
 if(url.pathname==='/team-logout'&&req.method==='POST'){
  if(req.headers.get('origin')!==env.APP_ORIGIN)return response('Invalid request',403);
  return response(null,303,{'Location':'/benefits/','Set-Cookie':sessionCookie('')});
 }
 const ai=await groqRoute(req,env,url);if(ai)return ai;
 const api=await careAPI(req,env,url);if(api)return api;
 if(url.pathname==='/leaders.html'&&!careLeader(req,env))return response(leaderLogin(),401,{'Content-Type':'text/html; charset=utf-8'});
 if(!env.identity)return response(req.method==='HEAD'?null:login(),401,{'Content-Type':'text/html; charset=utf-8'});
 if(!['GET','HEAD'].includes(req.method))return response('Method not allowed',405);
 const name=url.pathname==='/'?'/index.html':url.pathname;const asset=ASSETS[name];
 if(!asset)return response('Page not found',404);
 if(req.method==='GET'&&['/index.html','/benefits.html','/uniforms.html'].includes(name))await careCount(env,name);
 return response(req.method==='HEAD'?null:Buffer.from(asset.data,'base64'),200,{'Content-Type':asset.type});
 }catch{return response('Unable to complete this action. Please retry or contact your usual leader.',503)}
}
