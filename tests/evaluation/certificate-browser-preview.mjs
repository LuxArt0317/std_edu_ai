import {isDeepStrictEqual,TextDecoder} from 'node:util';
import {certificateAwardPath} from '../../server/certificateAwardsContract.js';
import {sanitizeStoredConversation} from '../../server/assistantConversationData.js';
import {isConversationId} from '../../src/services/assistantConversationId.js';
import {certificateAwardPreviewHash,gradeCertificateAwardPreviewResponse} from './certificate-award-preview.mjs';
import {deriveProtectedConversationBrowserAssets} from './protected-conversation-browser-assets.mjs';
import {createTranscriptDurableJournal} from './transcript-durable-journal.mjs';
import {certificateBrowserProfile,createProtectedConversationBrowserRelay} from './vercel-preview-browser-transport.mjs';
import {createPreviewDevelopmentTokenGuard,isEvaluationPreviewOrigin,previewTrustedHeader} from './vercel-preview-transport.mjs';
import {requireProtectedBrowser as check} from './protected-browser-diagnostics.mjs';
import {verifyProtectedCertificateBrowserEgress} from './certificate-browser-turn.mjs';
import {installProtectedConversationBrowserRoute} from '../integration/helpers/protected-conversation-browser.mjs';

const conversationPath='/api/affairs-conversations';
const generatedAsset=/^\/assets\/[a-zA-Z0-9_.-]+\.(?:js|css)$/u;
const digest=certificateAwardPreviewHash;
const decode=bytes=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
const certificateBrowser={
  profile:certificateBrowserProfile,route:certificateAwardPath,heading:'學生證照記錄填表作業',
  bootstrap:'/api/affairs-data?scope=certificate-awards&view=mine',receiptKey:'certificateReceipt',
  grade:gradeCertificateAwardPreviewResponse,verifyEgress:verifyProtectedCertificateBrowserEgress,
};

export function deriveCertificateBrowserAssets(options){
  return deriveProtectedNativeBrowserAssets(options,certificateBrowser);
}

export async function deriveProtectedNativeBrowserAssets({origin,revision,token,signal,fetchImpl=globalThis.fetch},browserProfile){
  check(isEvaluationPreviewOrigin(origin),'invalid fixture config');
  const guard=createPreviewDevelopmentTokenGuard(token);
  const get=async(input,options)=>{
    guard();
    const url=new URL(input);
    check(url.origin===origin&&url.href===origin+url.pathname&&
      (url.pathname===browserProfile.route||url.pathname==='/release.json'||generatedAsset.test(url.pathname))
      &&options?.method==='GET'&&options.body===undefined,'invalid resource allowlist');
    const headers=new Headers(options.headers);
    check(!headers.has('authorization')&&!headers.has('cookie')&&!headers.has(previewTrustedHeader),'inherited Preview credential');
    headers.set(previewTrustedHeader,token);
    return fetchImpl(url,{method:'GET',headers,signal:options.signal,redirect:'error',credentials:'omit',cache:'no-store'});
  };
  return deriveProtectedConversationBrowserAssets({origin,approvedPreviewOrigin:origin,revision,fetchImpl:get,signal,profile:browserProfile.profile});
}

export function createCertificateBrowserSaveJournal(options){
  return createProtectedNativeBrowserSaveJournal(options,certificateBrowser);
}

