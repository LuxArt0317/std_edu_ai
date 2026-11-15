import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler,validateAffairsAssistantRoute} from '../../api/affairs-assistant.ts';
import {AffairsWorkspaceError} from '../../server/affairsWorkspace.js';
import type {SupplementalAccountReadContext,SupplementalAccountReaders} from '../../server/answerVerificationAccount.js';

type Dependencies=Parameters<typeof createAffairsAssistantHandler>[0];
let sequence=0;
const account=()=>({user:{id:'10000000-0000-4000-8000-'+String(++sequence).padStart(12,'0'),email:'synthetic@example.invalid'},
  url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'SYNTHETIC-VERIFIED-KEY',token:'SYNTHETIC-VERIFIED-TOKEN'});
const answer={status:'answered',answer:'Synthetic verified result.',citations:[],verification:{status:'verified'}};
const endpoint='/school-affairs/services/12-3';
const fullRoute=endpoint+'?search_scope=current&keyword='+encodeURIComponent('課'.repeat(150))+'&term=1151&department=IM&themes=1&searched=1&syllabus=20000000-0000-4000-8000-000000000001';
async function invoke(dependencies:Dependencies,body:unknown,method='POST'){
  const output:{status:number;body:any;headers:Record<string,string>}={status:200,body:null,headers:{}};
  const response={status(value:number){output.status=value;return response;},json(value:unknown){output.body=value;},setHeader(name:string,value:string){output.headers[name]=value;}};
  await createAffairsAssistantHandler(dependencies)({method,body,headers:{authorization:'Bearer SYNTHETIC-REQUEST-TOKEN'}},response);
  return output;
}
function base(overrides:Dependencies={}):Dependencies {
  const verified=account();
  return {verifyToken:async token=>{assert.equal(token,'SYNTHETIC-REQUEST-TOKEN');return verified;},loadSnapshot:async()=>({profile:{userId:verified.user.id},officialUniversityData:false,assignments:[],dtm:{courses:[]}}),
    answerAccount:async()=>answer,publicResearch:async()=>{assert.fail('Private question must not enter public research.');},...overrides};
}

test('full validated local routes retain encoded selectors past250 characters and accept exactly3100',()=>{
  assert.ok(fullRoute.length>250);assert.equal(validateAffairsAssistantRoute(fullRoute),fullRoute);
  assert.equal(validateAffairsAssistantRoute('https://stu.best'+fullRoute),fullRoute);
  assert.equal(validateAffairsAssistantRoute(endpoint+'/?keyword=A%20B&term=1151'),endpoint+'?keyword=A%20B&term=1151');
  const longest=endpoint+'?keyword='+'x'.repeat(3100-(endpoint+'?keyword=').length);
  assert.equal(longest.length,3100);assert.equal(validateAffairsAssistantRoute(longest),longest);
  assert.equal(validateAffairsAssistantRoute(undefined),'');assert.equal(validateAffairsAssistantRoute('/'),'/');assert.equal(validateAffairsAssistantRoute('/?query=school'),'/?query=school');
});

test('unsafe, malformed, fragmented or oversized routes fail before authentication or private work',async()=>{
  const invalid=[null,2,{},'//other.invalid/dtm','https://stu.edu.tw/dtm','https://stu.best.evil.invalid/dtm','http://stu.best/dtm',
    'https://user:pass@stu.best/dtm','https://stu.best:444/dtm','/dtm#private','/dtm?x=a#b','/dtm\\route',' /dtm','/dtm\n',
    '/school-affairs/../dtm','/school-affairs/%2e%2e/dtm','/dtm/%2fadmin','/dtm/%5cadmin','/dtm?key=%00','/dtm?%0a=value','/dtm/%xx','/dtm/\ud800',
    '/dtm?x='+'x'.repeat(3100)];
  for(const route of invalid){
    let auth=0;const result=await invoke(base({verifyToken:async()=>{auth++;throw new Error('No authentication expected');}}),{question:'Show the syllabus.',route});
    assert.equal(result.status,400,JSON.stringify(route));assert.equal(auth,0);assert.match(result.body.error,/local page route/);
  }
});

