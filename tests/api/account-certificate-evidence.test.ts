import assert from 'node:assert/strict';
import test from 'node:test';
import {certificateEvidenceMaxBytes,isCertificateEvidenceQuestion,readCertificateEvidence} from '../../server/accountCertificateEvidence.js';

const owner='10000000-0000-4000-8000-000000000001',foreign='10000000-0000-4000-8000-000000000002';
const recordId='20000000-0000-4000-8000-000000000001',path='/school-affairs/services/17-1';
const account={user:{id:owner},url:'https://xiftudmvxphxcjtmfmib.supabase.co',token:'PRIVATE-TEST-TOKEN',key:'PRIVATE-TEST-KEY'};
const stamp='2026-11-13T02:00:00Z';
const row=()=>({id:recordId,userId:owner,sourceMode:'local_demo',version:1,createdAt:stamp,updatedAt:stamp,
  academicYear:115,semester:1,hasPendingFees:'Y',status:'blocked',resultText:'Local assessment waiting for receipt review.',assessedAt:stamp,
  identity:{studentNumber:'CERT-QA-001',studentName:'Certificate Test Student',departmentName:'Information Studies',yearText:'3',classLabel:'QA-A'}});
const data=(assessment:unknown=row())=>({assessments:[assessment],documents:[]});
const history=[{role:'user',content:'What status is stored in my enrollment certificate assessment?'}];
const decode=(value:Awaited<ReturnType<typeof readCertificateEvidence>>)=>JSON.parse(value.evidence.content);
async function read(value:unknown=data(),question='What status is recorded in my enrollment certificate assessment?'){
  return readCertificateEvidence(account,{question,route:path},{load:async()=>value});
}

test('certificate credentials and requested identity fields are fixed before its deferred reader starts',async()=>{
  const inherited=Date.now()+5000;
  const caller={...account,user:{id:owner,email:'private-extra@example.invalid'},requestDeadline:inherited,unused:'PRIVATE EXTRA'};
  const options={question:'What is my name?',route:'/dtm',history:[...history.map(item=>({...item}))],deadline:Date.now()+10000};
  let release!:()=>void,started!:()=>void,observed:unknown;
  const gate=new Promise<void>(resolve=>{release=resolve;}),begun=new Promise<void>(resolve=>{started=resolve;});
  const pending=readCertificateEvidence(caller,options,{load:async selected=>{
    observed={keys:Object.keys(selected).sort(),user:{...selected.user},url:selected.url,key:selected.key,token:selected.token,requestDeadline:selected.requestDeadline};
    started();await gate;return data();
  }});
  caller.user.id=foreign;caller.url='https://foreign.invalid';caller.token='FOREIGN TOKEN';caller.key='FOREIGN KEY';caller.requestDeadline=0;
  options.question='What is my student number?';options.route=path;options.history[0].content='Show my tuition balance.';options.deadline=0;
  await begun;
  caller.user={id:foreign,email:'changed@example.invalid'};release();
  const result=await pending;
  assert.equal(result.readState,'ok');
  assert.deepEqual(observed,{keys:['key','requestDeadline','token','url','user'],user:{id:owner},url:account.url,key:account.key,token:account.token,requestDeadline:inherited});
  assert.deepEqual(decode(result).assessment.identity,{studentName:'Certificate Test Student'});
  assert.doesNotMatch(JSON.stringify(result),/CERT-QA-001|FOREIGN|PRIVATE EXTRA|private-extra|changed@example/);
});

test('changing the caller while a certificate read awaits never authorizes a foreign assessment',async()=>{
  const caller={...account,user:{id:owner}};
  let release!:(value:unknown)=>void;
  const gate=new Promise<unknown>(resolve=>{release=resolve;});
  const pending=readCertificateEvidence(caller,{question:'Show my enrollment certificate.'},{load:async()=>gate});
  caller.user.id=foreign;release(data({...row(),userId:foreign}));
  const result=await pending;
  assert.equal(result.readState,'unavailable');assert.equal(result.reason,'invalid_records');
  assert.equal(decode(result).assessment,null);assert.doesNotMatch(result.evidence.content,/CERT-QA-001|Certificate Test Student/);
});

