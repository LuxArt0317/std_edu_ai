import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {newConversationId} from '../../src/services/assistantConversationId.js';
import {readAssistantReply} from '../../src/services/assistantStreamReader.js';
import {createProtectedConversationBrowserRelay} from './vercel-preview-browser-transport.mjs';
import {previewTrustedHeader} from './vercel-preview-transport.mjs';

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
