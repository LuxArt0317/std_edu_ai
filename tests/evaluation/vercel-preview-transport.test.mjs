import assert from 'node:assert/strict';
import {test} from 'node:test';
import {conversationDeleteProbeTitles,createTrustedPreviewFetch} from './vercel-preview-transport.mjs';
import {main,options} from './run.mjs';

const origin='https://stdedu-abcdef123-v1-d286.vercel.app';
const trusted='x-vercel-trusted-oidc-idp-token';
const caller='Bearer synthetic.caller.signature';
const time=1800000000;
const tokenAt=(seconds,claims={})=>[
  'synthetic',Buffer.from(JSON.stringify({iss:'https://oidc.vercel.com/v1-d286',aud:'https://vercel.com/v1-d286',
    sub:'owner:v1-d286:project:std_edu_ai:environment:development',owner:'v1-d286',project:'std_edu_ai',environment:'development',
    nbf:seconds-120,exp:seconds+1800,...claims})).toString('base64url'),'signature',
].join('.');
const argv=['--mode','live','--origin',origin,'--approved-preview-origin',origin,'--preview-auth','oidc'];
const post={method:'POST',headers:{'Content-Type':'application/json',Authorization:caller},body:'{}'};

test('the transport keeps Vercel and caller credentials separate and sends only exact evaluation requests',async()=>{
  const token=tokenAt(time),sent=[];
  const fetch=createTrustedPreviewFetch({origin,token,now:()=>time*1000,fetchImpl:async(url,init)=>{
    sent.push({url:url.href,init});return Response.json({ok:true});
  }});
  const signal=new AbortController().signal;
  await fetch(origin+'/release.json',{signal});
  await fetch(new URL(origin+'/api/affairs-data?scope=club-student&view=my-attendance&page=2'),{headers:{Authorization:caller}});
  await fetch(origin+'/api/affairs-assistant',post);
  await fetch(origin+'/api/research-assistant',{...post,headers:{'Content-Type':'application/json'}});
  assert.equal(sent.length,4);
  assert.equal(sent[0].init.signal,signal);
  assert.deepEqual(sent.map(({init})=>init.headers.get('authorization')),[null,caller,caller,null]);
  assert.ok(sent.every(({init})=>init.headers.get(trusted)===token&&init.redirect==='error'
    &&init.credentials==='omit'&&init.cache==='no-store'));
  assert.equal(Object.hasOwn(post.headers,trusted),false);
  for(const [input,init] of [
    ['https://stu.best/release.json',{}],[origin+'.invalid/release.json',{}],[origin+'/public/../release.json',{}],
    [origin+'/release.json#hidden',{}],[origin+'/release.json',{headers:{Authorization:caller}}],
    [origin+'/api/affairs-data',{}],[origin+'/api/affairs-data',{...post}],
    [origin+'/api/affairs-conversations',post],[origin+'/api/affairs-assistant?other=1',post],
    [origin+'/api/affairs-assistant',{...post,headers:{...post.headers,[trusted]:'wrong'}}],
    [origin+'/api/research-assistant',{...post,headers:{...post.headers,Cookie:'browser-session'}}],
    [origin+'/api/research-assistant',{...post,body:'x'.repeat(60001)}],
  ])await assert.rejects(fetch(input,init),/^Error: Protected Preview transport:/u);
  assert.equal(sent.length,4);
});

test('other projects, environments, expiry, redirects and transport error details are rejected',async()=>{
  let calls=0,clock=time*1000;
  const base={origin,now:()=>clock,fetchImpl:async()=>{calls++;throw new Error('unsafe private detail');}};
  for(const hostname of ['unrelated-abcdef123-v1-d286.vercel.app','stdedu-git-main-v1-d286.vercel.app'])
    assert.throws(()=>createTrustedPreviewFetch({...base,origin:'https://'+hostname,token:tokenAt(time)}),/invalid Preview target/u);
  assert.throws(()=>createTrustedPreviewFetch(base),/Development token is required/u);
  for(const claims of [{project:'other'},{environment:'preview'},{aud:'https://other.invalid'},{iss:'https://other.invalid'},{exp:time}])
    assert.throws(()=>createTrustedPreviewFetch({...base,token:tokenAt(time,claims)}),/Protected Preview transport/u);
  const token=tokenAt(time),fetch=createTrustedPreviewFetch({...base,token});
  await assert.rejects(fetch(origin+'/release.json'),{message:'Protected Preview transport: request could not reach the pinned Preview.'});
  clock+=1800000;
  await assert.rejects(fetch(origin+'/release.json'),/outside its validity window/u);
  assert.equal(calls,1);
  const redirected=createTrustedPreviewFetch({...base,now:()=>time*1000,token,fetchImpl:async()=>new Response(null,{status:302})});
  await assert.rejects(redirected(origin+'/release.json'),/unexpected redirect/u);
});

