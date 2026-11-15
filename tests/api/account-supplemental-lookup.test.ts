import assert from 'node:assert/strict';
import {test} from 'node:test';
import {accountTools,answerAccountWithVerification,planAccountLookup,accountEvidence} from '../../server/answerVerificationAccount.js';
import {supplementalAccountTools,requiredSupplementalTools,readSupplementalLookups,boundSupplementalResults,validateCatalogReadPlan,type SupplementalAccountReaders} from '../../server/accountSupplementalLookup.js';
import {formatSupplementalAccountAnswers,type SupplementalEvidenceResult} from '../../server/supplementalAccountAnswers.js';
import {readCertificateEvidence} from '../../server/accountCertificateEvidence.js';
import {readTuitionEvidence} from '../../server/accountTuitionEvidence.js';
import {readSubmissionEvidence} from '../../server/accountSubmissionEvidence.js';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {readStudentConductEvidence} from '../../server/accountStudentConductEvidence.js';
import {readStudentLoanEvidence} from '../../server/accountStudentLoanEvidence.js';
import {readAidPaymentsEvidence} from '../../server/accountAidPaymentsEvidence.js';
import {readDtmGradeReportEvidence} from '../../server/accountDtmGradeReportEvidence.js';
import {buildAccountFixture,fixtureForCase,EVAL_USER_ID,evalId} from '../evaluation/fixtures.mjs';

const stamp='2026-11-13T02:00:00Z',account={user:{id:EVAL_USER_ID},url:'https://xiftudmvxphxcjtmfmib.supabase.co',token:'SECRET-CALLER',key:'SECRET-KEY'};
const snapshot=()=>buildAccountFixture();
const certificate=(status='blocked')=>readCertificateEvidence(account,{question:'Show my enrollment certificate.'},{load:async()=>({documents:[],assessments:[{
  id:evalId(801),userId:EVAL_USER_ID,sourceMode:'local_demo',version:1,createdAt:stamp,updatedAt:stamp,academicYear:115,semester:1,hasPendingFees:'N',status,resultText:'Literal '+status,assessedAt:null,
  identity:{studentNumber:'PRIVATE-STUDENT',studentName:'PRIVATE-NAME',departmentName:'PRIVATE-DEPARTMENT',yearText:'3',classLabel:'A'},
}]})});
const tuition=()=>readTuitionEvidence(account,{question:'Show my tuition settlement.'},{load:async()=>({periods:[],settlements:[],documents:[]})});
function catalog(count=1,padding=''){
  const payload={collection:'courseCatalog',readState:'ok',checkedAt:stamp,provenance:{sourceMode:'sample',officialUniversityData:false,enrollmentEvidence:false},omittedFields:[],
    counts:{total:count,returnedRows:count,includedRows:count,hasMore:false,complete:true},rows:Array.from({length:count},(_,i)=>({id:evalId(900+i),sequence:i+1,course_code:'CAT'+i,course_name:'Course '+i+padding,instructor:'Teacher',admission_name:'Day',academicYearText:'115',semesterText:'1'}))};
  return {readState:'ok',reason:null,evidence:{id:'account:courseCatalog',title:'Published sample catalog',url:'/school-affairs/services/12-4',urls:['/school-affairs/services/12-4'],content:JSON.stringify(payload)}} as SupplementalEvidenceResult;
}
const review=(source='account:enrollmentCertificate',path='/assessment/status')=>({supported:true,answersQuestion:true,claims:[{claim:'Recorded assessment status',supported:true,evidenceId:source,jsonPaths:[path],quotes:[]}]});
async function model(operation:(input:{name:string;payload:any;body:any})=>unknown,run:()=>Promise<void>){
  const fetch=globalThis.fetch,key=process.env.OPENAI_API_KEY,warn=console.warn;process.env.OPENAI_API_KEY='synthetic-provider-key';console.warn=()=>{};
  let fixtureError:unknown;
  globalThis.fetch=async(url,init)=>{
    try{
      assert.equal(new URL(String(url)).hostname,'api.openai.com','Unexpected network attempt is prohibited.');
      const body=JSON.parse(String(init?.body)),payload=JSON.parse(body.input[0].content[0].text),result=operation({name:body.text.format.name,payload,body});
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
    }catch(error){fixtureError??=error;throw error;}
  };
  try{await run();}finally{
    globalThis.fetch=fetch;console.warn=warn;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;
    if(fixtureError)throw fixtureError;
  }
}

