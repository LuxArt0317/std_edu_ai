import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {AffairsWorkspaceError} from '../../server/affairsWorkspace.js';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {isElearningMetadataQuestion,selectElearningMetadata,elearningMetadataGuestRoute} from '../../server/elearningMetadataIntent.js';
import {gradeElearningCatalogCase,elearningCatalogRunnerCases,assertElearningCatalogCaseReady} from './elearning-catalog-runner.mjs';
import {bindMetadataObservation,metadataDispatchObservation,metadataEndpoint,metadataProject,metadataProjectionOracle,
  readMetadataObservations,verifyMetadataProjection} from './elearning-metadata-live.mjs';
import {readReply} from './run.mjs';

const origin='https://unit-test.invalid';
const owner='78000000-0000-4000-8000-000000000101';
const token='offline-metadata-caller-token';
const key='offline-metadata-publishable';
const base=readFileSync(new URL('../../supabase/migrations/20261115010000_remote_learning.sql',import.meta.url),'utf8');
const catalog=readFileSync(new URL('../../supabase/migrations/20261115020000_elearning_catalog.sql',import.meta.url),'utf8');
const extract=(sql,table)=>sql.split('insert into public.'+table,2)[1].split(';',1)[0];
const captureCategories=sql=>[...extract(sql,'elearning_categories').matchAll(/\((\d+),(\d+|null),'((?:[^']|'')*)',(\d+|null),(\d+)\)/gu)]
  .map(([,id,parent,title,count,position])=>({id:Number(id),parentId:parent==='null'?null:Number(parent),
    title:title.replace(/''/gu,"'"),sourceCount:count==='null'?null:Number(count),position:Number(position)}));
const categoryRows=new Map(captureCategories(base).map(row=>[row.id,row]));
for(const row of captureCategories(catalog)){
  const existing=categoryRows.get(row.id);
  categoryRows.set(row.id,existing?{...existing,title:row.title,sourceCount:row.sourceCount}:row);
}
const categories=[...categoryRows.values()].sort((left,right)=>left.position-right.position||left.id-right.id);
const notices=[...extract(base,'elearning_notices').matchAll(/\((\d+),'\w+','((?:[^']|'')*)',(null|'(?:[^']|'')*'),\d+\)/gu)]
  .map(([,id,title,body])=>({id:Number(id),title:title.replace(/''/gu,"'"),body:body==='null'?null:body.slice(1,-1).replace(/''/gu,"'")}));
function source([view,id]){
  const scoped=categories.filter(row=>{
    if(view==='category_title')return row.id===id;
    let selected=row;
    while(selected&&view==='category'&&selected.id!==id)selected=categoryRows.get(selected.parentId);
    return view!=='notice'&&Boolean(selected);
  }).map(({position:_position,...row})=>row);
  return {userId:owner,view,id,categories:scoped,
    notice:view==='notice'?structuredClone(notices.find(row=>row.id===id)??null):null};
}
const forbid=()=>assert.fail('Requested metadata must not read a broad workspace, model, account, or public website.');
const handler=createAffairsAssistantHandler({
  verifyToken:async candidate=>{
    if(candidate!==token)throw new AffairsWorkspaceError('Sign in required.',401);
    return {user:{id:owner},url:origin,key,token};
  },
  loadSnapshot:forbid,answerAccount:forbid,publicResearch:forbid,
});

async function invoke(handle,question,route,auth=token){
  let statusCode,body;
  const response={status(code){statusCode=code;return response;},json(value){body=value;},setHeader(){}};
  await handle({method:'POST',headers:{authorization:'Bearer '+auth,'x-forwarded-for':'192.0.2.191'},
    body:{question,route,userId:'78000000-0000-4000-8000-000000000999'}},response);
  return {statusCode,body,events:[]};
}