test('confirmed task transport grants one exact POST to its bound caller and rejects cross-purpose requests',async()=>{
  const requestId='10000000-0000-4000-8000-000000000012',token=tokenAt(time),sent=[];
  const body={kind:'create_task',requestId,payload:{title:'QA assistant task 400a8c03c7ff'}};
  const bound={callerToken:caller.slice(7),body};
  const opts={origin,token,now:()=>time*1000,fetchImpl:async(url,init)=>{sent.push({url,init});return Response.json({ok:true});}};
  const endpoint=origin+'/api/affairs-action',init={...post,body:JSON.stringify(body)};
  await assert.rejects(createTrustedPreviewFetch(opts)(endpoint,init),/unapproved request operation/u);
  for(const invalid of [{...bound,body:{...body,payload:{title:'Live student task'}}},
    {...bound,body:{...body,requestId:null}},{...bound,body:{...body,kind:'publish_announcement'}}])
    assert.throws(()=>createTrustedPreviewFetch({...opts,confirmedTaskCommand:invalid}),/invalid confirmed task fixture/u);
  const relay=createTrustedPreviewFetch({...opts,confirmedTaskCommand:bound});
  for(const [url,req] of [[origin+'/api/affairs-assistant',init],[origin+'/api/affairs-data',{headers:init.headers}],
    [endpoint,{...init,headers:{...init.headers,Authorization:'Bearer another.caller.signature'}}],
    [endpoint,{...init,body:JSON.stringify({...body,payload:{title:body.payload.title+' revised'}})}],
    [endpoint+'?id='+requestId,init]])
    await assert.rejects(relay(url,req),/unapproved request operation/u);
  await relay(endpoint,init);
  await assert.rejects(relay(endpoint,init),/unapproved request operation/u);
  assert.equal(sent.length,1);
  assert.equal(sent[0].init.headers.get(trusted),token);
  assert.equal(sent[0].init.headers.get('authorization'),caller);
});

test('confirmed club cancellation relays one exact pending command to its bound caller',async()=>{
  const target='10000000-0000-4000-8000-000000000012',requestId='10000000-0000-4000-8000-000000000013';
  const body={kind:'cancel_club_equipment',payload:{request_id:requestId,id:target,expected_version:2}};
  const command={callerToken:caller.slice(7),body},sent=[];
  const opts={origin,token:tokenAt(time),now:()=>time*1000,fetchImpl:async(url,init)=>{sent.push({url,init});return Response.json({ok:true});}};
  assert.throws(()=>createTrustedPreviewFetch({...opts,confirmedClubCommand:{...command,body:{...body,payload:{...body.payload,expected_version:'2'}}}}),/invalid club cancellation/u);
  const endpoint=origin+'/api/affairs-action',init={...post,body:JSON.stringify(body)};
  await assert.rejects(createTrustedPreviewFetch(opts)(endpoint,init),/unapproved request operation/u);
  const relay=createTrustedPreviewFetch({...opts,confirmedClubCommand:command});
  await assert.rejects(relay(endpoint,{...init,headers:{...init.headers,Authorization:'Bearer another.caller.signature'}}),/unapproved request operation/u);
  await assert.rejects(relay(endpoint,{...init,body:JSON.stringify({...body,payload:{...body.payload,expected_version:1}})}),/unapproved request operation/u);
  await relay(endpoint,init);
  await assert.rejects(relay(endpoint,init),/unapproved request operation/u);
  assert.equal(sent.length,1);
  assert.equal(sent[0].init.headers.get('authorization'),caller);
});

