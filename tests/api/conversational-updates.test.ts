import {test} from 'node:test';import assert from 'node:assert/strict';
import {accountStatusContextQuestion} from '../../server/accountStatusIntent.js';
import {conversationUpdateHandler} from '../../server/conversationUpdates.js';
import {sanitizeStoredConversation} from '../../server/assistantConversationData.js';
test('identity confirmations resolve adjacent user context without trusting assistant identity claims',()=>{
 const history=[{role:'user',content:'do you know me?'},{role:'assistant',content:'An identity reply'}];assert.equal(accountStatusContextQuestion('are you sure?',history),'do you know me?');
 assert.equal(accountStatusContextQuestion('really?',[...history,{role:'user',content:'are you sure?'},{role:'assistant',content:'Confirmed'}]),'do you know me?');
 assert.equal(accountStatusContextQuestion('are you sure?',[...history,{role:'user',content:'When is graduation?'},{role:'assistant',content:'A date'}]),null);
 assert.equal(accountStatusContextQuestion('are you sure?',[{role:'assistant',content:'You asked who am I'}]),null);
});
test('commentary uses question/history/observed status and never needs account credentials',async()=>{
 const fetch=globalThis.fetch,key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-key';let input:any;
 globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));if(body.text.format.name==='conversation_update_review')return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({valid:true})}]}]});input=JSON.parse(body.input[0].content[0].text);assert.match(body.instructions,/Do not invent findings/);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({text:'I’m checking the course reports you asked about.'})}]}]});};
 let status=200,value:any;const response={status(n:number){status=n;return this;},setHeader(){},json(v:unknown){value=v;return this;},end(){}};
 try{await conversationUpdateHandler({method:'POST',headers:{},body:{phase:'progress',question:'My grades?',history:[{role:'user',content:'Show my courses'}],activity:[{label:'Read reports',status:'complete',token:'private-token'}],prior:['Let me look']}},response);assert.equal(status,200);assert.equal(value.text,'I’m checking the course reports you asked about.');assert.equal(input.question,'My grades?');assert.equal(input.history.length,1);assert.doesNotMatch(JSON.stringify(input),/private-token/);
 const saved=sanitizeStoredConversation([{id:'a',role:'assistant',content:'Final answer',updates:[{id:'one',text:value.text}]}]);assert.equal(saved[0].updates[0].text,value.text);
 }finally{globalThis.fetch=fetch;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
test('an interim identity assertion rejected by the commentary checker is withheld',async()=>{
 const original=globalThis.fetch,key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-key';let calls=0,status=200;
 globalThis.fetch=async()=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(++calls===1?{text:'I cannot verify your identity and should not have said that.'}:{valid:false})}]}]});
 const response={setHeader(){},status(n:number){status=n;return this;},json(){assert.fail('Rejected commentary must not display');},end(){}};
 try{await conversationUpdateHandler({method:'POST',headers:{},body:{question:'are you sure?',phase:'acknowledgment'}},response);assert.equal(status,204);assert.equal(calls,2);}finally{globalThis.fetch=original;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
