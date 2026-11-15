import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {AffairsWorkspaceError} from '../../server/affairsWorkspace.js';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {isElearningMetadataQuestion,selectElearningMetadata,elearningMetadataGuestRoute} from '../../server/elearningMetadataIntent.js';
import {gradeElearningCatalogCase,elearningCatalogRunnerCases,assertElearningCatalogCaseReady} from './elearning-catalog-runner.mjs';

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
const categories=[...categoryRows.values()].sort((left,right)=>left.position-right.position);
const notices=[...extract(base,'elearning_notices').matchAll(/\((\d+),'\w+','((?:[^']|'')*)',(null|'(?:[^']|'')*'),\d+\)/gu)]
  .map(([,id,title,body])=>({id:Number(id),title:title.replace(/''/gu,"'"),body:body==='null'?null:body.slice(1,-1).replace(/''/gu,"'")}));
function source([view,id]){
  const scoped=categories.filter(row=>{
    if(view==='category_title')return row.id===id;
    let selected=row;
    while(selected&&view==='category'&&selected.id!==id)selected=categoryRows.get(selected.parentId);
    return view!=='notice'&&Boolean(selected);
  }).map(({position,...row})=>row);
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
    assert.throws(()=>assertElearningCatalogCaseReady(row),/await hosted verification/u);
    const rpc=transport(context,row.metadataOracle);
    const reply=await invoke(handler,row.question,row.route);
    const result=gradeElearningCatalogCase(row,{...reply,execution:'deterministic',fixtureKey:row.fixtureKey});
    assert.ok(result.passed,JSON.stringify(result.failures));
    assert.equal(reply.body.verification.attempts,1);
    assert.equal(rpc.mock.callCount(),1);
    assert.equal(JSON.stringify(reply).includes(token),false);
  });
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
