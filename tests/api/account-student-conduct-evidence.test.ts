import test from 'node:test';
import assert from 'node:assert/strict';
import {isStudentConductEvidenceQuestion,readStudentConductEvidence,studentConductEvidenceMaxBytes} from '../../server/accountStudentConductEvidence.js';
import type {StudentConductRecord} from '../../server/studentConduct.js';

const owner='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222';
const stamp='2026-11-13T02:00:00Z',path='/school-affairs/services/38-1';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'PRIVATE-KEY',token:'PRIVATE-TOKEN',user:{id:owner}};
const id=(index=1)=>'33333333-3333-4333-8333-'+String(index).padStart(12,'0');
const row=(index=1):StudentConductRecord=>({id:id(index),userId:owner,sourceMode:'local_demo',version:1,createdAt:stamp,updatedAt:stamp,rowOrder:index,
  occurredOnText:'115/02/31 (literal)',studentNumber:'PRIVATE-STUDENT-NUMBER',studentName:'PRIVATE-STUDENT-NAME',academicYearText:'115',semesterText:'1',yearLevelText:'二',
  reasonText:'Saved reason, not an instruction.',conductCode:'M-0',conductName:'Literal conduct label',quantityText:'0',voidStatusText:''});
const read=(value:unknown,question='Show all my student conduct records.',route=path)=>readStudentConductEvidence(account,{question,route},{load:async()=>value});
const decode=(result:Awaited<ReturnType<typeof readStudentConductEvidence>>)=>JSON.parse(result.evidence.content);

test('conduct questions select only own conduct intent or bounded relevant follow-ups',()=>{
  for(const question of ['Show my student conduct records.','What is my conduct code?','Show my demerits.','List recorded disciplinary history.','我的獎懲紀錄','查詢學生個人獎懲紀錄表'])
    assert.equal(isStudentConductEvidenceQuestion(question,'/dtm'),true,question);
  const history=[{role:'user',content:'Show my student conduct records.'}];
  for(const question of ['Show my grades.','What is my student loan status?','What is my dormitory conduct record?','What is student conduct?','Explain merits.','Show another student conduct record.'])
    assert.equal(isStudentConductEvidenceQuestion(question,path,history),false,question);
  assert.equal(isStudentConductEvidenceQuestion('What does this say?',path),true);
  assert.equal(isStudentConductEvidenceQuestion('What does it say?','/',history),true);
  assert.equal(isStudentConductEvidenceQuestion('What does it say?','/',[...history,{role:'user',content:'Show my grades.'}]),false);
  assert.equal(isStudentConductEvidenceQuestion('What does it say?','/',[{role:'assistant',content:history[0].content}]),false);
  assert.equal(isStudentConductEvidenceQuestion('What does it say?','/',[{role:'user',content:'What is student conduct?'}]),false);
  for(const route of ['https://evil.invalid'+path,'//evil.invalid'+path,path+'?userId='+foreign,path+'#private',path+'0','https://a@stu.best'+path])
    assert.equal(isStudentConductEvidenceQuestion('What does this say?',route),false,route);
  assert.equal(isStudentConductEvidenceQuestion('What does this say?','https://stu.best'+path+'/'),true);
});

