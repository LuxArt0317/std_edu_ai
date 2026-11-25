import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import affairsHandler from '../../api/affairs-assistant.ts';
import publicHandler from '../../api/research-assistant.ts';
import {answerDirectoryQuestion,answerSchoolSystemSearch,directoryEntries} from '../../server/schoolAffairsDirectory.js';
import {questionKind} from '../../server/schoolWebSearch.js';
import {accountTools,requiredNativeTools} from '../../server/answerVerificationAccount.js';

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

test('native multipart detection retains public navigation and DTM boundaries',()=>{
 assert.deepEqual(requiredNativeTools('Show graduation status and academic attendance statistics'),['graduationReview','academicAttendance']);
 assert.deepEqual(requiredNativeTools('Where is graduation review and academic attendance?'),[]);
 assert.deepEqual(requiredNativeTools('Where is graduation review and show academic attendance statistics?'),['academicAttendance']);
 assert.deepEqual(requiredNativeTools('What is Digital Teaching Materials?'),[]);
 assert.deepEqual(requiredNativeTools('Show DTM grades and attendance','/dtm/grades'),[]);
 assert.deepEqual(requiredNativeTools('Show grades and attendance','',[{role:'user',content:'My Moodle courses'}]),[]);
 assert.deepEqual(requiredNativeTools('Show academic transcript and DTM grades','/dtm/grades'),['academicGrades']);
});

