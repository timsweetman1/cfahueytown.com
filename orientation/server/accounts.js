import {createHash,randomBytes,timingSafeEqual,scrypt as derive} from 'node:crypto';
import {promisify} from 'node:util';
import {transaction} from './store.js';
const scrypt=promisify(derive);
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const secret=()=>randomBytes(32).toString('base64url');
export const normalize=value=>typeof value==='string'?value.trim().toLowerCase():'';
export function requireValue(value,status,message){if(!value){const err=new Error(message);err.status=status;throw err}}
const validEmail=e=>e.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
function passwordOK(value){return typeof value==='string' && [...value].length>=12 && Buffer.byteLength(value)<=512}
async function hash(password,salt) {
  const key=await scrypt(password,salt,32,{N:32768,r:8,p:3,maxmem:64*1024*1024});
  return key.toString('hex');
}
export async function limit(db,key,max) {
  const answer=await db.query(`INSERT INTO orientation.limits AS l VALUES ($1,1,now()+interval '10 minutes')
    ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN l.expires<now() THEN 1 ELSE l.count+1 END,
      expires=CASE WHEN l.expires<now() THEN excluded.expires ELSE l.expires END RETURNING count`,[digest(key)]);
  requireValue(answer.rows[0].count<=max,429,'Too many attempts. Try again in ten minutes.');
}
export async function account(db,cookie) {
  if(!/^[\w-]{43}$/.test(cookie||''))return null;
  const {rows}=await db.query(`SELECT a.email,a.manager FROM orientation.sessions s JOIN orientation.accounts a USING(email)
    WHERE s.token_hash=$1 AND s.expires>now() AND a.active`,[digest(cookie)]);
  return rows[0]||null;
}
async function session(db,email) {
  const token=secret();
  await db.query("DELETE FROM orientation.sessions WHERE expires<=now()");
  await db.query("INSERT INTO orientation.sessions VALUES ($1,$2,now()+interval '7 days')",[digest(token),email]);
  return token;
}
export async function login(db,input) {
  const email=normalize(input.email),password=input.password;
  requireValue(typeof password==='string' && Buffer.byteLength(password)<=512 && validEmail(email),401,'Email or password is incorrect.');
  const {rows}=await db.query('SELECT password_hash FROM orientation.accounts WHERE email=$1 AND active',[email]);
  const stored=rows[0]?.password_hash;
  const [salt,expected]=stored?.split('.')||['0'.repeat(32),'0'.repeat(64)];
  const actual=await hash(password,salt);
  requireValue(timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(actual,'hex')) && stored,401,'Email or password is incorrect.');
  return transaction(db,async client=>{
    const verified=await client.query('SELECT 1 FROM orientation.accounts WHERE email=$1 AND active AND password_hash=$2 FOR UPDATE',[email,stored]);
    requireValue(verified.rowCount,401,'Email or password is incorrect.');
    return session(client,email);
  });
}
export async function activate(db,input,config) {
  const email=normalize(input.email);
  requireValue(validEmail(email)&&typeof input.token==='string'&&/^[\w-]{43}$/.test(input.token),400,'Use the complete setup link from your manager.');
  requireValue(passwordOK(input.password),400,'Choose a password of at least 12 characters and no more than 512 bytes.');
  const tokenHash=digest(input.token);
  const manager=Date.parse(config.expires)>Date.now()&&config.managers.some(m=>m.addressHash===digest(email)&&m.tokenHash===tokenHash);
  const salt=randomBytes(16).toString('hex');
  const stored=salt+'.'+await hash(input.password,salt);
  return transaction(db,async client=>{
    if(manager) await client.query(`INSERT INTO orientation.accounts(email,manager,invite_hash,invite_expires)
      VALUES ($1,true,$2,$3) ON CONFLICT DO NOTHING`,[email,tokenHash,config.expires]);
    const updated=await client.query(`UPDATE orientation.accounts SET password_hash=$1,invite_hash=NULL,invite_expires=NULL
      WHERE email=$2 AND invite_hash=$3 AND invite_expires>now() AND active RETURNING email`,[stored,email,tokenHash]);
    requireValue(updated.rowCount===1,400,'This setup link has expired or has already been used. Ask your manager for a new one.');
    await client.query('DELETE FROM orientation.sessions WHERE email=$1',[email]);
    return session(client,email);
  });
}
export async function manage(db,input,config) {
  const email=normalize(input.email),action=input.action;
  requireValue(validEmail(email),400,'Enter a valid learner email.');
  requireValue(!config.managers.some(m=>m.addressHash===digest(email)),403,'Manager accounts cannot be changed here.');
  requireValue(['invite','reset','revoke'].includes(action),400,'Choose an invitation action.');
  return transaction(db,async client=>{
    const token=secret(), key=digest(token);
    if(action==='invite') {
      const changed=await client.query(`INSERT INTO orientation.accounts AS a(email,invite_hash,invite_expires)
        VALUES($1,$2,now()+interval '7 days') ON CONFLICT(email) DO UPDATE SET invite_hash=$2,
        invite_expires=excluded.invite_expires,active=true,password_hash=NULL
        WHERE NOT a.manager AND (NOT a.active OR a.password_hash IS NULL) RETURNING email`,[email,key]);
      requireValue(changed.rowCount,409,'This learner already has a password. Use Reset password if needed.');
    }else{
      const changed=await client.query(action==='revoke'
        ?'UPDATE orientation.accounts SET active=false,invite_hash=NULL,invite_expires=NULL,password_hash=NULL WHERE email=$1 AND NOT manager'
        :"UPDATE orientation.accounts SET invite_hash=$2, invite_expires=now()+interval '7 days',password_hash=NULL WHERE email=$1 AND active AND NOT manager",
        action==='revoke'?[email]:[email,key]);
      requireValue(changed.rowCount,404,'Learner not found.');
    }
    await client.query('DELETE FROM orientation.sessions WHERE email=$1',[email]);
    return action==='revoke'?{}:{token,email};
  });
}
