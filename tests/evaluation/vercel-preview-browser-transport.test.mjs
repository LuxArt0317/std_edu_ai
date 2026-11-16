import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {newConversationId} from '../../src/services/assistantConversationId.js';
import {readAssistantReply} from '../../src/services/assistantStreamReader.js';
import {certificateBrowserHeading,certificateBrowserProfile,createProtectedConversationBrowserRelay} from './vercel-preview-browser-transport.mjs';
import {previewTrustedHeader} from './vercel-preview-transport.mjs';
import {ProtectedBrowserDiagnostic} from './protected-browser-diagnostics.mjs';
import {verifyProtectedCertificateBrowserEgress,verifyProtectedCertificateBrowserSave} from './certificate-browser-turn.mjs';
import {announcementEmailBrowserCases,announcementEmailBrowserAnswerPath,announcementEmailBrowserBootstrap,announcementEmailBrowserProfile,
  announcementEmailBrowserMedia,verifyProtectedAnnouncementEmailBrowserEgress} from './announcement-email-browser-turn.mjs';
import {sanitizeStoredConversation} from '../../server/assistantConversationData.js';
import {certificateAwardBankReceiptNote} from '../../server/certificateAwardsContract.js';
import {announcementEmailInboxLimit,announcementEmailPath} from '../../server/announcementEmailContract.js';
import {studentProfilePath} from '../../server/studentProfileContract.js';
import {studentProfileBrowserAnswerPath,studentProfileBrowserBootstrap,studentProfileBrowserCases,studentProfileBrowserHeading,
  studentProfileBrowserProfile,verifyProtectedStudentProfileBrowserEgress} from './student-profile-browser-turn.mjs';

const epoch=1800000000,origin='https://stdedu-abcdef123-v1-d286.vercel.app',project='https://xiftudmvxphxcjtmfmib.supabase.co';
const revision='a'.repeat(40),ownerId=randomUUID(),otherId=randomUUID();
const encode=claims=>['synthetic',Buffer.from(JSON.stringify(claims)).toString('base64url'),'signature'].join('.');
const token=encode({iss:'https://oidc.vercel.com/v1-d286',sub:'owner:v1-d286:project:std_edu_ai:environment:development',
  aud:'https://vercel.com/v1-d286',owner:'v1-d286',project:'std_edu_ai',environment:'development',nbf:epoch-2,exp:epoch+100});
const jwt=(id=ownerId,role='authenticated')=>encode({sub:id,iss:project+'/auth/v1',aud:'authenticated',role,exp:epoch+100});
const proof={origin,sourceRevision:revision,manifest:{revision,environment:'preview',source:'vercel-git'}};
const assets=['/assets/index-123abcd.js','/dtm-theme/assign.svg'];
const frame='/dtm',questions=['What is my display name?','How much is my unpaid tuition?'];
const id=()=>newConversationId(epoch*1000);
const step={kind:'account',label:'Checked the saved record',detail:'Observed positive lookup',status:'complete'};
const answer={answer:'A saved answer',status:'answered',citations:[],suggestedQuestions:[],activity:[step]};
const sse=(payload=answer,correlation=randomUUID())=>new Response(
  'event: progress\ndata: '+JSON.stringify(step)+'\n\nevent: result\ndata: '+JSON.stringify(payload)+'\n\n',
  {headers:{'Content-Type':'text/event-stream; charset=utf-8','X-Assistant-Request-Id':correlation}});
const bodyFor=(i=0,overrides={})=>JSON.stringify({question:questions[i],route:frame,history:[],images:[],stream:true,...overrides});
const saveFor=(id,i=0)=>({id,title:questions[i],version:0,messages:[{id:'q',role:'user',content:questions[i]},
  {id:'a',role:'assistant',phase:'complete',content:answer.answer,activity:[step]}]});
const get=(path,headers={})=>({url:origin+path,method:'GET',headers});
const ownedHeaders=(id=ownerId)=>({Authorization:'Bearer '+jwt(id)});
const assistant=(body=bodyFor(),route=frame)=>({url:origin+'/api/affairs-assistant',method:'POST',
  headers:{...ownedHeaders(),'Content-Type':'application/json'},body,frameUrl:origin+route});
const save=payload=>({...assistant(JSON.stringify(payload)),url:origin+'/api/affairs-conversations'});
function harness({respond,authorizeSave=async()=>true,verifyPin,readToken=()=>jwt(),...overrides}={}){
  const calls=[],authorized=[],events=[];
  const config={origin,revision,token,ownerId,assets,getCallerToken:readToken,now:()=>epoch*1000,
    verifyPin:async()=>{events.push('pin');return verifyPin?verifyPin():proof;},
    authorizeSave:async command=>{authorized.push(command);events.push('journal');return authorizeSave(command);},
    fetchImpl:async(url,init)=>{
      calls.push({url:url.href,init});events.push('fetch:'+url.pathname);
      if(respond)return respond(url,init);
      if(url.pathname==='/api/affairs-assistant')return sse();
      if(url.pathname==='/api/affairs-conversations')return Response.json(init.body?{id:JSON.parse(init.body).id}:url.search?{id:url.searchParams.get('id')}:{conversations:[]});
      return new Response('same-origin resource',{headers:{'Content-Type':'text/html','Set-Cookie':'ignored=1','x-internal-test':'ignored'}});
    },...overrides};
  return {...createProtectedConversationBrowserRelay(config),calls,authorized,events};
}