test('discoverable supplemental tools stay distinct from snapshot and scoped account tools',()=>{
  assert.deepEqual(Object.keys(accountTools),['profile','courses','assignments','dtm','charges','tasks','requests','serviceRecords',
    'announcements','scholarship','studentAid','housing','housingApplications','creditLoadHistory','courseSelection','academicGrades',
    'graduationReview','academicAttendance']);
  assert.deepEqual(Object.keys(supplementalAccountTools),['internshipRecords','leaveRecords','courseCatalog','enrollmentCertificate','dtmSubmissions','studentConduct','studentLoan','tuition','aidPayments','dtmAssignment','dtmGradeReport','elearningEnrollments','facilityRepairs','dormitoryConduct','feeRemission','tutorEvaluation','teachingFeedback','graduationClearance','counselingAppointments','healthExaminations','elearningOutline']);
  assert.ok(accountEvidence(snapshot()).every(source=>!Object.keys(supplementalAccountTools).some(key=>source.id==='account:'+key)));
  assert.deepEqual(requiredSupplementalTools('Show my enrollment certificate and tuition settlement.'),['enrollmentCertificate','tuition']);
});

test('catalog selectors are strict, retain only supplied fields and cannot select a table, owner or URL',()=>{
  assert.deepEqual(validateCatalogReadPlan({keyword:'Database Design',term:'1151',department:'IM'}),{keyword:'Database Design',term:'1151',department:'IM'});
  assert.deepEqual(validateCatalogReadPlan({keyword:null}),{});assert.equal(validateCatalogReadPlan(null),null);
  for(const value of [{user_id:EVAL_USER_ID},{url:'https://other.invalid'},{keyword:['wrong']},{id:evalId(900),keyword:'Different'},{themes:'1,1'},{page_size:'51'},{page:'1001'},Object.create({keyword:'Hidden'})])assert.throws(()=>validateCatalogReadPlan(value));
});

test('existing planner call emits structured named catalog selectors and preserves the full route',async()=>{
  const route='/school-affairs/services/12-3?search_scope=historical&keyword=Database+Design&term=1151&department=IM&themes=1%2C26&searched=1';let calls=0;
  await model(({name,payload,body})=>{calls++;assert.equal(name,'account_lookup_plan');assert.equal(payload.route,route);assert.deepEqual(Object.keys(payload.availableTools),Object.keys({...accountTools,...supplementalAccountTools}));assert.ok(body.text.format.schema.properties.catalogQuery);
    return {tools:['courseCatalog'],publicTopics:[],catalogQuery:{keyword:'Database Design',term:'1151',department:'IM',themes:'1,26'},action:null};
  },async()=>{const plan=await planAccountLookup('Show the Database Design syllabus for term1151 inIM.',[],route,Date.now()+5000);assert.deepEqual(plan.tools,['courseCatalog']);assert.equal(plan.catalogQuery?.keyword,'Database Design');});
  assert.equal(calls,1);
});

test('planner failure retains required capabilities without querying unrelated default or supplemental collections',async()=>{
  await model(()=>({tools:['arbitrary_sql'],publicTopics:[],catalogQuery:null}),async()=>{
    const plan=await planAccountLookup('Show my enrollment certificate.',[],'/',Date.now()+5000);
    assert.equal(plan.degraded,true);assert.deepEqual(plan.tools,['enrollmentCertificate']);
    assert.ok(!plan.tools.includes('courseCatalog')&&!plan.tools.includes('tuition')&&!plan.tools.includes('dtmSubmissions'));
  });
});

test('salary amounts and student aid claims do not retrieve tuition or the separate subsidy collection',async()=>{
  await model(()=>({tools:['charges','studentAid'],publicTopics:[],catalogQuery:null}),async()=>{
    const single=await planAccountLookup('What amount paid and tax are in my student salary records?',[],'/dtm',Date.now()+5000);
    assert.deepEqual(single.tools,['aidPayments']);
    const mixed=await planAccountLookup('Show my student salary records and the status of my disadvantaged student aid application and my tuition balance.',[],'/',Date.now()+5000);
    assert.deepEqual(new Set(mixed.tools),new Set(['aidPayments','studentAid','charges']));
  });
});

test('native Moodle grade questions work from the homepage without unrelated grade or assignment collections',async()=>{
  await model(()=>({tools:['courses','dtm','assignments','dtmSubmissions'],publicTopics:[],catalogQuery:null}),async()=>{
    for(const question of ['Show my Moodle grades','What are my Moodle grades for the Database assignment?','我的數位教材成績']){
      const plan=await planAccountLookup(question,[],'/',Date.now()+5000);
      assert.deepEqual(plan.tools,['dtmGradeReport'],question);
    }
    const mixed=await planAccountLookup('Show my Moodle grades and list my unfinished assignments.',[],'/',Date.now()+5000);
    assert.deepEqual(new Set(mixed.tools),new Set(['dtmGradeReport','assignments','dtm']));
    const explicitTracker=await planAccountLookup('Show my personal DTM grade tracker.',[],'/dtm/grades',Date.now()+5000);
    assert.equal(explicitTracker.tools.includes('dtmGradeReport'),false);
    assert.equal(explicitTracker.tools.includes('dtm'),true);
  });
});