test('noun-only multipart native request loads own records and verification without public research',async()=>{
 configured();const userId='00000000-0000-4000-8000-000000000090',calls:string[]=[],rpc:string[]=[];
 let snapshots=0,reviews=0,repairs=0;
 const nativeTables=new Set(['affairs_academic_grade_records','affairs_academic_term_summaries','affairs_academic_rankings','affairs_academic_metadata',
  'affairs_graduation_reviews','affairs_academic_attendance_statistics','affairs_academic_attendance_details','affairs_academic_attendance_metadata']);
 const readTables=new Set(['affairs_students','affairs_terms','affairs_programs','affairs_courses','affairs_sections','affairs_announcements','affairs_tasks',
  'affairs_service_requests','affairs_service_records','affairs_scholarship_periods','affairs_scholarship_applications','affairs_student_aid_records',
  'affairs_housing_periods','affairs_housing_applications','affairs_housing_assignments','affairs_credit_load_history','affairs_course_selection_records',
  'affairs_grade_items','affairs_attendance','dtm_courses','dtm_notices',...nativeTables]);
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));calls.push(url.href);
  if(url.href==='https://api.openai.com/v1/responses'){
   const body=JSON.parse(String(init?.body)),operation=body.text.format.name,payload=JSON.parse(body.input[0].content[0].text);
   assert.doesNotMatch(String(init?.body),/access_token|refresh_token|Bearer x{20}/);
   let value:unknown;
   if(operation==='account_lookup_plan')value={tools:[],publicTopics:[],action:null};
   else {
    assert.deepEqual(payload.evidence.map((item:{id:string})=>item.id),['account-scope','account:graduationReview','account:academicAttendance']);
    const graduation=JSON.parse(payload.evidence[1].content),attendance=JSON.parse(payload.evidence[2].content);
    assert.equal(graduation.requestedReportKind,'academic_services');assert.equal(graduation.records.counts[0].matchingRows,0);
    assert.equal(attendance.selection.reason,'current_term_missing');
    if(operation==='answer_evidence_review'){
     reviews++;value={supported:reviews===2,answersQuestion:reviews===2,claims:reviews===1?[]:[
      {claim:'No saved Academic Services report matches this account.',supported:true,evidenceId:'account:graduationReview',quotes:[],jsonPaths:['/records/counts/0/matchingRows']},
      {claim:'The current attendance term is not designated.',supported:true,evidenceId:'account:academicAttendance',quotes:[],jsonPaths:['/selection/reason']},
     ]};
    }else {
     assert.equal(operation,'correct_grounded_answer');repairs++;
     value={status:'answered',answer:'No saved Academic Services report matches this account. The current attendance term is not designated.',sourceIds:['account:graduationReview','account:academicAttendance']};
    }
   }
   return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});
  }
  assert.equal(url.hostname,'xiftudmvxphxcjtmfmib.supabase.co','No public research or external source may receive this record question.');
  assert.equal((init?.headers as Record<string,string>)?.Authorization,token);
  if(url.pathname==='/auth/v1/user')return Response.json({id:userId,identities:[{provider:'google'}]});
  const table=url.pathname.split('/').at(-1)!;
  if(url.pathname.includes('/rpc/')){assert.equal(snapshots,0);assert.ok(['affairs_initialize_account','dtm_initialize_account'].includes(table));rpc.push(table);return Response.json(null);}
  assert.ok(!init?.method||init.method==='GET');
  if(table==='affairs_profiles'){snapshots++;assert.equal(url.searchParams.get('user_id'),'eq.'+userId);return Response.json([{user_id:userId,email:'synthetic@example.invalid',display_name:'Synthetic',role:'student'}]);}
  assert.ok(readTables.has(table),'Unexpected record source: '+table);
  if(nativeTables.has(table))assert.equal(url.searchParams.get('user_id'),'eq.'+userId);
  return Response.json([]);
 };
 const result=await invoke(affairsHandler,{question:'Show graduation status and academic attendance statistics',route:'/school-affairs'},token);
 assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.grounding.source,'account');assert.equal(result.body.verification.status,'verified');
 assert.equal(result.body.verification.attempts,2);assert.equal(snapshots,2);assert.equal(reviews,2);assert.equal(repairs,1);
 assert.deepEqual(rpc,['affairs_initialize_account','dtm_initialize_account']);assert.equal(result.body.proposedAction,undefined);
 assert.match(result.body.answer,/No saved Academic Services report/);assert.match(result.body.answer,/current attendance term is not designated/);
 assert.ok(!calls.some(url=>url.includes('/api/research-assistant')));
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
 globalThis.fetch=async(input,init)=>{const url=String(input);calls.push(url);assert.equal(url,'https://xiftudmvxphxcjtmfmib.supabase.co/auth/v1/user','Public research runs in this deployment, not through a production HTTP hop.');assert.ok(init);assert.equal((init.headers as Record<string,string>).Authorization,token);return Response.json({id:'00000000-0000-4000-8000-000000000001',email:'student@example.com',identities:[{provider:'google'}]});};
 const result=await invoke(affairsHandler,{question:'What is on this page?',route:'/school-affairs/menu/swd/input',history:[{role:'assistant',content:'IM101 Digital Systems Foundations'}]},token);
 assert.equal(result.status,200);assert.equal(result.body.grounding.source,'directory');assert.equal(result.body.citations.length,3);
 assert.doesNotMatch(result.body.answer,/IM101|IM203|Fall Semester 2026|Nexus/);
 assert.deepEqual(calls,['https://xiftudmvxphxcjtmfmib.supabase.co/auth/v1/user']);
 const streamed=await invokeStream({question:'What is on this page?',route:'/school-affairs/menu/swd/input'},token);
 assert.deepEqual(streamed.map(event=>event.type),['progress','progress','progress','progress','result']);
 assert.deepEqual(streamed.filter(event=>event.type==='progress').map(event=>event.data.kind),['public','directory','directory','public']);
});

