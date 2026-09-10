import {createHmac,timingSafeEqual,randomBytes,scrypt as scryptCallback} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
const cookieName='__Host-teamcare-v2';
const ttl=8*3600;
export function safeEqual(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
export function signSession(identity,env,now=Date.now()){
 const value=Buffer.from(JSON.stringify({...identity,exp:Math.floor(now/1000)+ttl,nonce:randomBytes(16).toString('hex')})).toString('base64url');
 return value+'.'+createHmac('sha256',env.TEAM_SESSION_SECRET).update(value).digest('base64url');
}
export function verifySession(token,env,now=Date.now()){
 try{if(!env.TEAM_SESSION_SECRET||env.TEAM_SESSION_SECRET.length<32)return null;const [v,s,extra]=token.split('.');if(extra||!v||!s)return null;
 if(!safeEqual(s,createHmac('sha256',env.TEAM_SESSION_SECRET).update(v).digest('base64url')))return null;
 const data=JSON.parse(Buffer.from(v,'base64url'));if(!Number.isInteger(data.exp)||data.exp<=now/1000||data.exp>now/1000+ttl+60||!['employee','leader'].includes(data.role))return null;return data;
 }catch{return null}
}
export function sessionCookie(token){return `${cookieName}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${token?ttl:0}`}
export async function identityFor(req,env){
 const token=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
 const identity=verifySession(token,env);if(!identity)return null;
 if(identity.role==='employee')return identity.version===fingerprint(env.TEAM_PASSWORD_HASH)?identity:null;
 const hashes=JSON.parse(env.LEADER_PASSWORD_HASHES||'{}');
 if(!hashes[identity.email]||identity.version!==fingerprint(hashes[identity.email]))return null;
 const row=await env.DB.prepare('SELECT email FROM care_leaders WHERE email = ? AND active = true').bind(identity.email).first();return row?identity:null;
}
export function fingerprint(value){return createHmac('sha256','credential-version').update(value||'').digest('hex')}
export async function hashPassword(password){const salt=randomBytes(16).toString('hex');const key=await scrypt(password,salt,64);return `scrypt:${salt}:${key.toString('hex')}`}
export async function checkPassword(password,hash){
 if(typeof password!=='string'||password.length>128)return false;
 const parts=(hash||'').split(':');const valid=parts.length===3&&parts[0]==='scrypt'&&/^[a-f0-9]{32}$/.test(parts[1])&&/^[a-f0-9]{128}$/.test(parts[2]);
 const actual=await scrypt(password,valid?parts[1]:'00000000000000000000000000000000',64);
 return valid&&safeEqual(actual.toString('hex'),parts[2]);
}
export async function loginAttempt(db,key){
 const bucket=createHmac('sha256','login-bucket').update(key).digest('hex');
 const now=Date.now();
 const row=await db.prepare('INSERT INTO care_login_attempts(bucket,attempts,expires) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN care_login_attempts.expires < ? THEN 1 ELSE care_login_attempts.attempts+1 END, expires=CASE WHEN care_login_attempts.expires < ? THEN EXCLUDED.expires ELSE care_login_attempts.expires END RETURNING attempts').bind(bucket,now+600000,now,now).first();
 return row.attempts<=10;
}