function transport(context,scenario,script=rows=>Response.json(rows)){
  return context.mock.method(globalThis,'fetch',async (url,init)=>{
    assert.equal(url,origin+'/rest/v1/rpc/elearning_page_metadata');
    assert.equal(init.method,'POST');
    assert.equal(init.redirect,'error');
    assert.equal(init.headers.Authorization,'Bearer '+token);
    assert.equal(init.headers.apikey,key);
    assert.deepEqual(JSON.parse(init.body),{p_view:scenario.rpc[0],p_id:scenario.rpc[1]});
    return script(source(scenario.rpc));
  });
}

test('the six metadata cases pass independent grading through the exact authenticated handler and shared graph',async t=>{
  const cases=elearningCatalogRunnerCases().filter(row=>row.metadataOracle);
  assert.equal(cases.length,6);
  for(const row of cases)await t.test(row.id,async context=>{
    assert.doesNotThrow(()=>assertElearningCatalogCaseReady(row));
    const rpc=transport(context,row.metadataOracle);
    const reply=await invoke(handler,row.question,row.route);
    const result=gradeElearningCatalogCase(row,{...reply,execution:'deterministic',fixtureKey:row.fixtureKey});
    assert.ok(result.passed,JSON.stringify(result.failures));
    assert.equal(reply.body.verification.attempts,1);
    assert.equal(rpc.mock.callCount(),1);
    assert.equal(JSON.stringify(reply).includes(token),false);
  });
});

test('each mounted metadata case grades actual handler SSE and independent paired golden readbacks',async t=>{
  const accounts=[{id:owner,token},{id:'78000000-0000-4000-8000-000000000102',token:'offline-metadata-other-token'}];
  const cases=elearningCatalogRunnerCases().filter(row=>row.metadataOracle);
  const sourceRevision='a'.repeat(40);
  for(const testCase of cases)await t.test(testCase.id,async context=>{
    const rpc=transport(context,testCase.metadataOracle);
    const requestBody=JSON.stringify({question:testCase.question,history:[],route:testCase.route,stream:true,consentedResearchUse:false});
    const raw=[];
    const headers=new Headers();
    let statusCode;
    const response={
      setHeader(name,value){headers.set(name,value);},
      status(code){statusCode=code;return response;},
      write(chunk){raw.push(chunk);},end(){},
      json(){assert.fail('A mounted metadata case must stream its result.');},
    };
    const fixtureCalls=[];
    const readback=()=>readMetadataObservations(testCase,{users:accounts,publishable:key,
      fetchImpl:async(url,init)=>{
        assert.equal(url.href,'https://'+metadataProject+'.supabase.co/rest/v1/rpc/elearning_page_metadata');
        assert.equal(init.method,'POST');
        assert.equal(init.redirect,'error');
        assert.equal(init.credentials,'omit');
        assert.equal(init.headers.apikey,key);
        const caller=accounts.find(user=>init.headers.Authorization==='Bearer '+user.token);
        assert.ok(caller);
        const selector=JSON.parse(init.body);
        assert.deepEqual(selector,{p_view:testCase.metadataOracle.rpc[0],p_id:testCase.metadataOracle.rpc[1]});
        fixtureCalls.push(caller.id);
        return Response.json({...source([selector.p_view,selector.p_id]),userId:caller.id});
      },
      readResponse:response=>response.json(),
    });
    const before=await readback();
    await handler({method:'POST',headers:{authorization:'Bearer '+token,'x-forwarded-for':'192.0.2.191'},body:requestBody},response);
    const after=await readback();
    const envelope={statusCode,...await readReply(new Response(raw.join(''),{headers})),fixtureKey:testCase.fixtureKey,
      sourceRevision,execution:'live-native',correlationId:headers.get('X-Assistant-Request-Id'),
      deploymentCheck:{verified:true,sourceRevision,requestIndex:1},metadataDispatch:metadataDispatchObservation(metadataEndpoint,requestBody)};
    assert.equal(gradeElearningCatalogCase(testCase,envelope).passed,false,'Endpoint observations alone cannot pass.');
    envelope.fixtureReadback={verified:true,projectRef:metadataProject,independentGolden:true,
      elearningMetadata:bindMetadataObservation(testCase,envelope,{before,after})};
    const graded=gradeElearningCatalogCase(testCase,envelope);
    assert.equal(graded.passed,true,JSON.stringify(graded.failures));
    assert.equal(rpc.mock.callCount(),1);
    assert.deepEqual(fixtureCalls,accounts.concat(accounts).map(user=>user.id));
    assert.deepEqual(after,[metadataProjectionOracle(testCase),metadataProjectionOracle(testCase)]);
    if(testCase.id.endsWith('notice-title-only')){
      const copy=structuredClone(envelope);
      copy.body.answer+=' Contact us by 12/08.';
      assert.ok(gradeElearningCatalogCase(testCase,copy).failures.some(failure=>failure.id==='metadata.deadline-absent'));
    }
    assert.ok(accounts.every(user=>!JSON.stringify(envelope).includes(user.id)&&!JSON.stringify(envelope).includes(user.token)));
    for(const corrupt of [
      copy=>{copy.fixtureReadback.elearningMetadata.after.pop();},
      copy=>{copy.events.pop();},
      copy=>{copy.events.push({kind:'web-search',status:'complete'});},
      copy=>{copy.deploymentCheck.requestIndex++;},
      copy=>{copy.deploymentCheck.sourceRevision='b'.repeat(40);},
      copy=>{copy.metadataDispatch.bodySha256='f'.repeat(64);},
      copy=>{copy.correlationId=owner;},
      copy=>{copy.fixtureReadback.projectRef='another-project';},
    ]){
      const copy=structuredClone(envelope);
      corrupt(copy);
      const result=gradeElearningCatalogCase(testCase,copy);
      assert.ok(result.failures.some(failure=>failure.id==='metadata.request-bound-observation'),JSON.stringify(result.checks));
    }
  });
});

