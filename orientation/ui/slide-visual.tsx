"use client";
import {useRef,useState} from "react";
export default function SlideVisual({id,title}:{id:string,title:string}){
 const full=useRef<HTMLDialogElement>(null),[failed,fail]=useState(false);
 if(failed)return null;
 const src="/orientation/service/media?file=slide-"+id+".webp";
 return <figure className="slide-art"><button className="open-art" aria-label={"Enlarge slide illustration: "+title} onClick={()=>full.current?.showModal()}><img src={src} alt={title+" — orientation slide"} onError={()=>fail(true)}/><span>Enlarge ↗</span></button><dialog ref={full} aria-label={title} onClick={e=>{if(e.target===e.currentTarget)full.current?.close()}}><button className="close-art" autoFocus onClick={()=>full.current?.close()}>Close ×</button><img src={src} alt={title+" — orientation slide"}/></dialog></figure>;
}
