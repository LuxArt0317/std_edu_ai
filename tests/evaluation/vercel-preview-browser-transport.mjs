import {readAssistantReply} from '../../src/services/assistantStreamReader.js';
import {isConversationId} from '../../src/services/assistantConversationId.js';
import {createPreviewDevelopmentTokenGuard,isEvaluationPreviewOrigin,previewTrustedHeader} from './vercel-preview-transport.mjs';
import {ProtectedBrowserDiagnostic,requireProtectedBrowser as check} from './protected-browser-diagnostics.mjs';
import {certificateAwardPath,certificateAwardScope} from '../../server/certificateAwardsContract.js';
import {certificateAwardPreviewManifest} from './certificate-award-preview.mjs';
import {inspectProtectedCertificateBrowserReply,verifyProtectedCertificateBrowserReceipt,verifyProtectedCertificateBrowserSave} from './certificate-browser-turn.mjs';
import {announcementEmailPath} from '../../server/announcementEmailContract.js';
import {announcementEmailBrowserAnswerPath,announcementEmailBrowserBootstrap,announcementEmailBrowserCases,announcementEmailBrowserProfile,
  announcementEmailBrowserMedia,inspectAnnouncementEmailBrowserBootstrap,inspectAnnouncementEmailBrowserReply,
  verifyProtectedAnnouncementEmailBrowserSave} from './announcement-email-browser-turn.mjs';
import {studentProfilePath} from '../../server/studentProfileContract.js';
import {studentProfileBrowserAnswerPath,studentProfileBrowserBootstrap,studentProfileBrowserCases,studentProfileBrowserHeading,
  studentProfileBrowserProfile,inspectStudentProfileBrowserBootstrap,inspectStudentProfileBrowserReply,
  verifyProtectedStudentProfileBrowserSave} from './student-profile-browser-turn.mjs';

const project='https://xiftudmvxphxcjtmfmib.supabase.co';
const conversationPath='/api/affairs-conversations',assistantPath='/api/affairs-assistant';
const dataPath='/api/affairs-data';
const pages=new Set(['/dtm','/dtm/login','/school-affairs','/school-affairs/login','/school-affairs/signed-out',
  '/school-affairs/services/leave','/school-affairs/services/39-1']);
export const certificateBrowserProfile='certificate-award';
export const certificateBrowserIcon='/favicon.png';
export const certificateBrowserHeading='/stu-reference/certificate-award/heading.png';
const certificateBootstrap=dataPath+'?scope='+certificateAwardScope+'&view=mine';
const certificateAnswers=new Map(certificateAwardPreviewManifest().filter(row=>row.id.endsWith('-aggregate-control')||row.bankReceipt)
  .map(({question,bankReceipt})=>[question,{selection:{bankReceipt:Boolean(bankReceipt)},
    answerPath:certificateBootstrap+'&answer=en'+(bankReceipt?'&bank_receipt=requested':'')}]));
const announcementAnswers=new Map(announcementEmailBrowserCases.map(({question,inbox})=>[question,{selection:{inbox},answerPath:announcementEmailBrowserAnswerPath(inbox)}]));
const profileAnswers=new Map(studentProfileBrowserCases.map(({question,year})=>[question,{selection:{year},answerPath:studentProfileBrowserAnswerPath(year)}]));
const nativeProfiles=new Map([
  [certificateBrowserProfile,{label:'certificate',route:certificateAwardPath,bootstrap:certificateBootstrap,answers:certificateAnswers,
    requiredMedia:[certificateBrowserHeading],receiptKey:'certificateReceipt',
    inspectReply:inspectProtectedCertificateBrowserReply,verifySave:verifyProtectedCertificateBrowserSave,
    inspectBootstrap(value,ownerId){check(value?.userId===ownerId&&Array.isArray(value.rows)&&Array.isArray(value.files),'wrong fixture caller');}}],
  [announcementEmailBrowserProfile,{label:'announcement-email',route:announcementEmailPath,bootstrap:announcementEmailBrowserBootstrap,
    answers:announcementAnswers,requiredMedia:announcementEmailBrowserMedia,receiptKey:'announcementEmailReceipt',
    inspectReply:inspectAnnouncementEmailBrowserReply,verifySave:verifyProtectedAnnouncementEmailBrowserSave,
    inspectBootstrap:inspectAnnouncementEmailBrowserBootstrap}],
  [studentProfileBrowserProfile,{label:'student-profile',route:studentProfilePath,bootstrap:studentProfileBrowserBootstrap,
    answers:profileAnswers,requiredMedia:[studentProfileBrowserHeading],receiptKey:'studentProfileReceipt',
    inspectReply:inspectStudentProfileBrowserReply,verifySave:verifyProtectedStudentProfileBrowserSave,
    inspectBootstrap:inspectStudentProfileBrowserBootstrap}],
]);
const sha=/^[a-f0-9]{40}$/u,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const asset=/^\/(?:assets|stu-reference|school-assets|dtm-theme)\/[a-zA-Z0-9._/-]+\.[a-zA-Z0-9]+$/u;
const browserMedia=/\.(?:woff2?|ttf|png|jpe?g|webp|gif|svg|avif)$/iu;
const replyHeaders=new Set(['content-type','content-security-policy','content-security-policy-report-only','referrer-policy',
  'x-content-type-options','x-frame-options','cross-origin-resource-policy','x-assistant-request-id']);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===keys;