test('explicit certificate questions match English and Chinese from any route',()=>{
  for(const question of ['Show my enrollment certificate assessment.','Show my enrolment certificate.','What does my certificate of enrollment say?',
    'Which student name and number are recorded in my enrollment-certificate assessment, rather than my account profile?',
    'Where is proof of student status?','Print my student-status certificate.','我的在學證明目前狀態？','在学证明待缴费用是甚麼？','查詢學籍證明','在籍證明'])
    assert.equal(isCertificateEvidenceQuestion(question,'/dtm',[]),true,question);
  assert.equal(isCertificateEvidenceQuestion('What is my tuition balance and enrollment certificate status?','/dtm'),true);
});

test('generic record questions require exact local route or last-user certificate context',()=>{
  for(const question of ['What is my status?','Why is it blocked?','What does this show?','Are there pending fees?','Can I download it?']){
    assert.equal(isCertificateEvidenceQuestion(question,path),true,question);
    assert.equal(isCertificateEvidenceQuestion(question,'/dtm',history),true,question);
    assert.equal(isCertificateEvidenceQuestion(question,'/dtm'),false,question);
  }
  assert.equal(isCertificateEvidenceQuestion('Why blocked?',path+'/?view=current#assessment'),true);
  assert.equal(isCertificateEvidenceQuestion('Why blocked?','https://stu.best'+path),true);
  for(const route of [path+'-other','https://example.invalid'+path,'//example.invalid'+path,'/school-affairs/services/17-10'])
    assert.equal(isCertificateEvidenceQuestion('Why blocked?',route),false);
  assert.equal(isCertificateEvidenceQuestion('Why blocked?','/dtm',[...history,{role:'user',content:'My library request is under review.'}]),false);
  assert.equal(isCertificateEvidenceQuestion('Why blocked?','/dtm',[{role:'assistant',content:history[0].content}]),false);
});

test('explicit unrelated topics override certificate route/history without intercepting other certificates',()=>{
  for(const question of ['How much tuition do I owe?','What is my tuition fee balance?','Show my Quiz 1 feedback.','What grades do I have?',
    'What are my course credits?','When is my next class on my timetable?','Show my graduation certificate.','What is my language certificate status?',
    'Show my medical certificate.','What are my pending assignments?','我的學費餘額？','我的畢業證書狀態？','查詢我的請假狀態'])
    assert.equal(isCertificateEvidenceQuestion(question,path,history),false,question);
  for(const question of ['hello','certificate','What is my email?',null,{},'x'.repeat(12001)])
    assert.equal(isCertificateEvidenceQuestion(question,path,history),false);
});

test('own read uses one personal reader and emits a bounded literal assessment without credentials or identity',async()=>{
  const requestedDeadline=Date.now()+2000;let calls=0;
  const result=await readCertificateEvidence(account,{question:'Show my certificate assessment.',deadline:requestedDeadline},{load:async selected=>{
    calls++;assert.equal(selected.user.id,owner);assert.equal(selected.token,account.token);
    assert.equal(selected.requestDeadline,requestedDeadline);return data();
  }});
  assert.equal(calls,1);assert.equal(result.readState,'ok');assert.equal(result.reason,null);
  assert.equal(result.evidence.id,'account:enrollmentCertificate');assert.equal(result.evidence.url,path);assert.equal(result.evidence.provenance,'local_demo');
  const content=decode(result);
  assert.deepEqual(content.assessment,{id:recordId,sourceMode:'local_demo',version:1,academicYear:115,semester:1,hasPendingFees:'Y',status:'blocked',resultText:'Local assessment waiting for receipt review.',assessedAt:stamp,updatedAt:stamp});
  assert.ok(Number.isFinite(Date.parse(content.checkedAt)));assert.notEqual(content.checkedAt,content.assessment.assessedAt);
  const serialized=JSON.stringify(result);
  for(const forbidden of [owner,account.token,account.key,'Certificate Test Student','CERT-QA-001','documents','documentMetadata','storage_path'])assert.equal(serialized.includes(forbidden),false,forbidden);
  assert.ok(Buffer.byteLength(serialized,'utf8')<=certificateEvidenceMaxBytes);
});