test('confirmed counseling cancellation grants one exact caller and appointment command',async()=>{
  const token=tokenAt(time),requests=[];
  const options={origin,token,now:()=>time*1000,fetchImpl:async(url,init)=>{requests.push({url,init});return Response.json({ok:true});}};
  const payload={id:'10000000-0000-4000-8000-000000000030',request_id:'10000000-0000-4000-8000-000000000031',expected_version:3};
  const body={kind:'counseling_cancel',payload},bound={callerToken:caller.slice(7),body};
  const dispatch=createTrustedPreviewFetch({...options,confirmedCounselingCommand:bound});
  const endpoint=origin+'/api/affairs-action',init={...post,body:JSON.stringify(body)};
  for(const denied of [
    {...init,body:JSON.stringify({...body,payload:{...payload,id:'10000000-0000-4000-8000-000000000032'}})},
    {...init,body:JSON.stringify({...body,payload:{...payload,expected_version:2}})},
    {...init,headers:{...init.headers,Authorization:'Bearer another.caller.signature'}},
  ])await assert.rejects(dispatch(endpoint,denied),/unapproved request operation/u);
  await assert.rejects(dispatch('https://stu.best/api/affairs-action',init),/outside the approved run/u);
  await assert.rejects(dispatch(origin+'/api/affairs-assistant',init),/unapproved request operation/u);
  await assert.rejects(createTrustedPreviewFetch(options)(endpoint,init),/unapproved request operation/u);
  assert.throws(()=>createTrustedPreviewFetch({...options,confirmedCounselingCommand:{...bound,body:{...body,kind:'counseling_request'}}}),
    /invalid counseling cancellation fixture/u);
  assert.throws(()=>createTrustedPreviewFetch({...options,confirmedCounselingCommand:bound,
    confirmedClubCommand:{...bound,body:{...body,kind:'cancel_club_equipment'}}}),/invalid confirmed action fixture/u);
  await dispatch(endpoint,init);
  await assert.rejects(dispatch(endpoint,init),/unapproved request operation/u);
  assert.equal(requests.length,1);
  assert.equal(requests[0].init.headers.get('authorization'),caller);
  assert.equal(requests[0].init.headers.get(trusted),token);
});

test('CLI enables OIDC only on the approved exact project Preview',()=>{
  assert.equal(options(argv).previewAuth,'oidc');
  for(const rejected of [argv.map(value=>value==='live'?'inventory':value),argv.map(value=>value===origin?'https://stu.best':value),
    argv.map(value=>value===origin?'https://other.vercel.app':value),argv.filter((_,index)=>index!==4&&index!==5),argv.map(value=>value==='oidc'?'cookie':value)])
    assert.throws(()=>options(rejected),/approved exact project Preview|approved Preview origin/u);
});

test('transcript mode permits only the runner’s selected saved conversation',async()=>{
  const conversationId='019acdef-1212-7010-8010-123456789012',otherId='019acdef-1212-7010-8010-123456789013',sent=[];
  const fetch=createTrustedPreviewFetch({origin,token:tokenAt(time),conversationId,now:()=>time*1000,
    fetchImpl:async(url,init)=>{sent.push([url.href,init.method]);return Response.json({});}});
  const endpoint=origin+'/api/affairs-conversations';
  const get={headers:{Authorization:caller}};
  const save=id=>({...post,body:JSON.stringify({id,title:'Reported school assistant transcript',version:0,messages:[]})});
  await fetch(endpoint+'?id='+conversationId,get);
  await fetch(endpoint,save(conversationId));
  assert.deepEqual(sent,[[endpoint+'?id='+conversationId,'GET'],[endpoint,'POST']]);
  for(const [url,init] of [[endpoint,get],[endpoint+'?id='+otherId,get],[endpoint,save(otherId)],
    [endpoint,{...save(conversationId),method:'DELETE'}],[endpoint+'?id='+conversationId,{}],
    [origin+'/api/affairs-data?scope=student-conduct',get],[origin+'/api/research-assistant',post]])
    await assert.rejects(fetch(url,init),/unapproved request operation/u);
  assert.equal(sent.length,2);
});