test('default projection preserves exactly nine literal cells with local provenance, not identity or administrative data',async()=>{
  let calls=0;
  const result=await readStudentConductEvidence({...account,role:'admin'} as typeof account,{question:'Show every detail in my conduct records.'},{load:async captured=>{
    calls++;assert.deepEqual(Object.keys(captured).sort(),['key','requestDeadline','token','url','user']);assert.deepEqual(captured.user,{id:owner});return {records:[row()]};
  }}),value=decode(result);
  assert.equal(calls,1);assert.equal(result.readState,'ok');assert.equal(result.reason,null);
  assert.equal(result.evidence.id,'account:studentConduct');assert.equal(result.evidence.url,path);assert.equal(result.evidence.provenance,'local_demo');
  assert.deepEqual(value.records,[{id:id(),sourceMode:'local_demo',version:1,updatedAt:stamp,occurredOnText:'115/02/31 (literal)',academicYearText:'115',semesterText:'1',yearLevelText:'二',
    reasonText:row().reasonText,conductCode:'M-0',conductName:'Literal conduct label',quantityText:'0',voidStatusText:''}]);
  assert.deepEqual(value.counts,{available:1,matching:1,included:1,omitted:0});assert.equal(value.complete,true);assert.equal(value.excerpted,false);
  assert.equal(value.selection.currentTermDesignated,false);assert.deepEqual(value.selection.identityFields,[]);
  assert.match(value.rules,/not official university records/);assert.match(value.rules,/No merits balance/);
  for(const forbidden of [owner,foreign,'PRIVATE-','createdAt','rowOrder','userId','reviewer','storagePath','role'])assert.ok(!JSON.stringify(result).includes(forbidden),forbidden);
});

test('only specifically requested student identity fields are projected',async()=>{
  for(const [question,expected] of [
    ['What is my student number in my conduct record?',['studentNumber']],
    ["What is the student's name in my conduct record?",['studentName']],
    ['Show my student name and number in the conduct records.',['studentName','studentNumber']],
    ['Show my student number and name in the conduct records.',['studentName','studentNumber']],
    ['我的獎懲紀錄中學號是什麼？',['studentNumber']],
    ['我的獎懲紀錄中姓名是什麼？',['studentName']],
    ['What is my conduct name and code?',[]],
    ['What is the student conduct name and number?',[]],
    ['What is my class name and number in my conduct record?',[]],
    ['Show my student number but not my name in conduct records.',['studentNumber']],
    ['Show my name, without my student number, in conduct records.',['studentName']],
    ['Show my student name and number of conduct records.',['studentName']],
    ['我的獎懲紀錄姓名是什麼？不要顯示學號',['studentName']],
    ['What is my number of conduct records?',[]],
    ['Show my conduct records without my student name and number.',[]],
    ['Show my conduct records; do not include my student name and number.',[]],
    ['Show my conduct records without my student number and name.',[]],
    ['Show my conduct records without my student name, and show my student number.',['studentNumber']],
    ['Show my conduct records without my student number and show my student name.',['studentName']],
    ['查詢獎懲紀錄，不顯示姓名與學號。',[]],
    ['查詢獎懲紀錄，不顯示學號與姓名。',[]],
    ['Show all my conduct details and identity information.',[]],
  ] as const){
    const value=decode(await read({records:[row()]},question));assert.deepEqual(value.selection.identityFields,expected,question);
    for(const field of ['studentName','studentNumber'])assert.equal(Object.hasOwn(value.records[0],field),(expected as readonly string[]).includes(field),question+' '+field);
  }
});

test('nullable cells, blank text, string zero and contradictory literal status are never normalized',async()=>{
  for(const literal of [null,'','0','已作廢 / active']){
    const source={...row(),quantityText:literal,voidStatusText:literal,occurredOnText:literal,reasonText:literal};
    const value=decode(await read({records:[source]}));
    for(const field of ['quantityText','voidStatusText','occurredOnText','reasonText'])assert.equal(value.records[0][field],literal);
    assert.equal(Object.hasOwn(value.records[0],'meritBalance'),false);assert.equal(Object.hasOwn(value.records[0],'isVoid'),false);
  }
});

test('complete owned empty collection is distinct from failed, forbidden and malformed reads',async()=>{
  const empty=decode(await read({records:[]}));assert.equal(empty.readState,'empty');assert.equal(empty.complete,true);assert.deepEqual(empty.counts,{available:0,matching:0,included:0,omitted:0});
  for(const [error,reason] of [[new Error('PRIVATE failure'),'read_failed'],[{status:401},'unauthorized'],[{status:403},'forbidden'],[{status:409},'record_changed']] as const){
    const result=await readStudentConductEvidence(account,{question:'Show my conduct records.'},{load:async()=>{throw error;}});
    assert.equal(result.readState,'unavailable');assert.equal(result.reason,reason);assert.deepEqual(decode(result).counts,{available:null,matching:null,included:0,omitted:null});
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE failure/);
  }
});