test('authenticated endpoint reads the native Moodle report and verifies its saved feedback and weight',async()=>{
  const courseId=evalId(801),question='What feedback and weight are in my Moodle grade report for Native Quiz in Research Lab?';
  const route='/dtm/course/'+courseId+'/grades',calls:string[]=[];
  const emptyCells={score:null,maximum:null,gradeText:null,rangeText:null,percentageText:null,weightText:null,weightNote:null,
    rankText:null,feedbackText:null,contributionText:null};
  let reads=0;
  await model(({name})=>{
    calls.push(name);
    return assert.fail('An exact item question should check the typed row without a model');
  },async()=>{
    let body:any,status=200;
    const handler=createAffairsAssistantHandler({
      verifyToken:async token=>{assert.equal(token,'browser-synthetic-token');return account;},
      loadSnapshot:async()=>assert.fail('A native-only report must not read the general snapshot.'),
      publicResearch:async()=>assert.fail('A native report must never enter public research.'),
      readers:{dtmGradeReport:(authorized,input)=>readDtmGradeReportEvidence(authorized,input,{
        loadOverview:async selected=>({courses:[{id:courseId,userId:selected.user.id,title:'Research Lab',code:'QA801',term:'115-1',gradeText:null}],limit:100,nextCursor:null}),
        loadReport:async(selected,{courseId:selectedCourse})=>{
          reads++;
          assert.equal(selected.token,account.token);
          assert.equal(selectedCourse,courseId);
          return {report:{id:evalId(802),userId:selected.user.id,courseId,version:1,sourceMode:'local_demo',
            createdAt:stamp,updatedAt:stamp,total:null,items:[{...emptyCells,id:evalId(803),label:'Native Quiz',
              activityKind:null,feedbackText:'Explain the index choice',weightText:'0.00 %'}]}};
        },
      })},
    });
    const response={status(value:number){status=value;return response;},json(value:unknown){body=value;},setHeader(){}};
    await handler({method:'POST',headers:{authorization:'Bearer browser-synthetic-token'},body:{question,route}},response);
    assert.equal(status,200);
    assert.equal(body.verification.status,'verified');
    assert.equal(body.verification.attempts,1);
    assert.match(body.answer,/Explain the index choice/u);
    assert.match(body.answer,/0\.00 %/u);
    assert.doesNotMatch(JSON.stringify(body),/SECRET-CALLER|SECRET-KEY|Displayed grade text/u);
    assert.ok(body.citations.some((citation:any)=>citation.chunkId==='account:dtmGradeReport'&&citation.url===route));
    assert.equal(body.views[0]?.url,route);
  });
  assert.equal(reads,1);
  assert.deepEqual(calls,[]);
});

test('graph verifies literal net and zero tax from the same native aid read without a model call',async()=>{
  const question='How many student salary records are saved for my account? Also show net pay and tax for each period.';
  const route='/school-affairs/services/37-1/salary';
  let reads=0;
  await model(({name})=>assert.fail('This scoped numeric lookup does not require '+name),async()=>{
    const data=snapshot();
    const result=await answerAccountWithVerification({question,route,snapshot:data,loadSnapshot:async()=>data,supplementalReaders:{
      aidPayments:({question,route,history,deadline})=>readAidPaymentsEvidence(account,{question,route,history,deadline},{read:async(_selected,query)=>{
        reads++;assert.deepEqual(query,{scope:'aid-payments',view:'salary',page:'1'});
        const row={id:evalId(919),appointment_type:'Campus student assistant',payment_period:'2026-09 local period',rate:null,work_units:null,gross:null,
          employer_labor:null,employer_health:null,employer_pension:null,employer_supplement:null,subtotal:null,student_labor:null,student_health:null,
          student_pension:null,student_supplement:null,tax:0,net:5400,bank_last4:'6543'};
        return {userId:account.user.id,view:'salary',total:1,rows:[row]};
      }}),
    }});
    assert.deepEqual(result.verification,{status:'verified',attempts:1});
    assert.match(result.answer,/1 saved student salary/u);
    assert.match(result.answer,/2026-09 local period[^\n]*Tax: 0\. Net pay: 5400/u);
    assert.doesNotMatch(JSON.stringify(result),/6543|account-read:(?:charges|studentAid)/);
    assert.equal(result.views?.[0]?.url,route);
    assert.deepEqual(result.views?.[0]?.rows,[['2026-09 local period','0','5400']]);
  });
  assert.equal(reads,1);
});

