import test from 'node:test';import assert from 'node:assert/strict';
import {verificationModelCall,verifyEvidenceAnswer} from '../../server/answerVerificationModel.js';
const evidence=[{id:'account-api:0',title:'Released assessments',url:'/school-affairs/records/subjects',content:JSON.stringify({ok:true,data:{grades:[{label:'Quiz',score:8,maximum:10}]}})}];
test('generic API composition gets bounded source instructions, not legacy collection-specific contracts',async()=>{
 const saved=globalThis.fetch,key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-key';
 globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));assert.match(body.instructions,/actual returned record values/);assert.match(body.instructions,/do not expose API field names/);assert.doesNotMatch(body.instructions,/account:clubAttendance|account:housingBed|account:academicGrades/);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({status:'answered',answer:'Quiz: 8/10.',sourceIds:['account-api:0']})}]}]});};
 try{const result=await verificationModelCall('compose_grounded_answer',{},'irrelevant legacy text',{question:'What are my scores?',evidence},Date.now()+5000);assert.equal(result.answer,'Quiz: 8/10.');}finally{globalThis.fetch=saved;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
test('generic API verification still rejects fabricated JSON pointers',async()=>{
 const saved=globalThis.fetch,key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-key';
 globalThis.fetch=async()=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({supported:true,answersQuestion:true,claims:[{claim:'Quiz score is 8/10',supported:true,evidenceId:'account-api:0',quotes:[],jsonPaths:['/data/grades/9/score']}]})}]}]});
 try{const result=await verifyEvidenceAnswer({question:'What is my quiz score?',candidate:{status:'answered',answer:'Quiz score is 8/10.',citations:[{chunkId:'account-api:0',title:'Released assessments',url:'/school-affairs/records/subjects'}]},evidence,deadline:Date.now()+5000,responseIntent:'records'});assert.equal(result.ok,false);}finally{globalThis.fetch=saved;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
test('imported Moodle reports use compact record instructions and sufficient all-course output budget',async()=>{
 const saved=globalThis.fetch,key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-key';
 const imported=[{...evidence[0],id:'account:dtmGradeReport',provenance:'imported'}];
 globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));assert.match(body.instructions,/actual returned record values/);assert.doesNotMatch(body.instructions,/account:clubAttendance|account:housingBed/);assert.equal(body.max_output_tokens,6000);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({status:'answered',answer:'The report contains your score.',sourceIds:['account:dtmGradeReport']})}]}]});};
 try{await verificationModelCall('compose_grounded_answer',{},'legacy instructions',{question:'All my Moodle scores',evidence:imported},Date.now()+40000);}finally{globalThis.fetch=saved;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