test('required supplemental domains and page followups use account routing without the word my',async()=>{
  const cases=[['What courses are available?',endpoint],['Show enrollment certificate status.','/school-affairs/services/17-1'],
    ['What is the status?','/school-affairs/services/17-1'],['Show tuition settlement.','/school-affairs/services/49-1'],
    ['What does this say?','/school-affairs/services/38-1'],['What does this say?','/school-affairs/services/21-1/history'],
    ['What does this say?','/school-affairs/services/49-1'],['Show saved assignment files.','/dtm'],['What feedback was recorded?','/dtm/course/20000000-0000-4000-8000-000000000001/assignment/20000000-0000-4000-8000-000000000002'],
    ['What tax is recorded?','/school-affairs/services/37-1/salary'],['List saved student aid claims.','/dtm'],
    ['Show saved Moodle grades.','/'],['What is on this page?','/dtm/grades'],
    ['Which remote-learning Moodle courses am I enrolled in?','/elearning/my-courses'],['What are my courses?','/elearning/my-courses'],
    ['What about reports?','/school-affairs/services/36-1?page=2'],['What is the status?','/school-affairs/services/29-1/appointments']];
  for(const [question,route]of cases){let calls=0;
    const result=await invoke(base({answerAccount:async options=>{calls++;assert.equal(options.question,question);assert.equal(options.route,route);
      assert.deepEqual(Object.keys(options.supplementalReaders??{}),['dtmAssignment','courseCatalog','enrollmentCertificate','dtmSubmissions','studentConduct','studentLoan','aidPayments','dtmGradeReport','elearningEnrollments','facilityRepairs','dormitoryConduct','elearningOutline','feeRemission','healthExaminations','counselingAppointments','tutorEvaluation','graduationClearance','tuition','teachingFeedback']);return answer;}}),{question,route});
    assert.equal(result.status,200,question);assert.equal(calls,1,question);
  }
});

test('foreign salary, aid and DTM grade requests are denied after auth with zero private or public lookups',async()=>{
  const disallowed=async()=>{assert.fail('A rejected account scope must not load or search records.');};
  for(const question of ['Show another student’s student salary records.','List another student’s financial aid claims.',
    'Show my classmate’s Moodle grades.','Show the Moodle grade report for student s12345678.',
    'Show another student’s remote-learning Moodle enrollments.']){
    const result=await invoke(base({loadSnapshot:disallowed,answerAccount:disallowed,publicResearch:disallowed}),{question,route:'/dtm'});
    assert.equal(result.status,200);assert.equal(result.body.status,'handoff');assert.equal(result.body.grounding.webSearched,false);
    assert.match(result.body.answer,/only check your signed-in stu\.best account/iu);
    assert.deepEqual(result.body.citations,[]);assert.equal(result.body.proposedAction,undefined);
  }
});

test('remote-learning-only answers avoid loading unrelated School Affairs and DTM snapshots',async()=>{
  let verified=0;
  const result=await invoke(base({
    loadSnapshot:async()=>assert.fail('No broader account snapshot expected'),
    answerAccount:async options=>{
      assert.deepEqual(Object.keys(options.snapshot).sort(),['checkedAt','profile']);
      assert.equal((await options.loadSnapshot()).profile.userId,options.snapshot.profile.userId);
      assert.equal(typeof options.supplementalReaders?.elearningEnrollments,'function');
      verified++;
      return answer;
    },
  }),{question:'What are my courses?',route:'/elearning/my-courses'});
  assert.equal(result.status,200);
  assert.equal(verified,1);
});

