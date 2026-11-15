import assert from 'node:assert/strict';
import test from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {isStudentConductCountQuestion,studentConductScope} from '../../server/studentConductEvidenceScope.js';
import {readStudentConductEvidence} from '../../server/accountStudentConductEvidence.js';
import {gradeCase} from './grading.mjs';

const db='https://xiftudmvxphxcjtmfmib.supabase.co',route='/school-affairs/services/38-1',source='account:studentConduct';
const ownerA='38000000-0000-4000-8000-000000000001',ownerB='38000000-0000-4000-8000-000000000002';
const record='38000000-0000-4000-8000-000000000003';
const fixtures={A:{id:ownerA,token:'qa-caller-a'},B:{id:ownerB,token:'qa-caller-b'}};
const question='How many student conduct records do I have?';
const configuredKey='synthetic-controlled-count';
const privateMarkers=[ownerA,ownerB,record,'qa-caller-a','qa-caller-b',configuredKey];
const savedCount=(count,owner=ownerA)=>Response.json(count?[{id:record,user_id:owner}]:[],{
  status:count>1?206:200,headers:{'Content-Range':count?'0-0/'+count:'*/0'},
});
async function send(handler,text,{role='A',page=route,history=[]}={}){
  const state={statusCode:200,body:null},token=fixtures[role]?.token;
  const response={setHeader(){},status(code){state.statusCode=code;return this;},json(body){state.body=body;}};
  await handler({method:'POST',headers:token?{authorization:'Bearer '+token}: {},body:{question:text,route:page,history}},response);
  return state;
}

function demandCount(id,state,value,label='Saved conduct record count'){
  const testCase={id,domain:'studentConduct',mode:'record',expected:{behavior:'answer',
    facts:[{label,kind:'number',values:[value],exclusive:true}],requiredTools:['studentConduct'],
    allowedTools:['studentConduct'],requiredAttemptedTools:['studentConduct'],maxDistinctAttemptedTools:1,
    requireToolExecution:true,requiredLinks:[route],requiredSourceBindings:[{sourceId:source,url:route}],
    verification:'verified',noAction:true,forbidPublicResearch:true,localLinksOnly:true}};
  const {body}=state;
  const grade=gradeCase(testCase,{...state,events:body.activity,execution:'deterministic'});
  assert.deepEqual(grade.failures.map(result=>result.id),[],id);
  assert.deepEqual(body.citations.map(({chunkId,url})=>[chunkId,url]),[[source,route]]);
  assert.deepEqual(body.views,[]);
  assert.equal(body.grounding.webSearched,false);
  assert.ok(body.activity.some(row=>row.kind==='student-conduct-count-check'&&row.status==='complete'));
  assert.ok(privateMarkers.every(marker=>!JSON.stringify(body).includes(marker)));
}