export async function createProtectedNativeBrowserSaveJournal({directory,runId,ownerId,conversationId,sourceRevision,bound},browserProfile){
  const journal=await createTranscriptDurableJournal({directory,binding:{
    runId,ownerId,conversationId,sourceRevision,suiteHash:digest(bound),
  }});
  let pending,expectedSave;
  return Object.freeze({
    journal,
    async reserveSave({payload,expected,assistantResponse,requestSequence,requestPath}){
      check(!pending&&payload.id===conversationId&&payload.version===0&&Buffer.isBuffer(assistantResponse)
        &&Number.isSafeInteger(requestSequence)&&requestSequence>0,'save envelope mismatch');
      const body=decode(assistantResponse);
      const assessment=browserProfile.grade(bound,{statusCode:200,body,requestPath});
      check(assessment.passed,'save answer mismatch');
      const grade={...assessment,
        requestDigest:digest({method:'GET',path:requestPath,role:bound.role,question:bound.testCase.question}),
        responseDigest:digest(body),
      };
      const messages=JSON.parse(JSON.stringify(sanitizeStoredConversation(payload.messages)));
      check(expected.title===payload.title&&isDeepStrictEqual(messages,expected.messages),'save message shape mismatch');
      const commitment={ownerId,conversationId,title:payload.title,expectedVersion:1,messageDigest:digest(messages),sourceRevision,
        requestIndex:1,operation:'conversation_save',requestHash:digest({conversationId,requestSequence,grade,payload})};
      try{await journal.pending(commitment);}catch{check(false,'save journal write failed');}
      pending=commitment;
      expectedSave={grade,...expected};
    },
    async receiveSave(reply){
      check(pending&&expectedSave,'save receipt not journaled');
      const {id,title,version,messages}=decode(reply.body);
      check(reply.status===200&&id===conversationId&&title===pending.title&&version===1
        &&Array.isArray(messages)&&digest(messages)===pending.messageDigest
        &&reply[browserProfile.receiptKey]?.id===id&&reply[browserProfile.receiptKey].version===version,'save receipt mismatch');
      const {operation:_operation,requestIndex:_requestIndex,...receipt}=pending;
      try{await journal.received(receipt);}catch{check(false,'save journal write failed');}
      expectedSave={...expectedSave,updatedAt:reply[browserProfile.receiptKey].updatedAt};
    },
    expected:()=>expectedSave,
  });
}

export function runCertificateBrowserTurn(options){
  return runProtectedNativeBrowserTurn(options,certificateBrowser);
}