test('certificate identity is projected only when specifically requested and is never replaced from profile',async()=>{
  for(const [question,keys] of [
    ['What student number is on my enrollment certificate?',['studentNumber']],
    ['Which name is recorded on my enrollment certificate?',['studentName']],
    ['Which class is recorded on my enrollment certificate?',['classLabel']],
    ['What name and department are recorded?',['studentName','departmentName']],
    ['我的在學證明姓名、學號、年級？',['studentNumber','studentName','yearText']],
    ['What department name is recorded?',['departmentName']],
    ['What class name is recorded?',['classLabel']],
    ['What year level is recorded?',['yearText']],
  ] as const){
    const own={...row(),identity:{...row().identity,studentName:'Certificate Identity Only'}};
    const content=decode(await read(data(own),question));
    assert.deepEqual(content.assessment.identity,Object.fromEntries(keys.map(key=>[key,own.identity[key]])));
  }
  for(const question of ['Show all certificate details.','Which academic year and semester are recorded?','What is my status?','What is the certificate name?','Show all identity details.'])
    assert.equal(Object.hasOwn(decode(await read(data(),question)).assessment,'identity'),false,question);
});

test('coordinated student identity requests retain the shared qualifier in either order and possessive lists',async()=>{
  for(const question of [
    'Which student name and number are recorded in my enrollment-certificate assessment, rather than my account profile?',
    'Which student number and name are recorded in my enrollment certificate?',
    'Show the student name, number and department in my enrollment certificate.',
    "What are the student's name and number in my enrollment certificate?",
    'What are the student’s number and name in my enrollment certificate?',
    'What name and number of the student are recorded in my enrollment certificate?',
    'What number and name of the student are recorded in my enrollment certificate?',
    'What are my name and number in my enrollment certificate?',
    'What are my number, name and year level in my enrollment certificate?',
    'Show student name / ID on my enrollment certificate.',
  ]){
    const content=decode(await read(data(),question));
    assert.equal(content.assessment.identity.studentName,'Certificate Test Student',question);
    assert.equal(content.assessment.identity.studentNumber,'CERT-QA-001',question);
    assert.ok(content.identityProjection.requestedFields.includes('studentNumber'),question);
    assert.ok(content.identityProjection.requestedFields.includes('studentName'),question);
    assert.equal(content.identityProjection.omittedFields.includes('studentNumber'),false,question);
  }
});

test('certificate, document and class numbers never become student identity requests',async()=>{
  for(const question of [
    'What is the certificate number in my enrollment certificate?',
    'Show the document number in my enrollment-certificate assessment.',
    'What is the class number in my enrollment certificate?',
    'What is the student certificate number?',
    'What is the student document number in my enrollment certificate?',
    'What is the student class number in my enrollment certificate?',
    'What is the certificate name and number in my enrollment certificate?',
    'What is the number and name of my certificate in this enrollment assessment?',
    'What is the name and number of the student certificate in my enrollment-certificate assessment?',
    'What is the name and number of the student document in my enrollment-certificate assessment?',
    'What is the number and name of the student certificate in my enrollment-certificate assessment?',
    "What is the name and number of the student's document in my enrollment-certificate assessment?",
    'What is the name and number of the student’s certificate in my enrollment-certificate assessment?',
    'Show name, number of the student certificate in my enrollment-certificate assessment.',
    'Show name / number of the student document in my enrollment-certificate assessment.',
    'Show my name and number of the student certificate in my enrollment-certificate assessment.',
  ]){
    const content=decode(await read(data(),question));
    assert.equal(Object.hasOwn(content.assessment,'identity'),false,question);
    assert.deepEqual(content.identityProjection.requestedFields,[],question);
    assert.doesNotMatch(JSON.stringify(content),/CERT-QA-001|Certificate Test Student|QA-A/,question);
  }
  for(const question of [
    'What student name and certificate number are on my enrollment certificate?',
    'What student name and document number are on my enrollment certificate?',
    'What student name and class number are on my enrollment certificate?',
    'What is my student name, not number, in my enrollment certificate?',
  ])assert.deepEqual(decode(await read(data(),question)).assessment.identity,{studentName:'Certificate Test Student'},question);
});

