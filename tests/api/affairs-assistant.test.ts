import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import affairsHandler from '../../api/affairs-assistant.ts';
import publicHandler from '../../api/research-assistant.ts';
import {answerDirectoryQuestion,directoryEntries} from '../../server/schoolAffairsDirectory.js';
import {questionKind} from '../../server/schoolWebSearch.js';

const originalFetch=globalThis.fetch;
const saved={url:process.env.VITE_SUPABASE_URL,key:process.env.VITE_SUPABASE_PUBLISHABLE_KEY,openai:process.env.OPENAI_API_KEY};
after(()=>{globalThis.fetch=originalFetch;for(const [key,value] of [['VITE_SUPABASE_URL',saved.url],['VITE_SUPABASE_PUBLISHABLE_KEY',saved.key],['OPENAI_API_KEY',saved.openai]] as const){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
function configured(){process.env.VITE_SUPABASE_URL='https://xiftudmvxphxcjtmfmib.supabase.co';process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';process.env.OPENAI_API_KEY='test-key';}
async function invoke(handler:typeof affairsHandler|typeof publicHandler,body:unknown,authorization?:string){const result:{status:number;body:any}={status:200,body:null};const response={status(code:number){result.status=code;return response;},json(value:unknown){result.body=value;},setHeader(){}};await handler({method:'POST',body,headers:{'x-forwarded-for':`qa-${Math.random()}`,...(authorization?{authorization}:{})}},response);return result;}
async function invokeStream(body:Record<string,unknown>,authorization:string){const chunks:string[]=[];let ended=false;const response={status(_code:number){return response},json(_value:unknown){throw Error('Expected SSE')},setHeader(_name:string,_value:string){},write(chunk:string){chunks.push(chunk)},end(){ended=true}};await affairsHandler({method:'POST',body:{...body,stream:true},headers:{'x-forwarded-for':`qa-${Math.random()}`,authorization}},response);assert.equal(ended,true);return chunks.join('').trim().split('\n\n').map(frame=>({type:frame.match(/^event: (.+)$/m)?.[1],data:JSON.parse(frame.match(/^data: (.+)$/m)?.[1]||'null')}));}
const token=`Bearer ${'x'.repeat(40)}`;

test('anonymous DTM and account questions require sign-in while public DTM questions remain public',()=>{
 assert.equal(questionKind('What DTM materials do I have?').personal,true);
 assert.equal(questionKind('Who am I?').personal,true);
 assert.equal(questionKind('What is my email?').personal,true);
 assert.equal(questionKind('What is Digital Teaching Materials?').personal,false);
});

test('captured directory includes all 94 services and the current General Affairs page',()=>{
 assert.equal(directoryEntries.length,94);
 const result=answerDirectoryQuestion('What is on this page?','/school-affairs/menu/swd/input');
 assert.ok(result);assert.equal(result.citations.length,3);
 for(const title of ['場地借用','報修','汽機車證'])assert.ok(result.answer.includes(title));
 assert.doesNotMatch(result.answer,/IM101|IM203|Fall Semester 2026|Nexus/);
});

test('signed School Affairs directory question never loads Nexus context or transmits account to research',async()=>{
 configured();const calls:string[]=[];
 globalThis.fetch=async(input,init)=>{const url=String(input);calls.push(url);if(url.endsWith('/auth/v1/user')){assert.ok(init);assert.equal((init.headers as Record<string,string>).Authorization,token);return new Response(JSON.stringify({id:'00000000-0000-4000-8000-000000000001',email:'student@example.com',identities:[{provider:'google'}]}),{status:200});}if(url.endsWith('/api/research-assistant')){assert.ok(init);assert.equal((init.headers as Record<string,string>).Authorization,undefined);const forwarded=JSON.parse(String(init.body));assert.deepEqual(forwarded.history,[]);assert.equal(forwarded.question,'What is on this page?');const answer=answerDirectoryQuestion(forwarded.question,forwarded.route)!;if(forwarded.stream)return new Response(`event: progress\ndata: {"kind":"directory","label":"Checked services","detail":"Three links","status":"complete"}\n\nevent: result\ndata: ${JSON.stringify({...answer,grounding:{source:'directory'}})}\n\n`,{status:200,headers:{'content-type':'text/event-stream'}});return new Response(JSON.stringify({...answer,grounding:{source:'directory'}}),{status:200});}throw Error(`Unexpected external call: ${url}`);};
 const result=await invoke(affairsHandler,{question:'What is on this page?',route:'/school-affairs/menu/swd/input',history:[{role:'assistant',content:'IM101 Digital Systems Foundations'}]},token);
 assert.equal(result.status,200);assert.equal(result.body.grounding.source,'directory');assert.equal(result.body.citations.length,3);
 assert.doesNotMatch(result.body.answer,/IM101|IM203|Fall Semester 2026|Nexus/);
 assert.deepEqual(calls,['https://xiftudmvxphxcjtmfmib.supabase.co/auth/v1/user','https://stu.best/api/research-assistant']);
 const streamed=await invokeStream({question:'What is on this page?',route:'/school-affairs/menu/swd/input'},token);
 assert.deepEqual(streamed.map(event=>event.type),['progress','progress','progress','result']);
 assert.deepEqual(streamed.filter(event=>event.type==='progress').map(event=>event.data.kind),['public','directory','public']);
});

test('personal School Affairs question reads only the caller site records, never Nexus',async()=>{
 configured();delete process.env.OPENAI_API_KEY;const calls:string[]=[];
 const userId='00000000-0000-4000-8000-000000000002';
 globalThis.fetch=async(input,init)=>{
  const url=String(input);calls.push(url);const path=new URL(url).pathname;
  if(path==='/auth/v1/user')return new Response(JSON.stringify({id:userId,email:'student@example.com',identities:[{provider:'google'}]}),{status:200});
  assert.equal((init?.headers as Record<string,string>)?.Authorization,token);
  const tables:Record<string,unknown>={
   '/rest/v1/rpc/affairs_initialize_account':{user_id:userId},
   '/rest/v1/rpc/dtm_initialize_account':null,
   '/rest/v1/affairs_profiles':[{user_id:userId,email:'student@example.com',display_name:'Student',role:'student'}],
   '/rest/v1/affairs_students':[{id:'student-id',user_id:userId,student_number:'SAMPLE-123',full_name:'Student',program_id:'program-id',year_level:1,status:'active',source_mode:'sample'}],
   '/rest/v1/affairs_programs':[{id:'program-id',name:'Sample General Studies'}],
   '/rest/v1/affairs_terms':[{id:'term-id',label:'Sample Fall 2026'}],
   '/rest/v1/affairs_courses':[{id:'course-id',code:'SAMP101',title:'Campus Orientation',credits:2}],
   '/rest/v1/affairs_sections':[{id:'section-id',course_id:'course-id',term_id:'term-id',instructor:'Sample instructor',weekday:1,starts_at:'09:00',ends_at:'10:30',room:'Sample Room'}],
   '/rest/v1/affairs_enrollments':[{id:'enrollment-id',section_id:'section-id',status:'enrolled',source_mode:'sample'}],
   '/rest/v1/affairs_grade_items':[],
   '/rest/v1/affairs_attendance':[],
   '/rest/v1/affairs_charges':[],
   '/rest/v1/affairs_announcements':[],
   '/rest/v1/affairs_tasks':[],
   '/rest/v1/affairs_service_requests':[],
   '/rest/v1/dtm_courses':[{id:'dtm-course-id',user_id:userId,code:'DTM-SAMPLE-101',title:'Digital Learning Orientation',term:'115學年度第1學期',role:'student',source_mode:'sample'}],
   '/rest/v1/dtm_materials':[{id:'dtm-material-id',course_id:'dtm-course-id',title:'Getting started guide',kind:'file',summary:'Sample guide',position:1,source_mode:'sample'}],
   '/rest/v1/dtm_notices':[{id:'dtm-notice-id',title:'Welcome to DTM',body:'Sample notice',published_at:'2026-11-05T00:00:00Z',source_mode:'sample'}],
  };
  if(path in tables)return new Response(JSON.stringify(tables[path]),{status:200});
  throw Error(`Unexpected external call: ${url}`);
 };
 const result=await invoke(affairsHandler,{question:'What are my current subjects?',route:'/school-affairs/menu/aca/query'},token);
 assert.equal(result.status,200,JSON.stringify({body:result.body,calls}));assert.match(result.body.answer,/SAMP101 Campus Orientation/);assert.match(result.body.answer,/sample/i);
 assert.doesNotMatch(result.body.answer,/IM101|IM203|Fall Semester 2026|Nexus/);
 assert.ok(calls.every(url=>url.startsWith('https://xiftudmvxphxcjtmfmib.supabase.co/')));
 const dtm=await invoke(affairsHandler,{question:'What DTM materials do I have?',route:'/dtm'},token);
 assert.equal(dtm.status,200);assert.match(dtm.body.answer,/Getting started guide/);assert.match(dtm.body.answer,/sample/i);
 const account=await invoke(affairsHandler,{question:'what are all my school details',route:'/dtm'},token);
 assert.equal(account.status,200);assert.match(account.body.answer,/student@example.com/);assert.match(account.body.answer,/SAMP101/);assert.match(account.body.answer,/DTM-SAMPLE-101/);
 const known=await invoke(affairsHandler,{question:'what details do you know about me',route:'/school-affairs'},token);
 assert.equal(known.status,200);assert.match(known.body.answer,/SAMPLE-123/);assert.match(known.body.answer,/sample/i);
 const tools=await invoke(affairsHandler,{question:'what tools do you have?',route:'/dtm'},token);
 assert.equal(tools.status,200);assert.match(tools.body.answer,/prepare a task or service request/);assert.match(tools.body.answer,/cannot access or change official university records/i);
 const assignments=await invoke(affairsHandler,{question:'What are my Moodle assignments?',route:'/dtm'},token);
 assert.equal(assignments.status,200);assert.match(assignments.body.answer,/not connected to stu.best/i);assert.doesNotMatch(assignments.body.answer,/Getting started guide/);
 const modelCalls=calls.filter(url=>url.includes('api.openai.com')||url.includes('/api/research-assistant'));
 assert.deepEqual(modelCalls,[],'signed-in account and capability questions must stay on the private path');
 const events=await invokeStream({question:'What DTM materials do I have?',route:'/dtm'},token);
 assert.deepEqual(events.map(event=>event.type),['progress','progress','progress','progress','result']);
 assert.deepEqual(events.filter(event=>event.type==='progress').map(event=>event.data.kind),['account','account','answer','answer']);
 assert.match(events.at(-1)!.data.answer,/Getting started guide/);
});

test('public image question accepts validated PNG and reports actual image analysis',async()=>{
 configured();const bytes=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(40)]);const dataUrl=`data:image/png;base64,${bytes.toString('base64')}`;
 globalThis.fetch=async(input,init)=>{assert.equal(String(input),'https://api.openai.com/v1/responses');const request=JSON.parse(String(init?.body));assert.equal(request.input[0].content[1].type,'input_image');assert.equal(request.store,false);return new Response(JSON.stringify({output:[{type:'message',content:[{text:JSON.stringify({answer:'The screenshot shows a School Affairs menu.',source_titles:['線上報修']})}]}]}),{status:200});};
 const result=await invoke(publicHandler,{question:'Please explain this screenshot',images:[{name:'menu.png',dataUrl}],route:'/school-affairs/menu/swd/input'});
 assert.equal(result.status,200);assert.equal(result.body.grounding.source,'image');assert.equal(result.body.citations[0].title,'線上報修');assert.equal(result.body.activity[0].kind,'image');
 const rejected=await invoke(publicHandler,{question:'Explain this',images:[{name:'fake.png',dataUrl:'data:image/png;base64,'+Buffer.alloc(40).toString('base64')} ]});
 assert.equal(rejected.status,400);
});
