import {readAssistantReply} from '../../src/services/assistantStreamReader.js';
import {isConversationId} from '../../src/services/assistantConversationId.js';
import {createPreviewDevelopmentTokenGuard,isEvaluationPreviewOrigin,previewTrustedHeader} from './vercel-preview-transport.mjs';
import {ProtectedBrowserDiagnostic,requireProtectedBrowser as check} from './protected-browser-diagnostics.mjs';
import {certificateAwardPath,certificateAwardScope} from '../../server/certificateAwardsContract.js';
import {certificateAwardPreviewManifest} from './certificate-award-preview.mjs';

const project='https://xiftudmvxphxcjtmfmib.supabase.co';
const conversationPath='/api/affairs-conversations',assistantPath='/api/affairs-assistant';
const dataPath='/api/affairs-data';
const pages=new Set(['/dtm','/dtm/login','/school-affairs','/school-affairs/login','/school-affairs/signed-out',
  '/school-affairs/services/leave','/school-affairs/services/39-1']);
export const certificateBrowserProfile='certificate-award';
export const certificateBrowserHeading='/stu-reference/certificate-award/heading.png';
const certificateBootstrap=dataPath+'?scope='+certificateAwardScope+'&view=mine';
const certificateAnswers=new Map(certificateAwardPreviewManifest().filter(row=>row.id.endsWith('-aggregate-control')||row.bankReceipt)
  .map(row=>[row.question,certificateBootstrap+'&answer=en'+(row.bankReceipt?'&bank_receipt=requested':'')]));
const certificateAnswerPaths=new Set(certificateAnswers.values());
const sha=/^[a-f0-9]{40}$/u,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const asset=/^\/(?:assets|stu-reference|school-assets|dtm-theme)\/[a-zA-Z0-9._/-]+\.[a-zA-Z0-9]+$/u;
const browserMedia=/\.(?:woff2?|ttf|png|jpe?g|webp|gif|svg|avif)$/iu;
const replyHeaders=new Set(['content-type','content-security-policy','content-security-policy-report-only','referrer-policy',
  'x-content-type-options','x-frame-options','cross-origin-resource-policy','x-assistant-request-id']);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===keys;
const authPaths=new Map([['/auth/v1/user','GET'],['/auth/v1/token?grant_type=refresh_token','POST'],['/auth/v1/logout?scope=local','POST']]);
function target(raw){
  try{
    const url=new URL(raw);
    if(raw===url.origin+url.pathname+url.search&&url.protocol==='https:'&&!url.username&&!url.password)return url;
  }catch{/* Only canonical absolute URLs are eligible. */}
  throw new ProtectedBrowserDiagnostic('invalid URL');
}
function decode(body,max){
  check(typeof body==='string'&&Buffer.byteLength(body)<=max,'invalid request body');
  try{return JSON.parse(body);}catch{throw new ProtectedBrowserDiagnostic('invalid JSON body');}
}
function callerClaims(value){
  if(typeof value!=='string'||value.length>16000||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(value))return null;
  try{return JSON.parse(Buffer.from(value.split('.')[1],'base64url').toString('utf8'));}catch{return null;}
}
async function capture(response,max){
  const reader=response.body?.getReader(),parts=[];
  check(reader,'missing response body');
  let size=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;
      check(size<=max&&parts.length<4096,'response limit');
      parts.push(value);
    }
  }finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
  return Buffer.concat(parts);
}

export function validateProtectedConversationBrowserResources({origin,assets,dataPaths,profile='dtm'}){
  check(isEvaluationPreviewOrigin(origin),'invalid resource origin');
  check(profile==='dtm'||profile===certificateBrowserProfile,'invalid fixture config');
  const certificate=profile===certificateBrowserProfile;
  check(Array.isArray(assets)&&assets.length<=256&&assets.every(path=>asset.test(path)&&target(origin+path).pathname===path
    &&(!certificate||path.startsWith('/assets/')||browserMedia.test(path)))
    &&(!certificate||assets.includes(certificateBrowserHeading)),'invalid resource allowlist');
  if(certificate){
    check(dataPaths===undefined,'invalid data route allowlist');
    return {staticPaths:new Set(assets),ownDataPaths:new Set([certificateBootstrap])};
  }
  if(dataPaths===undefined)dataPaths=[dataPath];
  check(Array.isArray(dataPaths)&&dataPaths.length<=8&&dataPaths.every(path=>{
    if(typeof path!=='string'||path.length>512)return false;
    const destination=target(origin+path),keys=[...destination.searchParams.keys()];
    return destination.pathname==='/api/affairs-data'&&keys.length===new Set(keys).size
      &&!keys.some(key=>['resource','user_id','owner_id'].includes(key));
  }),'invalid data route allowlist');
  return {staticPaths:new Set(assets),ownDataPaths:new Set(dataPaths)};
}

