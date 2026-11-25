import assert from 'node:assert/strict';
import {test} from 'node:test';
import {gradeCase} from './grading.mjs';
const c={id:'test.relevance',domain:'courses',mode:'record',expected:{behavior:'answer',facts:[{label:'course',kind:'text',values:['QA Course']}],requiredTools:['courses'],requireToolExecution:true,requiredAttemptedTools:['courses'],allowedTools:['courses'],maxDistinctAttemptedTools:1,toolTerminalStates:{courses:['complete']},forbidPublicResearch:true}};
const envelope=()=>({statusCode:200,execution:'recorded',events:[{kind:'account-read:courses:1',status:'running'},{kind:'account-read:courses:1',status:'complete'}],body:{status:'answered',answer:'Your course is QA Course.',verification:{status:'verified',attempts:1},citations:[{chunkId:'account:courses',url:'/school-affairs/records'}]}});
const fail=(r,id)=>assert.ok(r.failures.some(row=>row.id===id),JSON.stringify(r.failures));
test('attempts, completions and citations remain separate sets',()=>{
 const e=envelope(),r=gradeCase(c,e);assert.equal(r.passed,true);assert.deepEqual(r.toolEvidence,{attempted:['courses'],observed:['courses'],claimed:['courses'],terminalStates:{courses:['complete']}});
 e.events=[];const cited=gradeCase(c,e);fail(cited,'tool.courses');fail(cited,'tool.attempted.courses');fail(cited,'tool.terminal.courses');
});
test('an unnecessary failed read is counted even when the final answer only cites relevant evidence',()=>{
 const e=envelope();e.events.unshift({kind:'account-read:housing:1',status:'unavailable'});const r=gradeCase(c,e);fail(r,'tools.allowed.attempted');fail(r,'tools.attempted.limit');assert.ok(r.toolEvidence.attempted.includes('housing'));assert.ok(!r.toolEvidence.observed.includes('housing'));
});
test('retry does not double-count a relevant tool but preserves inconsistent terminal outcomes',()=>{
 const e=envelope();e.events.push({kind:'account-read:courses:2',status:'complete'});assert.equal(gradeCase(c,e).passed,true);
 e.events.unshift({kind:'account-read:courses:1',status:'unavailable'});fail(gradeCase(c,e),'tool.terminal.courses');
 const flexible={...c,expected:{...c.expected,toolTerminalStates:{courses:['complete','unavailable']}}};assert.equal(gradeCase(flexible,e).passed,true);
});
test('planner selections and unknown or malformed read telemetry cannot fabricate completion',()=>{
 const e=envelope();e.events=[{kind:'account-tools',tools:['courses'],status:'complete'}];fail(gradeCase(c,e),'tool.courses');fail(gradeCase(c,e),'tool.attempted.courses');
 for(const event of [{kind:'account-read:courses:3',status:'complete'},{kind:'account-read:allPrivateRecords:1',status:'complete'},{kind:'account-read:courses:1',status:'apparently_ok'}]){e.events=[event];fail(gradeCase(c,e),'tools.telemetry');}
});
test('unavailable terminal state is not equivalent to completed or pending',()=>{
 const item={...c,expected:{...c.expected,requiredTools:[],toolTerminalStates:{courses:['unavailable']}}};const e=envelope();e.events=[{kind:'account-read:courses:1',status:'unavailable'}];assert.equal(gradeCase(item,e).passed,true);assert.deepEqual(gradeCase(item,e).toolEvidence.observed,[]);
 for(const status of ['running','complete','error']){e.events[0].status=status;fail(gradeCase(item,e),'tool.terminal.courses');}
});
test('public research is forbidden at attempt time including failed searches and retained activity',()=>{
 for(const kind of ['public','public-campus','web-wifi','knowledge','page-context']){const e=envelope();e.events.push({kind,status:'unavailable'});fail(gradeCase(c,e),'tools.public.none');}
 const e=envelope();e.body.activity=[{kind:'web-history',status:'running'}];fail(gradeCase(c,e),'tools.public.none');
});
test('forbidden cited collection and missing telemetry fail even if prose has all facts',()=>{
 const e=envelope();e.body.citations.push({chunkId:'account:charges',url:'/school-affairs/records'});fail(gradeCase(c,e),'tools.allowed.cited');delete e.events;fail(gradeCase(c,e),'tools.telemetry');
});
test('malformed relevance policies fail closed without silently allowing extra tools',()=>{
 for(const patch of [{allowedTools:['courses','courses']},{allowedTools:['unknown']},{maxDistinctAttemptedTools:-1},{requiredAttemptedTools:['unknown']},{toolTerminalStates:{courses:[]}},{toolTerminalStates:{courses:['success']}}])assert.equal(gradeCase({...c,expected:{...c.expected,...patch}},envelope()).passed,false);
});
test('current conduct, loan and aid readers can satisfy exact relevance oracles',()=>{
 for(const name of ['studentConduct','studentLoan','aidPayments']){
  const item={...c,expected:{...c.expected,requiredTools:[name],requiredAttemptedTools:[name],allowedTools:[name],toolTerminalStates:{[name]:['complete']}}};
  const e=envelope();e.events=[{kind:'account-read:'+name+':1',status:'complete'}];e.body.citations[0].chunkId='account:'+name;
  const result=gradeCase(item,e);
  assert.equal(result.passed,true,JSON.stringify(result.failures));
 }
});