test('non-catalog transient query parameters never enter the model planner',async()=>{
  await model(({payload})=>{assert.equal(payload.route,'/school-affairs/auth/callback');assert.doesNotMatch(JSON.stringify(payload),/PRIVATE-OAUTH-CODE/);return {tools:['profile'],publicTopics:[],catalogQuery:null,action:null};},
    async()=>{await planAccountLookup('Show my account.',[],'/school-affairs/auth/callback?code=PRIVATE-OAUTH-CODE',Date.now()+3000);});
});

test('undocumented catalog query fields do not enter the planner or become catalog selectors',async()=>{
  const route='/school-affairs/services/12-3?keyword=Database&access_token=PRIVATE-CATALOG-TOKEN';
  await model(({payload})=>{assert.equal(payload.route,'/school-affairs/services/12-3');assert.doesNotMatch(JSON.stringify(payload),/PRIVATE-CATALOG-TOKEN/);return {tools:['courseCatalog'],publicTopics:[],catalogQuery:null,action:null};},
    async()=>{const plan=await planAccountLookup('Explain this page.',[],route,Date.now()+3000);assert.equal(plan.catalogQuery,null);});
});

test('dispatcher runs only selected callbacks, shares deadlines and never fabricates success for absent readers',async()=>{
  let certificateCalls=0,otherCalls=0;const events:any[]=[],deadline=Date.now()+3000;
  const results=await readSupplementalLookups({tools:['enrollmentCertificate','unknown'],question:'Show my certificate',snapshot:snapshot(),deadline,onProgress:step=>events.push(step),readers:{
    enrollmentCertificate:async context=>{certificateCalls++;assert.equal(context.deadline,deadline);assert.equal(context.question,'Show my certificate');assert.equal('token' in context,false);return certificate();},
    tuition:async()=>{otherCalls++;return tuition();},
  }});
  assert.equal(certificateCalls,1);assert.equal(otherCalls,0);assert.equal(results[0].readState,'ok');assert.deepEqual(events.map(step=>step.status),['running','complete']);
  const missing=await readSupplementalLookups({tools:['dtmSubmissions'],question:'My file?',snapshot:snapshot(),deadline});
  assert.equal(missing[0].readState,'unavailable');assert.equal(missing[0].reason,'reader_unavailable');assert.equal(JSON.parse(missing[0].evidence.content).counts.available,null);
});

test('catalog routes and planned queries are forwarded intact; unresolved names fail without first-page substitution',async()=>{
  let calls=0;const readers:SupplementalAccountReaders={courseCatalog:async context=>{calls++;assert.ok(context.route.length>250);assert.equal(context.catalogQuery,undefined);return catalog();}};
  const route='/school-affairs/services/12-3?keyword='+encodeURIComponent('課'.repeat(40))+'&term=1151&searched=1';
  const result=await readSupplementalLookups({tools:['courseCatalog'],readers,question:'Explain this page.',route,snapshot:snapshot(),deadline:Date.now()+3000});
  assert.equal(result[0].readState,'ok');assert.equal(calls,1);
  const noSelection=await readSupplementalLookups({tools:['courseCatalog'],readers,question:'Explain the named Database Design syllabus.',route:'/school-affairs/services/12-3',snapshot:snapshot(),deadline:Date.now()+3000});
  assert.equal(noSelection[0].reason,'catalog_selection_unavailable');assert.equal(calls,1);
  const query={keyword:'Database Design'};
  await readSupplementalLookups({tools:['courseCatalog'],question:'Show Database Design',route:'/',catalogQuery:query,snapshot:snapshot(),deadline:Date.now()+3000,readers:{courseCatalog:async context=>{assert.deepEqual(context.catalogQuery,query);return catalog();}}});
});

test('callback source mismatch, malformed response and expired deadlines remain unavailable without record claims',async()=>{
  const deadline=Date.now()+3000;
  for(const value of [await tuition(),{readState:'empty',evidence:{id:'account:enrollmentCertificate',content:'invalid'}}]){
    const result=await readSupplementalLookups({tools:['enrollmentCertificate'],question:'Certificate?',snapshot:snapshot(),deadline,readers:{enrollmentCertificate:async()=>value as SupplementalEvidenceResult}});
    assert.equal(result[0].readState,'unavailable');assert.equal(result[0].reason,'read_failed');assert.equal(formatSupplementalAccountAnswers(result).status,'abstained');
  }
  let calls=0;const expired=await readSupplementalLookups({tools:['enrollmentCertificate'],question:'Certificate?',snapshot:snapshot(),deadline:Date.now()-1,readers:{enrollmentCertificate:async()=>{calls++;return certificate();}}});
  assert.equal(calls,0);assert.equal(expired[0].reason,'deadline_exceeded');
});