test('projection metadata distinguishes unrequested values from requested null and blank without exposing other identity',async()=>{
  const value={...row(),identity:{...row().identity,studentName:null,studentNumber:''}};
  const omitted=decode(await read(data(value),'What status is stored in my enrollment certificate?'));
  assert.equal(Object.hasOwn(omitted.assessment,'identity'),false);
  assert.deepEqual(omitted.identityProjection,{requestedFields:[],omittedFields:['studentNumber','studentName','departmentName','yearText','classLabel'],omissionReason:'not_requested',nullMeaning:'not_recorded'});
  const selected=decode(await read(data(value),'What student name and number are stored in my enrollment certificate?'));
  assert.deepEqual(selected.assessment.identity,{studentNumber:'',studentName:null});
  assert.deepEqual(selected.identityProjection,{requestedFields:['studentNumber','studentName'],omittedFields:['departmentName','yearText','classLabel'],omissionReason:'not_requested',nullMeaning:'not_recorded'});
  assert.match(selected.rules.join(' '),/omission does not mean the stored field is absent or null/);
  assert.doesNotMatch(JSON.stringify(selected),/Information Studies|QA-A/);
});

test('a class or department qualifier never lends its bare number to student identity',async()=>{
  for(const question of [
    'What is the student class name and number on my enrollment certificate?',
    'What is the student’s class name and number on my enrollment certificate?',
    'What is my class name and number on my enrollment certificate?',
    'What class name and number of the student are on my enrollment certificate?',
    'What student class label, name and number are recorded in my enrollment certificate?',
  ]){
    const result=decode(await read(data(),question));
    assert.deepEqual(result.assessment.identity,{classLabel:'QA-A'},question);
    assert.deepEqual(result.identityProjection.requestedFields,['classLabel'],question);
    assert.doesNotMatch(JSON.stringify(result),/CERT-QA-001|Certificate Test Student/,question);
  }
  assert.deepEqual(decode(await read(data(),'What is the student department name and number on my enrollment certificate?')).assessment.identity,{departmentName:'Information Studies'});
  for(const question of [
    'What student number and class name are recorded on my enrollment certificate?',
    'What class name and student number are recorded on my enrollment certificate?',
  ])assert.deepEqual(decode(await read(data(),question)).assessment.identity,{studentNumber:'CERT-QA-001',classLabel:'QA-A'},question);
});

test('name and class followups need certificate context and never expose unrelated identity scalars',async()=>{
  for(const [question,key] of [['Which name is recorded?','studentName'],['Which class is recorded?','classLabel']] as const){
    const result=await readCertificateEvidence(account,{question,route:'/dtm',history},{load:async()=>data()});
    assert.deepEqual(decode(result).assessment.identity,{[key]:row().identity[key]});
    const unrelated=await readCertificateEvidence(account,{question,route:'/dtm',history:[{role:'user',content:'Show my Quiz 1 feedback.'}]},{load:async()=>data()});
    assert.equal(Object.hasOwn(decode(unrelated).assessment,'identity'),false);
  }
});

test('an administrator still reads only their own account and foreign reader responses fail closed',async()=>{
  const administrator={...account,role:'admin',user:{id:foreign}};
  let calls=0;
  const result=await readCertificateEvidence(administrator,{}, {load:async selected=>{calls++;assert.equal(selected.user.id,foreign);return data();}});
  assert.equal(calls,1);assert.equal(result.readState,'unavailable');assert.equal(result.reason,'invalid_records');
  assert.equal(JSON.stringify(result).includes('CERT-QA-001'),false);
  const own=await readCertificateEvidence(administrator,{}, {load:async()=>data({...row(),userId:foreign})});
  assert.equal(own.readState,'ok');
});