test('callbacks capture verified credentials, preserve full selectors and use fresh graph snapshots with bounded deadlines',async()=>{
  const verified=account(),expected=structuredClone(verified),reads:{tool:string;input:any}[]=[],snapshots:any[]=[];
  const history=[{role:'user',content:'Show the course catalog.'}],question='Show the syllabus and certificate status and saved assignment files and tuition settlement.';
  const mockReader=(tool:string)=>async (selected:typeof verified,input:any)=>{
    assert.deepEqual(selected,expected);assert.ok(Object.isFrozen(selected));assert.ok(Object.isFrozen(selected.user));reads.push({tool,input:structuredClone(input)});
    return {readState:'unavailable',reason:'synthetic',evidence:{id:'account:'+tool,title:'Synthetic',url:'/dtm',content:'{}'}};
  };
  let loads=0;
  const result=await invoke(base({verifyToken:async()=>verified,
    loadSnapshot:async(selected,_admin,options)=>{
      assert.deepEqual(selected,expected);assert.equal(_admin,false);assert.ok(options?.deadline&&options.deadline>Date.now());
      if(loads)assert.equal(options?.initialize,false);
      const snapshot={profile:{userId:expected.user.id},revision:++loads};snapshots.push(snapshot);
      verified.user.id='10000000-0000-4000-8000-999999999999';verified.url='https://other.invalid';verified.key='MUTATED';verified.token='MUTATED';
      return snapshot;
    },readers:{courseCatalog:mockReader('courseCatalog') as any,enrollmentCertificate:mockReader('enrollmentCertificate') as any,dtmSubmissions:mockReader('dtmSubmissions') as any,tuition:mockReader('tuition') as any},
    answerAccount:async options=>{
      const encoded=JSON.stringify(options);for(const secret of [expected.token,expected.key,expected.url,expected.user.email])assert.equal(encoded.includes(secret),false,secret);
      assert.equal(options.route,fullRoute);assert.equal(options.snapshot,snapshots[0]);
      const callbacks=options.supplementalReaders as SupplementalAccountReaders;
      assert.equal(reads.length,0,'Readers remain lazy until selected by the graph.');
      const catalogQuery={search_scope:'historical' as const,keyword:'database'};
      const context:SupplementalAccountReadContext={question:'Untrusted replacement',route:'/different',history:[],snapshot:options.snapshot,deadline:options.deadline!+60000,catalogQuery};
      await callbacks.courseCatalog!(context);await callbacks.enrollmentCertificate!(context);await callbacks.tuition!(context);
      const refreshed=await options.loadSnapshot();await callbacks.dtmSubmissions!({...context,snapshot:refreshed,deadline:Date.now()+5000});
      for(const read of reads){assert.equal(read.input.question,question);assert.equal(read.input.route,fullRoute);assert.ok(read.input.deadline<=options.deadline!);}
      assert.deepEqual(reads.find(read=>read.tool==='courseCatalog')!.input.query,catalogQuery);
      assert.deepEqual(reads.find(read=>read.tool==='enrollmentCertificate')!.input.history,history);
      assert.equal(reads.find(read=>read.tool==='dtmSubmissions')!.input.snapshot.revision,2);
      await assert.rejects(async()=>callbacks.tuition!({...context,deadline:NaN}),/Invalid account reader deadline/);
      return answer;
    }}),{question,route:fullRoute,history});
  assert.equal(result.status,200);assert.equal(loads,2);assert.deepEqual(reads.map(read=>read.tool),['courseCatalog','enrollmentCertificate','tuition','dtmSubmissions']);
});

test('unselected callbacks never read records and private images stop before snapshots or model work',async()=>{
  let reads=0,loads=0,models=0;const reader=async()=>{reads++;throw new Error('Not selected');};
  const deps=base({loadSnapshot:async()=>{loads++;return {};},answerAccount:async()=>{models++;return answer;},
    readers:{courseCatalog:reader,enrollmentCertificate:reader,dtmSubmissions:reader,tuition:reader}});
  const result=await invoke(deps,{question:'Show enrollment certificate status.',route:'/school-affairs/services/17-1'});
  assert.equal(result.status,200);assert.equal(reads,0);assert.equal(loads,1);assert.equal(models,1);
  const image=await invoke(deps,{question:'Show the course syllabus.',route:endpoint,images:[{dataUrl:'data:image/png;base64,AAA='}]});
  assert.equal(image.status,400);assert.match(image.body.error,/remove the image/);assert.equal(reads,0);assert.equal(loads,1);assert.equal(models,1);
});