const certificateRoute='/school-affairs/services/52-1';
const certificateBootstrap='/api/affairs-data?scope=certificate-awards&view=mine';
const certificateAnswer=certificateBootstrap+'&answer=en';
const certificateCompound=certificateAnswer+'&bank_receipt=requested';
const certificateQuestion='What is the status of my professional certificate subsidy application?';
const certificateCompoundQuestion=certificateQuestion+' Also tell me whether its payout has reached my bank.';
const certificateGet=(path,actor=ownerId,route=certificateRoute)=>({...get(path,ownedHeaders(actor)),frameUrl:origin+route});
const certTitle='Certificate award applications',certSummary='Your recent certificate applications:';
const certRead={kind:'certificate-awards',label:certTitle,detail:certSummary,status:'complete'};
const certBank={kind:'certificate-awards-bank-receipt',label:'Bank receipt confirmation',detail:certificateAwardBankReceiptNote[1],status:'unavailable'};
const certUpdatedAt='2027-01-15T05:20:00+00:00';
const directAnswer=(bankReceipt=false)=>({status:'answered',
  answer:[certSummary,'- (MOS)Excel Associate Microsoft 365 Apps · Approved · NT$900',...(bankReceipt?[certBank.detail]:[]),
    `[${certTitle}](${certificateRoute})`].join('\n\n'),
  activity:[certRead,...(bankReceipt?[certBank]:[])],
  citations:[{chunkId:'account:certificate-awards',claim:certSummary,title:certTitle,url:certificateRoute,sourceName:'My stu.best records'}],
  suggestedQuestions:[],grounding:{source:'account',webSearched:false}});
function certificateSave(target,bankReceipt=false){
  const question=bankReceipt?certificateCompoundQuestion:certificateQuestion;
  const direct=directAnswer(bankReceipt),messageId=randomUUID();
  return {id:target,title:question.slice(0,80),version:0,messages:sanitizeStoredConversation([
    {id:'u-'+messageId,role:'user',content:question,images:[]},
    {id:'a-'+messageId,role:'assistant',phase:'complete',content:direct.answer,activity:direct.activity,result:direct},
  ])};
}
const certificatePost=(payload,actor=ownerId)=>({...save(payload),frameUrl:origin+certificateRoute,
  headers:{...ownedHeaders(actor),'Content-Type':'application/json'}});
function certificateHarness(overrides={}){
  return harness({profile:certificateBrowserProfile,assets:[assets[0],certificateBrowserHeading],
    respond:url=>{
      if(url.pathname==='/api/affairs-conversations')return Response.json({conversations:[]});
      if(url.pathname==='/api/affairs-data')
        return Response.json(url.searchParams.has('answer')?directAnswer(url.searchParams.has('bank_receipt')):{userId:ownerId,rows:[],files:[]});
      return new Response('Pinned certificate page',{headers:{'Content-Type':'text/html'}});
    },...overrides});
}

for(const [question,path] of [[certificateQuestion,certificateAnswer],[certificateCompoundQuestion,certificateCompound]]){
  test('certificate browser admits one exact answer after its distinct bootstrap for '+path,async()=>{
    const h=certificateHarness();
    const reservation={id:id(),mode:'turn',route:certificateRoute,question};
    assert.throws(()=>h.reserve(reservation),/invalid conversation reservation/u);
    await assert.rejects(h.dispatch(certificateGet(certificateBootstrap)),/unapproved request operation/u);
    await h.dispatch(get(certificateRoute));
    await h.dispatch(get(certificateBrowserHeading));
    await h.dispatch(certificateGet('/api/affairs-conversations'));
    await assert.rejects(h.dispatch(certificateGet(path)),/unapproved request operation/u);
    await h.dispatch(certificateGet(certificateBootstrap));
    assert.throws(()=>h.reserve({...reservation,question:'A different prompt'}),/invalid conversation reservation/u);
    h.reserve(reservation);
    await assert.rejects(h.dispatch(certificateGet(certificateBootstrap)),/unapproved request operation/u);
    await assert.rejects(h.dispatch(certificateGet(path,otherId)),/wrong fixture caller/u);
    await assert.rejects(h.dispatch(certificateGet(path,ownerId,'/dtm')),/unapproved request operation/u);
    await assert.rejects(h.dispatch(certificateGet(path===certificateAnswer?certificateCompound:certificateAnswer)),/unapproved request operation/u);
    await assert.rejects(h.dispatch(certificateGet(path+'&id='+otherId)),/unapproved request operation/u);
    const response=await h.dispatch(certificateGet(path));
    assert.deepEqual(JSON.parse(response.body),directAnswer(path===certificateCompound));
    await assert.rejects(h.dispatch(certificateGet(path)),/unapproved request operation/u);
    await assert.rejects(h.dispatch(assistant(bodyFor(),certificateRoute)),/unapproved request operation/u);
    await assert.rejects(h.dispatch({...save(saveFor(reservation.id)),frameUrl:origin+certificateRoute}),/unreserved conversation save/u);
    assert.deepEqual(h.calls.map(({url})=>url),[certificateRoute,certificateBrowserHeading,'/api/affairs-conversations',certificateBootstrap,path].map(path=>origin+path));
    assert.equal(h.authorized.length,0);
    assert.deepEqual(h.egress().observations.filter(row=>row.request==='certificate-answer'&&row.forwarded),
      [{sequence:12,phase:'turn',request:'certificate-answer',method:'GET',forwarded:true,result:'accepted',status:200}]);
  });
}