test('an injected reader cannot change the captured owner through its argument',async()=>{
  const original={...account,user:{id:owner}};
  let changed:boolean|undefined;
  const result=await readCertificateEvidence(original,{}, {load:async selected=>{
    changed=Reflect.set(selected.user,'id',foreign);return data({...row(),userId:foreign});
  }});
  assert.equal(changed,false);
  assert.equal(result.readState,'unavailable');assert.equal(result.reason,'invalid_records');
  assert.equal(original.user.id,owner);assert.equal(JSON.stringify(result).includes('CERT-QA-001'),false);
});

test('empty collection is explicit local absence and differs from failed or ambiguous reads',async()=>{
  const empty=await read({assessments:[],documents:[]});
  assert.equal(empty.readState,'empty');assert.equal(empty.reason,null);assert.equal(decode(empty).assessment,null);
  const duplicate=await read({assessments:[row(),{...row(),id:'20000000-0000-4000-8000-000000000002',updatedAt:'2026-11-14T00:00:00Z'}],documents:[]});
  assert.equal(duplicate.readState,'unavailable');assert.equal(duplicate.reason,'ambiguous_records');assert.equal(decode(duplicate).assessment,null);
});

test('null values and blank text are preserved without fee or term inference',async()=>{
  const unknown={...row(),academicYear:null,semester:null,hasPendingFees:null,status:'unknown',resultText:null,assessedAt:null,
    identity:{studentNumber:null,studentName:null,departmentName:null,yearText:null,classLabel:null}};
  const result=await read(data(unknown),'What are my certificate student number and pending fees?');
  assert.equal(result.readState,'ok');
  const assessment=decode(result).assessment;
  for(const key of ['academicYear','semester','hasPendingFees','resultText','assessedAt'])assert.equal(assessment[key],null,key);
  assert.deepEqual(assessment.identity,{studentNumber:null});assert.equal(assessment.status,'unknown');
  const blank=decode(await read(data({...row(),resultText:'',identity:{...row().identity,studentName:''}}),'What student name is recorded?')).assessment;
  assert.equal(blank.resultText,'');assert.equal(blank.identity.studentName,'');
});

test('independently recorded fee flags and local status stay independent and cannot activate a document',async()=>{
  const blocked=decode(await read(data({...row(),hasPendingFees:'N',status:'blocked'})));
  assert.equal(blocked.assessment.hasPendingFees,'N');assert.equal(blocked.assessment.status,'blocked');
  const eligible=decode(await read(data({...row(),hasPendingFees:'Y',status:'local_eligible'}),'Can I download my enrollment certificate?'));
  assert.equal(eligible.assessment.hasPendingFees,'Y');assert.equal(eligible.assessment.status,'local_eligible');
  assert.match(eligible.rules.join(' '),/local recorded status only/);
  assert.match(eligible.rules.join(' '),/issuance, verification and download capabilities are unavailable/);
  assert.equal(Object.hasOwn(eligible,'documents'),false);
});

test('injected readers cannot bypass exact field, owner, timestamp or null validation',async()=>{
  const patches=[{userId:foreign},{id:'wrong'},{sourceMode:'official'},{version:0},{version:'1'},{academicYear:0},{academicYear:'115'},
    {semester:4},{hasPendingFees:false},{hasPendingFees:0},{status:'eligible'},{resultText:0},{assessedAt:'2026-02-29T00:00:00Z'},
    {createdAt:'bad'},{updatedAt:'2026-01-01'},{identity:{...row().identity,studentNumber:17}},{identity:{...row().identity,studentName:'x'.repeat(161)}},
    {signed_url:'CAPABILITY'},{storage_path:'PRIVATE/PATH'},{admin:true},{identity:{...row().identity,token:'CAPABILITY'}}];
  for(const patch of patches){const result=await read(data({...row(),...patch}));assert.equal(result.readState,'unavailable',JSON.stringify(patch));assert.equal(result.reason,'invalid_records');}
  for(const key of Object.keys(row())){
    const incomplete:Record<string,unknown>={...row()};delete incomplete[key];
    assert.equal((await read(data(incomplete))).reason,'invalid_records',key);
  }
});