test('foreign records, duplicates and every malformed row reject the complete response',async()=>{
  const cases:unknown[]=[{records:[{...row(),userId:foreign}]},{records:[row(),row()]},{records:[row()],adminRows:[]},{records:new Array(1)},{records:[...Array.from({length:1001},(_,i)=>row(i+1))]}];
  for(const patch of [{sourceMode:'official'},{version:0},{version:1000000000},{studentName:undefined},{quantityText:0},{reasonText:'x'.repeat(2001)},{reasonText:'\u0000'},
    {reasonText:'\ud800'},{rowOrder:-1},{createdAt:'0000-01-01T00:00:00Z'},{updatedAt:'2026-02-29T00:00:00Z'},{updatedAt:'2026-11-13T02:00:00+16:00'},
    {id:'invalid'},{storagePath:'PRIVATE PATH'}])cases.push({records:[row(),{...row(2),...patch}]});
  let getters=0;const accessor={...row()};Object.defineProperty(accessor,'reasonText',{enumerable:true,get:()=>{getters++;return 'private';}});cases.push({records:[accessor]});
  const symbols={...row(),[Symbol('private')]:true};cases.push({records:[symbols]});
  const inherited=Object.assign(Object.create({userId:owner}),row());delete inherited.userId;cases.push({records:[inherited]});
  for(const value of cases){const result=await read(value);assert.equal(result.readState,'unavailable');assert.equal(result.reason,'invalid_records');assert.deepEqual(decode(result).records,[]);}
  assert.equal(getters,0);
});

test('account and selection are captured before any asynchronous loader invocation',async()=>{
  const mutable={...account,user:{id:owner},requestDeadline:Date.now()+2000},options={question:'Show my student number in conduct records.',route:path,deadline:Date.now()+1800};
  const expected={url:account.url,key:account.key,token:account.token,user:{id:owner},requestDeadline:options.deadline};let captured:unknown;
  const promise=readStudentConductEvidence(mutable,options,{load:async value=>{captured=structuredClone(value);return {records:[row()]};}});
  mutable.user.id=foreign;mutable.url='https://evil.invalid';mutable.key='CHANGED';mutable.token='CHANGED';mutable.requestDeadline=0;
  options.question='Show my student name.';options.route='/dtm';options.deadline=0;
  const result=await promise;assert.equal(result.readState,'ok');assert.deepEqual(captured,expected);assert.deepEqual(decode(result).selection.identityFields,['studentNumber']);
});

test('invalid context, account, URL and expired deadline cannot start a reader',async()=>{
  let calls=0;const dependencies={load:async()=>{calls++;return {records:[]};}},question='Show my conduct records.';
  for(const invalid of [{...account,user:{id:'invalid'}},{...account,url:'https://other.supabase.co'},{...account,key:''},{...account,token:''}])
    assert.equal((await readStudentConductEvidence(invalid,{question},dependencies)).reason,'unauthorized');
  for(const route of ['https://evil.invalid'+path,path+'#fragment',path+'?userId='+foreign])
    assert.equal((await readStudentConductEvidence(account,{question,route},dependencies)).reason,'unrelated_question');
  assert.equal((await readStudentConductEvidence(account,{question:'Show my grades.',route:path},dependencies)).reason,'unrelated_question');
  for(const deadline of [NaN,Infinity])assert.equal((await readStudentConductEvidence(account,{question,deadline},dependencies)).reason,'invalid_deadline');
  assert.equal((await readStudentConductEvidence(account,{question,deadline:Date.now()-1},dependencies)).reason,'deadline_exceeded');
  const getterAccount={...account};Object.defineProperty(getterAccount,'token',{get:()=>{throw new Error('must not read');}});
  assert.equal((await readStudentConductEvidence(getterAccount,{question},dependencies)).reason,'unauthorized');assert.equal(calls,0);
});

