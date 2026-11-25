import {digest,requireValue} from './accounts.js';

// Fingerprint of the random key held by the restaurant's private mail worker.
const workerFingerprint='199d5d48c01049dbe62e5d682ff7ed32f95b664626297c491fe650ca86431e1a';
export function authorizeNotifier(header){
  const token=typeof header==='string'&&/^Bearer ([a-f0-9-]{72})$/.exec(header)?.[1];
  requireValue(token&&digest(token)===workerFingerprint,403,'Notification worker authorization required.');
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
