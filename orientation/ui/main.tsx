import {useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import Course from './course';
const base='/orientation';
const endpoint=base+'/service/';
async function call(op:string,input?:object){
  const response=await fetch(endpoint+op,input===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'Please try again.');
  return result;
}
function Header({signOut}:{signOut?:()=>void}){
  return <header><div className="brand"><img src="/logo-transparent.png" alt="Chick-fil-A"/><span>Hueytown</span></div>{signOut&&<button className="text-button" onClick={signOut}>Sign out</button>}</header>;
}
function SignIn(){
  const [token]=useState(()=>new URLSearchParams(location.hash.slice(1)).get('invite')||sessionStorage.getItem('orientation-setup')||'');
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{if(token){sessionStorage.setItem('orientation-setup',token);history.replaceState(null,'',base+'/activate')}},[token]);
  async function submit(e:React.FormEvent){e.preventDefault();setMessage('');
    if(token&&password!==confirm){setMessage('The passwords do not match.');return}
    setBusy(true);
    try{await call(token?'activate':'login',{email,password,token});sessionStorage.removeItem('orientation-setup');location.replace(location.pathname.endsWith('/records')?base+'/records':base)}
    catch(error){setMessage((error as Error).message);setBusy(false)}
  }
  return <><Header/><main className="account"><p className="eyebrow">Team member orientation</p><h1>{token?'Create your password':'Sign in to orientation'}</h1>
    <form className="fields" onSubmit={submit}><label>Email address<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <label>{token?'New password':'Password'}<input type="password" minLength={token?12:1} autoComplete={token?'new-password':'current-password'} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
    {token&&<><small>Use at least 12 characters.</small><label>Confirm password<input type="password" autoComplete="new-password" required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label></>}
    <button className="primary" disabled={busy}>{busy?'Please wait…':token?'Set password and open orientation':'Sign in'}</button></form>
    {message&&<p role="alert" className="notice">{message}</p>}
    <footer>{token?<a href={base} onClick={()=>sessionStorage.removeItem('orientation-setup')}>Already have a password? Sign in</a>:'First time here or forgot your password? Ask your orientation manager for a personal setup link.'}</footer></main></>;
}
type Row={email:string;active:boolean;manager:boolean;enrolled:boolean;progress:number;retries:string;updated:string|null};
function Records({signOut}:{signOut:()=>void}){
  const [rows,setRows]=useState<Row[]>([]),[total,setTotal]=useState(0),[email,setEmail]=useState(''),[link,setLink]=useState(''),[target,setTarget]=useState(''),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false);
  async function refresh(){const d=await call('roster');setRows(d.rows);setTotal(d.total)}
  useEffect(()=>{refresh().catch(e=>setMsg(e.message))},[]);
  async function change(address:string,action:string){if(busy)return;
    if(action==='revoke'&&!confirm('Remove orientation access for '+address+'? Their progress will be kept.'))return;
    if(action==='reset'&&!confirm('Create a new password setup link for '+address+' and sign them out?'))return;
    setBusy(true);setMsg('');setLink('');
    try{const d=await call('manage',{email:address,action});
      if(d.token){setTarget(d.email);setLink(location.origin+base+'/activate#invite='+d.token);setEmail('')}
      else setMsg('Access removed.');await refresh();
    }catch(e){setMsg((e as Error).message)}finally{setBusy(false)}
  }
  return <><Header signOut={signOut}/><main className="report"><a href={base}>Back to orientation</a><h1>Learner records</h1>
    <h2>Invite a new hire</h2><form className="fields" onSubmit={e=>{e.preventDefault();change(email,'invite')}}><label>Learner’s email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><button disabled={busy} className="primary">Create invitation</button></form>
    {link&&<div className="invite"><b>Personal setup link for {target}</b><p>Send this link directly to the learner. It expires in seven days and can be used once.</p><a href={link}>{link}</a><p><button onClick={async()=>{try{await navigator.clipboard.writeText(link);setMsg('Setup link copied.')}catch{setMsg('Select and copy the link above.')}}}>Copy setup link</button></p></div>}
    {msg&&<p role="status" className="notice">{msg}</p>}<h2>Progress</h2><div className="tablewrap"><table><thead><tr>{['Email','Account','Course progress','Quiz retries','Last activity','Actions'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
    {rows.map(r=><tr key={r.email}><td>{r.email}</td><td>{!r.active?'Access removed':r.manager?'Manager':r.enrolled?'Active':'Invited'}</td><td>{r.progress>=total?'Completed and acknowledged':r.progress?r.progress+' / '+total:'Not started'}</td><td>{r.retries}</td><td>{r.updated?new Date(r.updated).toLocaleString():'—'}</td><td>{!r.manager&&(r.active?<><button disabled={busy} onClick={()=>change(r.email,r.enrolled?'reset':'invite')}>{r.enrolled?'Reset password':'New setup link'}</button><button disabled={busy} onClick={()=>change(r.email,'revoke')}>Remove access</button></>:<button disabled={busy} onClick={()=>change(r.email,'invite')}>Restore access</button>)}</td></tr>)}</tbody></table></div></main></>;
}
function ImportCourse(){
  const [token,setToken]=useState(''),[files,setFiles]=useState<File[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  async function upload(e:React.FormEvent){e.preventDefault();setBusy(true);try{
    for(let i=0;i<files.length;i++){const file=files[i];setMessage('Importing '+(i+1)+' of '+files.length);
      const bytes=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file)});
      await call('import',{token,name:file.name,bytes});}
    await call('import',{token,name:'finish',bytes:''});setToken('');setMessage('Course imported and ready.');
  }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
  return <><Header/><main className="account"><h1>Import orientation</h1><form className="fields" onSubmit={upload}><label>Release setup key<input required type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)}/></label><label>Course release files<input type="file" multiple required onChange={e=>setFiles(Array.from(e.target.files||[]))}/></label><button disabled={busy} className="primary">Import course</button></form><p role="status">{message}</p></main></>;
}
function App(){
 const [user,setUser]=useState<{email:string;manager:boolean}|null|undefined>(undefined),[data,setData]=useState<any>(null),[error,setError]=useState('');
 const path=location.pathname.replace(/\/$/,'');
 useEffect(()=>{if(path===base+'/import')return;
   const activation=path===base+'/activate'&&(location.hash||sessionStorage.getItem('orientation-setup'));
   if(activation){setUser(null);return}
   call('state').then(async d=>{setUser(d.user);if(d.user&&path!==base+'/records')setData(await call('course'))}).catch(e=>setError(e.message));
 },[]);
 async function signOut(){try{await call('logout',{});sessionStorage.removeItem('orientation-setup');location.assign(base)}catch(e){setError((e as Error).message)}}
 if(path===base+'/import')return <ImportCourse/>;
 if(error)return <><Header signOut={user?signOut:undefined}/><main className="account"><h1>Orientation</h1><p role="alert">{error}</p><button onClick={()=>location.reload()}>Try again</button>{user?.manager&&<p><a href={base+'/records'}>Learner records</a></p>}</main></>;
 if(user===null)return <SignIn/>;
 if(user&&path===base+'/records')return user.manager?<Records signOut={signOut}/>:<><Header signOut={signOut}/><main className="account"><p>Manager access required.</p><a href={base}>Return to orientation</a></main></>;
 return data?<Course {...data} onLogout={signOut}/>:<main className="account"><p>Opening orientation…</p></main>;
}
createRoot(document.getElementById('app')!).render(<App/>);