test('certificate egress reports denied cross-origin and unbounded attempts without recording their values',async()=>{
  const h=certificateHarness();
  await assert.rejects(h.dispatch({url:'https://example.invalid/private-marker',method:'PURGE'}),/unapproved request origin/u);
  await assert.rejects(h.dispatch({url:project+'/auth/v1/user',method:'GET',headers:ownedHeaders(otherId)}),/wrong fixture caller/u);
  await assert.rejects(h.dispatch({url:project+'/auth/v1/token?grant_type=refresh_token',method:'POST'}),/unapproved request origin/u);
  await h.dispatch({url:project+'/auth/v1/user',method:'GET',headers:ownedHeaders()});
  const evidence=h.egress();
  assert.deepEqual(evidence.observations.map(({request,method,result,forwarded})=>[request,method,result,forwarded]),[
    ['other','other','rejected',false],['auth','GET','rejected',false],
    ['other','POST','rejected',false],['auth','GET','pass-through',false],
  ]);
  assert.ok(!JSON.stringify(evidence).includes('private-marker'));
  evidence.observations[0].result='accepted';
  assert.equal(h.egress().observations[0].result,'rejected');
  for(let i=4;i<256;i++)await assert.rejects(h.dispatch({url:'https://example.invalid',method:'GET'}));
  await assert.rejects(h.dispatch(get(certificateRoute)),/egress observation limit/u);
  assert.equal(h.egress().overflow,true);
  assert.equal(h.calls.length,0);
});

test('announcement email admits one reserved inbox answer and journaled save with closed egress',async()=>{
  const scope=announcementEmailBrowserAnswerPath(true),{question}=announcementEmailBrowserCases[1],target=id();
  const summary='Your announcement email preference is enabled and scheduled to activate.';
  const effectiveAt='2099-01-01T00:00:00+00:00',title='Announcement email settings';
  const activity=[{kind:'announcement-email',label:title,detail:summary,status:'complete'},
    {kind:'announcement-email-inbox-receipt',label:'Inbox delivery confirmation',detail:announcementEmailInboxLimit,status:'unavailable'}];
  const response={status:'answered',answer:[summary,'Saved activation time: '+effectiveAt,announcementEmailInboxLimit,
    `[${title}](${announcementEmailPath})`].join('\n\n'),activity,
    citations:[{chunkId:'account:announcement-email',claim:summary,title,url:announcementEmailPath,sourceName:'My stu.best settings'}],
    grounding:{source:'account',webSearched:false},suggestedQuestions:[]};
  const payload={id:target,title:question.slice(0,80),version:0,messages:sanitizeStoredConversation([
    {id:'u-'+otherId,role:'user',content:question,images:[]},
    {id:'a-'+otherId,role:'assistant',phase:'complete',content:response.answer,result:response,activity},
  ])};
  const answerSequence=6;
  assert.throws(()=>harness({profile:announcementEmailBrowserProfile,assets:[assets[0]]}),{code:'invalid-resource-allowlist'});
  const h=harness({profile:announcementEmailBrowserProfile,assets:[assets[0],...announcementEmailBrowserMedia],
    authorizeSave:command=>command.inbox===true&&command.requestSequence===answerSequence&&command.expected.answer===response.answer,
    respond(url,init){
      if(url.pathname===announcementEmailPath)return new Response('Pinned email page',{headers:{'Content-Type':'text/html'}});
      if(announcementEmailBrowserMedia.includes(url.pathname)){
        assert.equal(init.headers.has('authorization'),false);
        return new Response('Public School Affairs image');
      }
      if(url.pathname==='/api/affairs-conversations')return Response.json(init.method==='GET'?{conversations:[]}:
        {...JSON.parse(init.body),version:1,created_at:certUpdatedAt,updated_at:certUpdatedAt});
      return Response.json(url.searchParams.has('answer')?response:
        {userId:ownerId,enabled:true,active:false,effectiveAt,version:1,deliveryConfigured:true});
    },
  });
  const own=path=>certificateGet(path,ownerId,announcementEmailPath);
  await h.dispatch(get(announcementEmailPath));
  await h.dispatch(own(announcementEmailBrowserBootstrap));
  for(const path of announcementEmailBrowserMedia)assert.equal((await h.dispatch(get(path))).status,200);
  await h.dispatch(own('/api/affairs-conversations'));
  h.reserve({id:target,mode:'turn',route:announcementEmailPath,question});
  await h.dispatch(own(scope));
  const saved=await h.dispatch({...certificatePost(payload),frameUrl:origin+announcementEmailPath});
  assert.deepEqual(saved.announcementEmailReceipt,{id:target,version:1,updatedAt:certUpdatedAt});
  assert.deepEqual(verifyProtectedAnnouncementEmailBrowserEgress({evidence:h.egress(),mode:'turn',requestSequence:answerSequence}),
    {mode:'turn',answerRequests:1,saveRequests:1,restoreRequests:0});
  const before=h.calls.length;
  await assert.rejects(h.dispatch(get(announcementEmailBrowserMedia[0],ownedHeaders())),{code:'caller-credential-on-a-public-resource'});
  await assert.rejects(h.dispatch(own('/stu-reference/unlisted.svg')),{code:'unapproved-request-operation'});
  for(const path of [scope,announcementEmailBrowserAnswerPath(false),certificateAnswer,scope+'&user_id='+otherId])
    await assert.rejects(h.dispatch(own(path)),/unapproved request operation/u);
  assert.equal(h.calls.length,before);
  assert.throws(()=>verifyProtectedAnnouncementEmailBrowserEgress({evidence:h.egress(),mode:'turn',requestSequence:answerSequence}),
    {code:'certificate-egress-mismatch'});
});

