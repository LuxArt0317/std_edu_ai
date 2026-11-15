import {useEffect,useRef,useState} from 'react';
import {readAssistantConversation,saveAssistantConversation,sanitizeAssistantMessages,MAX_CONVERSATION_MESSAGES,type AssistantMessage} from '../../services/assistantConversation';
import {boundedAssistantText} from '../../services/assistantActivityBudget.js';
import {conversationRequest,newAssistantSession,readAssistantSessions,remoteSession,saveAssistantSessions,type AssistantSession,type SessionIndex,type SessionCacheResult} from '../../services/assistantSessions';

type SaveFailure={serialized:string;messages:AssistantMessage[];title:string;error:string};

function recentCompleteTurns(messages:AssistantMessage[]) {
  let start=0;
  while(messages.length-start>MAX_CONVERSATION_MESSAGES){
    const nextUser=messages.findIndex((message,index)=>index>start&&message.role==='user');
    if(nextUser<0)break; // Keep an oversized live turn intact; persistence reports its limit.
    start=nextUser;
  }
  // Live action payloads and image bytes remain available until explicitly used.
  return messages.slice(start);
}

export function useAssistantSessions(scope:string|null){
  const [state,setState]=useState<{scope:string|null;activeId:string;chats:AssistantSession[];remote:SessionIndex[]}>({scope:null,activeId:'',chats:[],remote:[]});
  const [operationError,setOperationError]=useState(''),[syncing,setSyncing]=useState(false),[loadingChat,setLoadingChat]=useState(false);
  const [saveFailures,setSaveFailures]=useState(new Map<string,SaveFailure>());
  const [cache,setCache]=useState<{scope:string;chats:AssistantSession[];result:SessionCacheResult}|null>(null);
  const [retry,setRetry]=useState(0);
  const generation=useRef(0),synced=useRef(new Map<string,string>()),saving=useRef(false);
  const loadingRequest=useRef(false),deleted=useRef(new Set<string>());
  const savedInputs=useRef(new Map<string,{messages:AssistantMessage[];title:string}>());
  const active=state.scope===scope?state.chats.find(chat=>chat.id===state.activeId):undefined;
  const fingerprint=(chat:AssistantSession)=>JSON.stringify({title:chat.title.trim(),messages:sanitizeAssistantMessages(chat.messages)});
  useEffect(()=>{
    const epoch=++generation.current,controller=new AbortController();synced.current.clear();savedInputs.current.clear();deleted.current.clear();saving.current=false;loadingRequest.current=false;setOperationError('');setSaveFailures(new Map());setCache(null);setSyncing(false);setLoadingChat(false);
    if(!scope){setState({scope:null,activeId:'',chats:[],remote:[]});return ()=>controller.abort();}
    const stored=readAssistantSessions(scope);
    // Upgrade the prior single-chat history without losing its observed activity.
    if(stored.chats.length===1&&!stored.chats[0].messages.length){const legacy=readAssistantConversation(scope);if(legacy.length){stored.chats[0].messages=legacy;stored.chats[0].title=boundedAssistantText(legacy.find(item=>item.role==='user')?.content,80)||'Earlier conversation';}}
    setState({scope,...stored,remote:[]});
    if(scope.startsWith('account:'))void conversationRequest<{conversations:Record<string,unknown>[]}>(scope,'GET',undefined,undefined,controller.signal).then(result=>{
      if(epoch!==generation.current)return;
      setState(previous=>({...previous,remote:result.conversations.map(remoteSession).filter(chat=>!deleted.current.has(chat.id))}));
    }).catch(error=>{if(!controller.signal.aborted&&epoch===generation.current)setOperationError(error.message);});
    return ()=>{controller.abort();generation.current++;};
  },[scope]);
  useEffect(()=>{
    if(!scope||state.scope!==scope)return;
    setCache({scope,chats:state.chats,result:saveAssistantSessions(scope,state)});
    if(active)saveAssistantConversation(scope,active.messages);
  },[scope,state,active,retry]);
  useEffect(()=>{
    if(!scope?.startsWith('account:')||state.scope!==scope||saving.current||loadingChat)return;
    let pending:{chat:AssistantSession;messages:AssistantMessage[];serialized:string}|undefined;
    for(const chat of state.chats){
      if(!chat.messages.length||chat.messages.some(message=>message.phase==='working'))continue;
      try{
        const messages=sanitizeAssistantMessages(chat.messages),serialized=JSON.stringify({title:chat.title.trim(),messages});
        // One failed conversation must not hold up unrelated ones. Edits retry
        // automatically; an unchanged failed request waits for explicit retry.
        const failure=saveFailures.get(chat.id);
        if(failure?.serialized===serialized){
          if(failure.messages!==chat.messages||failure.title!==chat.title)setSaveFailures(previous=>new Map(previous).set(chat.id,{...failure,messages:chat.messages,title:chat.title}));
          continue;
        }
        if(synced.current.get(chat.id)===serialized){savedInputs.current.set(chat.id,{messages:chat.messages,title:chat.title});continue;}
        pending={chat,messages,serialized};break;
      }catch{
        // The per-chat browser report exposes the same preparation failure.
        // Keep this live turn and continue looking for another savable chat.
      }
    }
    if(!pending)return;
    const {chat,messages,serialized}=pending;
    const epoch=generation.current,timer=setTimeout(()=>{
      if(loadingRequest.current||epoch!==generation.current)return;
      saving.current=true;setSyncing(true);
      void conversationRequest<Record<string,unknown>>(scope,'POST',undefined,{id:chat.id,title:chat.title,version:chat.version,messages}).then(row=>{
        if(epoch!==generation.current)return;
        const saved=remoteSession(row);
        if(row.id!==chat.id||typeof row.title!=='string'||!Array.isArray(row.messages)||!Number.isInteger(row.version)||saved.version<Math.max(1,chat.version)
          ||!Number.isFinite(Date.parse(saved.updatedAt))||fingerprint(saved)!==serialized)
          throw new Error('The saved conversation did not match this version. Retry saving it.');
        synced.current.set(chat.id,serialized);savedInputs.current.set(chat.id,{messages:chat.messages,title:chat.title});
        setSaveFailures(previous=>{if(!previous.has(chat.id))return previous;const next=new Map(previous);next.delete(chat.id);return next;});
        setState(previous=>({...previous,chats:previous.chats.map(item=>item.id===saved.id?{...item,version:saved.version,updatedAt:saved.updatedAt}:item),remote:[saved,...previous.remote.filter(item=>item.id!==saved.id)]}));
      }).catch(error=>{if(epoch===generation.current)setSaveFailures(previous=>new Map(previous).set(chat.id,{serialized,messages:chat.messages,title:chat.title,error:error instanceof Error?error.message:'Conversation could not be saved to your account.'}));}).finally(()=>{if(epoch===generation.current){saving.current=false;setSyncing(false);}});
    },400);
    return ()=>clearTimeout(timer);
  },[scope,state,saveFailures,syncing,loadingChat,retry]);
  function setMessages(update:AssistantMessage[]|((previous:AssistantMessage[])=>AssistantMessage[])){
    setState(previous=>{
      if(previous.scope!==scope)return previous;
      return {...previous,chats:previous.chats.map(chat=>{
        if(chat.id!==previous.activeId)return chat;
        const messages=recentCompleteTurns(typeof update==='function'?update(chat.messages):update);
        return {...chat,messages,title:boundedAssistantText(messages.find(item=>item.role==='user')?.content,80)||chat.title,updatedAt:new Date().toISOString()};
      })};
    });
  }
  function newChat(){
    if(state.chats.filter(chat=>chat.messages.length).length>=20){setOperationError('This tab has 20 conversations. Delete one before starting another.');return;}
    const chat=newAssistantSession();
    setOperationError('');setState(previous=>({...previous,activeId:chat.id,chats:[chat,...previous.chats.filter(item=>item.messages.length)]}));
  }
  async function chooseChat(id:string,forceRemote=false){
    if(!scope||loadingRequest.current||saving.current)return;
    const local=state.chats.find(chat=>chat.id===id);
    if(local&&!forceRemote){setState(previous=>({...previous,activeId:id}));return;}
    if(!scope.startsWith('account:'))return;
    if(!local&&state.chats.filter(chat=>chat.messages.length).length>=20){setOperationError('This tab has 20 conversations. Delete one before loading another.');return;}
    const epoch=generation.current;loadingRequest.current=true;setLoadingChat(true);
    try{
      const row=await conversationRequest<Record<string,unknown>>(scope,'GET',id);
      if(epoch!==generation.current)return;
      if(row.id!==id||typeof row.title!=='string'||!Array.isArray(row.messages)||!Number.isInteger(row.version)||Number(row.version)<1)
        throw new Error('The requested conversation could not be verified.');
      const chat=remoteSession(row);
      synced.current.set(chat.id,fingerprint(chat));savedInputs.current.set(chat.id,{messages:chat.messages,title:chat.title});setOperationError('');
      setSaveFailures(previous=>{const next=new Map(previous);next.delete(id);return next;});
      setState(previous=>({...previous,activeId:id,chats:[chat,...previous.chats.filter(item=>item.id!==id&&item.messages.length)]}));
    }catch(error){if(epoch===generation.current)setOperationError(error instanceof Error?error.message:'Conversation could not be loaded.');}
    finally{if(epoch===generation.current){loadingRequest.current=false;setLoadingChat(false);}}
  }
  async function deleteChat(){
    if(!active||!scope||saving.current||loadingRequest.current)return;
    const epoch=generation.current,id=active.id;loadingRequest.current=true;setLoadingChat(true);
    try{
      // A save can commit even when its response never reaches this browser.
      if(scope.startsWith('account:')){
        const result=await conversationRequest<{deleted:boolean}>(scope,'DELETE',id);
        if(result.deleted!==true)throw new Error('The account did not confirm deletion. Please try again.');
      }
      if(epoch!==generation.current)return;
      const next=newAssistantSession();synced.current.delete(id);savedInputs.current.delete(id);deleted.current.add(id);
      setSaveFailures(previous=>{const remaining=new Map(previous);remaining.delete(id);return remaining;});
      setState(previous=>({...previous,activeId:next.id,chats:[next,...previous.chats.filter(item=>item.id!==id&&item.messages.length)],remote:previous.remote.filter(item=>item.id!==id)}));setOperationError('');
    }catch(error){if(epoch===generation.current)setOperationError(error instanceof Error?error.message:'Conversation could not be deleted.');}
    finally{if(epoch===generation.current){loadingRequest.current=false;setLoadingChat(false);}}
  }
  const conversations=state.scope===scope?[...new Map([...state.remote,...state.chats].map(item=>[item.id,item])).values()]:[];
  const cachedStatus=(chat:AssistantSession)=>{
    const previous=cache?.scope===scope?cache.chats.find(item=>item.id===chat.id):undefined;
    return previous&&previous.messages===chat.messages&&previous.title===chat.title?cache?.result.chats[chat.id]:undefined;
  };
  const cached=active?cachedStatus(active):undefined;
  const failed=active?saveFailures.get(active.id):undefined;
  const activeFailure=failed&&failed.messages===active?.messages&&failed.title===active.title?failed.error:'';
  const saved=active?savedInputs.current.get(active.id):undefined;
  const accountSaved=Boolean(active&&saved?.messages===active.messages&&saved.title===active.title);
  const syncError=cached?.error||activeFailure||operationError;
  const persistenceStatus=cached?.status==='uncached'
    ? accountSaved?'Saved to your account, but not cached in this browser.':'This conversation is only in memory and will be lost on reload.'
    :cached?.status==='previous'
      ? accountSaved?'Saved to your account; this browser has only an earlier copy.':'Latest changes are not cached; this browser has only an earlier copy.'
      :scope?.startsWith('account:')
        ? accountSaved?'Conversation saved to your private account.':cached?.status==='saved'?'Saved in this browser tab; account save is pending.':'Preparing this conversation for saving…'
        :cached?.status==='saved'?'Conversation saved in this browser tab.':'Preparing this conversation for saving…';
  const unsavedConversationIds=state.chats.filter(chat=>{
    const cacheFailure=cachedStatus(chat)?.error,remoteFailure=saveFailures.get(chat.id);
    return cacheFailure||remoteFailure&&remoteFailure.messages===chat.messages&&remoteFailure.title===chat.title;
  }).map(chat=>chat.id);
  function retrySync(){setOperationError('');if(active)setSaveFailures(previous=>{const next=new Map(previous);next.delete(active.id);return next;});setRetry(value=>value+1);}
  return {active,messages:active?.messages||[],setMessages,newChat,chooseChat,deleteChat,conversations,syncError,syncing,loadingChat,retrySync,persistenceStatus,unsavedConversationIds};
}