test('the actual signed-in handler verifies all saved report counts with one exact minimal read, using each caller and the selected language',async t=>{
  const originalKey=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='deliberately-present-model-key-unused';
  t.after(()=>{if(originalKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalKey;});
  const requests=[],calls=[],outbound=[];
  const ask=createAffairsAssistantHandler({
    verifyToken:async token=>{
      const user=Object.values(fixtures).find(value=>value.token===token);
      if(!user)throw new Error('Synthetic caller only.');
      return {url:db,key:configuredKey,token,user:{id:user.id}};
    },
    loadSnapshot:async()=>{calls.push('workspace');assert.fail('No broad snapshot');},
    publicResearch:async()=>{calls.push('public');assert.fail('No public research');},
  });
  let delivery=owner=>savedCount(owner===ownerA?523:0,owner);
  t.mock.method(globalThis,'fetch',async(target,init)=>{
    const url=new URL(target);
    if(url.origin!==db||url.pathname!=='/rest/v1/affairs_student_conduct'){
      outbound.push(url.origin);assert.fail('Only the bound native count read is permitted.');
    }
    const headers=new Headers(init.headers),token=headers.get('authorization')?.slice(7);
    const owner=Object.values(fixtures).find(value=>value.token===token)?.id;
    assert.ok(owner);
    assert.equal(init.method,'GET');assert.equal(init.redirect,'error');
    assert.equal(headers.get('prefer'),'count=exact');assert.equal(headers.get('apikey'),configuredKey);
    assert.deepEqual(Object.fromEntries(url.searchParams),{select:'id,user_id',order:'id.asc',limit:'1',deleted_at:'is.null',user_id:'eq.'+owner});
    requests.push({owner,url:url.href});
    return delivery(owner);
  });

  const a=await send(ask,question,{page:'/'});
  demandCount('student-conduct:count-owner-a',a,523);assert.equal(a.body.verification.attempts,1);
  const b=await send(ask,'What is the total number of my saved conduct records?',{role:'B'});
  demandCount('student-conduct:count-owner-b-empty',b,0);assert.equal(b.body.verification.attempts,1);
  delivery=owner=>savedCount(7,owner);
  const zh=await send(ask,'我有幾筆學生個人獎懲紀錄？');
  demandCount('student-conduct:count-zh',zh,7,'已儲存獎懲紀錄筆數');
  const page=await send(ask,'How many saved rows do I have?');
  demandCount('student-conduct:count-context',page,7);
  const explicit=await send(ask,'Count student conduct rows.',{page:'/'});
  demandCount('student-conduct:count-explicit-directive',explicit,7);

  let attempt=0;
  delivery=owner=>++attempt===1?Response.json([],{headers:{'Content-Range':'*/3'}}):savedCount(4,owner);
  const recovery=await send(ask,question);
  demandCount('student-conduct:count-rescoped-retry',recovery,4);assert.equal(recovery.body.verification.attempts,2);
  assert.deepEqual(requests.slice(-2).map(row=>row.url),[requests[0].url,requests[0].url]);

  for(const broken of [
    ()=>savedCount(3,ownerB),
    ()=>savedCount(1001),
    ()=>Response.json([{id:record,user_id:ownerA,reason_text:'Forbidden field'}],{headers:{'Content-Range':'0-0/1'}}),
    ()=>Response.json([],{headers:{'Content-Range':'0-0/0'}}),
    ()=>Response.json([],{status:503}),
  ]){
    delivery=broken;
    const failed=await send(ask,question);
    assert.equal(failed.body.verification.status,'unverified');
    assert.equal(failed.body.verification.attempts,2);
    assert.doesNotMatch(failed.body.answer,/record count\s*:|no saved|zero saved|no matching record/iu);
    assert.ok(failed.body.activity.filter(step=>step.kind.startsWith('account-read:')).every(step=>step.status==='unavailable'));
    assert.ok(privateMarkers.every(marker=>!JSON.stringify(failed.body).includes(marker)));
  }
  const before=requests.length;
  const other=await send(ask,'How many conduct records does Alice have?');
  assert.equal(other.body.status,'handoff');assert.deepEqual(other.body.citations,[]);
  const guest=await send(createResearchAssistantHandler(),question,{role:'guest'});
  assert.equal(guest.body.status,'handoff');
  assert.equal(guest.body.citations[0].url,'/school-affairs/login?next='+encodeURIComponent(route));
  assert.equal(requests.length,before);
  assert.deepEqual(calls,[]);assert.deepEqual(outbound,[]);
});

test('frequency, current term, a specific date, void status, and other scopes never bind to the all-record count',async()=>{
  for(const prompt of [
    'How many student conduct records do I have this semester?',
    'How many of my voided conduct records are saved?',
    'How many student conduct records do I have in 2025?',
    'How many merits did I get?',
    'Show my conduct quantity and reason.',
    'How many dormitory conduct records are present?',
    '我這學期有幾筆學生個人獎懲紀錄？',
    '王小明的學生獎懲紀錄有幾筆？',
  ])assert.equal(isStudentConductCountQuestion(prompt),false,prompt);
  assert.equal(studentConductScope('How many saved rows do I have?','/').selected,false);
  const exact=await readStudentConductEvidence({user:{id:ownerA},key:configuredKey,token:fixtures.A.token,url:db},
    {question,route},{load:()=>assert.fail('Count must not fetch conduct cells.'),loadCount:async()=>({count:19})});
  assert.deepEqual(JSON.parse(exact.evidence.content).records,[]);
  assert.deepEqual(JSON.parse(exact.evidence.content).counts,{available:19,matching:19,included:0,omitted:0});
});
