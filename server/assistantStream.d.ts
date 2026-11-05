export type AssistantProgress = {kind:string;label:string;detail:string;status:'running'|'complete'|'unavailable'};
export function createAssistantStream(requested:unknown,response:{status:(code:number)=>unknown;json:(payload:unknown)=>void;setHeader:(name:string,value:string)=>void;write?:(chunk:string)=>void;end?:()=>void;flushHeaders?:()=>void}):{
  enabled:boolean;
  progress:(kind:string,label:string,detail:string,status?:AssistantProgress['status'])=>void;
  send:(status:number,payload:unknown)=>void;
};
