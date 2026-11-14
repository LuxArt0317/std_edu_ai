import test from 'node:test';
import assert from 'node:assert/strict';
import {isStudentLoanEvidenceQuestion,readStudentLoanEvidence,studentLoanEvidenceMaxBytes} from '../../server/accountStudentLoanEvidence.js';
import type {StudentLoanRecord} from '../../server/studentLoan.js';

const owner='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222';
const stamp='2026-11-13T02:00:00Z',path='/school-affairs/services/21-1';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'PRIVATE-KEY',token:'PRIVATE-TOKEN',user:{id:owner}};
const row=():StudentLoanRecord=>({id:'33333333-3333-4333-8333-333333333333',userId:owner,sourceMode:'local_demo',version:1,createdAt:stamp,updatedAt:stamp,
  currentTermLabel:'Literal period B',currentApplicationState:'unknown',currentApplicationText:'Locally entered application text',progressText:'approved (literal text)',historyCount:0,historyText:'Two previous applications (literal text)'});
const read=(value:unknown,question='Show my student loan records.',route=path)=>readStudentLoanEvidence(account,{question,route},{load:async()=>value});
const snapshot=(record:StudentLoanRecord|null=row())=>({status:'loaded',record});
const decode=(result:Awaited<ReturnType<typeof readStudentLoanEvidence>>)=>JSON.parse(result.evidence.content);

test('loan selection separates recorded intent, public concepts, other topics and stale follow-ups',()=>{
  for(const question of ['Show my student loan records.','Did I apply for a student loan?','What is my loan progress?','How much was my student loan payment?','我的就學貸款申請狀態','查詢學貸歷史紀錄'])
    assert.equal(isStudentLoanEvidenceQuestion(question,'/dtm'),true,question);
  const history=[{role:'user',content:'Show my student loan status.'}];
  for(const question of ['What are my grades?','What is student loan?','What is a student loan?','Explain loans.','Show my conduct history.','Show another student loan record.','Show my car loan.','Where is my next class?',
    'Show my equipment loan record.','查詢我的器材借用紀錄','Show my library loan history.','What is the status of my book loan?'])
    assert.equal(isStudentLoanEvidenceQuestion(question,path,history),false,question);
  for(const route of [path,path+'/progress',path+'/history',path+'/document'])assert.equal(isStudentLoanEvidenceQuestion('What does this say?',route),true,route);
  assert.equal(isStudentLoanEvidenceQuestion('What does it say?','/',history),true);
  assert.equal(isStudentLoanEvidenceQuestion('What does it say?','/',[...history,{role:'user',content:'Show my grades.'}]),false);
  assert.equal(isStudentLoanEvidenceQuestion('What does it say?','/',[{role:'assistant',content:history[0].content}]),false);
  assert.equal(isStudentLoanEvidenceQuestion('What does it say?','/',[{role:'user',content:'What is a student loan?'}]),false);
  for(const route of ['https://evil.invalid'+path,'//evil.invalid'+path,path+'?userId='+foreign,path+'#fragment',path+'0','https://a@stu.best'+path])
    assert.equal(isStudentLoanEvidenceQuestion('What does this say?',route),false,route);
});

test('strict caller-only singleton projection keeps all six fields independent and excludes identities/admin metadata',async()=>{
  let calls=0;
  const result=await readStudentLoanEvidence({...account,role:'admin'} as typeof account,{question:'Show my loan history and progress.'},{load:async captured=>{
    calls++;assert.deepEqual(Object.keys(captured).sort(),['key','requestDeadline','token','url','user']);assert.deepEqual(captured.user,{id:owner});return snapshot();
  }}),value=decode(result);
  assert.equal(calls,1);assert.equal(result.readState,'ok');assert.equal(result.reason,null);assert.equal(result.evidence.id,'account:studentLoan');
  assert.equal(result.evidence.provenance,'local_demo');assert.equal(result.evidence.url,path+'/progress');assert.deepEqual(result.evidence.urls,[path+'/progress',path+'/history']);
  assert.deepEqual(value.record,{id:row().id,sourceMode:'local_demo',version:1,updatedAt:stamp,currentTermLabel:'Literal period B',currentApplicationState:'unknown',
    currentApplicationText:row().currentApplicationText,progressText:'approved (literal text)',historyCount:0,historyText:'Two previous applications (literal text)'});
  assert.deepEqual(value.counts,{available:1,matching:1,included:1,omitted:0});assert.equal(value.recordPresent,true);assert.equal(value.complete,true);
  assert.match(value.rules,/Conflicting text\/state\/count values must be disclosed/);assert.match(value.rules,/not official university or bank data/);
  for(const forbidden of [owner,foreign,'PRIVATE-','userId','createdAt','admin','storagePath','studentNumber'])assert.ok(!JSON.stringify(result).includes(forbidden),forbidden);
});

