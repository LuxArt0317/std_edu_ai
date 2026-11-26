import test from 'node:test';import assert from 'node:assert/strict';
import {createAssistantApiToolsHandler} from '../../server/assistantApiToolsHttp.js';
import {AffairsWorkspaceError} from '../../server/affairsWorkspace.js';
const caller={user:{id:'10000000-0000-4000-8000-000000000001'},url:'https://example.invalid',key:'fixture',token:'fixture'};
function response(){return {code:0,value:undefined as any,setHeader(){},status(code:number){this.code=code;return this;},json(value:unknown){this.value=value;}};}
test('HTTP gateway authenticates discovery and never accepts caller-supplied transport overrides',async()=>{
 let reads=0;const denied=createAssistantApiToolsHandler({verify:async()=>{throw new AffairsWorkspaceError('Sign in',401);},invoke:async()=>{reads++;}});const r=response();await denied({method:'GET',headers:{}},r);assert.equal(r.code,401);assert.equal(reads,0);
 const handler=createAssistantApiToolsHandler({verify:async()=>caller,invoke:async()=>{reads++;}});
 const discovery=response();await handler({method:'GET',headers:{authorization:'Bearer fixture'}},discovery);assert.equal(discovery.code,200);assert.ok(discovery.value.operations.some((op:any)=>op.id==='affairs-data.get'));
 const forged=response();await handler({method:'POST',headers:{authorization:'Bearer fixture'},body:{action:'read',operationId:'affairs-data.get',headers:{authorization:'foreign'}}},forged);assert.equal(forged.code,400);assert.equal(reads,0);
});
test('HTTP confirmation invokes only the saved review and does not accept replacement API arguments',async()=>{
 let confirmations=0;const handler=createAssistantApiToolsHandler({verify:async()=>caller,confirm:async(_account:any,input:any)=>{confirmations++;assert.deepEqual(input,{requestId:'review',confirmationToken:'token'});return {id:'review',kind:'invoke_application_api',summary:'Saved receipt'};}});
 const forged=response();await handler({method:'POST',headers:{},body:{action:'confirm',requestId:'review',confirmationToken:'token',body:{title:'Changed'}}},forged);assert.equal(forged.code,400);assert.equal(confirmations,0);
 const valid=response();await handler({method:'POST',headers:{},body:{action:'confirm',requestId:'review',confirmationToken:'token'}},valid);assert.equal(valid.code,200);assert.equal(confirmations,1);
});