test('the exact Student Profile multipart GET binds both citations to one save and one fresh restore',async()=>{
  const {question}=studentProfileBrowserCases.find(row=>row.year);
  const summary='Your current student information has been confirmed.',title='Student information confirmation';
  const year='Your recorded year level is 3 (sample data).',yearTitle='Recorded School Affairs year level';
  const activity=[
    {kind:'student-profile',label:'Checked student information confirmation',detail:summary,status:'complete'},
    {kind:'account-read:profile:1',label:yearTitle,detail:year,status:'complete'},
  ];
  const reply={status:'answered',answer:[summary,year,'['+title+']('+studentProfilePath+')'].join('\n\n'),
    activity,suggestedQuestions:[],grounding:{source:'account',webSearched:false},
    citations:[['account:student-profile-status',title,summary],['account:profile',yearTitle,year]].map(([chunkId,title,claim])=>
      ({chunkId,title,claim,url:studentProfilePath,sourceName:'My stu.best records',locator:null,effectiveAt:null,reviewedAt:null})),
  };
  const target=id(),messageId=randomUUID(),payload={id:target,title:question.slice(0,80),version:0,messages:sanitizeStoredConversation([
    {id:'u-'+messageId,role:'user',content:question,images:[]},
    {id:'a-'+messageId,role:'assistant',phase:'complete',content:reply.answer,result:reply,activity},
  ])};
  const saved={...payload,version:1,created_at:certUpdatedAt,updated_at:certUpdatedAt};
  const assetPaths=[assets[0],studentProfileBrowserHeading];
  const frameRequest=path=>certificateGet(path,ownerId,studentProfilePath);
  let expected;
  const relay=(restore=false)=>harness({profile:studentProfileBrowserProfile,assets:assetPaths,
    authorizeSave(command){expected=command.expected;return !restore&&command.year&&command.expected.display.sourceLinks.length===2;},
    respond(url,init){
      if(url.pathname===studentProfilePath)return new Response('Pinned student profile page',{headers:{'Content-Type':'text/html'}});
      if(url.pathname==='/api/affairs-conversations'){
        if(init.method==='POST')return Response.json(saved);
        if(!url.search)return Response.json({conversations:restore?[{id:target}]:[]});
        const {created_at,...detail}=saved;
        return Response.json(detail);
      }
      return Response.json(url.searchParams.has('answer')?reply:{userId:ownerId,record:null});
    },
  });
  const live=relay();
  await live.dispatch(get(studentProfilePath));
  await live.dispatch(frameRequest(studentProfileBrowserBootstrap));
  await live.dispatch(frameRequest('/api/affairs-conversations'));
  live.reserve({id:target,mode:'turn',route:studentProfilePath,question});
  const answerPath=studentProfileBrowserAnswerPath(true);
  await live.dispatch(frameRequest(answerPath));
  assert.deepEqual((await live.dispatch({...certificatePost(payload),frameUrl:origin+studentProfilePath})).studentProfileReceipt,
    {id:target,version:1,updatedAt:certUpdatedAt});
  assert.deepEqual(verifyProtectedStudentProfileBrowserEgress({evidence:live.egress(),mode:'turn',requestSequence:4}),
    {mode:'turn',answerRequests:1,saveRequests:1,restoreRequests:0});
  const fresh=relay(true);
  fresh.reserve({id:target,mode:'read',expected:{...expected,updatedAt:certUpdatedAt}});
  await fresh.dispatch(get(studentProfilePath));
  await fresh.dispatch(frameRequest(studentProfileBrowserBootstrap));
  await fresh.dispatch(frameRequest('/api/affairs-conversations'));
  await fresh.dispatch(frameRequest('/api/affairs-conversations?id='+target));
  assert.deepEqual(verifyProtectedStudentProfileBrowserEgress({evidence:fresh.egress(),mode:'restore'}),
    {mode:'restore',answerRequests:0,saveRequests:0,restoreRequests:1});
  const before=fresh.calls.length;
  for(const path of [answerPath,studentProfileBrowserAnswerPath(false),answerPath+'&user_id='+otherId])
    await assert.rejects(fresh.dispatch(frameRequest(path)),/unapproved request operation/u);
  assert.equal(fresh.calls.length,before);
});

test('foreign profile and announcement questions allow one exact refusal save and zero answer requests',async t=>{
  const emailSummary='I can’t check another student’s announcement email preference.',title='Announcement email settings';
  const fixtures=[
    {case:studentProfileBrowserCases.find(row=>row.local),route:studentProfilePath,profile:studentProfileBrowserProfile,
      bootstrap:studentProfileBrowserBootstrap,bootReply:{userId:ownerId,record:null},media:[studentProfileBrowserHeading],
      answerPath:studentProfileBrowserAnswerPath(false),verify:verifyProtectedStudentProfileBrowserEgress,
      refusal:{answer:'I can’t access another student’s profile records.'}},
    {case:announcementEmailBrowserCases.find(row=>row.local),route:announcementEmailPath,profile:announcementEmailBrowserProfile,
      bootstrap:announcementEmailBrowserBootstrap,bootReply:{userId:ownerId,enabled:false,active:false,effectiveAt:null,version:0,deliveryConfigured:false},
      media:announcementEmailBrowserMedia,answerPath:announcementEmailBrowserAnswerPath(false),verify:verifyProtectedAnnouncementEmailBrowserEgress,
      refusal:{answer:`${emailSummary}\n\n[${title}](${announcementEmailPath})`,grounding:{source:'directory',webSearched:false},
        activity:[{kind:'announcement-email-privacy',label:title,detail:emailSummary,status:'complete'}]}},
  ];
  for(const fixture of fixtures)await t.test(fixture.profile,async()=>{
    const {route,profile,bootstrap,bootReply,media,answerPath,verify,refusal,case:{question}}=fixture;
    const target=id(),messageId=randomUUID(),reply={status:'handoff',citations:[],suggestedQuestions:[],...refusal};
    const payload={id:target,title:question.slice(0,80),version:0,messages:sanitizeStoredConversation([
      {id:'u-'+messageId,role:'user',content:question,images:[]},
      {id:'a-'+messageId,role:'assistant',phase:'complete',content:reply.answer,result:reply,activity:reply.activity},
    ])};
    const setup=async()=>{
      const h=harness({profile,assets:[assets[0],...media],authorizeSave:command=>command.local===true&&command.requestSequence===4,
        respond(url,init){
          if(url.pathname===route)return new Response('Pinned private page',{headers:{'Content-Type':'text/html'}});
          if(url.pathname+url.search===bootstrap)return Response.json(bootReply);
          if(url.pathname==='/api/affairs-conversations')return Response.json(init.method==='GET'?{conversations:[]}:
            {...payload,version:1,created_at:certUpdatedAt,updated_at:certUpdatedAt});
          assert.fail('A refusal must not dispatch an answer lookup.');
        }});
      await h.dispatch(get(route));
      await h.dispatch(certificateGet(bootstrap,ownerId,route));
      await h.dispatch(certificateGet('/api/affairs-conversations',ownerId,route));
      h.reserve({id:target,mode:'turn',route,question});
      return h;
    };
    const post=value=>({...certificatePost(value),frameUrl:origin+route});
    const h=await setup();
    assert.equal((await h.dispatch(post(payload))).status,200);
    assert.deepEqual(verify({evidence:h.egress(),mode:'turn',requestSequence:4,local:true}),
      {mode:'turn',answerRequests:0,saveRequests:1,restoreRequests:0});
    assert.throws(()=>verify({evidence:h.egress(),mode:'turn',requestSequence:3,local:true}));
    await assert.rejects(h.dispatch(certificateGet(answerPath,ownerId,route)),{code:'unapproved-request-operation'});
    await assert.rejects(h.dispatch(assistant(bodyFor(0,{question,route}),route)),{code:'unapproved-request-operation'});
    assert.throws(()=>verify({evidence:h.egress(),mode:'turn',requestSequence:4,local:true}));
    const tampered=await setup(),bad=structuredClone(payload);
    bad.messages[1].result.views=[{title:'Another student’s record',rows:[['private']]}];
    await assert.rejects(tampered.dispatch(post(bad)),{code:'save-answer-mismatch'});
    assert.equal(tampered.calls.length,3);
  });
});

