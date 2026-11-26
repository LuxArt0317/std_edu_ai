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
