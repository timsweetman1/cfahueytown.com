import {createHmac} from 'node:crypto';
import {transaction} from './store.js';
import {digest,requireValue} from './accounts.js';

// Fingerprint of the random key held by the restaurant's private mail worker.
const workerFingerprint='199d5d48c01049dbe62e5d682ff7ed32f95b664626297c491fe650ca86431e1a';
export function authorizeNotifier(header){
  const token=typeof header==='string'&&/^Bearer ([a-f0-9-]{72})$/.exec(header)?.[1];
  requireValue(token&&digest(token)===workerFingerprint,403,'Notification worker authorization required.');
  return token;
}
export async function completionAlerts(db,input){
  if(input.action==='list'){
    const result=await db.query(`SELECT id,email,completed_at FROM orientation.completion_alerts
      WHERE sent_at IS NULL ORDER BY completed_at,id LIMIT 25`);
    return {alerts:result.rows};
  }
  requireValue(input.action==='sent'&&typeof input.id==='string'&&
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.id),400,'Invalid receipt.');
  const result=await db.query(`UPDATE orientation.completion_alerts SET sent_at=coalesce(sent_at,now())
    WHERE id=$1 RETURNING id`,[input.id]);
  requireValue(result.rowCount===1,404,'Alert not found.');
  return {ok:true};
}

const validId=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
export async function invitationMail(db,input,workerKey){
  if(input.action==='configureInvitations'){
    requireValue(typeof input.url==='string'&&/^https:\/\/script\.google\.com\/macros\/s\/[\w-]{35,160}\/exec$/.test(input.url)
      &&typeof input.wake==='string'&&/^[a-f0-9-]{72}$/.test(input.wake),400,'Invalid sender configuration.');
    await db.query(`INSERT INTO orientation.mail_delivery VALUES(true,$1,$2) ON CONFLICT(singleton)
      DO UPDATE SET endpoint=excluded.endpoint,wake_key=excluded.wake_key`,[input.url,input.wake]);
    return {ok:true};
  }
  if(input.action==='listInvitations'){
    const result=await db.query(`SELECT i.id FROM orientation.invitation_emails i JOIN orientation.accounts a USING(email)
      WHERE i.sent_at IS NULL AND a.active AND a.password_hash IS NULL AND a.invite_expires>now()
      ORDER BY i.requested_at LIMIT 25`);
    return {ids:result.rows.map(row=>row.id)};
  }
  requireValue(validId(input.id),400,'Invalid invitation.');
  if(input.action==='invitationSent'){
    await db.query('UPDATE orientation.invitation_emails SET sent_at=coalesce(sent_at,now()) WHERE id=$1',[input.id]);
    return {ok:true};
  }
  requireValue(input.action==='prepareInvitation',400,'Invalid action.');
  return transaction(db,async client=>{
    // Lock the account first, matching the manager's ordering during a resend or revocation.
    const row=(await client.query(`SELECT a.email FROM orientation.invitation_emails i JOIN orientation.accounts a USING(email)
      WHERE i.id=$1 AND i.sent_at IS NULL AND a.active AND a.password_hash IS NULL AND a.invite_expires>now()
      FOR UPDATE OF a`,[input.id])).rows[0];
    if(!row)return {invitation:null};
    const token=createHmac('sha256',workerKey).update('learner-invite:'+input.id).digest('base64url');
    const result=await client.query(`UPDATE orientation.accounts SET invite_hash=$2 WHERE email=$1 AND EXISTS
      (SELECT 1 FROM orientation.invitation_emails WHERE email=$1 AND id=$3 AND sent_at IS NULL) RETURNING invite_expires`,
      [row.email,digest(token),input.id]);
    if(!result.rows.length)return {invitation:null};
    return {invitation:{email:row.email,token,expires:result.rows[0].invite_expires}};
  });
}

export async function dispatchInvitation(db,job){
  try{
    const config=(await db.query('SELECT endpoint,wake_key FROM orientation.mail_delivery WHERE singleton')).rows[0];
    if(config){
      // Apps Script sends before returning a redirect to its plain-text response.
      await fetch(config.endpoint,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(9000),
        headers:{'Content-Type':'application/json'},body:JSON.stringify({id:job.id,wake:config.wake_key})});
    }
    const row=(await db.query('SELECT sent_at FROM orientation.invitation_emails WHERE id=$1',[job.id])).rows[0];
    return {email:job.email,status:row?.sent_at?'sent':'queued'};
  }catch{
    // The invitation transaction is already committed. The scheduled sender retries it.
    return {email:job.email,status:'queued'};
  }
}
