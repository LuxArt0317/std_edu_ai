import test from 'node:test';import assert from 'node:assert/strict';
import {answerWithApplicationApis,applicationRecordLinks} from '../../server/applicationApiAgent.js';
const account={user:{id:'10000000-0000-4000-8000-000000000001'},url:'https://example.invalid',key:'fixture-key',token:'fixture-token'};
const decision=(kind:string,fields:Record<string,unknown>={})=>({kind,operationId:'records.get',queryJson:'{}',bodyJson:'{}',searchQuery:'records',answer:'',sourceIds:[],...fields});
const result={operationId:'records.get',method:'GET',path:'/api/records',status:200,ok:true,data:{name:'A saved value'},truncated:false};
const base={account,question:'What is saved in the new service?',history:[],route:'/school-affairs',deadline:Date.now()+60000};
const deps={operations:()=>[{id:'records.get',method:'GET',path:'/api/records',description:'New records',readOnly:true,callable:true}],search:()=>[{id:'records.get'}],describe:()=>({id:'records.get',method:'GET',path:'/api/records'}),verify:async()=>({ok:true})};
test('model dynamically discovers, inspects and reads an API and answers from actual results',async()=>{
 const steps=[decision('discover'),decision('describe'),decision('read'),decision('answer',{answer:'Your saved value is A saved value.',sourceIds:['account-api:0']})];let reads=0;
 const value=await answerWithApplicationApis(base,{...deps,decide:async(_name:string,_schema:unknown,_instructions:string,input:unknown)=>{assert.doesNotMatch(JSON.stringify(input),/fixture-token|fixture-key/u);return steps.shift();},invoke:async()=>{reads++;return result;}});
 assert.equal(reads,1);assert.equal(value?.verification?.status,'verified');assert.match(value?.answer??'',/A saved value/u);assert.ok(value?.activity?.some(s=>s.kind==='api-discovery'));
});
test('failed evidence checks lead to a model-selected correction rather than approving the first draft',async()=>{
 const steps=[decision('describe'),decision('read'),decision('answer',{answer:'wrong',sourceIds:['account-api:0']}),decision('answer',{answer:'A saved value',sourceIds:['account-api:0']})];let checks=0;
 const value=await answerWithApplicationApis(base,{...deps,decide:async()=>steps.shift(),invoke:async()=>result,verify:async()=>({ok:++checks===2,feedback:['Use returned name']})});assert.equal(checks,2);assert.equal(value?.answer??'','A saved value');
});
test('mutations are prepared for review without executing a write',async()=>{
 const steps=[decision('describe',{operationId:'records.post'}),decision('propose',{operationId:'records.post',bodyJson:'{"title":"Requested"}'})];let writes=0;
 const value=await answerWithApplicationApis(base,{...deps,describe:()=>({id:'records.post'}),decide:async()=>steps.shift(),invoke:async()=>{writes++;assert.fail();},propose:async()=>({kind:'invoke_application_api',payload:{review:'Requested'}})});assert.equal(writes,0);assert.equal(value?.proposedAction.kind,'invoke_application_api');
});
test('normal public questions delegate, missing selectors clarify, and unsupported answers are not promoted',async()=>{
 assert.equal(await answerWithApplicationApis(base,{...deps,decide:async()=>decision('delegate')}),null);
 const value=await answerWithApplicationApis(base,{...deps,decide:async()=>decision('clarify',{answer:'Which term?'})});assert.equal(value?.status,'clarification');
 assert.equal(await answerWithApplicationApis(base,{...deps,maxSteps:1,decide:async()=>decision('answer',{answer:'Invented'})}),null);
});
test('API validation failure can recover through a corrected call instead of treating it as absent grades',async()=>{
 const steps=[decision('describe'),decision('read',{queryJson:'{"scope":"dtm-grade-report"}'}),decision('read',{queryJson:'{"scope":"dtm-grade-report-overview"}'}),decision('answer',{answer:'A saved value',sourceIds:['account-api:0']})];const scopes:string[]=[];
 const value=await answerWithApplicationApis(base,{...deps,decide:async()=>steps.shift(),invoke:async(_account:any,call:any)=>{scopes.push(call.query.scope);return scopes.length===1?{...result,status:400,ok:false,data:{error:'course_id required; use overview first'}}:result;}});
 assert.deepEqual(scopes,['dtm-grade-report','dtm-grade-report-overview']);assert.equal(value?.verification?.status,'verified');assert.ok(value?.activity?.some(step=>step.status==='unavailable'));
});
test('unverified tool draft yields to standard assistant instead of returning generic failure to user',async()=>{
 const steps=[decision('describe'),decision('read'),decision('answer',{answer:'Unsupported',sourceIds:['account-api:0']})];const activity:any[]=[];
 const value=await answerWithApplicationApis({...base,onProgress:step=>activity.push(step)},{...deps,maxSteps:3,decide:async()=>steps.shift(),invoke:async()=>result,verify:async()=>({ok:false})});
 assert.equal(value,null);assert.equal(activity.at(-1).kind,'api-fallback');assert.ok(activity.every(step=>!JSON.stringify(step).includes('/api/')));
});
test('completion review retrieves an alternate authorized grade scope after an empty transcript',async()=>{
 const op={id:'records.get',method:'GET',path:'/api/affairs-data',description:'Transcript and Moodle grade overview',readOnly:true,callable:true};
 const steps=[decision('describe'),decision('read',{queryJson:'{"scope":"academic-grades"}'}),decision('answer',{answer:'The transcript is empty. Open the page.',sourceIds:['account-api:0']}),decision('answer',{answer:'Moodle lists Course A: 86.',sourceIds:['account-api:1']})];const queries:string[]=[];let coverageChecks=0;
 const value=await answerWithApplicationApis({...base,question:'what are my grades?'},{...deps,unified:true,operations:()=>[op],decide:async()=>steps.shift(),invoke:async(_a:any,call:any)=>{queries.push(call.query.scope);return {...result,path:op.path,data:queries.length===1?{academicGrades:{records:[],termSummaries:[]}}:{courses:[{id:'owned-course',title:'Course A',gradeText:'86'}]}};},checkCoverage:async()=>++coverageChecks===1?{complete:false,nextSourceId:'',nextOperationId:op.id,nextQueryJson:'{"scope":"dtm-grade-report-overview"}',nextBodyJson:'{}'}:{complete:true,nextSourceId:'',nextOperationId:'',nextQueryJson:'',nextBodyJson:''},compose:async(input:any)=>input.candidate});
 assert.deepEqual(queries,['academic-grades','dtm-grade-report-overview']);assert.equal(value?.answer,'Moodle lists Course A: 86.');assert.equal(value?.verification?.status,'verified');assert.ok(value?.activity?.some(step=>step.kind==='source-coverage'));
});
test('completion recovery cannot execute write operations or repeat the same read under reordered query keys',async()=>{
 const steps=[decision('describe'),decision('read',{queryJson:'{"scope":"transcript","view":"all"}'}),decision('answer',{answer:'Transcript result.',sourceIds:['account-api:0']})];let reads=0;
 const value=await answerWithApplicationApis(base,{...deps,unified:true,decide:async()=>steps.shift(),invoke:async()=>{reads++;return result;},checkCoverage:async()=>({complete:false,nextSourceId:'',nextOperationId:'records.get',nextQueryJson:'{"view":"all","scope":"transcript"}',nextBodyJson:'{}'}),compose:async(input:any)=>input.candidate});assert.equal(reads,1);assert.equal(value,null);
 const writeSteps=[decision('describe'),decision('read'),decision('answer',{answer:'Saved result.',sourceIds:['account-api:0']})];let writes=0;
 await answerWithApplicationApis(base,{...deps,unified:true,operations:()=>[...deps.operations(),{id:'records.post',method:'POST',path:'/api/records',readOnly:false,callable:true}],decide:async()=>writeSteps.shift(),invoke:async()=>result,checkCoverage:async()=>({complete:false,nextSourceId:'',nextOperationId:'records.post',nextQueryJson:'{}',nextBodyJson:'{"change":true}'}),propose:async()=>{writes++;assert.fail();},compose:async(input:any)=>input.candidate});assert.equal(writes,0);
});
test('course-context discovery preserves route/history and cites the exact Moodle grade destination',async()=>{
 const steps=[decision('describe'),decision('read',{queryJson:'{"scope":"dtm-library","view":"grades","course_id":"92665"}'}),decision('answer',{answer:'Operating Systems: 85. Open the course grade report.',sourceIds:['account-api:0']})];
 let context:any;const history=[{role:'user',content:'I mean Operating Systems.'}];
 const value=await answerWithApplicationApis({...base,question:'Where are those grades?',route:'/dtm/course/import-92665',history},{...deps,decide:async(_name:any,_schema:any,_instructions:any,input:any)=>{context=input;return steps.shift();},invoke:async(_account:any,call:any)=>{assert.equal(call.query.course_id,'92665');return {...result,path:'/api/affairs-data',data:{courses:[{id:'92665',gradeText:'85',url:'/dtm/course/import-92665/grades'}]}};}});
 assert.equal(context.route,'/dtm/course/import-92665');assert.ok(JSON.stringify(context.history).includes('Operating Systems'));assert.equal(value?.citations?.[0].url,'/dtm/course/import-92665/grades');
});
test('active imported course bootstraps only its owned course context before dynamic planning',async()=>{
 const op={...deps.operations()[0],path:'/api/affairs-data'};const calls:any[]=[];
 const value=await answerWithApplicationApis({...base,route:'/dtm/course/import-92665',question:'What material is here?'},{...deps,unified:true,operations:()=>[op],describe:()=>op,invoke:async(_account:any,call:any)=>{calls.push(call);return {...result,path:op.path,data:{courses:[{id:'92665',courseUrl:'/dtm/course/import-92665'}]}};},decide:async()=>decision('clarify',{answer:'Which week would you like?'} )});
 assert.deepEqual(calls.map(c=>c.query),[{scope:'dtm-library',course_id:'92665'}]);assert.equal(value?.status,'clarification');
 calls.length=0;await answerWithApplicationApis({...base,account:null,route:'/dtm/course/import-92665'},{...deps,unified:true,operations:()=>[op],invoke:async()=>{assert.fail('Guest must not bootstrap private course context');},decide:async()=>decision('delegate')});assert.equal(calls.length,0);
});