test('metadata, documents, inherited values and accessor payloads are rejected before projection',async()=>{
  for(const value of [null,[],{...data(),documentMetadata:[{signed_url:'CAPABILITY'}]},{assessments:[row()],documents:[{status:'available',url:'CAPABILITY'}]},
    Object.create(data()),{assessments:'invalid',documents:[]}]){
    const result=await read(value);assert.equal(result.readState,'unavailable');assert.equal(result.reason,'invalid_records');assert.equal(JSON.stringify(result).includes('CAPABILITY'),false);
  }
  const accessor={...row()};let touched=false;
  Object.defineProperty(accessor,'resultText',{get(){touched=true;return 'CAPABILITY';},enumerable:true});
  assert.equal((await read(data(accessor))).reason,'invalid_records');assert.equal(touched,false);
});

test('safe failures never forward backend messages, substitute empty data or retain earlier records',async()=>{
  for(const [status,reason] of [[401,'unauthorized'],[403,'forbidden'],[409,'record_changed'],[503,'read_failed']] as const){
    const result=await readCertificateEvidence(account,{}, {load:async()=>{throw Object.assign(new Error('PRIVATE-TOKEN storage/path PRIVATE-STUDENT'),{status});}});
    assert.equal(result.readState,'unavailable');assert.equal(result.reason,reason);assert.equal(decode(result).assessment,null);
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE-TOKEN|storage\/path|PRIVATE-STUDENT/);
  }
  assert.equal((await read()).readState,'ok');
  assert.equal((await read({bad:'response'})).readState,'unavailable');
  let accessed=false;const badError=Object.defineProperty({},'status',{get(){accessed=true;throw new Error('private');}});
  const failed=await readCertificateEvidence(account,{}, {load:async()=>{throw badError;}});
  assert.equal(failed.reason,'read_failed');assert.equal(accessed,false);
});

test('invalid account/deadline and expired budgets never invoke a reader',async()=>{
  let calls=0;const load=async()=>{calls++;return data();};
  for(const value of [{...account,user:{id:'bad'}},{...account,token:''},{...account,key:''},{...account,url:'https://other.supabase.co'}])
    assert.equal((await readCertificateEvidence(value,{}, {load})).reason,'unauthorized');
  for(const deadline of [NaN,Infinity,-Infinity])assert.equal((await readCertificateEvidence(account,{deadline},{load})).reason,'invalid_deadline');
  assert.equal((await readCertificateEvidence(account,{deadline:Date.now()-1},{load})).reason,'deadline_exceeded');
  assert.equal((await readCertificateEvidence({...account,requestDeadline:Date.now()-1},{},{load})).reason,'deadline_exceeded');
  assert.equal(calls,0);
});

test('a nonresolving injected reader is bounded and inherits the earlier deadline',async()=>{
  const deadline=Date.now()+25;let passed:number|undefined;const started=Date.now();
  const result=await readCertificateEvidence({...account,requestDeadline:deadline},{deadline:Date.now()+5000},{load:async selected=>{passed=selected.requestDeadline;return new Promise(()=>{});}});
  assert.equal(passed,deadline);assert.equal(result.readState,'unavailable');assert.equal(result.reason,'deadline_exceeded');
  assert.ok(Date.now()-started<1000);
});

test('UTF-8 and escaped fields remain whole within the complete JSON budget',async()=>{
  for(const character of ['😀','\u0001','\\','"']){
    const large={...row(),resultText:character.repeat(500),identity:{studentNumber:character.repeat(80),studentName:character.repeat(160),departmentName:character.repeat(160),yearText:character.repeat(30),classLabel:character.repeat(80)}};
    const result=await read(data(large),'Show my enrollment certificate student number, name, department, year level and class label.');
    assert.equal(result.readState,'ok');assert.deepEqual(decode(result).assessment.identity,large.identity);
    assert.equal(decode(result).assessment.resultText,large.resultText);
    assert.ok(Buffer.byteLength(JSON.stringify(result),'utf8')<=certificateEvidenceMaxBytes);
  }
});
