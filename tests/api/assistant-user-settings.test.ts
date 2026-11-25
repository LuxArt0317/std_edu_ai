import assert from 'node:assert/strict';
import test from 'node:test';
import {withUserAssistantSettings} from '../../server/assistantUserSettings.js';
import {assistantModelOverride,assistantReasoningOverride} from '../../server/assistantModelConfig.js';
import {assistantCommandChoices,parseAssistantCommand} from '../../src/services/assistantPreferences.js';
import {sanitizeStoredConversation} from '../../server/assistantConversationData.js';

test('slash commands select settings without treating website paths as commands',()=>{
 assert.deepEqual(parseAssistantCommand('/model gpt-6-luna',['gpt-6-luna']),{kind:'set',field:'model',value:'gpt-6-luna'});
 assert.deepEqual(parseAssistantCommand('/thinking high'),{kind:'set',field:'thinking',value:'high'});
 assert.equal(parseAssistantCommand('/model not-available',['gpt-6-luna']).kind,'error');
 assert.equal(parseAssistantCommand('/school-affairs where do I go?').kind,'none');
 assert.equal(assistantCommandChoices('/thinking h')[0].value,'high');
});

test('simultaneous model choices remain request-scoped and invalid settings never invoke the chat',async()=>{
 const observed:unknown[]=[],responses=()=>({headers:{} as Record<string,string>,statusCode:0,body:null as unknown,setHeader(k:string,v:string){this.headers[k]=v;},status(s:number){this.statusCode=s;return this;},json(v:unknown){this.body=v;}});
 const handler=withUserAssistantSettings(async(req:any,res:any)=>{
  await new Promise(resolve=>setTimeout(resolve,req.delay));
  observed.push([assistantModelOverride(),assistantReasoningOverride()]);res.status(200).json({answer:'ok'});
 },{validate:async(model:string)=>{if(!['gpt-6-luna','gpt-6.1-terra'].includes(model))throw Error('unknown');}});
 await Promise.all([
  handler({method:'POST',delay:10,headers:{'x-stu-assistant-model':'gpt-6-luna','x-stu-assistant-thinking':'low'}},responses()),
  handler({method:'POST',delay:1,headers:{'x-stu-assistant-model':'gpt-6.1-terra','x-stu-assistant-thinking':'high'}},responses()),
 ]);
 assert.deepEqual(observed,[['gpt-6.1-terra','high'],['gpt-6-luna','low']]);assert.equal(assistantModelOverride(),undefined);
 const invalid=responses();await handler({method:'POST',headers:{'x-stu-assistant-thinking':'unbounded'}},invalid);
 assert.equal(invalid.statusCode,400);assert.equal(observed.length,2);
});

test('saved answers retain bounded model settings and discard malformed metadata',()=>{
 const messages=sanitizeStoredConversation([{id:'a',role:'assistant',content:'Hello',result:{status:'answered',answer:'Hello',modelSettings:{model:'gpt-6-luna',thinking:'medium'}}}]);
 assert.deepEqual(messages[0].result.modelSettings,{model:'gpt-6-luna',thinking:'medium'});
 const invalid=sanitizeStoredConversation([{id:'b',role:'assistant',content:'Hello',result:{status:'answered',answer:'Hello',modelSettings:{model:'https://foreign.invalid',thinking:'unlimited'}}}]);
 assert.equal(invalid[0].result.modelSettings,undefined);
});
