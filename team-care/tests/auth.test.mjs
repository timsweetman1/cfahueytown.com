import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {signSession,verifySession,identityFor,hashPassword,checkPassword,fingerprint,sessionCookie} from '../server/auth.js';
import {handle} from '../dist/app.js';
const env={TEAM_SESSION_SECRET:randomBytes(48).toString('hex')};
test('signed sessions reject tampering, expiration and key rotation',()=>{
 const now=Date.now(),token=signSession({role:'employee'},env,now);assert.equal(verifySession(token,env,now).role,'employee');
 assert.equal(verifySession(token+'x',env,now),null);assert.equal(verifySession(token,env,now+9*3600000),null);
 assert.equal(verifySession(token,{TEAM_SESSION_SECRET:randomBytes(48).toString('hex')},now),null);
});
test('forged dispatcher headers do not establish any identity',async()=>{
 const req=new Request('https://example.test/benefits/leaders.html',{headers:{'oai-authenticated-user-id':'123','oai-authenticated-user-email':'06123@chick-fil-a.com'}});
 assert.equal(await identityFor(req,env),null);
});
test('scrypt passwords verify and wrong or malformed credentials fail',async()=>{
 const hash=await hashPassword('a test-only password');assert.equal(await checkPassword('a test-only password',hash),true);
 assert.equal(await checkPassword('wrong',hash),false);assert.equal(await checkPassword('anything',''),false);
});
test('leader sessions require active database membership and current credential',async()=>{
 const email='leader@example.test',hash=await hashPassword('test only');
 const settings={...env,LEADER_PASSWORD_HASHES:JSON.stringify({[email]:hash}),DB:{prepare(){return {bind(){return {first:async()=>null}}}}}};
 const token=signSession({role:'leader',email,version:fingerprint(hash)},settings);
 const req=new Request('https://example.test/benefits/leaders.html',{headers:{cookie:sessionCookie(token)}});
 assert.equal(await identityFor(req,settings),null);
 settings.DB.prepare=()=>({bind:()=>({first:async()=>({email})})});assert.equal((await identityFor(req,settings)).email,email);
 settings.LEADER_PASSWORD_HASHES='{}';assert.equal(await identityFor(req,settings),null);
});
test('employee password rotation revokes signed sessions',async()=>{
 const settings={...env,TEAM_PASSWORD_HASH:'hash-v1'},token=signSession({role:'employee',version:fingerprint('hash-v1')},settings);
 const req=new Request('https://example.test/benefits/',{headers:{cookie:sessionCookie(token)}});
 assert.equal((await identityFor(req,settings)).role,'employee');settings.TEAM_PASSWORD_HASH='hash-v2';assert.equal(await identityFor(req,settings),null);
});
test('cookies have browser security flags and unset configuration fails closed',async()=>{
 assert.match(sessionCookie('test'),/Secure; HttpOnly; SameSite=Lax/);
 const result=await handle(new Request('https://example.test/benefits/'),{});assert.equal(result.status,503);
});