test('School Affairs search and General Affairs menu cases answer from their route when the model is unavailable',async()=>{
 configured();
 delete process.env.OPENAI_API_KEY;
 const authCalls:string[]=[];
 globalThis.fetch=async(input)=>{
  const url=String(input);authCalls.push(url);
  assert.equal(url,'https://xiftudmvxphxcjtmfmib.supabase.co/auth/v1/user');
  return Response.json({id:'00000000-0000-4000-8000-000000000001',identities:[{provider:'google'}]});
 };
 const cases=[
  {route:'/school-affairs/search', question:'How do I use the keyword field on this page to find a service?',
    required:['keyword','線上報修','matching service link','/school-affairs/search'],excluded:[]},
  {route:'/school-affairs/menu/swd/input',question:'這個頁面有哪些申請或輸入服務？',
    required:['場地借用','線上報修','汽機車證'],excluded:['場地使用狀況查詢']},
  {route:'/school-affairs/menu/swd/query/',question:'Which service lookups are shown on this page?',
    required:['場地使用狀況查詢','使用者電匯付款查詢','學生帳戶繳交狀態查詢'],excluded:['線上報修','汽機車證申請']},
 ];
 for(const {route,question,required,excluded} of cases){
  const body={route,question};
  for(const [handler,authorization] of [[publicHandler,undefined],[affairsHandler,token]] as const){
   const result=await invoke(handler,body,authorization);
   assert.equal(result.status,200,route+' '+handler.name+' '+JSON.stringify(result.body)+' '+JSON.stringify(authCalls));
   assert.equal(result.body.grounding?.source,'directory');
   for(const value of required)assert.ok(result.body.answer.includes(value),value+' missing from '+result.body.answer);
   for(const value of excluded)assert.ok(!result.body.answer.includes(value),value);
   assert.equal(result.body.proposedAction,undefined);
  }
 }
 assert.equal(authCalls.length,3);
 assert.equal(answerSchoolSystemSearch('What does the keyword field search and what are my grades?','/school-affairs/search'),null);
 assert.equal(answerSchoolSystemSearch('What does the keyword field on this page search?','/school-affairs/menu/swd/input'),null);
 configured();
});