test('pretransport failures report unavailable without claiming that a reader ran',async()=>{
  const cases=[
    {tools:['enrollmentCertificate'],deadline:Date.now()-1},
    {tools:['enrollmentCertificate'],deadline:Date.now()+3000},
    {tools:['courseCatalog'],deadline:Date.now()+3000,readers:{courseCatalog:async()=>{throw new Error('Selection must prevent this call.');}}},
  ];
  for(const options of cases){
    const events:any[]=[];
    const results=await readSupplementalLookups({...options,question:'Show the Database Design syllabus.',snapshot:snapshot(),onProgress:step=>events.push(step)});
    assert.equal(results[0].readState,'unavailable');assert.deepEqual(events.map(step=>step.status),['unavailable']);
  }
});

test('bounded reads run at concurrency two and hung readers cannot overrun the deadline or later claim completion',async()=>{
  let active=0,maximum=0;const readers:SupplementalAccountReaders={
    enrollmentCertificate:async()=>{active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,10));active--;return certificate();},
    tuition:async()=>{active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,10));active--;return tuition();},
    courseCatalog:async()=>{active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,10));active--;return catalog();},
  };
  const result=await readSupplementalLookups({tools:Object.keys(readers),readers,question:'Show all',catalogQuery:{},snapshot:snapshot(),deadline:Date.now()+3000});assert.equal(result.length,3);assert.equal(maximum,2);
  const events:any[]=[];const hung=await readSupplementalLookups({tools:['enrollmentCertificate'],readers:{enrollmentCertificate:async()=>new Promise(()=>{})},question:'Certificate?',snapshot:snapshot(),deadline:Date.now()+15,onProgress:step=>events.push(step)});
  assert.equal(hung[0].reason,'deadline_exceeded');assert.deepEqual(events.map(step=>step.status),['running','unavailable']);
});

test('aggregate budgeting removes whole source rows with truthful coverage and keeps input untouched',async()=>{
  const large=catalog(35,'L'.repeat(130)),inputs=[large,await certificate(),await tuition()],before=structuredClone(inputs);
  assert.ok(Buffer.byteLength(JSON.stringify(large))<=18000);
  const result=boundSupplementalResults(inputs,6000);assert.ok(Buffer.byteLength(JSON.stringify(result))<=6000);assert.deepEqual(inputs,before);
  const source=result.find(row=>row.evidence.id==='account:courseCatalog')!,p=JSON.parse(source.evidence.content);
  assert.equal(source.readState,'partial');assert.equal(p.counts.returnedRows,35);assert.equal(p.counts.includedRows,p.rows.length);assert.ok(p.rows.length<35);assert.equal(p.counts.complete,false);
  assert.ok(p.rows.every((row:any)=>row.course_name.length>130));formatSupplementalAccountAnswers(result);
});

test('the residual snapshot allocation stays within the shared private70KB envelope',async()=>{
  const snap=snapshot() as Record<string,any>;
  snap.serviceRecords=Array.from({length:80},(_,index)=>({id:evalId(3000+index),serviceKey:'29-1',title:'Saved note '+index,notes:'字'.repeat(3000),status:'open',userId:EVAL_USER_ID}));
  const base=accountEvidence(snap,undefined,{budget:16000});assert.ok(Buffer.byteLength(JSON.stringify(base))<=16000);
  const supplemental=boundSupplementalResults([catalog(35,'L'.repeat(130)),await certificate(),await tuition()]);
  const extra=supplemental.map(result=>result.evidence),budget=70000-Buffer.byteLength(JSON.stringify(extra))-4;
  assert.ok(Buffer.byteLength(JSON.stringify([...accountEvidence(snap,undefined,{budget}),...extra]))<=70000);
  assert.ok(base.some(source=>source.content.includes('excerpted')));
});

test('supplemental-only draft uses its reader, not the unrelated legacy fallback, then passes strict independent review',async()=>{
  const calls:string[]=[],events:any[]=[];
  await model(({name,payload})=>{calls.push(name);if(name==='account_lookup_plan')return {tools:['enrollmentCertificate'],publicTopics:[],catalogQuery:null,action:null};
    assert.equal(name,'answer_evidence_review');assert.match(payload.answer,/Recorded assessment status/);assert.doesNotMatch(payload.answer,/Sample stu.best workspace|not linked to|Nexus/);return review();
  },async()=>{const result=await answerAccountWithVerification({question:'Show my enrollment certificate status.',snapshot:snapshot(),loadSnapshot:async()=>{throw new Error('No retry needed.');},deadline:Date.now()+50000,supplementalReaders:{enrollmentCertificate:async()=>certificate()},onProgress:step=>events.push(step)});
    assert.equal(result.verification.status,'verified');assert.equal(result.verification.attempts,1);assert.equal(result.views[0].id,'enrollmentCertificate');
    assert.equal(events.filter(step=>step.kind==='account-read:enrollmentCertificate:1'&&step.status==='complete').length,1);
  });
  assert.deepEqual(calls,['account_lookup_plan','answer_evidence_review']);
});