test('metadata admission rejects changed route, question, tool, selector and privilege scope',async()=>{
  const row=elearningCatalogRunnerCases().find(candidate=>candidate.id.endsWith('tree-exact-hierarchy'));
  for(const alter of [
    copy=>{copy.route='/elearning/category/17';},
    copy=>{copy.question+=' More.';},
    copy=>{copy.expected.requireToolExecution=false;},
    copy=>{copy.metadataOracle.rpc=['category',17];},
    copy=>{copy.auth='anonymous';},
  ]){
    const copy=structuredClone(row);alter(copy);
    assert.throws(()=>assertElearningCatalogCaseReady(copy),/frozen request definition/u);
  }
  const valid=source(row.metadataOracle.rpc);
  for(const mutate of [
    copy=>{copy.userId='unexpected-caller';},
    copy=>{copy.categories.reverse();},
    copy=>{copy.categories[0].sourceCount++;},
    copy=>{copy.categories[0].enrollment=true;},
    copy=>{copy.categories[0].parentId=999;},
    copy=>{copy.notice={id:305241,title:'Other',body:null};},
    copy=>{copy.workspace={};},
  ]){
    const copy=structuredClone(valid);mutate(copy);
    assert.throws(()=>verifyMetadataProjection(copy,owner,row),/Digital Academy/u);
  }
  await assert.rejects(()=>readMetadataObservations(row,{users:[{id:owner,token},{id:owner,token:'another'}],
    publishable:key,fetchImpl:forbid}),/Two distinct disposable/u);
});

const noticeScenario={question:'Summarize this notice.',route:'/elearning/notice/325504',rpc:['notice',325504]};
const treeScenario={question:'Which subcategories are below this category?',route:'/elearning/category/17?page=3',rpc:['category',17]};