test('production callback defaults invoke only the four reviewed caller-scoped read transports',async()=>{
  const originalFetch=globalThis.fetch,verified=account(),courseId='20000000-0000-4000-8000-000000000001',assignmentId='20000000-0000-4000-8000-000000000002';
  const snapshot={profile:{userId:verified.user.id},officialUniversityData:false,assignments:[{id:assignmentId,userId:verified.user.id,dtmCourseId:courseId,title:'UploadCheck',sourceMode:'personal'}],
    dtm:{courses:[{id:courseId,userId:verified.user.id,title:'Synthetic course',code:'QA1',sourceMode:'personal'}]}};
  const paths:string[]=[];
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));paths.push(url.pathname);assert.equal(url.origin,verified.url);
    const headers=new Headers(init?.headers);assert.equal(headers.get('Authorization'),'Bearer '+verified.token);assert.equal(headers.get('apikey'),verified.key);
    if(url.pathname==='/rest/v1/rpc/affairs_syllabus_search'){
      assert.equal(init?.method,'POST');assert.doesNotMatch(String(init?.body),/user_id|SYNTHETIC/);
      return Response.json({scope:'historical',total:0,rows:[],page:0,pageSize:20,hasMore:false,sort:{key:'course_code',direction:'asc'},revision:'a'.repeat(32)});
    }
    if(url.pathname==='/rest/v1/rpc/dtm_submission_workspace'){
      assert.equal(init?.method,'POST');assert.deepEqual(JSON.parse(String(init?.body)),{p_assignment_id:assignmentId});
      return Response.json({assignmentId,userId:verified.user.id,courseId,dueAt:null,maxBytes:10485760,submission:null,files:[],reviews:[]});
    }
    assert.ok(['/rest/v1/affairs_enrollment_certificate_assessments','/rest/v1/affairs_tuition_settlements'].includes(url.pathname),url.pathname);
    assert.equal(init?.method,'GET');assert.equal(url.searchParams.get('user_id'),'eq.'+verified.user.id);return Response.json([]);
  };
  try{
    const result=await invoke(base({verifyToken:async()=>verified,loadSnapshot:async()=>snapshot,answerAccount:async options=>{
      const context:SupplementalAccountReadContext={question:options.question,route:options.route!,history:options.history!,snapshot:options.snapshot,deadline:options.deadline!};
      const callbacks=options.supplementalReaders as SupplementalAccountReaders;
      for(const [key,expectedState]of [['courseCatalog','empty'],['enrollmentCertificate','empty'],['dtmSubmissions','ok'],['tuition','empty']] as const){
        const evidence=await callbacks[key]!(context);assert.equal(evidence.evidence.id,'account:'+key);assert.equal(evidence.readState,expectedState,JSON.stringify(evidence));
      }
      return answer;
    }}),{question:'Show the course catalog, enrollment certificate status, UploadCheck assignment files and tuition settlement.',route:'/'});
    assert.equal(result.status,200);assert.deepEqual(paths,['/rest/v1/rpc/affairs_syllabus_search','/rest/v1/affairs_enrollment_certificate_assessments','/rest/v1/rpc/dtm_submission_workspace','/rest/v1/affairs_tuition_settlements']);
  }finally{globalThis.fetch=originalFetch;}
});

test('public forwarding has no account credentials, private history or image metadata',async()=>{
  let forwarded:any,loads=0;const result=await invoke(base({loadSnapshot:async()=>{loads++;return {};},publicResearch:async(request,response)=>{forwarded=request;response.status(200).json({status:'answered',answer:'Public school information.',citations:[]});}}),
    {question:'Where is campus Wi-Fi help available?',route:'/',history:[{role:'user',content:'PRIVATE ACCOUNT HISTORY'}],images:[{name:'image.png',dataUrl:'data:image/png;base64,AAA=',owner:'PRIVATE OWNER'}]});
  assert.equal(result.status,200);assert.equal(loads,0);assert.deepEqual(forwarded.body.history,[]);assert.deepEqual(forwarded.body.images,[{name:'image.png',dataUrl:'data:image/png;base64,AAA='}]);
  assert.equal(forwarded.body.route,'/');assert.equal(forwarded.body.consentedResearchUse,false);assert.equal(forwarded.headers.authorization,undefined);
  assert.doesNotMatch(JSON.stringify(forwarded),/VERIFIED|REQUEST-TOKEN|PRIVATE ACCOUNT HISTORY|PRIVATE OWNER|access_token|refresh_token/);
});

test('failed authentication and unchanged method/rate limits prevent all private execution',async()=>{
  let calls=0;const noCalls=async()=>{calls++;return {};};
  const denied=await invoke(base({verifyToken:async()=>{throw new AffairsWorkspaceError('Sign in required.',401);},loadSnapshot:noCalls}),{question:'Show enrollment certificate status.'});
  assert.equal(denied.status,401);assert.equal(calls,0);
  const invalidMethod=await invoke(base({verifyToken:async()=>{calls++;return account();}}),{},'GET');assert.equal(invalidMethod.status,405);assert.equal(invalidMethod.headers.Allow,'POST');assert.equal(calls,0);
  const stable=account(),deps=base({verifyToken:async()=>stable,loadSnapshot:noCalls});
  for(let index=0;index<24;index++)assert.equal((await invoke(deps,{question:'Show enrollment certificate status.'})).status,200);
  const throttled=await invoke(deps,{question:'Show enrollment certificate status.'});assert.equal(throttled.status,429);assert.equal(calls,24);
});
