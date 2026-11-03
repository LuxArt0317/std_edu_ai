import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import affairsHandler from '../../api/affairs-assistant.ts';
import publicHandler from '../../api/research-assistant.ts';
import {answerDirectoryQuestion,directoryEntries} from '../../server/schoolAffairsDirectory.js';

const originalFetch=globalThis.fetch;
const saved={url:process.env.VITE_SUPABASE_URL,key:process.env.VITE_SUPABASE_PUBLISHABLE_KEY,openai:process.env.OPENAI_API_KEY};
after(()=>{globalThis.fetch=originalFetch;for(const [key,value] of [['VITE_SUPABASE_URL',saved.url],['VITE_SUPABASE_PUBLISHABLE_KEY',saved.key],['OPENAI_API_KEY',saved.openai]] as const){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
function configured(){process.env.VITE_SUPABASE_URL='https://example.supabase.co';process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';process.env.OPENAI_API_KEY='test-key';}
async function invoke(handler:typeof affairsHandler|typeof publicHandler,body:unknown,authorization?:string){const result:{status:number;body:any}={status:200,body:null};const response={status(code:number){result.status=code;return response;},json(value:unknown){result.body=value;},setHeader(){}};await handler({method:'POST',body,headers:{'x-forwarded-for':`qa-${Math.random()}`,...(authorization?{authorization}:{})}},response);return result;}
const token=`Bearer ${'x'.repeat(40)}`;

test('captured directory includes all 94 services and the current General Affairs page',()=>{
 assert.equal(directoryEntries.length,94);
 const result=answerDirectoryQuestion('What is on this page?','/school-affairs/menu/swd/input');
 assert.ok(result);assert.equal(result.citations.length,3);
 for(const title of ['場地借用','報修','汽機車證'])assert.ok(result.answer.includes(title));
 assert.doesNotMatch(result.answer,/IM101|IM203|Fall Semester 2026|Nexus/);
});

test('signed School Affairs directory question never loads Nexus context or transmits account to research',async()=>{
 configured();const calls:string[]=[];
 globalThis.fetch=async(input,init)=>{const url=String(input);calls.push(url);if(url.endsWith('/auth/v1/user')){assert.ok(init);assert.equal((init.headers as Record<string,string>).Authorization,token);return new Response(JSON.stringify({id:'00000000-0000-4000-8000-000000000001',email:'student@example.com'}),{status:200});}if(url.endsWith('/api/research-assistant')){assert.ok(init);assert.equal((init.headers as Record<string,string>).Authorization,undefined);const forwarded=JSON.parse(String(init.body));assert.deepEqual(forwarded.history,[]);assert.equal(forwarded.question,'What is on this page?');const answer=answerDirectoryQuestion(forwarded.question,forwarded.route)!;return new Response(JSON.stringify({...answer,grounding:{source:'directory'}}),{status:200});}throw Error(`Unexpected external call: ${url}`);};
 const result=await invoke(affairsHandler,{question:'What is on this page?',route:'/school-affairs/menu/swd/input',history:[{role:'assistant',content:'IM101 Digital Systems Foundations'}]},token);
 assert.equal(result.status,200);assert.equal(result.body.grounding.source,'directory');assert.equal(result.body.citations.length,3);
 assert.doesNotMatch(result.body.answer,/IM101|IM203|Fall Semester 2026|Nexus/);
 assert.equal(calls.length,2);assert.equal(calls[0],'https://example.supabase.co/auth/v1/user');assert.ok(calls[1].endsWith('/api/research-assistant'));
});

test('personal School Affairs question verifies only the Google session and admits missing official enrollment',async()=>{
 configured();const calls:string[]=[];
 globalThis.fetch=async(input)=>{const url=String(input);calls.push(url);if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'00000000-0000-4000-8000-000000000002',email:'student@example.com'}),{status:200});throw Error(`Unexpected external call: ${url}`);};
 const result=await invoke(affairsHandler,{question:'What are my current subjects?',route:'/school-affairs/menu/aca/query'},token);
 assert.equal(result.status,200);assert.match(result.body.answer,/stu.best is not connected to official university enrollments/);
 assert.doesNotMatch(result.body.answer,/IM101|IM203|Fall Semester 2026|Nexus/);
 assert.deepEqual(calls,['https://example.supabase.co/auth/v1/user']);
});

test('public image question accepts validated PNG and reports actual image analysis',async()=>{
 configured();const bytes=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(40)]);const dataUrl=`data:image/png;base64,${bytes.toString('base64')}`;
 globalThis.fetch=async(input,init)=>{assert.equal(String(input),'https://api.openai.com/v1/responses');const request=JSON.parse(String(init?.body));assert.equal(request.input[0].content[1].type,'input_image');assert.equal(request.store,false);return new Response(JSON.stringify({output:[{type:'message',content:[{text:JSON.stringify({answer:'The screenshot shows a School Affairs menu.',source_titles:['線上報修']})}]}]}),{status:200});};
 const result=await invoke(publicHandler,{question:'Please explain this screenshot',images:[{name:'menu.png',dataUrl}],route:'/school-affairs/menu/swd/input'});
 assert.equal(result.status,200);assert.equal(result.body.grounding.source,'image');assert.equal(result.body.citations[0].title,'線上報修');assert.equal(result.body.activity[0].kind,'image');
 const rejected=await invoke(publicHandler,{question:'Explain this',images:[{name:'fake.png',dataUrl:'data:image/png;base64,'+Buffer.alloc(40).toString('base64')} ]});
 assert.equal(rejected.status,400);
});
