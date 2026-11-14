/** Target-bound transport contract only. Importing performs no I/O; no default
 * fetch, credential discovery, protection bypass, fixture lifecycle or runner.
 * The injected transport must be trusted to honor redirect:'error', cancellation
 * and exact request URLs. Mocked receipts cannot establish live acceptance. */
import {createHash} from 'node:crypto';
import {createPinnedDeploymentVerifier} from './pinned-deployment.mjs';

const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(value);
const plain=value=>value!==null&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype;
const codes=new Set(['invalid_configuration','invalid_request','invalid_state','journal_failed','deployment_failed','transport_failed','response_failed','cancelled']);
export class TranscriptTransportError extends Error{
  constructor(code,disposition='not_sent'){
    const safe=codes.has(code)?code:'transport_failed';super('Transcript transport failed: '+safe+'.');
    this.name='TranscriptTransportError';this.code=safe;this.disposition=disposition;
    this.requiresReconciliation=disposition==='uncertain';
  }
}
const fail=(code,disposition)=>{throw new TranscriptTransportError(code,disposition);};
function jsonData(value,maximum=190000){
  let nodes=0,characters=0;
  const visit=(item,depth)=>{
    if(++nodes>20000||depth>30)fail('invalid_request');
    if(typeof item==='string'){characters+=item.length;if(characters>maximum)fail('invalid_request');return item;}
    if(item===null||typeof item==='boolean'||typeof item==='number'&&Number.isFinite(item))return item;
    if(!item||typeof item!=='object'||Object.getOwnPropertySymbols(item).length)fail('invalid_request');
    const descriptors=Object.getOwnPropertyDescriptors(item);
    if(Object.values(descriptors).some(row=>!Object.hasOwn(row,'value')))fail('invalid_request');
    if(Array.isArray(item)){
      if(Object.getPrototypeOf(item)!==Array.prototype||item.length>1024||Object.keys(descriptors).length!==item.length+1)fail('invalid_request');
      return Array.from({length:item.length},(_,index)=>{
        if(!Object.hasOwn(descriptors,index))fail('invalid_request');return visit(descriptors[index].value,depth+1);
      });
    }
    if(!plain(item)||Object.keys(descriptors).length>256)fail('invalid_request');
    return Object.fromEntries(Object.keys(descriptors).sort().map(key=>{
      if(key.length>300||!descriptors[key].enumerable)fail('invalid_request');return [key,visit(descriptors[key].value,depth+1)];
    }));
  };
  const copy=visit(value,0),text=JSON.stringify(copy);
  if(Buffer.byteLength(text)>maximum)fail('invalid_request');return {copy,text};
}
const exact=(value,keys)=>plain(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&!value.includes('\0')&&!/[\ud800-\udfff]/u.test(value);
function tokenValue(token){if(typeof token!=='string'||!token||token.length>16000||/[\p{Cc}\s]/u.test(token))fail('invalid_request');return token;}
function assistantBody(input){
  const {copy}=jsonData(input,60000);
  if(!exact(copy,['question','history','route'])||!text(copy.question,2000)||!Array.isArray(copy.history)||copy.history.length>6
    ||copy.history.some(row=>!exact(row,['role','content'])||!['user','assistant'].includes(row.role)||!text(row.content,8000))
    ||typeof copy.route!=='string'||copy.route.length>3100||!/^\/(?!\/)/u.test(copy.route)||/[\\#\p{Cc}]/u.test(copy.route))fail('invalid_request');
  const target=new URL(copy.route,'https://local.invalid');if(target.origin!=='https://local.invalid'||target.pathname+target.search!==copy.route)fail('invalid_request');
  return {...copy,stream:true,consentedResearchUse:false};
}
function conversationBody(input){
  const {copy}=jsonData(input);
  if(!exact(copy,['id','title','version','messages'])||!uuid(copy.id)||!text(copy.title,100)||!Number.isSafeInteger(copy.version)||copy.version<0
    ||!Array.isArray(copy.messages)||copy.messages.length>24)fail('invalid_request');
  for(const row of copy.messages){
    if(!plain(row)||Object.keys(row).some(key=>!['id','role','content','phase','activity','result','actionExpired'].includes(key))
      ||!text(row.id,100)||!['user','assistant'].includes(row.role)||typeof row.content!=='string'||row.content.length>8000)fail('invalid_request');
  }
  return copy;
}
const commitment=(operation,index,path,body,revision)=>Object.freeze({operation,requestIndex:index,sourceRevision:revision,
  requestHash:createHash('sha256').update(JSON.stringify({operation,path,body})).digest('hex')});

// Same bounded terminal-event contract as the evaluation runner, kept local
// because importing that executable changes the process umask at module load.
async function readReply(response,signal){
  const reader=response.body?.getReader();if(!reader)fail('response_failed');
  const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
  const chunks=[];let bytes=0,reads=0;
  try{for(;;){if(signal.aborted)fail('cancelled');const {value,done}=await reader.read();if(done)break;if(++reads>4096)fail('response_failed');bytes+=value.byteLength;if(bytes>2_000_000)fail('response_failed');chunks.push(value);}}
  finally{signal.removeEventListener('abort',cancel);cancel();try{reader.releaseLock();}catch{/* A cancelled read may still settle. */}}
  const raw=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
  if(!response.headers.get('content-type')?.toLowerCase().startsWith('text/event-stream'))return {body:JSON.parse(raw),events:[]};
  const events=[];let body,terminal=false;
  for(const block of raw.split(/\r?\n\r?\n/u)){
    const type=block.match(/^event:\s*(.+)$/mu)?.[1]?.trim();
    const data=block.split(/\r?\n/u).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\n');
    if(!data)continue;
    const value=JSON.parse(data);if(terminal)fail('response_failed');
    if(type==='result'){body=value;terminal=true;}
    else if(type==='progress'){if(events.length>=100)fail('response_failed');events.push(value);}
    else if(type==='error'){body={error:value.error||'Stream failed'};terminal=true;}
  }
  if(!body)fail('response_failed');return {body,events};
}

export const transcriptLiveTransportContract=Object.freeze({version:1,mounted:false,liveAcceptance:false,
  operations:Object.freeze(['assistant','conversation_read','conversation_save']),
  limitations:Object.freeze(['Supplied transport access and fixture authorization are separate prerequisites.',
    'A transport receipt is not a correct answer, durable save, own-account proof or successful cleanup.',
    'Caller must journal pending POST commitments and reconcile exact saved rows after uncertainty.',
    'Returned response bodies are private caller data; status and errors contain no request content or token.'])});

/** All credentials remain in the call stack only. beforeSend must durably save
 * its immutable commitment before resolving; this module cannot prove that an
 * arbitrary injected journal actually persisted it. No automatic request retry. */
export function createTranscriptLiveTransport({origin,approvedPreviewOrigin,expectedRevision,fetchImpl,signal,timeoutMs=65000}={}){
  if(typeof fetchImpl!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>65000
    ||signal!==undefined&&!(signal instanceof AbortSignal))fail('invalid_configuration');
  const shared=new AbortController(),runSignal=signal?AbortSignal.any([signal,shared.signal]):shared.signal;
  let gate;
  try{gate=createPinnedDeploymentVerifier({origin,approvedPreviewOrigin,expectedRevision,fetchImpl,signal:runSignal,timeoutMs:Math.min(8000,timeoutMs)});}
  catch{fail('invalid_configuration');}
  let busy=false,stopped=false,finished=false,issued=0,received=0,lastDisposition=null;
  const status=()=>Object.freeze({version:1,origin,sourceRevision:expectedRevision,busy,stopped,finished,issued,received,lastDisposition,requiresReconciliation:lastDisposition==='uncertain',
    deployment:gate.status(),liveAcceptance:false});
  const enter=()=>{if(busy||stopped||finished)fail('invalid_state');if(runSignal.aborted)fail('cancelled');busy=true;};
  const check=async()=>{try{await gate.assertCurrent();}catch{fail('deployment_failed');}};
  async function control(method){
    enter();try{const proof=await gate[method]();if(method==='finish')finished=true;return proof;}
    catch{stopped=true;fail(runSignal.aborted?'cancelled':'deployment_failed');}finally{busy=false;}
  }
  async function request(operation,{token,body,id,beforeSend}){
    token=tokenValue(token);
    if(operation!=='conversation_read'&&typeof beforeSend!=='function')fail('invalid_request');
    if(operation==='conversation_read'&&!uuid(id))fail('invalid_request');
    const path=operation==='assistant'?'/api/affairs-assistant':'/api/affairs-conversations'+(operation==='conversation_read'?'?id='+id:'');
    const copied=body===undefined?null:operation==='assistant'?assistantBody(body):conversationBody(body);
    const serialized=copied===null?undefined:jsonData(copied).text;
    enter();let sent=false,ticket,response,readerTask,timer,abort,receivedResponse;
    try{
      await check();
      const receipt=commitment(operation,issued+1,path,copied,expectedRevision);
      abort=new AbortController();const operationSignal=AbortSignal.any([runSignal,abort.signal]);
      const bounded=async work=>{
        let onAbort;
        try{return await Promise.race([Promise.resolve().then(()=>{if(operationSignal.aborted)fail('cancelled');return work();}),
          new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(new TranscriptTransportError('transport_failed'));},timeoutMs);
            onAbort=()=>reject(new TranscriptTransportError('cancelled'));operationSignal.addEventListener('abort',onAbort,{once:true});})]);}
        finally{clearTimeout(timer);if(onAbort)operationSignal.removeEventListener('abort',onAbort);}
      };
      if(operation!=='conversation_read'){
        try{await bounded(()=>beforeSend(receipt));}catch{fail('journal_failed');}
      }
      ticket=await gate.beforeRequest();
      const url=origin+path;
      let decoded;
      try{decoded=await bounded(async()=>{
        sent=true;issued++;lastDisposition='uncertain';
        response=await fetchImpl(url,{method:operation==='conversation_read'?'GET':'POST',redirect:'error',credentials:'omit',cache:'no-store',signal:operationSignal,
          headers:{Accept:operation==='assistant'?'text/event-stream, application/json':'application/json',Authorization:'Bearer '+token,...(serialized===undefined?{}:{'Content-Type':'application/json'})},
          ...(serialized===undefined?{}:{body:serialized})});
        if(operationSignal.aborted){void response?.body?.cancel().catch(()=>{});fail('cancelled');}
        if(response.redirected||response.url&&response.url!==url||!Number.isInteger(response.status)||response.status<200||response.status>599||response.status>=300&&response.status<400)fail('response_failed');
        const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
        if(!['application/json',...(operation==='assistant'?['text/event-stream']:[])].includes(type))fail('response_failed');
        readerTask=readReply(response,operationSignal);const decoded=await readerTask;
        if(operationSignal.aborted||!plain(decoded.body))fail('response_failed');
        if(operation!=='assistant'&&response.status===200&&decoded.body.id!==(id??copied.id))fail('response_failed');
        const correlationId=response.headers.get('X-Assistant-Request-Id');
        if(operation==='assistant'&&response.status===200&&!uuid(correlationId))fail('response_failed');
        return {statusCode:response.status,body:decoded.body,events:decoded.events,
          ...(operation==='assistant'&&uuid(correlationId)?{correlationId}:{})};
      });}catch{fail('transport_failed','uncertain');}
      receivedResponse=decoded;
      try{await gate.afterRequest(ticket);}catch{fail('deployment_failed','uncertain');}
      received++;lastDisposition='received';
      return {...decoded,operation,requestIndex:receipt.requestIndex,requestHash:receipt.requestHash,sourceRevision:expectedRevision,
        disposition:'received',deploymentVerified:true,persistenceVerified:false,modelAcceptance:false};
    }catch(error){
      stopped=true;lastDisposition=sent?'uncertain':'not_sent';
      const safe=new TranscriptTransportError(error instanceof TranscriptTransportError?error.code:runSignal.aborted?'cancelled':'transport_failed',lastDisposition);
      // Preserve an actual response for the caller's private failed-run artifact,
      // without including it in serialized errors or shared status diagnostics.
      if(receivedResponse)Object.defineProperty(safe,'receivedResponse',{value:receivedResponse});
      throw safe;
    }finally{
      clearTimeout(timer);abort?.abort();if(response?.body&&!readerTask)void response.body.cancel().catch(()=>{});
      // Do not retain the caller token or a request body in transport state.
      token=null;busy=false;
    }
  }
  return Object.freeze({pin:()=>control('pin'),assertCurrent:()=>control('assertCurrent'),finish:()=>control('finish'),status,
    assistant:({token,question,history=[],route='/',beforeSend}={})=>request('assistant',{token,body:{question,history,route},beforeSend}),
    readConversation:({token,id}={})=>request('conversation_read',{token,id}),
    saveConversation:({token,payload,beforeSend}={})=>request('conversation_save',{token,body:payload,beforeSend}),
    stop(){stopped=true;shared.abort();},
  });
}
