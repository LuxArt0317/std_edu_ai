import {AffairsWorkspaceError,verifyAffairsToken} from './affairsWorkspace.js';
import {sanitizeStoredConversation} from './assistantConversationData.js';
import {boundedAssistantText} from '../src/services/assistantActivityBudget.js';
const first=(value)=>Array.isArray(value)?value[0]:value;
const uuid=(value)=>typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');
  if(!['GET','POST','DELETE'].includes(req.method||'')){res.setHeader('Allow','GET, POST, DELETE');res.status(405).json({error:'Method not allowed'});return;}
  try{
    const account=await verifyAffairsToken(first(req.headers.authorization)?.replace(/^Bearer /,'')||'');
    let raw=req.body;if(typeof raw==='string'){try{raw=JSON.parse(raw);}catch{raw=null;}}
    const body=raw && typeof raw==='object' && !Array.isArray(raw)?raw:{};
    const id=req.method==='POST'?body.id:first(req.query?.id);
    if(id!==undefined&&!uuid(id))throw new AffairsWorkspaceError('Invalid conversation identifier.',400);
    const headers={apikey:account.key,Authorization:`Bearer ${account.token}`,'Content-Type':'application/json'};
    let path,content;
    if(req.method==='POST'){
      if(!id || typeof body.title!=='string' || body.title.trim().length<1 || body.title.length>100 || !Number.isInteger(body.version) || Number(body.version)<0 || !Array.isArray(body.messages) || Buffer.byteLength(JSON.stringify(body),'utf8')>190000)
        throw new AffairsWorkspaceError('Invalid conversation.',400);
      const title=boundedAssistantText(body.title,100);
      if(!title.trim())throw new AffairsWorkspaceError('Invalid conversation.',400);
      path='rpc/affairs_save_conversation_v2';
      try{content=JSON.stringify({p_id:id,p_title:title,p_expected_version:body.version,p_messages:sanitizeStoredConversation(body.messages)});}
      catch(error){if(error instanceof RangeError)throw new AffairsWorkspaceError('This conversation turn is too large to save. Start a new conversation.',400);throw error;}
    }else if(req.method==='DELETE'){
      if(!id)throw new AffairsWorkspaceError('Choose a conversation to delete.',400);
      path='rpc/affairs_delete_conversation_v2';content=JSON.stringify({p_id:id});
    }else{
      path='rpc/affairs_read_conversations_v2';content=JSON.stringify({p_id:id??null});
    }
    const response=await fetch(`${account.url}/rest/v1/${path}`,{method:'POST',headers,body:content,signal:AbortSignal.timeout(10000)});
    if(!response.ok&&req.method==='DELETE'){
      const message=response.status===429?'Deletion protection reached its limit for this account.'
        :response.status===409?'This conversation could not be safely deleted. Refresh your account conversations and try again.'
          :'Conversation deletion could not be confirmed.';
      throw new AffairsWorkspaceError(message,[400,401,403,409,429].includes(response.status)?response.status:503);
    }
    if(!response.ok)throw new AffairsWorkspaceError(response.status===409?'This conversation changed in another tab. Reload it before editing.':response.status===403?'This conversation is unavailable for your account.':'Conversations could not be saved or loaded.',[400,401,403,409].includes(response.status)?response.status:503);
    const data=await response.json();
    if(req.method==='DELETE'){
      if(data?.deleted!==true||data?.protection!=='conversation-delete-v2')throw new AffairsWorkspaceError('Conversations could not be deleted.',503);
      res.status(200).json({deleted:true});return;
    }
    if(req.method==='GET'&&id){if(data==null)throw new AffairsWorkspaceError('Conversation not found.',404);if(data.id!==id.toLowerCase())throw new AffairsWorkspaceError('Conversation lookup could not be verified.',503);res.status(200).json(data);}
    else if(req.method==='GET'){
      if(!Array.isArray(data))throw new AffairsWorkspaceError('Conversation list could not be verified.',503);
      res.status(200).json({conversations:data});
    }else res.status(200).json(data);
  }catch(error){res.status(error instanceof AffairsWorkspaceError?error.status:503).json({error:error instanceof AffairsWorkspaceError?error.message:'Conversations are temporarily unavailable.'});}
}