test('unified planning exhaustion retains actual evidence for independently checked final composition',async()=>{
 const steps=[decision('describe'),decision('read'),decision('delegate')];let composed=0,reviewed=0;
 const value=await answerWithApplicationApis(base,{...deps,unified:true,decide:async()=>steps.shift(),invoke:async()=>result,compose:async(input:any)=>{composed++;assert.equal(input.evidence.length,1);return {...input.candidate,answer:'The saved value is 84.'};},verify:async()=>{reviewed++;return {ok:true};}});
 assert.equal(composed,1);assert.equal(reviewed,1);assert.equal(value?.answer,'The saved value is 84.');assert.equal(value?.verification?.status,'verified');
});

test('unnecessary clarification uses prior referent and fresh evidence instead of asking again',async()=>{
 const steps=[decision('describe'),decision('read'),decision('clarify',{answer:'Which report?'})];
 const value=await answerWithApplicationApis({...base,question:'Where is that report?',history:[{role:'assistant',content:'Your course report is /dtm/course/import-92665/grades.'}]},{...deps,unified:true,decide:async()=>steps.shift(),invoke:async()=>result,checkCoverage:async(name:any,_schema:any,_prompt:any,input:any)=>{assert.equal(name,'application_api_clarification_check');assert.ok(JSON.stringify(input.history).includes('92665'));return {needed:false};},compose:async(input:any)=>({...input.candidate,answer:'Open your course grade report.'})});
 assert.equal(value?.status,'answered');assert.equal(value?.verification?.status,'verified');
});

test('record evidence admits exact returned local links without trusting external or credential URLs',()=>{
 assert.deepEqual(applicationRecordLinks({courses:[{courseUrl:'/dtm/course/import-12',url:'/dtm/course/import-12/grades'}],pages:[{localUrl:'/dtm/course/import-12?source=%2Fmod%2Fpage%2Fview.php%3Fid%3D2'}],bad:[{url:'https://evil.test/dtm/grades'},{url:'//evil.test/dtm'},{url:'/dtm?access_token=secret'},{url:'javascript:alert(1)'},{url:'/app/admin'}]}),['/dtm/course/import-12','/dtm/course/import-12/grades','/dtm/course/import-12?source=%2Fmod%2Fpage%2Fview.php%3Fid%3D2']);
});
