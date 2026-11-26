import test from 'node:test';import assert from 'node:assert/strict';
import {answerWithApplicationApis} from '../../server/applicationApiAgent.js';
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
