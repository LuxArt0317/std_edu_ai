import {affairsClient} from '@/features/public/affairs/authClient';
import {sanitizeAssistantMessages,type AssistantMessage} from './assistantConversation';
export type AssistantSession={id:string;title:string;messages:AssistantMessage[];version:number;updatedAt:string};
export type SessionIndex=Omit<AssistantSession,'messages'>;
const storageKey='stu-campus-assistant-sessions-v2';
export const newAssistantSession=():AssistantSession=>({id:crypto.randomUUID(),title:'New conversation',messages:[],version:0,updatedAt:new Date().toISOString()});
export function readAssistantSessions(scope:string):{activeId:string;chats:AssistantSession[]}{
  try{
    const value=JSON.parse(sessionStorage.getItem(storageKey)||'null');
    if(value?.scope===scope&&Array.isArray(value.chats)){
      const chats=value.chats.slice(0,20).flatMap((chat:AssistantSession)=>typeof chat?.id==='string'&&typeof chat.title==='string'?[{...chat,messages:sanitizeAssistantMessages(chat.messages,true)}]:[]);
      if(chats.length)return {chats,activeId:chats.some((chat:AssistantSession)=>chat.id===value.activeId)?value.activeId:chats[0].id};
    }
    sessionStorage.removeItem(storageKey);
  }catch{ /* A blocked store must not prevent chat. */ }
  const chat=newAssistantSession();return {activeId:chat.id,chats:[chat]};
}
export function saveAssistantSessions(scope:string,state:{activeId:string;chats:AssistantSession[]}){
  try{
    let chats=state.chats.slice(0,20).map(chat=>({...chat,messages:sanitizeAssistantMessages(chat.messages)}));
    while(JSON.stringify(chats).length>900000&&chats.length>1){const index=chats.findLastIndex(chat=>chat.id!==state.activeId);chats=chats.filter((_,i)=>i!==index);}
    sessionStorage.setItem(storageKey,JSON.stringify({scope,activeId:state.activeId,chats}));
  }catch{ /* Storage is optional. Account sync reports its own failures. */ }
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
export function remoteSession(row:Record<string,unknown>):AssistantSession{return {id:String(row.id),title:String(row.title),messages:sanitizeAssistantMessages(row.messages,true),version:Number(row.version),updatedAt:String(row.updated_at)};}