test('personal School Affairs question reads only the caller site records, never Nexus',async()=>{
 configured();process.env.VITE_SUPABASE_URL='https://xiftudmvxphxcjtmfmib.supabase.co';const calls:string[]=[];
 const userId='00000000-0000-4000-8000-000000000002';
 const id=(part:number)=>'00000000-0000-4000-8001-'+String(part).padStart(12,'0');
 const range=(rows:unknown[])=>Response.json(rows,{headers:{'content-range':rows.length?'0-'+(rows.length-1)+'/'+rows.length:'*/0'}});
 let overview=false;
 globalThis.fetch=async(input,init)=>{
  const url=String(input);calls.push(url);const path=new URL(url).pathname;
  if(url==='https://api.openai.com/v1/responses') {
    assert.equal((init?.headers as Record<string,string>)?.Authorization,'Bearer test-key');
    const body=JSON.parse(String(init?.body));
    const name=body.text.format.name;
    assert.ok(['account_lookup_plan','compose_grounded_answer','answer_evidence_review'].includes(name));
    assert.doesNotMatch(String(init?.body),/access_token|refresh_token|Bearer x{20}/);
    const payload=JSON.parse(body.input[0].content[0].text);
    let value:unknown=name==='account_lookup_plan'?{tools:Object.keys(accountTools),publicTopics:[]}:
      {supported:true,answersQuestion:true,claims:[{claim:'The data is local account evidence',supported:true,evidenceId:'account-scope',quote:'stu.best account records'}]};
    if(overview){
      assert.equal(name,'answer_evidence_review');
      const parts=[
        ['profile','/records/student/program','Sample General Studies'],
        ['profile','/records/student/yearLevel','Year level: 1'],
        ['courses','/records/0/code','SAMP101 Campus Orientation'],
        ['dtm','/records/0/code','DTM-SAMPLE-101 Digital Learning Orientation'],
        ['assignments','/overview/total','1 assignment tracker record'],
        ['charges','/overview/total','1 charge item'],
        ['tasks','/overview/total','0 saved tasks'],
        ['requests','/overview/total','0 service requests'],
      ];
      value={supported:true,answersQuestion:true,claims:parts.map(([key,pointer,claim])=>({claim,supported:true,evidenceId:'account:'+key,jsonPaths:[pointer],quotes:[]}))};
    }
    if(name==='compose_grounded_answer'){
      assert.equal(payload.previousAnswer,undefined);
      const sources=new Map<string,any>(payload.evidence.map((row:any)=>[row.id,JSON.parse(row.content)]));
      const profile=sources.get('account:profile').records,courses=sources.get('account:courses').records,dtm=sources.get('account:dtm').records;
      assert.equal(profile.student.studentNumber,undefined);
      assert.equal(profile.profile.email,undefined);
      assert.equal(profile.student.program,'Sample General Studies');
      value={status:'answered',answer:`Saved sample records for ${profile.profile.displayName}: ${profile.student.program}, year ${profile.student.yearLevel}. Current subjects: ${courses.map((row:any)=>row.code+' '+row.title).join(', ')}. Separately saved DTM courses: ${dtm.courses.map((row:any)=>row.code+' '+row.title).join(', ')}.`,sourceIds:['account:profile','account:courses','account:dtm']};
    }
    if(name==='answer_evidence_review')assert.ok(payload.evidence.every((row:any)=>row.id.startsWith('account')||row.id==='service-directory'));
    return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});
  }
  if(path==='/auth/v1/user')return new Response(JSON.stringify({id:userId,email:'student@example.com',identities:[{provider:'google'}]}),{status:200});
  assert.equal((init?.headers as Record<string,string>)?.Authorization,token);
  const selected=new URL(url).searchParams;
  if(path==='/rest/v1/affairs_graduation_reviews'&&selected.get('select')==='user_id,report_kind,source_mode,review_status:report->graduationReview->>text'){
    assert.equal(init?.method,'GET');
    assert.equal(new Headers(init?.headers).get('prefer'),'count=exact');
    assert.equal(selected.get('user_id'),'eq.'+userId);
    assert.ok(['eq.academic_services','eq.legacy'].includes(selected.get('report_kind')??''));
    return range([]);
  }
  if(path==='/rest/v1/affairs_course_selection_records'&&new Headers(init?.headers).get('prefer')==='count=exact'){
    assert.equal(init?.method,'GET');
    assert.equal(selected.get('user_id'),'eq.'+userId);
    return range([]);
  }
  if(path==='/rest/v1/affairs_academic_attendance_metadata'&&new Headers(init?.headers).get('prefer')==='count=exact'){
    assert.equal(init?.method,'GET');
    assert.equal(selected.get('user_id'),'eq.'+userId);
    return range([]);
  }
  if(path==='/rest/v1/affairs_students'&&selected.get('select')==='id,user_id')return range([{id:id(1),user_id:userId}]);
  if(path==='/rest/v1/affairs_charges'&&selected.get('select')?.includes('occurrence_on'))return range([{
    id:id(20),student_id:id(1),label:'Sample Fall 2026 tuition',amount_due:28000,amount_paid:5000,currency:'TWD',
    due_on:'2026-12-15',source_mode:'sample',occurrence_on:null,category:'tuition',contact_unit:null,contact_extension:null,payment_unit:null,
  }]);
  if(overview){
    const params=new URL(url).searchParams;
    if(init?.method==='HEAD'){
      const counts:Record<string,number>={affairs_assignments:1,affairs_charges:1,affairs_tasks:0,affairs_service_requests:0};
      const resource=path.split('/').at(-1)!;
      assert.ok(Object.hasOwn(counts,resource));
      return new Response(null,{headers:{'content-range':'*/'+counts[resource]}});
    }
    assert.equal(init?.method,'GET');
    if(path==='/rest/v1/affairs_profiles')return range([{user_id:userId,display_name:'Student',preferred_name:null}]);
    if(path==='/rest/v1/affairs_students')return range([params.get('select')==='id,user_id'?{id:id(1),user_id:userId}:{
      id:id(1),user_id:userId,program_id:id(2),year_level:1,source_mode:'sample',program:{id:id(2),name:'Sample General Studies',source_mode:'sample'},
    }]);
    if(path==='/rest/v1/dtm_courses')return range([{id:id(3),user_id:userId,code:'DTM-SAMPLE-101',title:'Digital Learning Orientation',term:'115學年度第1學期',source_mode:'sample'}]);
    assert.equal(path,'/rest/v1/affairs_enrollments');
    return range([{id:id(4),student_id:id(1),section_id:id(5),status:'enrolled',source_mode:'sample',student:{id:id(1),user_id:userId},
      section:{id:id(5),course_id:id(6),term_id:id(7),weekday:1,starts_at:'09:00',ends_at:'10:30',room:'Sample Room',
        course:{id:id(6),code:'SAMP101',title:'Campus Orientation'},term:{id:id(7),label:'Sample Fall 2026',starts_on:'2021-01-01',ends_on:'2098-01-15'}}}]);
  }
  const tables:Record<string,unknown>={
   '/rest/v1/rpc/affairs_initialize_account':{user_id:userId},
   '/rest/v1/rpc/dtm_initialize_account':null,
   '/rest/v1/affairs_profiles':[{user_id:userId,email:'student@example.com',display_name:'Student',role:'student'}],
   '/rest/v1/affairs_students':[{id:'student-id',user_id:userId,student_number:'SAMPLE-123',full_name:'Student',program_id:'program-id',year_level:1,status:'active',source_mode:'sample'}],
   '/rest/v1/affairs_programs':[{id:'program-id',name:'Sample General Studies'}],
   '/rest/v1/affairs_terms':[{id:'term-id',label:'Sample Fall 2026',starts_on:'2026-09-07',ends_on:'2027-01-15'}],
   '/rest/v1/affairs_courses':[{id:'course-id',code:'SAMP101',title:'Campus Orientation',credits:2}],
   '/rest/v1/affairs_sections':[{id:'section-id',course_id:'course-id',term_id:'term-id',instructor:'Sample instructor',weekday:1,starts_at:'09:00',ends_at:'10:30',room:'Sample Room'}],
   '/rest/v1/affairs_enrollments':[{id:'enrollment-id',section_id:'section-id',status:'enrolled',source_mode:'sample'}],
   '/rest/v1/affairs_grade_items':[],
   '/rest/v1/affairs_attendance':[],
   '/rest/v1/affairs_charges':[{id:'charge-id',student_id:'student-id',label:'Sample Fall 2026 tuition',amount_due:28000,amount_paid:5000,currency:'TWD',due_on:'2026-12-15',source_mode:'sample'}],
   '/rest/v1/affairs_assignments':[{id:'assignment-id',student_id:'student-id',dtm_course_id:'dtm-course-id',enrollment_id:null,title:'Practice reflection',details:'Sample practice',due_at:'2026-11-18T15:59:00Z',status:'open',submitted_at:null,source_mode:'sample'}],
   '/rest/v1/affairs_announcements':[],
   '/rest/v1/affairs_tasks':[],
   '/rest/v1/affairs_service_requests':[],
   '/rest/v1/affairs_service_records':[],
   '/rest/v1/affairs_scholarship_periods':[],
   '/rest/v1/affairs_scholarship_applications':[],
   '/rest/v1/affairs_student_aid_records':[],
   '/rest/v1/affairs_credit_load_history':[],
   '/rest/v1/affairs_course_selection_records':[],
   '/rest/v1/affairs_academic_grade_records':[],
   '/rest/v1/affairs_academic_term_summaries':[],
   '/rest/v1/affairs_academic_rankings':[],
   '/rest/v1/affairs_academic_metadata':[],
   '/rest/v1/affairs_graduation_reviews':[],
   '/rest/v1/affairs_academic_attendance_statistics':[],
   '/rest/v1/affairs_academic_attendance_details':[],
   '/rest/v1/affairs_academic_attendance_metadata':[],
   '/rest/v1/affairs_housing_periods':[],
   '/rest/v1/affairs_housing_applications':[],
   '/rest/v1/affairs_housing_assignments':[],
   '/rest/v1/dtm_meetings':[],
   '/rest/v1/dtm_grade_items':[],
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
 assert.equal(result.body.verification.status,'verified');
 assert.ok(calls.every(url=>url.startsWith('https://xiftudmvxphxcjtmfmib.supabase.co/')||url==='https://api.openai.com/v1/responses'));
 const dtm=await invoke(affairsHandler,{question:'What DTM materials do I have?',route:'/dtm'},token);
 assert.equal(dtm.status,200);assert.match(dtm.body.answer,/Getting started guide/);assert.match(dtm.body.answer,/sample/i);
 overview=true;
 const account=await invoke(affairsHandler,{question:'what are all my school details',route:'/dtm'},token);
 assert.equal(account.status,200);assert.match(account.body.answer,/Sample General Studies/);assert.match(account.body.answer,/Year level: 1/u);assert.match(account.body.answer,/SAMP101/);assert.match(account.body.answer,/DTM-SAMPLE-101/);assert.doesNotMatch(account.body.answer,/student@example.com/);
 const known=await invoke(affairsHandler,{question:'what details do you know about me',route:'/school-affairs'},token);
 assert.equal(known.status,200);assert.match(known.body.answer,/Sample General Studies/);assert.match(known.body.answer,/Year level: 1/u);assert.match(known.body.answer,/sample/i);
 overview=false;
 const identity=await invoke(affairsHandler,{question:'What is my student number?',route:'/school-affairs'},token);
 assert.equal(identity.status,200);assert.match(identity.body.answer,/SAMPLE-123/);
 const tools=await invoke(affairsHandler,{question:'what tools do you have?',route:'/dtm'},token);
 assert.equal(tools.status,200);assert.match(tools.body.answer,/prepare a task or service request/);assert.match(tools.body.answer,/cannot access or change official university records/i);
 const assignments=await invoke(affairsHandler,{question:'What are my Moodle assignments?',route:'/dtm'},token);
 assert.equal(assignments.status,200);assert.match(assignments.body.answer,/Practice reflection/);assert.match(assignments.body.answer,/sample/i);
 const followup=await invoke(affairsHandler,{question:'how about assignments?',route:'/dtm',history:[{role:'user',content:'What are my current subjects?'}]},token);
 assert.equal(followup.status,200);assert.match(followup.body.answer,/Practice reflection/);assert.equal(followup.body.grounding.source,'account');
 const tomorrow=await invoke(affairsHandler,{question:'and tomorrow?',route:'/school-affairs',history:[{role:'user',content:'What subjects do I have today?'}]},token);
 assert.equal(tomorrow.status,200);assert.match(tomorrow.body.answer,/tomorrow/i);assert.equal(tomorrow.body.grounding.source,'account');
 const fees=await invoke(affairsHandler,{question:'how much is my tuition balance?',route:'/school-affairs'},token);
 assert.equal(fees.status,200);assert.match(fees.body.answer,/NT\$23,000/);assert.equal(fees.body.grounding.source,'account');
 const feeContact=await invoke(affairsHandler,{question:'Which contact unit?',route:'/school-affairs/services/39-1'},token);
 assert.equal(feeContact.status,200);assert.match(feeContact.body.answer,/contact unit not recorded/);assert.equal(feeContact.body.grounding.source,'account');
 const creditHistory=await invoke(affairsHandler,{question:'What is my credit-load history?',route:'/school-affairs/services/11-3'},token);
 assert.equal(creditHistory.status,200);assert.match(creditHistory.body.answer,/No credit-load history records/);assert.equal(creditHistory.body.grounding.source,'account');
 const selectionHistory=await invoke(affairsHandler,{question:'What is my course-selection history?',route:'/school-affairs/services/11-1'},token);
 assert.equal(selectionHistory.status,200);assert.match(selectionHistory.body.answer,/No course-selection records/);assert.equal(selectionHistory.body.grounding.source,'account');
 const phaseFollowup=await invoke(affairsHandler,{question:'semester 1',route:'/school-affairs/services/11-2'},token);
 assert.equal(phaseFollowup.status,200);assert.match(phaseFollowup.body.answer,/No timetable records/);assert.equal(phaseFollowup.body.grounding.source,'account');
 const nativeQueries=[
  {question:'Show my academic transcript',route:'/school-affairs/services/13-1/transcript/',expected:/No.*transcript|no.*records/i},
  {question:'semester 1',route:'/school-affairs/services/13-1/ranking/',expected:/No.*ranking/i},
  {question:'What is my graduation review status?',route:'/school-affairs/services/15-1/',expected:/no saved Academic Services graduation report/i},
  {question:'What is the status?',route:'/school-affairs/services/15-2/',expected:/no saved Legacy graduation report/i},
  {question:'What are the missing credits?',route:'/',history:[{role:'user',content:'My legacy graduation review'}],expected:/no saved Legacy graduation report/i},
  {question:'Show my academic attendance statistics',route:'/school-affairs/services/14-1/',expected:/current term has not been explicitly designated/i},
  {question:'semester 1',route:'/school-affairs/services/14-1/detail/',expected:/No.*attendance|no.*details/i},
 ];
 for(const query of nativeQueries){
  const native=await invoke(affairsHandler,query,token);
  assert.equal(native.status,200,JSON.stringify(native.body));assert.match(native.body.answer,query.expected);
  assert.equal(native.body.grounding.source,'account');assert.doesNotMatch(native.body.answer,/SAMP101|DTM-SAMPLE-101/);
 }
 assert.ok(!calls.some(url=>url.includes('/api/research-assistant')),'private questions must not be sent to public research');
 const events=await invokeStream({question:'What DTM materials do I have?',route:'/dtm'},token);
 assert.equal(events.at(-1)?.type,'result');
 assert.ok(events.some(event=>event.type==='progress' && event.data.kind==='verification-1' && event.data.status==='complete'));
 assert.match(events.at(-1)!.data.answer,/Getting started guide/);
});