test('known empty metadata never implies not-applied, zero history or official absence',async()=>{
  const result=await read(snapshot(null)),value=decode(result);
  assert.equal(result.readState,'empty');assert.equal(value.recordPresent,false);assert.equal(value.record,null);assert.equal(value.complete,true);
  assert.deepEqual(value.counts,{available:0,matching:0,included:0,omitted:0});assert.match(value.rules,/never not_applied, zero history or no official loan/);
  assert.equal(Object.hasOwn(value,'currentApplicationState'),false);assert.equal(Object.hasOwn(value,'historyCount'),false);
});

test('null, blank, zero and conflicting metadata are preserved without deriving loan approval or history items',async()=>{
  for(const literal of [null,'','0','not applied and approved']){
    const source={...row(),currentTermLabel:literal,currentApplicationText:literal,progressText:literal,historyText:literal,historyCount:null};
    const value=decode(await read(snapshot(source)));
    for(const field of ['currentTermLabel','currentApplicationText','progressText','historyText'])assert.equal(value.record[field],literal);
    assert.equal(value.record.historyCount,null);assert.equal(value.record.currentApplicationState,'unknown');
    for(const derived of ['approved','paid','loanAmount','applications','historyItems'])assert.equal(Object.hasOwn(value.record,derived),false);
  }
  for(const state of ['unknown','not_applied','recorded'] as const){const value=decode(await read(snapshot({...row(),currentApplicationState:state})));assert.equal(value.record.currentApplicationState,state);assert.equal(value.record.historyCount,0);}
});

test('malformed own singleton or foreign data fail closed instead of returning partial fields',async()=>{
  const cases:unknown[]=[{status:'unavailable',record:null},{record:row()},{status:'loaded',record:null,admin:[]},{status:'loaded',record:[row(),row()]}];
  for(const patch of [{userId:foreign},{sourceMode:'official'},{version:0},{version:1000000000},{currentApplicationState:'approved'},{currentTermLabel:undefined},
    {progressText:'x'.repeat(2001)},{progressText:'\u0000'},{progressText:'\ud800'},{historyCount:-1},{historyCount:1.5},{historyCount:1000001},{historyCount:'0'},
    {createdAt:'0000-01-01T00:00:00Z'},{updatedAt:'2026-02-29T00:00:00Z'},{updatedAt:'2026-11-13T00:00:00+16:00'},
    {storagePath:'PRIVATE PATH'},{id:'invalid'}])cases.push(snapshot({...row(),...patch} as StudentLoanRecord));
  let getters=0;const accessor={...row()};Object.defineProperty(accessor,'progressText',{enumerable:true,get:()=>{getters++;return 'private';}});cases.push(snapshot(accessor));
  cases.push(snapshot({...row(),[Symbol('private')]:true}));
  const inherited=Object.assign(Object.create({userId:owner}),row());delete inherited.userId;cases.push(snapshot(inherited));
  for(const source of cases){const result=await read(source);assert.equal(result.readState,'unavailable');assert.equal(result.reason,'invalid_records');assert.equal(decode(result).record,null);assert.equal(decode(result).recordPresent,null);}
  assert.equal(getters,0);
});