const methodForObservation=input=>['GET','POST','OPTIONS'].includes(input?.method)?input.method:'other';
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
  const native=nativeProfiles.get(profile);
  check(profile==='dtm'||native,'invalid fixture config');
  check(Array.isArray(assets)&&assets.length<=256&&assets.every(path=>(asset.test(path)||native&&path===certificateBrowserIcon)&&target(origin+path).pathname===path
    &&(!native||path.startsWith('/assets/')||browserMedia.test(path)))
    &&(!native||native.requiredMedia.every(path=>assets.includes(path))),'invalid resource allowlist');
  if(native){
    check(dataPaths===undefined,'invalid data route allowlist');
    return {staticPaths:new Set(assets),ownDataPaths:new Set([native.bootstrap])};
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
  const native=nativeProfiles.get(profile);
  check(isEvaluationPreviewOrigin(origin)&&sha.test(revision??'')&&uuid.test(ownerId??'')&&typeof getCallerToken==='function'
    &&typeof verifyPin==='function'&&(native||typeof authorizeSave==='function')&&typeof fetchImpl==='function','invalid fixture config');
  const tokenGuard=createPreviewDevelopmentTokenGuard(token,now);
  const checkToken=()=>{try{tokenGuard();}catch{check(false,'Preview credential expired');}};
  const {staticPaths,ownDataPaths}=validateProtectedConversationBrowserResources({origin,assets,dataPaths,profile});
  const permittedPages=native?new Set([native.route]):pages;
  const reservations=new Map(),correlations=new Set();
  const observations=[];
  let nativeDocumentRequested=false,nativeDocumentLoaded=false,nativeBootstrapRequested=false,nativeLoaded=false;
  let nativeTurn=null,nativeRestoration=null,overflow=false;
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
  function reserve({id,mode='read',route,question,expected}={}){
    const real=mode==='turn';
    check(isConversationId(id)&&id[14]==='7'&&!reservations.has(id)&&reservations.size<2&&['read','fixture','turn'].includes(mode)
      &&(real?permittedPages.has(route)&&typeof question==='string'&&question.trim()===question&&question.length>=2&&question.length<=2000
        &&![...reservations.values()].some(item=>item.route===route&&item.question===question):route===undefined&&question===undefined),
    'invalid conversation reservation');
    if(native){
      check(reservations.size===0&&!overflow,'invalid conversation reservation');
      if(real){
        check(nativeLoaded&&observations.every(row=>row.result!=='pending')&&native.answers.has(question)
          &&expected===undefined,'invalid conversation reservation');
        nativeTurn={...native.answers.get(question),requested:false,response:null};
      }else{
        check(mode==='read'&&!nativeDocumentRequested&&expected?.id===id&&typeof expected.updatedAt==='string',
          'invalid conversation reservation');
        nativeRestoration={expected:structuredClone(expected),requested:false};
      }
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
    if(url.origin===project&&authPaths.has(path)&&(!native||path==='/auth/v1/user')&&
      (authPaths.get(path)===method||method==='OPTIONS'&&body===undefined&&!received.has('authorization'))){
      if(native&&method==='GET'){check(body===undefined,'unapproved request operation');ownedToken(received);}
      return {kind:'supabase-auth'};
    }
    check(url.origin===origin,'unapproved request origin');
    checkToken();
    check(!pinFailed,'release pin failed');
    const get=method==='GET'&&body===undefined,post=method==='POST'&&received.get('content-type')==='application/json';
    const document=get&&permittedPages.has(path),staticAsset=get&&staticPaths.has(path),publicResource=document||staticAsset;
    const headers=new Headers({Accept:received.get('accept')||'*/*'});
    let ask,answer,save,readId,index=false,caller=null,transaction,expectedSave,nativeReceipt;
    if(publicResource){
      check(!received.has('authorization'),'caller credential on a public resource');
      if(native&&document){
        check(!nativeDocumentRequested,'unapproved request operation');
        nativeDocumentRequested=true;
      }
    }else{
      caller=ownedToken(received);
      headers.set('Authorization','Bearer '+caller);
      if(post)headers.set('Content-Type','application/json');
      if(get&&ownDataPaths.has(path)){
        if(native){
          check(nativeDocumentLoaded&&!nativeBootstrapRequested&&frameUrl===origin+native.route,'unapproved request operation');
          nativeBootstrapRequested=true;
        }
      }else if(native&&get&&path===nativeTurn?.answerPath){
        check(!nativeTurn.requested&&frameUrl===origin+native.route,'unapproved request operation');
        nativeTurn.requested=true;
      }else if(get&&url.pathname===conversationPath){
        index=path===conversationPath;
        readId=url.searchParams.get('id');
        check(!native||nativeDocumentLoaded&&frameUrl===origin+native.route,'unapproved request operation');
        check(index||reservations.has(readId)&&url.search==='?id='+readId,'unreserved conversation read');
        if(native&&!index){
          check(nativeRestoration&&!nativeRestoration.requested&&readId===nativeRestoration.expected.id,'unreserved conversation read');
          nativeRestoration.requested=true;
        }
      }else if(!native&&post&&path===assistantPath){
        const envelope=decode(body,60000);
        check(exact(envelope,'history,images,question,route,stream')&&envelope.stream===true
          &&Array.isArray(envelope.images)&&!envelope.images.length&&Array.isArray(envelope.history)&&!envelope.history.length,
        'unexpected assistant envelope');
        ask=[...reservations.values()].find(item=>item.mode==='turn'&&item.question===envelope.question&&item.route===envelope.route);
        check(ask&&!ask.requested&&frameUrl===origin+ask.route,'unreserved assistant turn or frame');
        ask.requested=true;
      }else if(post&&path===conversationPath&&(!native||typeof authorizeSave==='function'&&nativeTurn)){
        transaction=decode(body,190000);
        save=reservations.get(transaction?.id);
        check(exact(transaction,'id,messages,title,version')&&transaction.version===0&&typeof transaction.title==='string'
          &&transaction.title.trim()===transaction.title&&transaction.title.length>0&&transaction.title.length<=100
          &&Array.isArray(transaction.messages)&&transaction.messages.length===2&&save&&!save.saved
          &&(save.mode==='fixture'&&[...permittedPages].some(page=>frameUrl===origin+page)
            ||save.mode==='turn'&&(native?nativeTurn.response:save.answer)&&frameUrl===origin+save.route
            &&transaction.messages[0]?.role==='user'&&transaction.messages[0].content===save.question
            &&transaction.messages[1]?.role==='assistant'&&transaction.messages[1].phase==='complete'),'unreserved conversation save');
        save.saved=true;
      }else check(false,'unapproved request operation');
    }
    if(!staticAsset||!releaseChecked)await pin();
    else{await pinQueue;check(!pinFailed,'release pin failed');}
    if(save){
      const nativeCommand=native?{
        assistantResponse:Buffer.from(nativeTurn.response.bytes),requestSequence:nativeTurn.response.requestSequence,
        ...nativeTurn.selection,question:save.question,
      }:null;
      if(nativeCommand)expectedSave=native.verifySave({payload:transaction,...nativeCommand});
      let approved;
      try{
        approved=await authorizeSave({ownerId,payload:structuredClone(transaction),...(nativeCommand
          ?{...nativeCommand,expected:structuredClone(expectedSave)}
          :{correlationId:save.answer?.correlationId??null,assistantResponse:save.answer?Buffer.from(save.answer.bytes):null})});
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
    if(native&&path===certificateBrowserIcon)check(/^image\/png(?:\s*;|$)/iu.test(response.headers.get('content-type')??''),'unexpected application response');
    if(native&&document)check(/^text\/html(?:\s*;|$)/iu.test(response.headers.get('content-type')??''),'unexpected application response');
    const limit=publicResource?4_000_000:ownDataPaths.has(path)?1_000_000:ask?300000:
      native&&path===nativeTurn?.answerPath?32768:220000;
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
        if(native&&path===native.bootstrap)
          native.inspectBootstrap(value,ownerId);
        if(native&&path===nativeTurn?.answerPath)
          native.inspectReply(value,nativeTurn.selection);
        if(index)check(Array.isArray(value?.conversations)&&value.conversations.length<=reservations.size
          &&new Set(value.conversations.map(row=>row?.id)).size===value.conversations.length
          &&value.conversations.every(row=>reservations.has(row?.id)),'unreserved conversation in index');
        if(readId||transaction)check(value?.id===(readId??transaction.id),'wrong conversation response');
        if(expectedSave)nativeReceipt=verifyProtectedCertificateBrowserReceipt({row:value,expected:expectedSave,mode:'save'});
        if(native&&readId)nativeReceipt=verifyProtectedCertificateBrowserReceipt({row:value,expected:nativeRestoration.expected,mode:'read'});
      }
    }
    if(!staticAsset)await pin();
    const visibleHeaders=Object.fromEntries([...response.headers].filter(([name])=>replyHeaders.has(name)));
    check(Object.values(visibleHeaders).every(value=>!value.includes(token)&&(!caller||!value.includes(caller))),'credential in response');
    if(ask)ask.answer=answer;
    if(native&&document)nativeDocumentLoaded=true;
    if(native&&path===native.bootstrap)nativeLoaded=true;
    if(native&&path===nativeTurn?.answerPath)nativeTurn.response={bytes:Buffer.from(bytes),requestSequence:observation.sequence};
    return {kind:'preview',status:response.status,headers:visibleHeaders,body:bytes,...(nativeReceipt?{[native.receiptKey]:nativeReceipt}:{})};
  }
  if(!native)return {reserve,dispatch:dispatchRequest};
  const nativeAnswerPaths=new Set([...native.answers.values()].map(turn=>turn.answerPath));
  async function dispatch(input){
    if(observations.length===256){overflow=true;check(false,'egress observation limit');}
    let request='other';
    try{
      const url=target(input?.url),path=url.pathname+url.search;
      if(url.origin===origin){
        if(permittedPages.has(path))request='document';
        else if(staticPaths.has(path))request='asset';
        else if(path===native.bootstrap)request=native.label+'-bootstrap';
        else if(nativeAnswerPaths.has(path))request=native.label+'-answer';
        else if(url.pathname===conversationPath)request=methodForObservation(input)==='POST'?'conversation-save':
          url.search?'conversation-detail':'conversations';
        else if(url.pathname===assistantPath)request='graph-assistant';
      }else if(url.origin===project&&path==='/auth/v1/user')request='auth';
    }catch{/* Classify malformed URLs without recording any of their contents. */}
    const observation={sequence:observations.length+1,phase:nativeTurn?'turn':nativeRestoration?'restore':'bootstrap',request,
      method:methodForObservation(input),forwarded:false,result:'pending'};
    observations.push(observation);
    try{
      const reply=await dispatchRequest(input,observation);
      observation.result=reply.kind==='supabase-auth'?'pass-through':'accepted';
      return reply;
    }catch(error){observation.result='rejected';throw error;}
  }
  return {reserve,dispatch,egress:()=>({overflow,observations:observations.map(row=>({...row}))})};
}