test('public image question accepts validated PNG and reports actual image analysis',async()=>{
 configured();const bytes=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(40)]);const dataUrl=`data:image/png;base64,${bytes.toString('base64')}`;
 globalThis.fetch=async(input,init)=>{assert.equal(String(input),'https://api.openai.com/v1/responses');const request=JSON.parse(String(init?.body));assert.equal(request.input[0].content[1].type,'input_image');assert.equal(request.store,false);const value=request.text.format.name==='answer_evidence_review'?{supported:true,answersQuestion:true,claims:[{claim:'The image shows a menu',supported:true,evidenceId:'attached-image',quote:''}]}:{status:'answered',answer:'The screenshot shows a School Affairs menu.',sourceIds:['attached-image']};return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]}),{status:200});};
 const result=await invoke(publicHandler,{question:'Please explain this screenshot',images:[{name:'menu.png',dataUrl}],route:'/school-affairs/menu/swd/input'});
 assert.equal(result.status,200);assert.equal(result.body.grounding.source,'attached-image');assert.match(result.body.answer,/screenshot shows a School Affairs menu/u);assert.deepEqual(result.body.citations,[]);assert.ok(result.body.activity.some((step:any)=>step.kind==='attached-image'));
 const rejected=await invoke(publicHandler,{question:'Explain this',images:[{name:'fake.png',dataUrl:'data:image/png;base64,'+Buffer.alloc(40).toString('base64')} ]});
 assert.equal(rejected.status,400);
});