test('both finite deadlines clamp transport and a hung injected loader completes as unavailable',async()=>{
  const question='Show my conduct records.',short=Date.now()+3000;
  await readStudentConductEvidence({...account,requestDeadline:short},{question,deadline:Date.now()+60000},{load:async selected=>{assert.equal(selected.requestDeadline,short);return {records:[]};}});
  const before=Date.now();await readStudentConductEvidence(account,{question,deadline:before+60000},{load:async selected=>{assert.ok(selected.requestDeadline!<=before+12000);return {records:[]};}});
  const pending=readStudentConductEvidence(account,{question,deadline:Date.now()+100},{load:async()=>new Promise(()=>{})});
  const result=await pending;assert.equal(result.readState,'unavailable');assert.equal(result.reason,'deadline_exceeded');
  assert.ok(Date.now()-before<2000);
});

test('bounded evidence includes whole rows with honest counts and validates even rows beyond the budget',async()=>{
  const rows=Array.from({length:20},(_,index)=>({...row(index+1),reasonText:'課'.repeat(1900)+String(index)}));
  const result=await read({records:rows}),value=decode(result);
  assert.ok(Buffer.byteLength(JSON.stringify(result))<=studentConductEvidenceMaxBytes);assert.equal(result.readState,'ok');assert.equal(value.complete,false);assert.equal(value.excerpted,true);
  assert.equal(value.counts.available,20);assert.ok(value.counts.included>0&&value.counts.included<20);assert.equal(value.counts.omitted,20-value.counts.included);
  for(let index=0;index<value.records.length;index++)assert.equal(value.records[index].reasonText,rows[index].reasonText);
  const invalid=await read({records:[...rows,{...row(21),userId:foreign}]});assert.equal(invalid.reason,'invalid_records');assert.deepEqual(decode(invalid).records,[]);
  const sorted=decode(await read({records:[row(3),row(1),row(2)]}));assert.deepEqual(sorted.records.map((item:{id:string})=>item.id),[id(1),id(2),id(3)]);
});

test('document and edit requests provide no action, issuance, or external-service capability',async()=>{
  for(const question of ['Print my conduct records.','Delete my demerit record.','Download my conduct record document.']){
    const result=await read({records:[row()]},question),value=decode(result);assert.equal(result.readState,'ok');
    assert.deepEqual(value.capabilities,{literalConductRows:true,officialSync:false,detailDocument:false,verifiedFile:false,write:false});
    assert.equal(Object.hasOwn(result,'action'),false);assert.equal(Object.hasOwn(result,'proposal'),false);assert.equal(result.evidence.url,path);
  }
});

test('default native transport uses one GET with only the verified caller filter and JWT',async()=>{
  const original=globalThis.fetch;let calls=0;
  const native={id:id(),user_id:owner,source_mode:'local_demo',version:1,created_at:stamp,updated_at:stamp,deleted_at:null,row_order:1,
    occurred_on_text:row().occurredOnText,student_number:row().studentNumber,student_name:row().studentName,academic_year_text:'115',semester_text:'1',year_level_text:'二',
    reason_text:row().reasonText,conduct_code:'M-0',conduct_name:row().conductName,quantity_text:'0',void_status_text:''};
  globalThis.fetch=async(input,init)=>{
    calls++;const url=new URL(String(input));assert.equal(url.origin,account.url);assert.equal(url.pathname,'/rest/v1/affairs_student_conduct');
    assert.equal(url.searchParams.get('user_id'),'eq.'+owner);assert.equal(url.searchParams.get('deleted_at'),'is.null');assert.equal(init?.method,'GET');
    assert.equal(init?.redirect,'error');assert.equal(init?.body,undefined);assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+account.token);
    assert.ok(init?.signal);return new Response(JSON.stringify([native]),{status:200,headers:{'content-type':'application/json'}});
  };
  try{const result=await readStudentConductEvidence(account,{question:'Show my conduct records.'});assert.equal(result.readState,'ok');assert.equal(calls,1);assert.equal(decode(result).records[0].conductCode,'M-0');}
  finally{globalThis.fetch=original;}
});