test('certificate profiles cannot broaden data paths and malformed replies cannot hide forwarded reads',async()=>{
  assert.throws(()=>certificateHarness({dataPaths:[certificateBootstrap]}),/invalid data route allowlist/u);
  assert.throws(()=>certificateHarness({assets:[assets[0],certificateBrowserHeading,'/stu-reference/other.js']}),/invalid resource allowlist/u);
  const h=certificateHarness({respond:url=>url.pathname===certificateRoute
    ?new Response('Pinned certificate page',{headers:{'Content-Type':'text/html'}})
    :Response.json(url.searchParams.has('answer')
      ?{...directAnswer(),grounding:{source:'public',webSearched:true}}:{userId:ownerId,rows:[],files:[]})});
  await h.dispatch(get(certificateRoute));
  await h.dispatch(certificateGet(certificateBootstrap));
  h.reserve({id:id(),mode:'turn',route:certificateRoute,question:certificateQuestion});
  await assert.rejects(h.dispatch(certificateGet(certificateAnswer)),/invalid certificate response/u);
  assert.deepEqual(h.egress().observations.at(-1),{
    sequence:3,phase:'turn',request:'certificate-answer',method:'GET',forwarded:true,result:'rejected',status:200,
  });
});

test('an in-flight certificate bootstrap remains visible and cannot admit a turn or retry',async()=>{
  const bootstrap=Promise.withResolvers(),started=Promise.withResolvers();
  const h=certificateHarness({respond:url=>{
    if(url.pathname===certificateRoute)return new Response('Pinned page',{headers:{'Content-Type':'text/html'}});
    started.resolve();
    return bootstrap.promise;
  }});
  await h.dispatch(get(certificateRoute));
  const read=h.dispatch(certificateGet(certificateBootstrap));
  await started.promise;
  assert.equal(h.egress().observations.at(-1).result,'pending');
  const reservation={id:id(),mode:'turn',route:certificateRoute,question:certificateQuestion};
  assert.throws(()=>h.reserve(reservation),/invalid conversation reservation/u);
  await assert.rejects(h.dispatch(certificateGet(certificateBootstrap)),/unapproved request operation/u);
  bootstrap.resolve(Response.json({userId:ownerId,rows:[],files:[]}));
  await read;
  h.reserve(reservation);
  assert.equal(h.egress().observations[1].result,'accepted');
});

function savedCertificateHarness(options={}){
  return certificateHarness({respond:(url,init)=>{
    if(url.pathname===certificateRoute)return new Response('Pinned certificate page',{headers:{'Content-Type':'text/html'}});
    if(url.pathname==='/api/affairs-data')return Response.json(url.searchParams.has('answer')
      ?directAnswer(url.searchParams.has('bank_receipt')):{userId:ownerId,rows:[],files:[]});
    if(init.method==='GET')return Response.json({conversations:[]});
    const payload=JSON.parse(init.body);
    return Response.json({...payload,version:1,created_at:certUpdatedAt,updated_at:certUpdatedAt});
  },...options});
}

async function prepareCertificateSave(h,payload,bankReceipt){
  await h.dispatch(get(certificateRoute));
  await h.dispatch(certificateGet(certificateBootstrap));
  h.reserve({id:payload.id,mode:'turn',route:certificateRoute,question:payload.messages[0].content});
  await h.dispatch(certificateGet(bankReceipt?certificateCompound:certificateAnswer));
}

test('drained egress distinguishes a complete certificate turn from one with blocked or pending effects',async()=>{
  const payload=certificateSave(id()),h=savedCertificateHarness();
  await h.dispatch(get(certificateRoute));
  await h.dispatch(certificateGet(certificateBootstrap));
  await h.dispatch(certificateGet('/api/affairs-conversations'));
  h.reserve({id:payload.id,mode:'turn',route:certificateRoute,question:certificateQuestion});
  await h.dispatch(certificateGet(certificateAnswer));
  assert.throws(()=>verifyProtectedCertificateBrowserEgress({evidence:h.egress(),mode:'turn',requestSequence:4}),{code:'certificate-egress-mismatch'});
  await h.dispatch(certificatePost(payload));
  const proof=verifyProtectedCertificateBrowserEgress({evidence:h.egress(),mode:'turn',requestSequence:4});
  assert.deepEqual(proof,{mode:'turn',answerRequests:1,saveRequests:1,restoreRequests:0});
  await assert.rejects(h.dispatch({url:'https://example.invalid/unapproved',method:'GET'}));
  assert.throws(()=>verifyProtectedCertificateBrowserEgress({evidence:h.egress(),mode:'turn',requestSequence:4}),{code:'certificate-egress-mismatch'});
});

