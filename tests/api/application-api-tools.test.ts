import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inventoryApplicationApis,generateApplicationApis} from '../../server/applicationApiCatalogBuild.js';
import {applicationApiOperations,searchApplicationApis,invokeApplicationApi,proposeApplicationApiAction,confirmApplicationApiAction,redactApiToolValue,validateApplicationApiCall} from '../../server/applicationApiTools.js';
const caller={user:{id:'10000000-0000-4000-8000-000000000001'},url:'https://example.invalid',key:'fixture-key-not-a-secret',token:'fixture-token-not-a-secret'};
const route={slug:'records',path:'/api/records',description:'Student timetable',methods:['GET','POST'],readMethods:['GET'],disabledReason:null,sourceHash:'hash-v1',queryFields:['scope'],scopeHints:['timetable'],querySchema:{type:'object',additionalProperties:{type:'string'}},bodySchema:{type:'object',additionalProperties:true}};
const catalog=[route];
test('new API file is discovered and compiled without editing any chatbot tool list',async()=>{
 const root=await mkdtemp(join(tmpdir(),'api-registry-'));
 try{await mkdir(join(root,'api'));await writeFile(join(root,'package.json'),'{"type":"module"}');await writeFile(join(root,'api','new-service.ts'),'export default async function handler(req:any,res:any){res.status(200).json({service:"new",scope:req.query.scope});}');
  const result=await generateApplicationApis(root);assert.equal(result.length,1);assert.equal(result[0].slug,'new-service');assert.deepEqual(result[0].readMethods,[]);
  const runtime=await import(pathToFileURL(join(root,'server/applicationApiCatalog.generated.js')).href);let body:any;await (await runtime.loadApplicationApiHandler('new-service'))({query:{scope:'own'}},{status(){return this;},json(v:unknown){body=v;}});assert.deepEqual(body,{service:'new',scope:'own'});
  assert.doesNotMatch(await readFile(join(root,'server/applicationApiCatalog.generated.js'),'utf8'),/import\([^)]*\.ts/u);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('all current API files are represented including explicitly unavailable recursive endpoints',async()=>{
 const rows=await inventoryApplicationApis(process.cwd());assert.ok(rows.length>=12);assert.ok(rows.find(r=>r.slug==='affairs-data')?.scopeHints.includes('student-profile'));
 for(const slug of ['affairs-assistant','research-assistant','school-assistant','crm-assistant'])assert.ok(rows.find(r=>r.slug===slug)?.disabledReason);
 assert.ok(applicationApiOperations(rows).some(r=>r.id==='affairs-manage.post'&&!r.readOnly));assert.ok(searchApplicationApis('timetable').length);
});
test('actual handler receives only server-supplied authentication and validated arguments',async()=>{
 const result=await invokeApplicationApi(caller,{operationId:'records.get',query:{scope:'timetable'}},{catalog,loadHandler:async()=>async(req:any,res:any)=>{assert.deepEqual(Object.keys(req.headers).sort(),['authorization','content-type','x-stu-assistant-tool-call']);assert.equal(req.headers.authorization,'Bearer '+caller.token);assert.equal(req.query.scope,'timetable');res.status(200).json({rows:[{title:'Saved record'}]});}});
 assert.equal(result.status,200);assert.equal(result.data.rows[0].title,'Saved record');assert.doesNotMatch(JSON.stringify(result),/fixture-token|fixture-key/u);
});
test('anonymous calls, forged transport fields, unknown APIs and direct writes are denied before handler load',async()=>{
 let loads=0;const options={catalog,loadHandler:async()=>{loads++;throw Error('must not load');}};
 await assert.rejects(()=>invokeApplicationApi(null,{operationId:'records.get'},options),{status:401});
 for(const input of [{operationId:'https://evil.example/get'},{operationId:'records.get',headers:{authorization:'x'}},{operationId:'records.get',query:{authorization:'x'}},{operationId:'records.get',body:{key:'value'}},{operationId:'records.post',body:{title:'change'}}])await assert.rejects(()=>invokeApplicationApi(caller,input,options));
 assert.equal(loads,0);assert.throws(()=>validateApplicationApiCall({operationId:'affairs-assistant.post'}),{status:403});
});
test('schema validation and endpoint authorization remain distinct and are both enforced',async()=>{
 const scoped=[{...route,querySchema:{type:'object',properties:{scope:{type:'string',enum:['own']}},required:['scope'],additionalProperties:false}}];
 assert.throws(()=>validateApplicationApiCall({operationId:'records.get',query:{scope:'admin'}},{catalog:scoped}));
 const denied=await invokeApplicationApi(caller,{operationId:'records.post',body:{kind:'admin'}},{catalog,allowReviewedWrite:true,loadHandler:async()=>async(_req:any,res:any)=>res.status(403).json({error:'Admin required'})});assert.equal(denied.status,403);assert.equal(denied.ok,false);
});
test('response redaction bounds records and hides credentials, signed URLs and inline files',()=>{
 const result=redactApiToolValue({authorization:'Bearer x',access_token:'secret',nested:{value:caller.token},url:'https://storage.example/file?token=private',image:'data:image/png;base64,AAA',rows:Array.from({length:500},()=>({text:'x'.repeat(1000)}))},caller,4000);
 assert.equal(result.truncated,true);assert.ok(result.redactions>=4);assert.doesNotMatch(JSON.stringify(result),/fixture-token|\?token=private|base64,AAA|Bearer x/u);assert.ok(Buffer.byteLength(JSON.stringify(result))<6000);
});
test('read timeouts and binary responses never become successful evidence',async()=>{
 await assert.rejects(()=>invokeApplicationApi(caller,{operationId:'records.get'},{catalog,deadline:Date.now()+15,loadHandler:async()=>async()=>new Promise(()=>{})}),{status:504});
 const result=await invokeApplicationApi(caller,{operationId:'records.get'},{catalog,loadHandler:async()=>async(_req:any,res:any)=>res.end(Buffer.from('CONFIDENTIAL_BYTES'))});assert.equal(result.data.binaryOmitted,true);assert.doesNotMatch(JSON.stringify(result),/CONFIDENTIAL_BYTES/u);
});
test('reviewed mutations bind actor and exact request, run once and retain a replay receipt',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'api-actions-')),previous=process.env.ASSISTANT_API_ACTION_STORE;process.env.ASSISTANT_API_ACTION_STORE=dir;let calls=0;
 try{
  const action=await proposeApplicationApiAction(caller,{operationId:'records.post',body:{title:'One change'}},{catalog});assert.equal(calls,0);assert.match(action.payload.review,/One change/u);
  const options={catalog,loadHandler:async()=>async(req:any,res:any)=>{calls++;assert.deepEqual(req.body,{title:'One change'});res.status(201).json({saved:true});}};
  await assert.rejects(()=>confirmApplicationApiAction({...caller,user:{id:'20000000-0000-4000-8000-000000000002'}},{requestId:action.requestId,confirmationToken:action.payload.confirmationToken},options),{status:403});
  const receipt=await confirmApplicationApiAction(caller,{requestId:action.requestId,confirmationToken:action.payload.confirmationToken},options);assert.equal(receipt.result.status,201);assert.equal(calls,1);
  assert.deepEqual(await confirmApplicationApiAction(caller,{requestId:action.requestId,confirmationToken:action.payload.confirmationToken},options),receipt);assert.equal(calls,1);
  const content=await readFile(join(dir,action.requestId+'.json'),'utf8');assert.doesNotMatch(content,/fixture-token|fixture-key/u);
 }finally{if(previous===undefined)delete process.env.ASSISTANT_API_ACTION_STORE;else process.env.ASSISTANT_API_ACTION_STORE=previous;await rm(dir,{recursive:true,force:true});}
});
test('expired/changed reviews and uncertain executions cannot silently run again',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'api-actions-')),previous=process.env.ASSISTANT_API_ACTION_STORE;process.env.ASSISTANT_API_ACTION_STORE=dir;
 try{
  const expired=await proposeApplicationApiAction(caller,{operationId:'records.post'},{catalog,now:Date.now()-700000});await assert.rejects(()=>confirmApplicationApiAction(caller,{requestId:expired.requestId,confirmationToken:expired.payload.confirmationToken},{catalog}),{status:409});
  const action=await proposeApplicationApiAction(caller,{operationId:'records.post'},{catalog});const input={requestId:action.requestId,confirmationToken:action.payload.confirmationToken};
  await assert.rejects(()=>confirmApplicationApiAction(caller,input,{catalog:[{...route,sourceHash:'new-version'}]}),{status:409});
  await assert.rejects(()=>confirmApplicationApiAction(caller,input,{catalog,deadline:Date.now()+10,loadHandler:async()=>async()=>new Promise(()=>{})}),{status:504});
  await assert.rejects(()=>confirmApplicationApiAction(caller,input,{catalog,loadHandler:async()=>{assert.fail('must not execute again');}}),{status:409});
 }finally{if(previous===undefined)delete process.env.ASSISTANT_API_ACTION_STORE;else process.env.ASSISTANT_API_ACTION_STORE=previous;await rm(dir,{recursive:true,force:true});}
});
test('production review and receipt signatures reject tampering and caller reassignment',async()=>{
 const {signApiReview,validApiReview,signApiReceipt,verifiedApiReceipt}=await import('../../server/applicationApiReviewStore.js');
 const prior=process.env.ASSISTANT_API_SIGNING_SECRET;process.env.ASSISTANT_API_SIGNING_SECRET='fixture-signing-key-32-characters-long';
 try{
  const review=signApiReview({userId:caller.user.id,id:'review',call:{operationId:'records.post',body:{title:'Original'}}});assert.equal(validApiReview(review),true);assert.equal(validApiReview({...review,call:{operationId:'records.post',body:{title:'Changed'}}}),false);
  const receipt={id:'review',kind:'invoke_application_api',summary:'HTTP 201'};const signed=signApiReceipt(caller.user.id,'review',receipt);assert.deepEqual(verifiedApiReceipt(caller.user.id,'review',signed),receipt);
  assert.throws(()=>verifiedApiReceipt('foreign','review',signed));assert.throws(()=>verifiedApiReceipt(caller.user.id,'review',{...signed,summary:'Forged'}));
 }finally{if(prior===undefined)delete process.env.ASSISTANT_API_SIGNING_SECRET;else process.env.ASSISTANT_API_SIGNING_SECRET=prior;}
});