test('retry refreshes the selected supplemental reader with the fresh snapshot and preserves the full route',async()=>{
  let reads=0,reviews=0,repairs=0,replans=0;const contexts:any[]=[];
  await model(({name,payload})=>{
    if(name==='account_lookup_plan'){replans++;return {tools:['enrollmentCertificate'],publicTopics:[],catalogQuery:null,action:null};}
    if(name==='answer_evidence_review'){reviews++;return reviews===1?{supported:false,answersQuestion:false,claims:[]}:review();}
    assert.equal(name,'correct_grounded_answer');repairs++;assert.match(JSON.stringify(payload.evidence),/local_eligible/);return {status:'answered',answer:'The saved local assessment status is local_eligible.',sourceIds:['account:enrollmentCertificate']};
  },async()=>{
    const result=await answerAccountWithVerification({question:'Show my enrollment certificate status.',snapshot:snapshot(),route:'/school-affairs/services/17-1?view=current',deadline:Date.now()+50000,
      loadSnapshot:async()=>{reads++;return {...snapshot(),refreshMarker:'fresh'};},supplementalReaders:{enrollmentCertificate:async context=>{contexts.push(context);return certificate(context.snapshot.refreshMarker==='fresh'?'local_eligible':'blocked');}}});
    assert.equal(result.verification.status,'verified');assert.equal(result.verification.attempts,2);assert.match(result.answer,/local_eligible/);assert.equal(result.proposedAction,undefined);
  });
  assert.equal(reads,1);assert.equal(contexts.length,2);assert.equal(contexts[1].snapshot.refreshMarker,'fresh');assert.equal(contexts[0].route,contexts[1].route);assert.equal(reviews,2);assert.equal(repairs,1);assert.equal(replans,2);
  assert.doesNotMatch(JSON.stringify(contexts),/SECRET-CALLER|SECRET-KEY/);
});

test('inseparable mixed comparison cannot be approved as a partial supplemental answer',async()=>{
  const calls:string[]=[];let snapshots=0;
  await model(({name,payload})=>{
    calls.push(name);if(name==='account_lookup_plan')return {tools:['charges','enrollmentCertificate'],publicTopics:[],catalogQuery:null,action:null};
    if(name==='compose_grounded_answer'){assert.equal(payload.previousAnswer,undefined);assert.match(JSON.stringify(payload.evidence),/account:charges/);assert.match(JSON.stringify(payload.evidence),/account:enrollmentCertificate/);return {status:'answered',answer:'The saved certificate assessment is blocked. Tuition charges are recorded separately.',sourceIds:['account:enrollmentCertificate','account:charges']};}
    assert.equal(name,'answer_evidence_review');assert.match(payload.answer,/blocked/);assert.match(payload.answer,/charges/);
    return review();
  },async()=>{const result=await answerAccountWithVerification({question:'Compare my tuition charges with my enrollment certificate assessment.',snapshot:snapshot(),loadSnapshot:async()=>{snapshots++;return snapshot();},deadline:Date.now()+50000,supplementalReaders:{enrollmentCertificate:async()=>certificate()}});assert.equal(result.verification.status,'verified');assert.equal(result.verification.attempts,1);});
  assert.equal(snapshots,0);assert.deepEqual(calls,['account_lookup_plan','compose_grounded_answer','answer_evidence_review']);
});

test('degraded planner with an explicitly mixed question still requires complete grounded composition',async()=>{
  let reviews=0,compositions=0;
  await model(({name,payload})=>{
    if(name==='account_lookup_plan')return {tools:['invalid_tool'],publicTopics:[],catalogQuery:null};
    if(name==='compose_grounded_answer'){compositions++;assert.match(JSON.stringify(payload.evidence),/account:charges/);return {status:'answered',answer:'The saved certificate assessment is blocked; the charge records are separate.',sourceIds:['account:enrollmentCertificate','account:charges']};}
    assert.equal(name,'answer_evidence_review');reviews++;return review();
  },async()=>{const result=await answerAccountWithVerification({question:'Show my enrollment certificate status and unpaid tuition balance.',snapshot:snapshot(),loadSnapshot:async()=>snapshot(),deadline:Date.now()+50000,supplementalReaders:{enrollmentCertificate:async()=>certificate()}});assert.equal(result.verification.status,'verified');assert.equal(result.verification.attempts,1);});
  assert.equal(compositions,1);assert.equal(reviews,1);
});