/** Node-side prerequisite for an isolated browser operator. Supabase Auth stays
 * on the original browser request. The OIDC header exists only in Node fetch. */
export function createProtectedConversationBrowserRelay({origin,revision,token,ownerId,getCallerToken,verifyPin,authorizeSave,
  assets=[],dataPaths,profile='dtm',fetchImpl=globalThis.fetch,now=Date.now}={}){
  const certificate=profile===certificateBrowserProfile;
  check(isEvaluationPreviewOrigin(origin)&&sha.test(revision??'')&&uuid.test(ownerId??'')&&typeof getCallerToken==='function'
    &&typeof verifyPin==='function'&&(certificate||typeof authorizeSave==='function')&&typeof fetchImpl==='function','invalid fixture config');
  const tokenGuard=createPreviewDevelopmentTokenGuard(token,now);
  const checkToken=()=>{try{tokenGuard();}catch{check(false,'Preview credential expired');}};
  const {staticPaths,ownDataPaths}=validateProtectedConversationBrowserResources({origin,assets,dataPaths,profile});
  const permittedPages=certificate?new Set([certificateAwardPath]):pages;
  const reservations=new Map(),correlations=new Set();
  const observations=[];
  let certificateDocumentLoaded=false,certificateBootstrapRequested=false,certificateLoaded=false,certificateTurn=null,overflow=false;
  let releaseChecked=false,pinFailed=false,pinQueue=Promise.resolve();
  function pin(){
    const work=pinQueue.then(async()=>{
      check(!pinFailed,'release pin failed');
      let proof;
      try{proof=await verifyPin();}catch{check(false,'exact release could not be verified');}
      check(proof?.origin===origin&&proof.sourceRevision===revision&&proof.manifest?.revision===revision
        &&proof.manifest.environment==='preview'&&proof.manifest.source==='vercel-git','exact release could not be verified');
      releaseChecked=true;
    });
    pinQueue=work.catch(()=>{releaseChecked=false;pinFailed=true;});
    return work;
  }
  function reserve({id,mode='read',route,question}={}){
    const real=mode==='turn';
    check(isConversationId(id)&&id[14]==='7'&&!reservations.has(id)&&reservations.size<2&&['read','fixture','turn'].includes(mode)
      &&(real?permittedPages.has(route)&&typeof question==='string'&&question.trim()===question&&question.length>=2&&question.length<=2000
        &&![...reservations.values()].some(item=>item.route===route&&item.question===question):route===undefined&&question===undefined),
    'invalid conversation reservation');
    if(certificate){
      check(real&&certificateLoaded&&!certificateTurn&&!overflow&&observations.every(row=>row.result!=='pending')
        &&certificateAnswers.has(question),'invalid conversation reservation');
      certificateTurn={answerPath:certificateAnswers.get(question),requested:false};
    }
    reservations.set(id,{mode,route,question,requested:false,saved:false,answer:null});
  }
  function ownedToken(received){
    let caller;
    try{caller=getCallerToken();}catch{check(false,'wrong fixture caller');}
    const claims=callerClaims(caller);
    check(claims?.sub===ownerId&&claims.iss===project+'/auth/v1'&&claims.aud==='authenticated'
      &&claims.role==='authenticated'&&Number.isSafeInteger(claims.exp)&&claims.exp>Math.floor(now()/1000)
      &&caller!==token&&received.get('authorization')==='Bearer '+caller,'wrong fixture caller');
    return caller;
  }
  async function dispatchRequest({url:raw,method,headers:input,body,frameUrl,signal}={},observation){
    const url=target(raw),path=url.pathname+url.search,received=new Headers(input);
    check(signal===undefined||signal instanceof AbortSignal&&!signal.aborted,'invalid request signal');
    check(!received.has(previewTrustedHeader)&&![...received.values()].some(value=>value.includes(token))
      &&(typeof body!=='string'||!body.includes(token)),'inherited Preview credential');
    if(url.origin===project&&authPaths.has(path)&&(!certificate||path==='/auth/v1/user')&&
      (authPaths.get(path)===method||method==='OPTIONS'&&body===undefined&&!received.has('authorization'))){
      if(certificate&&method==='GET'){check(body===undefined,'unapproved request operation');ownedToken(received);}
      return {kind:'supabase-auth'};
    }
    check(url.origin===origin,'unapproved request origin');
    checkToken();
    check(!pinFailed,'release pin failed');
    const get=method==='GET'&&body===undefined,post=method==='POST'&&received.get('content-type')==='application/json';
    const document=get&&permittedPages.has(path),staticAsset=get&&staticPaths.has(path),publicResource=document||staticAsset;
    const headers=new Headers({Accept:received.get('accept')||'*/*'});
    let ask,answer,save,readId,index=false,caller=null,transaction;
    if(publicResource){
      check(!received.has('authorization'),'caller credential on a public resource');
    }else{
      caller=ownedToken(received);
      headers.set('Authorization','Bearer '+caller);
      if(post)headers.set('Content-Type','application/json');
      if(get&&ownDataPaths.has(path)){
        if(certificate){
          check(certificateDocumentLoaded&&!certificateBootstrapRequested&&frameUrl===origin+certificateAwardPath,'unapproved request operation');
          certificateBootstrapRequested=true;
        }
      }else if(certificate&&get&&path===certificateTurn?.answerPath){
        check(!certificateTurn.requested&&frameUrl===origin+certificateAwardPath,'unapproved request operation');
        certificateTurn.requested=true;
      }else if(get&&url.pathname===conversationPath){
        index=path===conversationPath;
        readId=url.searchParams.get('id');
        check(!certificate||certificateDocumentLoaded&&frameUrl===origin+certificateAwardPath,'unapproved request operation');
        check(index||reservations.has(readId)&&url.search==='?id='+readId,'unreserved conversation read');
      }else if(!certificate&&post&&path===assistantPath){
        const envelope=decode(body,60000);
        check(exact(envelope,'history,images,question,route,stream')&&envelope.stream===true
          &&Array.isArray(envelope.images)&&!envelope.images.length&&Array.isArray(envelope.history)&&!envelope.history.length,
        'unexpected assistant envelope');
        ask=[...reservations.values()].find(item=>item.mode==='turn'&&item.question===envelope.question&&item.route===envelope.route);
        check(ask&&!ask.requested&&frameUrl===origin+ask.route,'unreserved assistant turn or frame');
        ask.requested=true;
      }else if(!certificate&&post&&path===conversationPath){
        transaction=decode(body,190000);
        save=reservations.get(transaction?.id);
        check(exact(transaction,'id,messages,title,version')&&transaction.version===0&&typeof transaction.title==='string'
          &&transaction.title.trim()===transaction.title&&transaction.title.length>0&&transaction.title.length<=100
          &&Array.isArray(transaction.messages)&&transaction.messages.length===2&&save&&!save.saved
          &&(save.mode==='fixture'&&[...permittedPages].some(page=>frameUrl===origin+page)||save.mode==='turn'&&save.answer&&frameUrl===origin+save.route
            &&transaction.messages[0]?.role==='user'&&transaction.messages[0].content===save.question
            &&transaction.messages[1]?.role==='assistant'&&transaction.messages[1].phase==='complete'),'unreserved conversation save');
        save.saved=true;
      }else check(false,'unapproved request operation');
    }
    if(!staticAsset||!releaseChecked)await pin();
    else{await pinQueue;check(!pinFailed,'release pin failed');}
    if(save){
      let approved;
      try{
        approved=await authorizeSave({ownerId,payload:structuredClone(transaction),correlationId:save.answer?.correlationId??null,
          assistantResponse:save.answer?Buffer.from(save.answer.bytes):null});
      }catch(error){
        // Forward only our allowlisted categories from the durable save checker.
        if(error instanceof ProtectedBrowserDiagnostic)throw error;
      }
      check(approved===true,'save intent could not be verified and journaled');
    }
    checkToken();
    headers.set(previewTrustedHeader,token);
    let response;
    const deadline=AbortSignal.timeout(65000),active=signal?AbortSignal.any([signal,deadline]):deadline;
    if(observation)observation.forwarded=true;
    try{response=await fetchImpl(url,{method,headers,...(post?{body}:{}),signal:active,redirect:'error',credentials:'omit',cache:'no-store'});}
    catch{throw new ProtectedBrowserDiagnostic('request could not reach the pinned deployment');}
    if(observation)observation.status=response.status;
    if(response.redirected||response.url&&response.url!==url.href||response.status>=300&&response.status<400){
      void response.body?.cancel().catch(()=>{});check(false,'unexpected redirect or response URL',response.status);
    }
    check(response.status===200,'unexpected application status',response.status);
    if(certificate&&document)check(/^text\/html(?:\s*;|$)/iu.test(response.headers.get('content-type')??''),'unexpected application response');
    const limit=publicResource?4_000_000:ownDataPaths.has(path)?1_000_000:ask?300000:
      certificate&&path===certificateTurn?.answerPath?32768:220000;
    const bytes=await capture(response,limit);
    check(!bytes.includes(token)&&(!caller||!bytes.includes(caller)),'credential in response');
    if(!publicResource){
      const contentType=response.headers.get('content-type')?.split(';')[0];
      if(ask){
        const correlationId=response.headers.get('x-assistant-request-id');
        check(contentType==='text/event-stream'&&uuid.test(correlationId??'')&&!correlations.has(correlationId),'invalid assistant stream correlation');
        let terminal;
        try{terminal=await readAssistantReply(new Response(bytes,{headers:{'Content-Type':'text/event-stream'}}));}
        catch{/* Preserve only bounded route diagnostics. */}
        check(typeof terminal?.answer==='string','invalid assistant stream result');
        correlations.add(correlationId);answer={correlationId,bytes};
      }else{
        check(contentType==='application/json','unexpected application response');
        const value=decode(bytes.toString('utf8'),limit);
        if(certificate&&path===certificateBootstrap)
          check(value?.userId===ownerId&&Array.isArray(value.rows)&&Array.isArray(value.files),'wrong fixture caller');
        if(certificate&&path===certificateTurn?.answerPath)
          check(value?.status==='answered'&&typeof value.answer==='string'&&value.answer.trim().length>0&&value.grounding?.source==='account'
            &&value.grounding.webSearched===false&&value.proposedAction===undefined,'invalid certificate response');
        if(index)check(Array.isArray(value?.conversations)&&value.conversations.length<=reservations.size
          &&new Set(value.conversations.map(row=>row?.id)).size===value.conversations.length
          &&value.conversations.every(row=>reservations.has(row?.id)),'unreserved conversation in index');
        if(readId||transaction)check(value?.id===(readId??transaction.id),'wrong conversation response');
      }
    }
    if(!staticAsset)await pin();
    const visibleHeaders=Object.fromEntries([...response.headers].filter(([name])=>replyHeaders.has(name)));
    check(Object.values(visibleHeaders).every(value=>!value.includes(token)&&(!caller||!value.includes(caller))),'credential in response');
    if(ask)ask.answer=answer;
    if(certificate&&document)certificateDocumentLoaded=true;
    if(certificate&&path===certificateBootstrap)certificateLoaded=true;
    return {kind:'preview',status:response.status,headers:visibleHeaders,body:bytes};
  }
  if(!certificate)return {reserve,dispatch:dispatchRequest};
  async function dispatch(input){
    if(observations.length===256){overflow=true;check(false,'egress observation limit');}
    let request='other';
    try{
      const url=target(input?.url),path=url.pathname+url.search;
      if(url.origin===origin){
        if(permittedPages.has(path))request='document';
        else if(staticPaths.has(path))request='asset';
        else if(path===certificateBootstrap)request='certificate-bootstrap';
        else if(certificateAnswerPaths.has(path))request='certificate-answer';
        else if(url.pathname===conversationPath)request='conversations';
        else if(url.pathname===assistantPath)request='graph-assistant';
      }else if(url.origin===project&&path==='/auth/v1/user')request='auth';
    }catch{/* Classify malformed URLs without recording any of their contents. */}
    const observation={sequence:observations.length+1,phase:certificateTurn?'turn':'bootstrap',request,
      method:['GET','POST','OPTIONS'].includes(input?.method)?input.method:'other',forwarded:false,result:'pending'};
    observations.push(observation);
    try{
      const reply=await dispatchRequest(input,observation);
      observation.result=reply.kind==='supabase-auth'?'pass-through':'accepted';
      return reply;
    }catch(error){observation.result='rejected';throw error;}
  }
  return {reserve,dispatch,egress:()=>({overflow,observations:observations.map(row=>({...row}))})};
}