test('deletion probe admits only the two fixed UUIDv7 payloads and exact authenticated conversation requests',async()=>{
  const endpoint=origin+'/api/affairs-conversations';
  const [saved,pending]=['019acdef-1212-7010-8010-123456789012','019acdef-1212-7010-8010-123456789013'];
  const fixtures=Object.values(conversationDeleteProbeTitles).map((title,index)=>({
    id:[saved,pending][index],title,version:0,messages:[{role:'user',content:'one'},{role:'assistant',content:'two'}],
  }));
  const sent=[];
  const base={origin,token:tokenAt(time),now:()=>time*1000,fetchImpl:async(url,init)=>{
    sent.push([url.href,init.method,init.headers.get('authorization')]);return Response.json({});
  }};
  for(const conversationDeleteFixtures of [[fixtures[0]],fixtures.map(row=>({...row,id:saved})),fixtures.map(row=>({...row,version:1})),
    fixtures.map(row=>({...row,id:row.id.replace('-7010-','-4010-')}))])
    assert.throws(()=>createTrustedPreviewFetch({...base,conversationDeleteFixtures}),/invalid conversation deletion probe/u);
  assert.throws(()=>createTrustedPreviewFetch({...base,conversationId:saved,conversationDeleteFixtures:fixtures}),/invalid conversation deletion probe/u);
  const relay=createTrustedPreviewFetch({...base,conversationDeleteFixtures:fixtures});
  const get={headers:{Authorization:caller}},remove={...get,method:'DELETE'};
  const save={...post,body:JSON.stringify(fixtures[0])};
  await relay(origin+'/release.json');
  await relay(endpoint,save);
  await relay(endpoint+'?id='+saved,get);
  await relay(endpoint+'?id='+pending,remove);
  for(const [url,init] of [
    [endpoint+'?id='+saved,{}],[endpoint+'?id='+saved+'&extra=1',remove],[endpoint,remove],
    [endpoint+'?id=019acdef-1212-7010-8010-123456789014',remove],
    [endpoint+'?id='+saved,{...remove,body:''}],[endpoint+'?id='+saved,{...remove,headers:{...get.headers,'Content-Type':'application/json'}}],
    [endpoint,{...save,body:JSON.stringify({...fixtures[0],version:1})}],[endpoint,get],
    [origin+'/api/affairs-data',get],[origin+'/api/affairs-assistant',post],[origin+'/api/research-assistant',post],
  ])await assert.rejects(relay(url,init),/unapproved request operation/u);
  assert.deepEqual(sent,[[origin+'/release.json','GET',null],[endpoint,'POST',caller],[endpoint+'?id='+saved,'GET',caller],[endpoint+'?id='+pending,'DELETE',caller]]);
});

test('the runner pins before fixtures and keeps their readbacks on the same approved transport',async()=>{
  const token=tokenAt(Math.floor(Date.now()/1000)),previousToken=process.env.VERCEL_OIDC_TOKEN,previousExit=process.exitCode;
  const revision='a'.repeat(40),digest='b'.repeat(64),calls=[];
  let readback;
  const row={id:'scope:owned',domain:'profile',fixtureKey:'owned',route:'/school-affairs',question:'Which role does my record show?',mode:'record',
    expected:{behavior:'answer',requiredText:['student'],requiredTools:[],noAction:true}};
  const adapter={protectedPreviewReadbackVersion:1,async prepare(binding){
    calls.push('prepare');readback=binding.previewReadbackFetch;
    assert.equal(typeof readback,'function');
    await assert.rejects(readback(origin+'/api/affairs-assistant',post),/read-only/u);
  },async forCase(){
    await readback(origin+'/api/affairs-data?scope=student-conduct',{headers:{Authorization:caller}});
    return {token:caller.slice(7)};
  },async cleanup(){calls.push('cleanup');return {verified:true};}};
  const inputs={sourceIdentity:async()=>({dirty:false,sourceRevision:revision,workingTreeHash:digest}),
    evaluationSuite:async()=>({cases:[row],inventory:{hash:digest,services:['owned'],tools:['profile'],publicPages:[],routeFamilies:[]},suiteHash:digest}),
    loadFixtureAdapter:async()=>adapter,saveReport:async()=>{},log(){},
    pace:async(start,_signal,beforeStart)=>{await beforeStart();return start(0);},
    fetchImpl:async(url,init)=>{
      assert.equal(init.headers.get(trusted),token);calls.push(url.pathname);
      if(url.pathname==='/release.json')return Response.json({version:1,revision,source:'vercel-git',environment:'preview',builtAt:'2026-11-15T01:00:00.000Z'});
      assert.equal(init.headers.get('authorization'),caller);
      return Response.json(url.pathname==='/api/affairs-data'?{}:{answer:'Your saved role is student.',status:'answered',citations:[],activity:[]});
    }};
  try{
    process.env.VERCEL_OIDC_TOKEN=token;
    const report=await main([...argv,'--fixture-module','tests/evaluation/live-fixtures.mjs'],inputs);
    assert.equal(report.results.length,1);
    assert.equal(report.results[0].response.executed,true);
    assert.equal(report.previewAccess,'vercel-development-oidc');
    assert.equal(JSON.stringify(report).includes(token),false);
    assert.deepEqual(calls,['/release.json','prepare','/release.json','/api/affairs-data','/release.json','/api/affairs-assistant','/release.json','cleanup','/release.json']);
    calls.length=0;
    await assert.rejects(main([...argv,'--fixture-module','tests/evaluation/live-fixtures.mjs'],{...inputs,
      fetchImpl:async()=>new Response(null,{status:302})}),/Pinned deployment check failed/u);
    assert.deepEqual(calls,[]);
  }finally{
    if(previousToken===undefined)delete process.env.VERCEL_OIDC_TOKEN;
    else process.env.VERCEL_OIDC_TOKEN=previousToken;
    process.exitCode=previousExit;
  }
});