test('loaded text/state and current-term labels are literal and never replaced by the question or clock',async()=>{
  const source={...row(),currentTermLabel:null,currentApplicationState:'not_applied' as const,progressText:'approved',historyCount:0,historyText:'8 previous applications'};
  const value=decode(await read(snapshot(source),'What is my current semester student loan application status and history?'));
  assert.equal(value.record.currentTermLabel,null);assert.equal(value.record.currentApplicationState,'not_applied');assert.equal(value.record.progressText,'approved');
  assert.equal(value.record.historyCount,0);assert.equal(value.record.historyText,'8 previous applications');assert.equal(value.capabilities.approval,false);
});

test('document, payment and application requests never imply write or file capability',async()=>{
  for(const question of ['Download my student loan document.','Submit my student loan application.','Pay my student loan.','Was my student loan approved?']){
    const result=await read(snapshot(),question),value=decode(result);assert.equal(result.readState,'ok');
    for(const field of ['submitApplication','approval','payment','documentIssuance','verifiedFile','historyItems'])assert.equal(value.capabilities[field],false,field);
    assert.equal(Object.hasOwn(result,'action'),false);assert.equal(Object.hasOwn(result,'proposal'),false);
    assert.ok(result.evidence.urls!.every(url=>Object.values({index:path,progress:path+'/progress',history:path+'/history',document:path+'/document'}).includes(url)));
  }
});

test('exact local view citations resolve from current explicit requests and do not borrow unrelated identifiers',async()=>{
  for(const [question,route,expected] of [
    ['What does this say?',path+'/history',[path+'/history']],
    ['Show my student loan application.',path+'/history',[path]],
    ['Show my loan history and download document.',path,[path+'/history',path+'/document']],
    ['我的就學貸款進度與歷史紀錄',path,[path+'/progress',path+'/history']],
  ] as const){const result=await read(snapshot(),question,route);assert.deepEqual(result.evidence.urls,expected,question);}
});

test('mutable caller transport, identity and view selection are captured synchronously',async()=>{
  const mutable={...account,user:{id:owner},requestDeadline:Date.now()+3000},options={question:'Show my student loan history.',route:path,deadline:Date.now()+2500};
  const expected={url:account.url,key:account.key,token:account.token,user:{id:owner},requestDeadline:options.deadline};let captured:unknown;
  const pending=readStudentLoanEvidence(mutable,options,{load:async selected=>{captured=structuredClone(selected);return snapshot();}});
  mutable.user.id=foreign;mutable.url='https://evil.invalid';mutable.key='CHANGED';mutable.token='CHANGED';mutable.requestDeadline=0;
  options.question='Show my student loan progress.';options.route=path+'/document';options.deadline=0;
  const result=await pending;assert.equal(result.readState,'ok');assert.deepEqual(captured,expected);assert.deepEqual(result.evidence.urls,[path+'/history']);
});

test('unavailable reads do not become loaded-empty or disclose error strings',async()=>{
  for(const [error,reason] of [[new Error('PRIVATE failure'),'read_failed'],[{status:401},'unauthorized'],[{status:403},'forbidden'],[{status:409},'record_changed']] as const){
    const result=await readStudentLoanEvidence(account,{question:'Show my student loan.'},{load:async()=>{throw error;}}),value=decode(result);
    assert.equal(result.readState,'unavailable');assert.equal(result.reason,reason);assert.equal(value.recordPresent,null);assert.equal(value.complete,false);
    assert.deepEqual(value.counts,{available:null,matching:null,included:0,omitted:null});assert.doesNotMatch(JSON.stringify(result),/PRIVATE failure/);
  }
});

