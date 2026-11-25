export type Slide = {id:string;title:string;display:string[];body:string};
export type Step = {kind:"slide";module:number;slide:Slide}|{kind:"quiz";module:number;question:number;prompt:string;choices:string[]}|{kind:"finish";module:number};
