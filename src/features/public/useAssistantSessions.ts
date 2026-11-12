import {useEffect,useRef,useState} from 'react';
import {readAssistantConversation,saveAssistantConversation,sanitizeAssistantMessages,type AssistantMessage} from '../../services/assistantConversation';
import {conversationRequest,newAssistantSession,readAssistantSessions,remoteSession,saveAssistantSessions,type AssistantSession,type SessionIndex} from '../../services/assistantSessions';

export function useAssistantSessions(scope:string|null){
  const [state,setState]=useState<{scope:string|null;activeId:string;chats:AssistantSession[];remote:SessionIndex[]}>({scope:null,activeId:'',chats:[],remote:[]});
  const [syncError,setSyncError]=useState(''),[syncing,setSyncing]=useState(false),[loadingChat,setLoadingChat]=useState(false);
  const generation=useRef(0),synced=useRef(new Map<string,string>()),saving=useRef(false);
  const active=state.scope===scope?state.chats.find(chat=>chat.id===state.activeId):undefined;
  const fingerprint=(chat:AssistantSession)=>JSON.stringify({title:chat.title,messages:sanitizeAssistantMessages(chat.messages)});
  useEffect(()=>{
    const epoch=++generation.current,controller=new AbortController();synced.current.clear();saving.current=false;setSyncError('');setSyncing(false);setLoadingChat(false);
    if(!scope){setState({scope:null,activeId:'',chats:[],remote:[]});return ()=>controller.abort();}
    const stored=readAssistantSessions(scope);
    // Upgrade the prior single-chat history without losing its observed activity.
    if(stored.chats.length===1&&!stored.chats[0].messages.length){const legacy=readAssistantConversation(scope);if(legacy.length){stored.chats[0].messages=legacy;stored.chats[0].title=legacy.find(item=>item.role==='user')?.content.slice(0,80)||'Earlier conversation';}}
    setState({scope,...stored,remote:[]});
    if(scope.startsWith('account:'))void conversationRequest<{conversations:Record<string,unknown>[]}>(scope,'GET',undefined,undefined,controller.signal).then(result=>{
      if(epoch!==generation.current)return;
      setState(previous=>({...previous,remote:result.conversations.map(remoteSession)}));
    }).catch(error=>{if(!controller.signal.aborted&&epoch===generation.current)setSyncError(error.message);});
    return ()=>{controller.abort();generation.current++;};
  },[scope]);
  useEffect(()=>{
    if(!scope||state.scope!==scope)return;
    saveAssistantSessions(scope,state);
    if(active)saveAssistantConversation(scope,active.messages);
  },[scope,state,active]);
  useEffect(()=>{
    if(!scope?.startsWith('account:')||state.scope!==scope||saving.current||syncError)return;
    const chat=state.chats.find(item=>item.messages.length&&!item.messages.some(message=>message.phase==='working')&&synced.current.get(item.id)!==fingerprint(item));
    if(!chat)return;
    const epoch=generation.current,serialized=fingerprint(chat),timer=setTimeout(()=>{
      saving.current=true;setSyncing(true);
      void conversationRequest<Record<string,unknown>>(scope,'POST',undefined,{id:chat.id,title:chat.title,version:chat.version,messages:sanitizeAssistantMessages(chat.messages)}).then(row=>{
        if(epoch!==generation.current)return;
        const saved=remoteSession(row);synced.current.set(chat.id,serialized);
        setState(previous=>({...previous,chats:previous.chats.map(item=>item.id===saved.id?{...item,version:saved.version,updatedAt:saved.updatedAt}:item),remote:[saved,...previous.remote.filter(item=>item.id!==saved.id)]}));
      }).catch(error=>{if(epoch===generation.current)setSyncError(error.message);}).finally(()=>{if(epoch===generation.current){saving.current=false;setSyncing(false);}});
    },400);
    return ()=>clearTimeout(timer);
  },[scope,state,syncError,syncing]);
  function setMessages(update:AssistantMessage[]|((previous:AssistantMessage[])=>AssistantMessage[])){
    setState(previous=>{
      if(previous.scope!==scope)return previous;
      return {...previous,chats:previous.chats.map(chat=>{
        if(chat.id!==previous.activeId)return chat;
        const messages=(typeof update==='function'?update(chat.messages):update).slice(-24);
        return {...chat,messages,title:messages.find(item=>item.role==='user')?.content.slice(0,80)||chat.title,updatedAt:new Date().toISOString()};
      })};
    });
  }
  function newChat(){
    if(state.chats.filter(chat=>chat.messages.length&&!chat.version).length>=20){setSyncError('This tab has 20 unsaved conversations. Save or delete one before starting another.');return;}
    const chat=newAssistantSession();
    setState(previous=>({...previous,activeId:chat.id,chats:[chat,...previous.chats.filter(item=>item.messages.length)].slice(0,20)}));
  }
  async function chooseChat(id:string,forceRemote=false){
    if(!scope||loadingChat||syncing)return;
    const local=state.chats.find(chat=>chat.id===id);
    if(local&&!forceRemote){setState(previous=>({...previous,activeId:id}));return;}
    if(!scope.startsWith('account:'))return;
    const epoch=generation.current;setLoadingChat(true);
    try{
      const chat=remoteSession(await conversationRequest<Record<string,unknown>>(scope,'GET',id));
      if(epoch!==generation.current)return;
      synced.current.set(chat.id,fingerprint(chat));setSyncError('');
      setState(previous=>({...previous,activeId:id,chats:[chat,...previous.chats.filter(item=>item.id!==id)].slice(0,20)}));
    }catch(error){if(epoch===generation.current)setSyncError(error instanceof Error?error.message:'Conversation could not be loaded.');}
    finally{if(epoch===generation.current)setLoadingChat(false);}
  }
  async function deleteChat(){
    if(!active||!scope||syncing||loadingChat)return;
    const epoch=generation.current,id=active.id;setLoadingChat(true);
    try{
      if(scope.startsWith('account:')&&(active.version||state.remote.some(item=>item.id===id)))await conversationRequest(scope,'DELETE',id);
      if(epoch!==generation.current)return;
      const next=newAssistantSession();synced.current.delete(id);
      setState(previous=>({...previous,activeId:next.id,chats:[next,...previous.chats.filter(item=>item.id!==id&&item.messages.length)],remote:previous.remote.filter(item=>item.id!==id)}));setSyncError('');
    }catch(error){if(epoch===generation.current)setSyncError(error instanceof Error?error.message:'Conversation could not be deleted.');}
    finally{if(epoch===generation.current)setLoadingChat(false);}
  }
  const conversations=state.scope===scope?[...new Map([...state.remote,...state.chats].map(item=>[item.id,item])).values()]:[];
  return {active,messages:active?.messages||[],setMessages,newChat,chooseChat,deleteChat,conversations,syncError,syncing,loadingChat,retrySync:()=>setSyncError('')};
}