test('invalid accounts, URLs, accessors and deadlines fail before invoking a loader',async()=>{
  let calls=0;const dependencies={load:async()=>{calls++;return snapshot();}},question='Show my student loan.';
  for(const invalid of [{...account,user:{id:'invalid'}},{...account,url:'https://other.supabase.co'},{...account,key:''},{...account,token:''}])
    assert.equal((await readStudentLoanEvidence(invalid,{question},dependencies)).reason,'unauthorized');
  for(const route of ['https://evil.invalid'+path,path+'#fragment',path+'?userId='+foreign])assert.equal((await readStudentLoanEvidence(account,{question,route},dependencies)).reason,'unrelated_question');
  assert.equal((await readStudentLoanEvidence(account,{question:'Show my grades.',route:path},dependencies)).reason,'unrelated_question');
  for(const deadline of [NaN,Infinity])assert.equal((await readStudentLoanEvidence(account,{question,deadline},dependencies)).reason,'invalid_deadline');
  assert.equal((await readStudentLoanEvidence(account,{question,deadline:Date.now()-1},dependencies)).reason,'deadline_exceeded');
  const getterAccount={...account};Object.defineProperty(getterAccount,'token',{get:()=>{throw new Error('must not read');}});
  assert.equal((await readStudentLoanEvidence(getterAccount,{question},dependencies)).reason,'unauthorized');assert.equal(calls,0);
});

test('caller and helper deadlines are both finite and a hung injected loader cannot hold the request',async()=>{
  const question='Show my student loan.',short=Date.now()+3000;
  await readStudentLoanEvidence({...account,requestDeadline:short},{question,deadline:Date.now()+60000},{load:async selected=>{assert.equal(selected.requestDeadline,short);return snapshot();}});
  const before=Date.now();await readStudentLoanEvidence(account,{question,deadline:before+60000},{load:async selected=>{assert.ok(selected.requestDeadline!<=before+12000);return snapshot();}});
  const result=await readStudentLoanEvidence(account,{question,deadline:Date.now()+100},{load:async()=>new Promise(()=>{})});
  assert.equal(result.reason,'deadline_exceeded');assert.equal(result.readState,'unavailable');assert.ok(Date.now()-before<2000);
});

test('full serialized envelope cap retains whole fields or explicitly omits the entire singleton',async()=>{
  const source={...row(),currentTermLabel:'課'.repeat(160),currentApplicationText:'😀'.repeat(2000),progressText:'😀'.repeat(2000),historyText:'😀'.repeat(2000)};
  const result=await read(snapshot(source)),value=decode(result);
  assert.ok(Buffer.byteLength(JSON.stringify(result))<=studentLoanEvidenceMaxBytes);assert.equal(result.readState,'ok');assert.equal(result.reason,'evidence_limit');
  assert.equal(value.recordPresent,true);assert.equal(value.record,null);assert.equal(value.complete,false);assert.equal(value.excerpted,true);
  assert.deepEqual(value.counts,{available:1,matching:1,included:0,omitted:1});
  const smaller={...row(),progressText:'\\"\n'.repeat(500)};const kept=await read(snapshot(smaller)),keptValue=decode(kept);
  assert.ok(Buffer.byteLength(JSON.stringify(kept))<=studentLoanEvidenceMaxBytes);assert.equal(keptValue.record.progressText,smaller.progressText);
});

test('default native loader makes only the caller-scoped singleton GET, never a management RPC',async()=>{
  const original=globalThis.fetch;let calls=0;
  const native={id:row().id,user_id:owner,source_mode:'local_demo',version:1,created_at:stamp,updated_at:stamp,deleted_at:null,
    current_term_label:row().currentTermLabel,current_application_state:'unknown',current_application_text:row().currentApplicationText,
    progress_text:row().progressText,history_count:0,history_text:row().historyText};
  globalThis.fetch=async(input,init)=>{
    calls++;const url=new URL(String(input));assert.equal(url.origin,account.url);assert.equal(url.pathname,'/rest/v1/affairs_student_loan');
    assert.equal(url.searchParams.get('user_id'),'eq.'+owner);assert.equal(url.searchParams.get('deleted_at'),'is.null');assert.equal(url.searchParams.get('limit'),'2');
    assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');assert.equal(init?.body,undefined);assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+account.token);
    assert.ok(init?.signal);return new Response(JSON.stringify([native]),{status:200,headers:{'content-type':'application/json'}});
  };
  try{const result=await readStudentLoanEvidence(account,{question:'Show my student loan.'});assert.equal(result.readState,'ok');assert.equal(calls,1);assert.equal(decode(result).record.historyCount,0);}
  finally{globalThis.fetch=original;}
});