test('certificate JSON binds the long title, browser save, independent journal and exact receipt',async()=>{
  const target=id(),payload=certificateSave(target,true);
  const h=savedCertificateHarness({authorizeSave:command=>{
    const {ownerId:actor,assistantResponse,expected,requestSequence}=command;
    assert.equal(actor,ownerId);
    assert.equal(expected.id,target);
    assert.equal(expected.title,certificateCompoundQuestion.slice(0,80));
    assert.equal(expected.question,certificateCompoundQuestion);
    assert.deepEqual(expected,verifyProtectedCertificateBrowserSave(command));
    assert.deepEqual(JSON.parse(assistantResponse),directAnswer(true));
    assert.equal(requestSequence,3);
    command.payload.messages[1].content='Callback mutation';
    expected.messages[1].content='Callback mutation';
    assistantResponse.fill(0);
    return true;
  }});
  await prepareCertificateSave(h,payload,true);
  await assert.rejects(h.dispatch(certificatePost(payload,otherId)),/wrong fixture caller/u);
  const result=await h.dispatch(certificatePost(payload));
  assert.deepEqual(result.certificateReceipt,{id:target,version:1,updatedAt:certUpdatedAt});
  assert.deepEqual(JSON.parse(h.calls.at(-1).init.body),payload);
  await assert.rejects(h.dispatch(certificatePost(payload)),/unreserved conversation save/u);
  await assert.rejects(h.dispatch(get(certificateRoute)),/unapproved request operation/u);
  await assert.rejects(h.dispatch(certificateGet('/api/affairs-conversations?id='+target)),/unreserved conversation read/u);
  assert.equal(h.authorized.length,1);
  assert.equal(h.calls.filter(row=>row.init.method==='POST').length,1);
  assert.deepEqual(h.egress().observations.filter(row=>row.request==='conversation-save').map(row=>[row.forwarded,row.result]),
    [[false,'rejected'],[true,'accepted'],[false,'rejected']]);
});

test('modified direct replies, transcript and save receipts fail before credit and never permit a retry',async()=>{
  for(const [mutate,code] of [
    [row=>{row.title+='X';},'save-envelope-mismatch'],
    [row=>{row.messages[1].content='Different certificates.';},'save-answer-mismatch'],
    [row=>{row.messages[1].activity.pop();},'save-activity-mismatch'],
    [row=>{row.messages[1].result.citations[0].url='/dtm';},'save-certificate-transcript-mismatch'],
    [row=>{row.messages[1].result.verification={status:'verified',attempts:1};},'save-certificate-transcript-mismatch'],
    [row=>{row.messages[1].id='a-'+randomUUID();},'save-message-shape-mismatch'],
  ]){
    const payload=certificateSave(id(),true),h=savedCertificateHarness();
    await prepareCertificateSave(h,payload,true);
    const changed=structuredClone(payload);mutate(changed);
    await assert.rejects(h.dispatch(certificatePost(changed)),{code});
    await assert.rejects(h.dispatch(certificatePost(payload)),/unreserved conversation save/u);
    assert.equal(h.authorized.length,0);
    assert.equal(h.calls.length,3);
  }
  const payload=certificateSave(id(),false);
  const alteredReceipt=savedCertificateHarness({respond:(url,init)=>{
    if(init?.method==='POST')
      return Response.json({...JSON.parse(init.body),version:2,created_at:certUpdatedAt,updated_at:certUpdatedAt});
    if(url.pathname===certificateRoute)return new Response('Pinned page',{headers:{'Content-Type':'text/html'}});
    return Response.json(url.searchParams.has('answer')?directAnswer():{userId:ownerId,rows:[],files:[]});
  }});
  await prepareCertificateSave(alteredReceipt,payload,false);
  await assert.rejects(alteredReceipt.dispatch(certificatePost(payload)),{code:'save-certificate-receipt-mismatch'});
  await assert.rejects(alteredReceipt.dispatch(certificatePost(payload)),/unreserved conversation save/u);
  assert.equal(alteredReceipt.authorized.length,1);
  assert.equal(alteredReceipt.calls.filter(row=>row.init.method==='POST').length,1);
});

test('a fresh certificate context can load one precisely observed saved turn and cannot save or re-ask',async()=>{
  const payload=certificateSave(id()),row={...payload,version:1,updated_at:certUpdatedAt};
  const expected={...verifyProtectedCertificateBrowserSave({payload,question:certificateQuestion,
    assistantResponse:Buffer.from(JSON.stringify(directAnswer())),requestSequence:3,bankReceipt:false}),updatedAt:certUpdatedAt};
  for(const changed of [false,true]){
    const fresh=savedCertificateHarness({respond:url=>{
      if(url.pathname===certificateRoute)return new Response('Pinned page',{headers:{'Content-Type':'text/html'}});
      if(url.pathname==='/api/affairs-conversations'){
        if(url.search)return Response.json({...row,updated_at:changed?'2027-01-16T05:20:00+00:00':row.updated_at});
        return Response.json({conversations:[{id:row.id,title:row.title,version:1,updated_at:row.updated_at}]});
      }
      return Response.json({userId:ownerId,rows:[],files:[]});
    }});
    fresh.reserve({id:row.id,mode:'read',expected});
    await fresh.dispatch(get(certificateRoute));
    await fresh.dispatch(certificateGet(certificateBootstrap));
    await fresh.dispatch(certificateGet('/api/affairs-conversations'));
    const detail=certificateGet('/api/affairs-conversations?id='+row.id);
    await assert.rejects(fresh.dispatch(certificateGet('/api/affairs-conversations?id='+id())),/unreserved conversation read/u);
    if(changed)await assert.rejects(fresh.dispatch(detail),{code:'save-certificate-receipt-mismatch'});
    else assert.deepEqual((await fresh.dispatch(detail)).certificateReceipt,{id:row.id,version:1,updatedAt:certUpdatedAt});
    await assert.rejects(fresh.dispatch(detail),/unreserved conversation read/u);
    await assert.rejects(fresh.dispatch(certificateGet(certificateAnswer)),/unapproved request operation/u);
    await assert.rejects(fresh.dispatch(certificatePost(payload)),/unapproved request operation/u);
    assert.equal(fresh.authorized.length,0);
    assert.equal(fresh.calls.length,4);
    assert.ok(fresh.egress().observations.every(item=>item.phase==='restore'));
  }
});

