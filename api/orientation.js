import {authorizeNotifier,completionAlerts,invitationMail,dispatchInvitation} from '../orientation/server/alerts.js';
import {database} from '../orientation/server/store.js';
import {account,activate,digest,limit,login,manage,normalize,requireValue} from '../orientation/server/accounts.js';
import {baseline,config,course,fetchBytes,importFile,progress,released,roster,total} from '../orientation/server/course.js';
const cookieName='__Host-hueytown-orientation';
const cookie=(token='')=>cookieName+'='+token+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+(token?604800:0);
function send(res,status,data){return res.status(status).json(data)}
export async function handle(req,res,getDb=database){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Vary','Cookie');
  try {
    const op=req.query.op,method=req.method;
    const allowed={state:'GET',login:'POST',activate:'POST',logout:'POST',course:'GET',media:'GET',progress:'POST',roster:'GET',manage:'POST',import:'POST',alerts:'POST'};
    requireValue(Object.hasOwn(allowed,op)&&allowed[op]===method,405,'Unsupported request.');
    if(method==='POST'){
      const host=req.headers.host;
      if(op!=='alerts')requireValue(req.headers.origin==='https://'+host,403,'Open the Hueytown orientation page to continue.');
      requireValue((req.headers['content-type']||'').startsWith('application/json'),415,'JSON required.');
    }
    const input=method==='POST'?(typeof req.body==='string'?JSON.parse(req.body):req.body)||{}:{};
    const token=(req.headers.cookie||'').split(';').map(c=>c.trim()).find(c=>c.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    if(op==='state'&&!token)return send(res,200,{user:null});
    if(op==='alerts'){
      const workerKey=authorizeNotifier(req.headers.authorization);
      const db=await getDb();
      return send(res,200,['list','sent'].includes(input.action)
        ?await completionAlerts(db,input):await invitationMail(db,input,workerKey));
    }
    const db=await getDb();
    if(op==='import'){
      requireValue(typeof input.name==='string'&&typeof input.bytes==='string'&&input.bytes.length<=3000000,400,'Invalid file.');
      await importFile(db,input.token,input.name,Buffer.from(input.bytes,'base64'));
      return send(res,200,{ok:true});
    }
    if(op==='login'||op==='activate'){
      const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-real-ip']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
      await limit(db,'ip:'+ip,100);
      await limit(db,'email:'+op+':'+normalize(input.email),15);
      const session=op==='login'?await login(db,input):await activate(db,input,config);
      res.setHeader('Set-Cookie',cookie(session));
      return send(res,200,{ok:true});
    }
    if(op==='logout'){
      if(token)await db.query('DELETE FROM orientation.sessions WHERE token_hash=$1',[digest(token)]);
      res.setHeader('Set-Cookie',cookie());
      return send(res,200,{ok:true});
    }
    const user=await account(db,token);
    if(op==='state')return send(res,200,{user});
    requireValue(user,401,'Sign in to continue.');
    if(op==='roster'||op==='manage'){
      requireValue(user.manager,403,'Manager sign-in required.');
      if(op==='roster')return send(res,200,{rows:await roster(db),total});
      // Only individual mailbox addresses can be grant targets.
      requireValue(!/[,;<>\s]/.test(normalize(input.email)),400,'Enter one learner email address.');
      const job=await manage(db,input,config);
      return send(res,200,job.id?await dispatchInvitation(db,job):job);
    }
    if(op==='course'){
      const result=await course(db);
      return send(res,200,{...result.public,initial:await baseline(db,user.email),owner:user.manager});
    }
    if(op==='progress')return send(res,200,await progress(db,user.email,input));
    const file=req.query.file;
    requireValue(typeof file==='string'&&/^slide-(0[1-9]|[1-3][0-9]|4[0-2])\.(mp3|webp)$/.test(file),404,'File unavailable.');
    requireValue(await released(db),503,'Course is being prepared.');
    const bytes=await fetchBytes(db,file);
    res.setHeader('Content-Type',file.endsWith('.mp3')?'audio/mpeg':'image/webp');
    res.setHeader('Accept-Ranges','bytes');
    if(req.headers.range){
      const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      const start=range?.[1]?Number(range[1]):Math.max(0,bytes.length-Number(range?.[2]||0));
      const end=range?.[1]&&range[2]?Math.min(Number(range[2]),bytes.length-1):bytes.length-1;
      if(!range||start>end||start>=bytes.length){res.setHeader('Content-Range','bytes */'+bytes.length);return res.status(416).end()}
      res.setHeader('Content-Range',`bytes ${start}-${end}/${bytes.length}`);res.setHeader('Content-Length',end-start+1);
      return res.status(206).end(bytes.subarray(start,end+1));
    }
    res.setHeader('Content-Length',bytes.length);return res.status(200).end(bytes);
  } catch(error) {
    if(!error.status)console.error('Orientation request failed',error.code||error.name);
    return send(res,error.status||503,{error:error.status?error.message:'Orientation is temporarily unavailable. Please try again shortly.'});
  }
}
export default handle;