export async function runProtectedNativeBrowserTurn({origin,sourceRevision,token,assets,bound,getSession,assertLease,verifyPin,
    reserveConversation,pinReadback,readConversation,directory,runId,signal,onDiagnostic=()=>{},graphTurn},browserProfile){
  signal?.throwIfAborted();
  const {chromium}=await import('playwright-core');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',timeout:20000});
  let savedId,savedJournal,beforeSave,capture;
  const abort=()=>{void browser.close().catch(()=>{});};
  signal?.addEventListener('abort',abort,{once:true});
  const responseUrl=new URL(conversationPath,origin).href;
  const {testCase}=bound;
  async function open({restore=false}={}){
    signal?.throwIfAborted();
    await assertLease();
    const session=await getSession();
    const context=await browser.newContext({viewport:{width:1000,height:900},serviceWorkers:'block'});
    let drain=()=>Promise.resolve(),denial=null,pageErrors=0,relay;
    try{
      await context.addInitScript(({session,origin})=>{
        if(window.top===window&&location.origin===origin&&!sessionStorage.getItem('stu-certificate-qa')){
          localStorage.setItem('stu-school-affairs-auth',JSON.stringify(session));
          sessionStorage.setItem('stu-certificate-qa','1');
        }
      },{session,origin});
      relay=createProtectedConversationBrowserRelay({origin,revision:sourceRevision,token,ownerId:session.user.id,
        getCallerToken:()=>session.access_token,verifyPin,assets,profile:browserProfile.profile,graphTurn,
        async authorizeSave({ownerId,payload,assistantResponse,requestSequence,expected}){
          check(!restore&&ownerId===session.user.id&&savedJournal&&savedId===payload.id
            &&capture&&capture.body.equals(assistantResponse),'save fixture owner mismatch');
          await assertLease();
          await savedJournal.reserveSave({payload,expected,assistantResponse,requestSequence,requestPath:capture.path});
          return true;
        },
      });
      if(restore)relay.reserve({id:savedId,mode:'read',expected:beforeSave});
      drain=await installProtectedConversationBrowserRoute(context,{relay,async onReply({url,method,reply}){
        const destination=new URL(url);
        if(url===origin+browserProfile.bootstrap)browserProfile.verifyBootstrap?.(bound,decode(reply.body));
        if(graphTurn?destination.pathname==='/api/affairs-assistant'&&method==='POST':destination.pathname==='/api/affairs-data'&&destination.searchParams.has('answer')){
          check(!restore&&!capture,'unexpected application response');
          capture={path:destination.pathname+destination.search,body:reply.graphTranscript??reply.body};
        }
        if(url===responseUrl&&method==='POST')await savedJournal.receiveSave(reply);
      },onDenied({error}){denial??=error;}});
      const page=await context.newPage();
      page.setDefaultTimeout(15000);
      page.on('pageerror',()=>{pageErrors++;});
      // Open the private assistant only after the School Affairs shell is verified.
      const boot=page.waitForResponse(reply=>reply.url()===origin+browserProfile.bootstrap
        &&reply.ok()&&reply.request().method()==='GET',{timeout:20000}).then(()=>null,error=>error);
      const index=page.waitForResponse(reply=>reply.url()===responseUrl&&reply.ok()
        &&reply.request().method()==='GET',{timeout:25000}).then(()=>null,error=>error);
      await page.goto(origin+browserProfile.route,{waitUntil:'domcontentloaded'});
      await page.getByRole('heading',{name:browserProfile.heading,exact:true}).waitFor();
      const missing=await boot;
      if(missing)throw missing;
      await browserProfile.verifyWorkspace?.(bound,page);
      await page.getByRole('button',{name:'開啟 AI 校園助理',exact:true}).click();
      const dialog=page.getByRole('dialog',{name:/Assistant/u});
      await dialog.getByLabel('Conversations',{exact:true}).waitFor();
      const indexFailure=await index;
      if(indexFailure)throw indexFailure;
      await drain();
      if(denial)throw denial;
      check(pageErrors===0,'unexpected application response');
      return {dialog,page,relay,session,async close(){
        await context.close();
        await drain();
        const egress=relay.egress();
        onDiagnostic({restore,pageErrors,...egress});
        return {egress,denial,pageErrors};
      }};
    }catch(error){
      await context.close();
      await drain();
      if(relay)onDiagnostic({restore,pageErrors,...relay.egress()});
      throw denial??error;
    }
  }
  try{
    const verifyRendered=browserProfile.verifyRendered??
      (await import('../integration/helpers/protected-conversation-browser.mjs')).verifyRenderedCertificateBrowserTurn;
    const live=await open();
    let turnNetwork;
    try{
      const picker=live.dialog.getByLabel('Conversations',{exact:true});
      savedId=await picker.inputValue();
      check(isConversationId(savedId)&&savedId[14]==='7','invalid conversation reservation');
      savedJournal=await createProtectedNativeBrowserSaveJournal({directory,runId,ownerId:live.session.user.id,
        conversationId:savedId,sourceRevision,bound},browserProfile);
      await reserveConversation(savedId,savedJournal.journal);
      live.relay.reserve({id:savedId,mode:'turn',route:testCase.route,question:testCase.question});
      const wait=live.page.waitForResponse(reply=>reply.url()===responseUrl&&reply.request().method()==='POST'&&reply.ok(),{timeout:30000})
        .then(()=>null,error=>error);
      await live.dialog.getByRole('textbox',{name:'Your question',exact:true}).fill(testCase.question);
      await live.dialog.getByRole('button',{name:'Send',exact:true}).click();
      const missing=await wait;
      if(missing)throw missing;
      await live.dialog.getByText('Conversation saved to your private account.',{exact:true}).waitFor();
      beforeSave=savedJournal.expected();
      check(beforeSave?.grade.passed,'save receipt mismatch');
      await verifyRendered({page:live.page,dialog:live.dialog,expected:beforeSave});
    }finally{turnNetwork=await live.close();}
    if(turnNetwork.denial)throw turnNetwork.denial;
    check(turnNetwork.pageErrors===0,'unexpected application response');
    const browserTurn=browserProfile.verifyEgress({evidence:turnNetwork.egress,mode:'turn',requestSequence:beforeSave.requestSequence});

    const readback=await pinReadback(async()=>{
      await assertLease();
      return readConversation({id:savedId,expected:beforeSave});
    });
    const fresh=await open({restore:true});
    let restoreNetwork;
    try{
      await fresh.dialog.getByLabel('Conversations',{exact:true}).selectOption(savedId);
      await fresh.dialog.getByText('Conversation saved to your private account.',{exact:true}).waitFor();
      await verifyRendered({page:fresh.page,dialog:fresh.dialog,expected:beforeSave});
    }finally{restoreNetwork=await fresh.close();}
    if(restoreNetwork.denial)throw restoreNetwork.denial;
    check(restoreNetwork.pageErrors===0,'unexpected application response');
    const browserRestore=browserProfile.verifyEgress({evidence:restoreNetwork.egress,mode:'restore'});
    return {caseId:testCase.id,passed:true,native:beforeSave.grade,requestDigest:beforeSave.grade.requestDigest,
      responseDigest:beforeSave.grade.responseDigest,readback,browserTurn,browserRestore};
  }finally{
    signal?.removeEventListener('abort',abort);
    await browser.close();

  }
}
