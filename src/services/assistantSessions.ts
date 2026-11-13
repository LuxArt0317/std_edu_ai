import {affairsClient} from '@/features/public/affairs/authClient';
import {sanitizeAssistantMessages,type AssistantMessage} from './assistantConversation';
import {boundedAssistantText} from './assistantActivityBudget.js';
export type AssistantSession={id:string;title:string;messages:AssistantMessage[];version:number;updatedAt:string};
export type SessionIndex=Omit<AssistantSession,'messages'>;
export type SessionCacheResult={chats:Record<string,{status:'saved'|'previous'|'uncached';error:string}>};
const storageKey='stu-campus-assistant-sessions-v2';
const savedTitle=(value:unknown)=>boundedAssistantText(value,100).trim()||'New conversation';
export const newAssistantSession=():AssistantSession=>({id:crypto.randomUUID(),title:'New conversation',messages:[],version:0,updatedAt:new Date().toISOString()});
function cachedChats(value:unknown,interrupted=false):AssistantSession[]{
  return Array.isArray(value)?value.slice(0,20).flatMap((chat:AssistantSession)=>{
    try{return typeof chat?.id==='string'&&typeof chat.title==='string'?[{...chat,title:savedTitle(chat.title),messages:sanitizeAssistantMessages(chat.messages,interrupted)}]:[];}
    catch{return [];}
  }):[];
}
export function readAssistantSessions(scope:string):{activeId:string;chats:AssistantSession[]}{
  try{
    const value=JSON.parse(sessionStorage.getItem(storageKey)||'null');
    if(value?.scope===scope&&Array.isArray(value.chats)){
      const chats=cachedChats(value.chats,true);
      if(chats.length)return {chats,activeId:chats.some((chat:AssistantSession)=>chat.id===value.activeId)?value.activeId:chats[0].id};
    }
    sessionStorage.removeItem(storageKey);
  }catch{ /* A blocked store must not prevent chat. */ }
  const chat=newAssistantSession();return {activeId:chat.id,chats:[chat]};
}
export function saveAssistantSessions(scope:string,state:{activeId:string;chats:AssistantSession[]}):SessionCacheResult{
  const report:SessionCacheResult={chats:Object.create(null)};
  let previous:AssistantSession[]=[];
  try{const value=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(value?.scope===scope)previous=cachedChats(value.chats);}catch{ /* A blocked cache may still reject writes below. */ }
  const old=new Map(previous.map(chat=>[chat.id,chat])),prepared=new Map<string,AssistantSession>();
  let chats=state.chats.slice(0,20).flatMap(chat=>{
    try{
      const safe={...chat,title:savedTitle(chat.title),messages:sanitizeAssistantMessages(chat.messages)};
      prepared.set(chat.id,safe);report.chats[chat.id]={status:'saved',error:''};return [safe];
    }catch(error){
      const saved=old.get(chat.id)?.messages.length?old.get(chat.id):undefined;
      report.chats[chat.id]={status:saved?'previous':'uncached',error:error instanceof RangeError
        ? 'This conversation is too large to save. Your answer remains visible in this tab. Start a new conversation to continue.'
        : 'This conversation could not be prepared for saving. Your answer remains visible in this tab.'};
      return saved?[saved]:[];
    }
  });
  for(const chat of state.chats.slice(20))report.chats[chat.id]={status:'uncached',error:'This conversation exceeds the browser cache limit. Your answer remains visible in this tab.'};
  try{
    const encode=()=>JSON.stringify({scope,activeId:state.activeId,chats});
    const encoder=new TextEncoder();
    while(encoder.encode(encode()).byteLength>900000&&chats.length>1){
      const index=chats.findLastIndex(chat=>chat.id!==state.activeId),removed=chats[index];
      report.chats[removed.id]={status:'uncached',error:report.chats[removed.id].error||'This conversation does not fit in the browser cache. Your answer remains visible in this tab.'};
      chats=chats.filter((_,i)=>i!==index);
    }
    const serialized=encode();
    if(encoder.encode(serialized).byteLength>900000)throw new RangeError('Browser conversation cache limit.');
    sessionStorage.setItem(storageKey,serialized);
  }catch{
    // setItem is atomic. If it fails, only the previous cache can be claimed;
    // never report newly prepared messages as saved or discard live messages.
    for(const chat of state.chats){
      const saved=old.get(chat.id)?.messages.length?old.get(chat.id):undefined,current=prepared.get(chat.id);
      const unchanged=Boolean(saved&&current&&JSON.stringify(saved)===JSON.stringify(current));
      report.chats[chat.id]={status:unchanged?'saved':saved?'previous':'uncached',error:unchanged?'':report.chats[chat.id]?.error||'This conversation could not be saved in this browser. Your answer remains visible in this tab.'};
    }
  }
  return report;
}
export async function conversationRequest<T>(scope:string,method='GET',id?:string,body?:unknown,signal?:AbortSignal):Promise<T>{
  if(!affairsClient||!scope.startsWith('account:'))throw new Error('Sign in to save account conversations.');
  const {data,error}=await affairsClient.auth.getSession();
  if(error||!data.session||`account:${data.session.user.id}`!==scope)throw new Error('Your account changed. Sign in again.');
  const response=await fetch('/api/affairs-conversations'+(id?'?id='+encodeURIComponent(id):''),{method,headers:{Authorization:`Bearer ${data.session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
  const result=await response.json().catch(()=>null);
  if(!response.ok||!result)throw new Error(result?.error||'Conversations are temporarily unavailable.');
  return result;
}
export function remoteSession(row:Record<string,unknown>):AssistantSession{return {id:String(row.id),title:savedTitle(row.title),messages:sanitizeAssistantMessages(row.messages,true),version:Number(row.version),updatedAt:String(row.updated_at)};}
