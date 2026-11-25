"use client";
import SlideVisual from "./slide-visual";
import {useState,useRef,useEffect} from "react";
import type {Step,Slide} from "./types";
function content(slide:Slide){
 const lines=slide.display.slice(2);
 if(slide.id==="01")return <p className="lead">{lines[0]}</p>;
 if(/^01$/.test(lines[0])){let groups=[],i=0; for(;i<lines.length && /^\d{2}$/.test(lines[i]);i+=3)groups.push(<div className="detail" key={i}><span>{lines[i]}</span><div><b>{lines[i+1]}</b><p>{lines[i+2]}</p></div></div>);return <>{groups}{lines.slice(i).map(x=><p key={x}>{x}</p>)}</>}
 return lines.map((x,i)=>x===x.toUpperCase()&&x.length<50?<p className="eyebrow" key={i}>{x}</p>:<p key={i}>{x}</p>);
}
type Props={steps:Step[],names:string[],ack:string[],initial:number,owner:boolean,onLogout:()=>void};
export default function Course({steps,names,ack,initial,owner,onLogout}:Props){
 const [cursor,setCursor]=useState(initial),[pos,setPos]=useState(initial),[choice,choose]=useState<number|null>(null),[checks,check]=useState(ack.map(()=>false)),[busy,setBusy]=useState(false),[msg,message]=useState(""),[feedback,feedbackSet]=useState<{pass:boolean,text:string}|null>(null),[audioOn,sound]=useState(false);
 const player=useRef<HTMLAudioElement>(null),title=useRef<HTMLHeadingElement>(null),pendingId=useRef("");
 const step=steps[pos],slide=step?.kind==="slide"?step.slide:null;
 const question=slide?.display[0].startsWith("FOLLOW-ALONG");
 const choices=step?.kind==="quiz"?step.choices:question?["A","B","C"].map(k=>slide!.display[slide!.display.indexOf(k)+1]):[];
 const starts=names.map((_,i)=>steps.findIndex(s=>s.module===i));
 const percent=Math.round(100*cursor/steps.length);
 function go(n:number){setPos(n);choose(null);message("");feedbackSet(null);pendingId.current="";check(ack.map(()=>false));}
 useEffect(()=>{if(pos!==initial)title.current?.focus();if(audioOn&&player.current)player.current.play().catch(()=>{});},[pos]);
 async function advance(){
   if(busy)return;
   if(feedback?.pass||pos<cursor){go(pos+1);return;}
   setBusy(true);message("");
   try{
     pendingId.current ||=crypto.randomUUID();
     const r=await fetch("/orientation/service/progress",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({step:pos,id:pendingId.current,answer:question&&choice!==null?["A","B","C"][choice]:choice,agreed:checks})});
     if(!r.ok)throw Error("Your progress could not be saved. Check your connection and try again.");
     const data=await r.json() as {next:number,passed:boolean,explanation:string};pendingId.current="";setCursor(data.next);
     if(step.kind==="quiz"){feedbackSet({pass:data.passed,text:data.explanation});if(!data.passed)choose(null);}
     else go(pos+1);
   }catch{message("Your progress could not be saved. Check your connection and try again.");}finally{setBusy(false);}
 }
 const module=step?.module??5;
 return <><header><div className="brand"><img src="/logo-transparent.png" alt="Chick-fil-A"/><span>Hueytown</span></div><div className="headlinks">{owner&&<a href="/orientation/records">Learner records</a>}<button className="text-button" onClick={onLogout}>Sign out</button></div></header>
 <main className="layout"><aside><div className="asidehead"><p className="eyebrow">Team member orientation</p><h2>Your first shift</h2><div className="progress"><i style={{width:percent+"%"}}/></div><small>{percent}% complete</small></div><nav aria-label="Course sections">{names.map((n,i)=><button key={n} disabled={busy||starts[i]>cursor} aria-current={i===module?"step":undefined} onClick={()=>go(starts[i])}><span>{String(i+1).padStart(2,"0")}</span>{n}{cursor>=(starts[i+1]??steps.length)&&<em>✓</em>}</button>)}</nav></aside>
 <section className="lesson" aria-label="Course player">{step?<><div className="kicker"><span>{names[module]}</span><span>{slide?"Slide "+Number(slide.id)+" of 42":step.kind==="quiz"?"Checkpoint "+(module+1)+" of 6":"Acknowledgment"}</span></div>
 <article key={pos}>{slide&&<SlideVisual id={slide.id} title={slide.title}/>}
 <div className="sheet"><p className="eyebrow">{question?"Practice scenario":step.kind==="quiz"?"Question "+(step.question+1)+" of 3":step.kind==="finish"?"Course completion":slide?.id==="01"?"Welcome to the team":"Team member orientation"}</p>
 <h1 tabIndex={-1} ref={title}>{slide?.title??(step.kind==="quiz"?step.prompt:"Before your first shift")}</h1>
 
 {slide&&(question?<p>{slide.display[2]}</p>:<details className="slide-text"><summary>Read slide text</summary>{content(slide)}</details>)}
 {choices.length>0&&<fieldset><legend className="sr">Choose an answer</legend>{choices.map((c,i)=><label className="option" key={i}><input type="radio" checked={choice===i} disabled={busy||feedback?.pass} name="answer" onChange={()=>{choose(i);feedbackSet(null);pendingId.current="";}}/><span>{c}</span></label>)}</fieldset>}
 {feedback&&<div className="feedback" role="status"><b>{feedback.pass?"Correct.":"Try again."}</b> {feedback.text}</div>}
 {step.kind==="finish"&&<fieldset><legend>Check each statement to record completion.</legend>{ack.map((x,i)=><label className="option" key={x}><input type="checkbox" checked={checks[i]} onChange={e=>check(checks.map((old,j)=>i===j?e.target.checked:old))}/>{x}</label>)}</fieldset>}
 {slide&&<div className="voice"><div><span className="eyebrow">Listen to Tim</span><audio key={slide.id} ref={player} controls preload="metadata" src={"/orientation/service/media?file=slide-"+slide.id+".mp3"} onPlay={()=>sound(true)} onPause={e=>{if(!e.currentTarget.ended)sound(false)}} onError={()=>message("Audio is unavailable. You can still use the transcript below.")}/></div><details><summary>Read transcript</summary><p>{slide.body}</p></details></div>}
 </div></article><div className="controls"><button disabled={!pos||busy} onClick={()=>go(pos-1)}>← Back</button><button className="primary" onClick={advance} disabled={busy||pos>=cursor&&((choices.length>0&&choice===null&&!feedback?.pass)||(step.kind==="finish"&&!checks.every(Boolean)))}>{busy?"Saving…":step.kind==="finish"?"Record completion":step.kind==="quiz"&&!feedback?.pass&&pos===cursor?"Check answer":"Continue"} →</button></div>{msg&&<p role="alert">{msg}</p>}
 </>:<article className="sheet"><p className="eyebrow">Orientation complete</p><h1 ref={title} tabIndex={-1}>You’re ready for the walkthrough.</h1><p>Your completion and acknowledgment have been saved. Bring your questions to your orientation host and confirm your first shift, entrance, and trainer.</p><button onClick={()=>go(0)}>Review the course</button></article>}</section></main></>
}