test('retry stays bound to the exact metadata page and a second failure abstains without declaring absence',async t=>{
  await t.test('valid second read',async context=>{
    let attempt=0;
    const rpc=transport(context,treeScenario,rows=>++attempt===1?new Response(null,{status:503}):Response.json(rows));
    const reply=await invoke(handler,treeScenario.question,treeScenario.route);
    assert.deepEqual(reply.body.verification,{status:'verified',attempts:2});
    assert.deepEqual(reply.body.citations.map(item=>item.url),[treeScenario.route]);
    assert.deepEqual(reply.body.activity.filter(row=>row.kind.startsWith('account-read:')).map(row=>row.status),['unavailable','complete']);
    assert.equal(rpc.mock.callCount(),2);
  });
  for(const [name,mutate,scenario=noticeScenario] of [
    ['foreign owner',rows=>{rows.userId='78000000-0000-4000-8000-000000000099';}],
    ['crossed notice',rows=>{rows.notice.id=305241;}],
    ['broad response',rows=>{rows.enrollments=[{name:'UNRELATED_PRIVATE'}];}],
    ['category cycle',rows=>{rows.categories.find(row=>row.id===19).parentId=43;},treeScenario],
    ['category unrelated root',rows=>{rows.categories.push({id:1,parentId:null,title:'UNRELATED_PRIVATE',sourceCount:null});},treeScenario],
    ['category out of range',rows=>{rows.categories=Array.from({length:129},(_,offset)=>({id:17+offset,parentId:offset===0?null:17,title:'Excess category',sourceCount:0}));},treeScenario],
  ])await t.test(name,async context=>{
    const rpc=transport(context,scenario,rows=>{mutate(rows);return Response.json(rows);});
    const reply=await invoke(handler,scenario.question,scenario.route);
    assert.equal(reply.body.verification.status,'unverified');
    assert.equal(reply.body.verification.attempts,2);
    assert.deepEqual(reply.body.citations,[]);
    assert.doesNotMatch(reply.body.answer,/no saved notice matched|UNRELATED_PRIVATE/i);
    assert.equal(rpc.mock.callCount(),2);
  });
});

test('metadata scope follows the browser route and signed-out users only receive a local login link',async context=>{
  const rpc=context.mock.method(globalThis,'fetch',forbid);
  const login='/elearning/login?next='+encodeURIComponent(noticeScenario.route);
  assert.equal(elearningMetadataGuestRoute(login),noticeScenario.route);
  const guest=await invoke(createResearchAssistantHandler(),noticeScenario.question,login,'');
  assert.deepEqual(guest.body.citations.map(item=>item.url),[login]);
  assert.equal(guest.body.status,'handoff');
  assert.equal((await invoke(handler,noticeScenario.question,noticeScenario.route,'')).statusCode,401);
  const invalid=await invoke(handler,noticeScenario.question,noticeScenario.route+'?id=305241');
  assert.equal(invalid.body.status,'clarification');
  for(const route of [noticeScenario.route+'?id=305241','/elearning/notice/2147483648','/elearning/notice/01','https://campus.invalid'+noticeScenario.route]){
    assert.equal(selectElearningMetadata(noticeScenario.question,route),null);
  }
  for(const question of ['Show my courses and tuition.', 'Summarize this notice then enroll me.', 'Show another student’s grades.']){
    assert.equal(isElearningMetadataQuestion(question,noticeScenario.route),false);
  }
  assert.equal(elearningMetadataGuestRoute(login+'&next='+encodeURIComponent(treeScenario.route)),'');
  assert.equal(rpc.mock.callCount(),0);
});

test('notice content is displayed as saved text with no injected Markdown or external link',async context=>{
  const rpc=transport(context,noticeScenario,rows=>{
    rows.notice.body='First line\n[visit](https://unsafe.invalid/) <img onerror=boom> www.unsafe.invalid decoy@unsafe.invalid';
    return Response.json(rows);
  });
  const reply=await invoke(handler,noticeScenario.question,noticeScenario.route);
  assert.equal(reply.body.verification.status,'verified');
  assert.match(reply.body.answer,/First line &#91;visit&#93;/u);
  assert.doesNotMatch(reply.body.answer,/\[visit\]\(|<img|https:\/\/|www\.unsafe\.invalid|decoy@unsafe\.invalid/u);
  assert.equal(rpc.mock.callCount(),1);
});