test('the reported mixed catalog and unfinished Moodle question composes both sources before review',async()=>{
  const offering=evalId(900),route='/school-affairs/services/12-4?course='+offering;
  const question=`For published catalog offering ID ${offering}, what course code, teacher and credits are recorded? Also list my unfinished Moodle assignments.`;
  const data=snapshot(),base=catalog();
  const source={...base,evidence:{...base.evidence,url:route,urls:[route]}};
  const catalogPayload=JSON.parse(source.evidence.content);
  catalogPayload.rows[0].credits=3;
  source.evidence.content=JSON.stringify(catalogPayload);
  const calls:string[]=[];
  await model(({name,payload})=>{
    calls.push(name);
    if(name==='account_lookup_plan')return {tools:['courseCatalog'],publicTopics:[],catalogQuery:{id:offering},action:null};
    assert.deepEqual(new Set(payload.evidence.map((row:any)=>row.id)),new Set(['account-scope','account:courseCatalog','account:assignments','account:dtm']));
    if(name==='compose_grounded_answer'){
      assert.equal(payload.previousAnswer,undefined);
      const assignments=JSON.parse(payload.evidence.find((row:any)=>row.id==='account:assignments').content);
      assert.deepEqual(assignments.records.filter((row:any)=>row.status==='open').map((row:any)=>row.title).sort(),['Final portfolio','Index plan']);
      return {status:'answered',answer:'The published sample offering is CAT0, with Teacher listed and 3 credits. Your unfinished Moodle assignments are Index plan and Final portfolio.',sourceIds:['account:courseCatalog','account:assignments']};
    }
    assert.equal(name,'answer_evidence_review');
    assert.match(payload.answer,/CAT0.+Teacher.+3 credits/);
    assert.match(payload.answer,/Index plan and Final portfolio/);
    assert.doesNotMatch(payload.answer,/Reading response/);
    return {supported:true,answersQuestion:true,claims:[
      {claim:'Catalog code, teacher and credits',supported:true,evidenceId:'account:courseCatalog',quotes:[],jsonPaths:['/rows/0/course_code','/rows/0/instructor','/rows/0/credits']},
      {claim:'Saved Moodle tracker',supported:true,evidenceId:'account:assignments',quotes:[],jsonPaths:['/records/0/status']},
    ]};
  },async()=>{
    const result=await answerAccountWithVerification({question,snapshot:data,route,deadline:Date.now()+50000,
      loadSnapshot:async()=>assert.fail('The clean first draft should not require a retry'),
      supplementalReaders:{courseCatalog:async context=>{assert.deepEqual(context.catalogQuery,{id:offering});return source;}}});
    assert.equal(result.verification.status,'verified');
    assert.deepEqual(result.citations.map(row=>row.chunkId).sort(),['account:assignments','account:courseCatalog']);
  });
  assert.deepEqual(calls,['account_lookup_plan','compose_grounded_answer','answer_evidence_review']);
});

test('Moodle tracker comparison uses both owned tracker and actual-file evidence before final review',async()=>{
  const snap=snapshot() as Record<string,any>,assignment=snap.assignments.find((row:any)=>row.title==='Reading response');
  const question='Compare my Moodle tracker for Reading response with its actual file review.';
  let reads=0,compositions=0,reviews=0;
  await model(({name,payload})=>{
    if(name==='account_lookup_plan')return {tools:['dtm','assignments','dtmSubmissions'],publicTopics:[],catalogQuery:null,action:null};
    if(name==='compose_grounded_answer'){
      compositions++;assert.equal(payload.previousAnswer,undefined);
      const sources=payload.evidence;
      assert.match(JSON.stringify(sources),/account:assignments/);assert.match(JSON.stringify(sources),/account:dtm/);
      const actual=sources.find((row:any)=>row.id==='account:dtmSubmissions');
      const actualPayload=JSON.parse(actual.content);
      assert.equal(actualPayload.records[0].assignmentTitle,'Reading response');assert.equal(actualPayload.records[0].submission,null);
      assert.match(JSON.stringify(sources.find((row:any)=>row.id==='account:assignments')),/submitted/);
      return {status:'answered',answer:'Reading response is marked submitted in the local tracker. The separate saved-file lookup found no committed file for this assignment, so it has no current-file review.',sourceIds:['account:assignments','account:dtmSubmissions']};
    }
    assert.equal(name,'answer_evidence_review');reviews++;return {supported:true,answersQuestion:true,claims:[
      {claim:'Reading response has a tracker entry',supported:true,evidenceId:'account:assignments',jsonPaths:['/records/0/title'],quotes:[]},
      {claim:'Separate saved-file evidence is for Reading response',supported:true,evidenceId:'account:dtmSubmissions',jsonPaths:['/records/0/assignmentTitle'],quotes:[]},
    ]};
  },async()=>{
    const result=await answerAccountWithVerification({question,snapshot:snap,route:`/dtm/course/${assignment.dtmCourseId}/assignment/${assignment.id}`,loadSnapshot:async()=>snap,deadline:Date.now()+50000,
      supplementalReaders:{dtmSubmissions:async context=>{
        reads++;
        return readSubmissionEvidence(account,{snapshot:context.snapshot,question,route:context.route,deadline:context.deadline},{fetchImpl:async()=>Response.json({assignmentId:assignment.id,userId:EVAL_USER_ID,courseId:assignment.dtmCourseId,dueAt:assignment.dueAt,maxBytes:10485760,submission:null,files:[],reviews:[]})});
      }}});
    assert.equal(result.verification.status,'verified');assert.equal(result.verification.attempts,1);assert.match(result.answer,/separate saved-file/);
    assert.deepEqual(new Set(result.citations.map((row:any)=>row.chunkId)),new Set(['account:assignments','account:dtmSubmissions']));
  });
  assert.equal(reads,1);assert.equal(compositions,1);assert.equal(reviews,1);
});