test('only registered navigation and build assets receive the separate Preview credential',async()=>{
  const h=harness();
  const result=await h.dispatch(get('/dtm',{Cookie:'browser=ignored',Referer:'https://example.invalid'}));
  assert.equal(result.kind,'preview');
  assert.deepEqual(result.headers,{'content-type':'text/html'});
  await h.dispatch(get(assets[0]));
  assert.deepEqual(h.events,['pin','fetch:/dtm','pin','fetch:'+assets[0]]);
  for(const {url,init} of h.calls){
    assert.equal(new URL(url).origin,origin);
    assert.equal(init.headers.get(previewTrustedHeader),token);
    assert.equal(init.headers.get('authorization'),null);
    assert.equal(init.headers.get('referer'),null);
    assert.equal(init.headers.get('cookie'),null);
    assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.cache,'no-store');
  }
  await assert.rejects(h.dispatch(get('/dtm?next=/api/affairs-data')),/unapproved request operation|wrong fixture caller/u);
  await assert.rejects(h.dispatch(get('/assets/unknown.js')),/unapproved request operation|wrong fixture caller/u);
  await assert.rejects(h.dispatch(get('/dtm',ownedHeaders())),/caller credential on a public resource/u);
  assert.equal(h.calls.length,2);
});

test('exact Supabase Auth may continue untouched and an incoming OIDC credential is always denied',async()=>{
  const h=harness();
  for(const [method,path] of [['GET','/auth/v1/user'],['POST','/auth/v1/token?grant_type=refresh_token'],
    ['POST','/auth/v1/logout?scope=local'],['OPTIONS','/auth/v1/user']]){
    assert.deepEqual(await h.dispatch({method,url:project+path}),{kind:'supabase-auth'});
    await assert.rejects(h.dispatch({method,url:project+path,headers:{[previewTrustedHeader]:token}}),/inherited Preview credential/u);
  }
  await assert.rejects(h.dispatch({method:'GET',url:project+'/auth/v1/user',headers:{Authorization:'Bearer '+token}}),
    /inherited Preview credential/u);
  await assert.rejects(h.dispatch({method:'POST',url:project+'/auth/v1/token?grant_type=refresh_token',body:JSON.stringify({refresh_token:token})}),
    /inherited Preview credential/u);
  for(const path of ['/auth/v1/logout?scope=global','/auth/v1/user?x=1','/rest/v1/affairs_conversations'])
    await assert.rejects(h.dispatch({method:'GET',url:project+path}),/unapproved request origin/u);
  for(const url of ['https://www.stu.edu.tw/dtm',origin+'.example.invalid/dtm',origin+'/dtm#fragment',origin+'/auth/../dtm'])
    await assert.rejects(h.dispatch({method:'GET',url}),/unapproved request origin|invalid URL/u);
  assert.deepEqual(h.calls,[]);
});

test('browser turns bind the page route, unique correlations, own saves and the journal boundary',async()=>{
  const h=harness({authorizeSave:async ({ownerId:actor,payload,correlationId,assistantResponse})=>{
    assert.equal(actor,ownerId);
    assert.match(correlationId,/^[a-f0-9-]{36}$/u);
    const result=await readAssistantReply(new Response(assistantResponse,{headers:{'Content-Type':'text/event-stream'}}));
    return payload.messages[1].content===result.answer&&payload.messages[1].activity[0].kind===step.kind;
  }});
  const ids=[id(),id()];
  ids.forEach((target,index)=>h.reserve({id:target,mode:'turn',route:frame,question:questions[index]}));
  await assert.rejects(h.dispatch(save(saveFor(ids[0]))),/unreserved conversation save/u);
  await assert.rejects(h.dispatch(assistant(bodyFor(),'/school-affairs')),/unreserved assistant turn or frame/u);
  await assert.rejects(h.dispatch(assistant(bodyFor(0,{route:'/school-affairs'}))),/unreserved assistant turn or frame/u);
  await assert.rejects(h.dispatch(assistant(bodyFor(0,{history:[{role:'user',content:'other'}]}))),/unexpected assistant envelope/u);
  await assert.rejects(h.dispatch(assistant(bodyFor(0,{imageProvider:'unexpected'}))),/unexpected assistant envelope/u);
  const first=await h.dispatch(assistant());
  await assert.rejects(h.dispatch(save(saveFor(ids[1],1))),/unreserved conversation save/u);
  await h.dispatch(save(saveFor(ids[0])));
  const second=await h.dispatch(assistant(bodyFor(1)));
  await h.dispatch(save(saveFor(ids[1],1)));
  assert.notEqual(first.headers['x-assistant-request-id'],second.headers['x-assistant-request-id']);
  assert.deepEqual(h.authorized.map(({payload,correlationId})=>[payload.id,correlationId]),
    ids.map((id,index)=>[id,[first,second][index].headers['x-assistant-request-id']]));
  assert.ok(h.events.includes('journal'));
  for(const site of h.events.flatMap((value,index)=>value==='fetch:/api/affairs-conversations'?[index]:[]))
    assert.equal(h.events[site-1],'journal');
  await assert.rejects(h.dispatch(assistant()),/unreserved assistant turn or frame/u);
  await assert.rejects(h.dispatch(save(saveFor(ids[0]))),/unreserved conversation save/u);
  for(const id of ids)await h.dispatch(get('/api/affairs-conversations?id='+id,ownedHeaders()));
  await assert.rejects(h.dispatch(get('/api/affairs-conversations?id='+id(),ownedHeaders())),/unreserved conversation read/u);
  await assert.rejects(h.dispatch(get('/api/affairs-conversations?id='+ids[0]+'&id='+ids[1],ownedHeaders())),/unreserved conversation read/u);
  await assert.rejects(h.dispatch(get('/api/affairs-conversations',ownedHeaders(otherId))),/wrong fixture caller/u);
  assert.equal(h.calls.length,6);
});