test('the signed-in endpoint verifies the selected native conduct and student loan fields through caller-scoped readers',async()=>{
  for(const [tool,question,path] of [
    ['studentConduct','What reason, code and quantity are saved in my student conduct records?','/school-affairs/services/38-1'],
    ['studentLoan','What is my student loan progress and recorded history count?','/school-affairs/services/21-1'],
  ] as const){
    const snap=fixtureForCase(tool);
    const reads:string[]=[];
    const route=path+(tool==='studentLoan'?'/progress':'');
    const handler=createAffairsAssistantHandler({
      verifyToken:async token=>{assert.equal(token,'synthetic-caller');return {...account,email:undefined};},
      loadSnapshot:async()=>snap,
      publicResearch:async()=>assert.fail('Native personal records require the verified account'),
      readers:{
        studentConduct:(caller,options)=>readStudentConductEvidence(caller,options,{load:async reader=>{
          assert.equal(reader.token,account.token);assert.equal(reader.user.id,EVAL_USER_ID);reads.push('studentConduct');return snap.studentConduct;
        }}),
        studentLoan:(caller,options)=>readStudentLoanEvidence(caller,options,{load:async reader=>{
          assert.equal(reader.token,account.token);assert.equal(reader.user.id,EVAL_USER_ID);reads.push('studentLoan');return snap.studentLoan;
        }}),
      },
    });
    const headers=new Map<string,string>();
    let status=200,answer:any;
    const response={status(code:number){status=code;return response;},json(value:unknown){answer=value;},setHeader(name:string,value:string){headers.set(name,value);}};
    await model(({name,payload})=>{
      assert.doesNotMatch(JSON.stringify(payload),/SECRET-CALLER|SECRET-KEY|CONDUCT-PRIVATE/);
      assert.equal(payload.correlationId,undefined);
      if(name==='account_lookup_plan')return {tools:[],publicTopics:[],catalogQuery:null,action:null};
      assert.equal(name,'answer_evidence_review');
      const source=payload.evidence.find((item:{id:string})=>item.id==='account:'+tool);
      assert.ok(source);
      if(tool==='studentConduct'){
        assert.match(payload.answer,/Returned borrowed equipment/);
        assert.equal(JSON.parse(source.content).records[0].quantityText,'0');
        return review('account:'+tool,'/records/0/quantityText');
      }
      assert.match(payload.answer,/Waiting for local review/);
      assert.equal(JSON.parse(source.content).record.historyCount,0);
      return review('account:'+tool,'/record/historyCount');
    },async()=>{
      await handler({method:'POST',headers:{authorization:'Bearer synthetic-caller','x-assistant-request-id':'untrusted'},body:{question,route}},response);
      assert.equal(status,200);
      assert.equal(answer.verification.status,'verified');
      assert.deepEqual(reads,[tool]);
      assert.equal(answer.views[0].id,tool);
      assert.ok(answer.citations.some((citation:{url:string})=>citation.url===route));
      assert.match(headers.get('X-Assistant-Request-Id')||'',/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    });
  }
});

test('retry scope changes cannot reveal a second account or call supplemental readers on that snapshot',async()=>{
  let reads=0;
  await model(({name})=>name==='account_lookup_plan'?{tools:['enrollmentCertificate'],publicTopics:[],catalogQuery:null,action:null}:{supported:false,answersQuestion:false,claims:[]},async()=>{
    const result=await answerAccountWithVerification({question:'Show my enrollment certificate status.',snapshot:snapshot(),loadSnapshot:async()=>({...snapshot(),profile:{userId:evalId(999)},charges:[{userId:evalId(999),label:'FOREIGN SECRET',amountDue:123456,amountPaid:0}]}),deadline:Date.now()+50000,supplementalReaders:{enrollmentCertificate:async()=>{reads++;return certificate();}}});
    assert.equal(result.status,'abstained');assert.equal(result.verification.reason,'evidence_unavailable');assert.equal(reads,1);
    assert.doesNotMatch(JSON.stringify(result),/FOREIGN SECRET|123456/);
  });
});