test('only an authorized explicit synthetic save can reach the deployed conversation endpoint',async()=>{
  const h=harness({authorizeSave:({assistantResponse,correlationId})=>{
    assert.equal(assistantResponse,null);assert.equal(correlationId,null);return false;
  }});
  const first=id(),second=id();
  h.reserve({id:first,mode:'read'});h.reserve({id:second,mode:'fixture'});
  await assert.rejects(h.dispatch(save(saveFor(first))),/unreserved conversation save/u);
  await assert.rejects(h.dispatch(save(saveFor(second))),/save intent could not be verified and journaled/u);
  assert.equal(h.authorized.length,1);
  assert.deepEqual(h.calls,[]);
});

test('invalid response pin, cross-account IDs, duplicate correlation IDs and unavailable streams fail closed',async()=>{
  let pins=0;
  const drift=harness({verifyPin:()=>++pins===1?proof:{...proof,manifest:{...proof.manifest,revision:'b'.repeat(40)}}});
  await assert.rejects(drift.dispatch(get('/dtm')),/exact release could not be verified/u);
  await assert.rejects(drift.dispatch(get(assets[0])),/release pin failed/u);
  assert.equal(drift.calls.length,1);
  const readBad=harness({respond:()=>Response.json({conversations:[{id:id()}]})});
  await assert.rejects(readBad.dispatch(get('/api/affairs-conversations',ownedHeaders())),/unreserved conversation in index/u);
  const same=randomUUID(),dup=harness({respond:()=>sse(answer,same)});
  for(const question of questions)dup.reserve({id:id(),mode:'turn',route:frame,question});
  await dup.dispatch(assistant());
  await assert.rejects(dup.dispatch(assistant(bodyFor(1))),/invalid assistant stream correlation/u);
  const broken=harness({respond:()=>new Response('event: progress\ndata: {}\n\n',{headers:{'Content-Type':'text/event-stream','X-Assistant-Request-Id':randomUUID()}})});
  const session=id();broken.reserve({id:session,mode:'turn',route:frame,question:questions[0]});
  await assert.rejects(broken.dispatch(assistant()),/invalid assistant stream result/u);
  await assert.rejects(broken.dispatch(save(saveFor(session))),/unreserved conversation save/u);
});

test('redirects, a different final URL, leaked header values and cross-owner fixture credentials cannot be fulfilled',async()=>{
  for(const [mock,error] of [
    [()=>new Response(null,{status:302,headers:{Location:project+'/auth/v1/user'}}),/unexpected redirect/u],
    [()=>{const response=new Response('ok');Object.defineProperty(response,'url',{value:project});return response;},/unexpected redirect/u],
    [()=>new Response('safe',{headers:{'Content-Security-Policy':token}}),/credential in response/u],
    [()=>new Response(token),/credential in response/u],
  ]){
    const h=harness({respond:mock});
    await assert.rejects(h.dispatch(get('/dtm')),error);
    assert.equal(h.calls.length,1);
    assert.equal(h.calls[0].init.redirect,'error');
  }
  const other=harness({readToken:()=>jwt(otherId)});
  await assert.rejects(other.dispatch(get('/api/affairs-conversations',ownedHeaders(otherId))),/wrong fixture caller/u);
  assert.equal(other.calls.length,0);
  assert.throws(()=>harness({dataPaths:['/api/affairs-data?resource=conversations']}),/invalid data route allowlist/u);
  assert.throws(()=>harness({assets:['/assets/../index.js']}),/invalid URL|invalid resource allowlist/u);
  assert.throws(()=>harness({now:()=>epoch*1000+100_000}),/outside its validity window/u);
});


test('relay preserves safe save validation codes before network and categorizes unknown failures',async()=>{
  for(const [failure,code] of [[new ProtectedBrowserDiagnostic('save assistant unverified'),'save-assistant-unverified'],
    [new Error('private provider response with credentials'),'save-intent-could-not-be-verified-and-journaled']]){
    const h=harness({authorizeSave:()=>{throw failure;}});
    const session=id();h.reserve({id:session,mode:'turn',route:frame,question:questions[0]});
    await h.dispatch(assistant());
    await assert.rejects(h.dispatch(save(saveFor(session))),error=>error.code===code&&!error.message.includes('credentials'));
    assert.deepEqual(h.calls.map(item=>item.url),[origin+'/api/affairs-assistant']);
  }
  const h=harness({respond:()=>Response.json({error:'private data'},{status:503})});
  await assert.rejects(h.dispatch(get('/api/affairs-conversations',ownedHeaders())),
    error=>error.code==='unexpected-application-status'&&error.status===503&&!error.message.includes('private data'));
});
