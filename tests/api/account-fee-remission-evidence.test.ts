import assert from 'node:assert/strict';
import test from 'node:test';
import {readFeeRemissionEvidence,feeRemissionEvidenceMaxBytes} from '../../server/accountFeeRemissionEvidence.js';
import {selectFeeRemissionEvidence,isFeeRemissionEvidenceQuestion} from '../../server/feeRemissionEvidenceIntent.js';
import type {FeeRemissionHistory,FeeRemissionRecord} from '../../server/feeRemissionContract.js';

const owner='62000000-0000-4000-8000-000000000001',foreign='62000000-0000-4000-8000-000000000002';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_KEY',token:'OFFLINE_TOKEN',user:{id:owner}};
const route='/school-affairs/services/21-3',question='Show my fee remission records.';
const row=(index=0,overrides:Partial<FeeRemissionRecord>={}):FeeRemissionRecord=>({id:'62000000-0000-4000-8001-'+String(index+1).padStart(12,'0'),version:3,row_order:index,
  academic_year_text:'115',semester_text:'1',student_number:'PRIVATE_STUDENT_NUMBER',category_text:'Local tuition reduction',amount_text:'0',check_status_text:'Waiting for local check',notes_text:null,...overrides});
const history=(records:FeeRemissionRecord[]=[row()]):FeeRemissionHistory=>({userId:owner,records});
const payload=(value:Awaited<ReturnType<typeof readFeeRemissionEvidence>>)=>JSON.parse(value.evidence.content);
const read=(native:unknown=history(),q=question,options:Record<string,unknown>={})=>readFeeRemissionEvidence(account,{question:q,route,...options},{load:async()=>native});

test('explicit source relevance and bounded contextual follow-ups do not substitute charges or other student services',()=>{
  for(const q of [question,'What is my tuition reduction amount?','請顯示我的學雜費減免紀錄。','Show my fee remission and my tuition balance.'])assert.equal(isFeeRemissionEvidenceQuestion(q,'/'),true,q);
  for(const q of ['What is fee remission?','What is my tuition balance?','Show my student loan.','Show my grades.','How can I connect to Wi-Fi?'])assert.equal(isFeeRemissionEvidenceQuestion(q,route,[{role:'user',content:question}]),false,q);
  assert.equal(selectFeeRemissionEvidence('What is its status?',route)?.from,'route');
  assert.equal(selectFeeRemissionEvidence('What is its status?','/',[{role:'user',content:question}])?.from,'history');
  assert.equal(selectFeeRemissionEvidence('What is its status?','/',[{role:'assistant',content:question}]),null);
  assert.equal(selectFeeRemissionEvidence('What is its status?','/',[{role:'user',content:question},{role:'user',content:'Show my grades.'}]),null);
});

test('negative source and identity requests remain excluded and explicit later requests can be included',async()=>{
  for(const q of ['Do not show my fee remission records.','Show my tuition balance, not my fee remission.','Show my tuition balance and never show my fee remission.','Show my tuition balance and don’t include my fee remission.','不要顯示我的學雜費減免紀錄。'])assert.equal(isFeeRemissionEvidenceQuestion(q,route,[{role:'user',content:question}]),false,q);
  for(const q of ['Show my fee remission without my student number.','Show my fee remission. Do not include my student number.','Show my fee remission, excluding my name and student number.',
    'Show my fee remission and never show my student number.',"Show my fee remission and don't include my student number.",'Show my fee remission and don’t include my student number.',
    'Show my fee remission and do not include my student number.','請顯示我的學雜費減免紀錄，並且不要顯示我的學號。','請顯示我的學雜費減免紀錄並且不要顯示我的學號。']){
    const result=await read(history(),q);assert.equal(payload(result).selection.studentNumber,false,q);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_STUDENT_NUMBER/u);
  }
  const result=await read(history(),'Show my fee remission without my student number, but include my student number.');
  assert.equal(payload(result).records[0].student_number,'PRIVATE_STUDENT_NUMBER');
  const reintroduced=await read(history(),'Show my fee remission and never show my student number, but include my student number.');
  assert.equal(payload(reintroduced).records[0].student_number,'PRIVATE_STUDENT_NUMBER');
});

test('named and third-party requests are refused before loading caller records',async()=>{
  for(const q of ["Show Alice's fee remission records.",'What is the fee remission status for Alice?','Show her tuition waiver.','Show my sister’s fee remission records.','Show fee remission records for my colleague.','請顯示王小明的學雜費減免紀錄。']){
    let calls=0;const result=await readFeeRemissionEvidence(account,{question:q,route},{load:async()=>{calls++;return history();}});
    assert.equal(result.reason,'foreign_request',q);assert.equal(calls,0,q);assert.deepEqual(payload(result).records,[]);
  }
  assert.equal((await read(history(),'請查看我自己的學雜費減免紀錄。')).readState,'ok');
  assert.equal((await read(history(),'Show my fee remission records for low-income students.')).readState,'ok');
});

test('literal year, semester, category, amount, check status and notes survive without default identity or metadata',async()=>{
  const native=history([row(0,{amount_text:'0',notes_text:''}),row(1,{academic_year_text:'114',semester_text:'2',category_text:null,amount_text:null,check_status_text:'unknown',notes_text:'Saved note'})]);
  const before=structuredClone(native),result=await read(native),p=payload(result);
  assert.equal(result.readState,'ok');assert.deepEqual(p.counts,{available:2,matching:2,included:2,omitted:0});
  assert.deepEqual(p.records,[
    {academic_year_text:'115',semester_text:'1',category_text:'Local tuition reduction',amount_text:'0',check_status_text:'Waiting for local check',notes_text:''},
    {academic_year_text:'114',semester_text:'2',category_text:null,amount_text:null,check_status_text:'unknown',notes_text:'Saved note'},
  ]);
  assert.deepEqual(native,before);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_STUDENT_NUMBER|OFFLINE_|62000000|"version"|"row_order"/u);
  assert.equal(result.evidence.provenance,'saved_local');assert.equal(result.evidence.url,route);assert.deepEqual(result.evidence.urls,[route]);
  assert.equal(p.capability.payment,false);assert.equal(p.capability.eligibility,false);assert.equal(p.capability.write,false);
  assert.match(p.rules,/not a tuition balance or payment transaction/u);
});

test('student number is available only on an explicit positive field request, with other identity fields absent',async()=>{
  const result=await read(history(),'Which student number is recorded on my fee remission history?');
  assert.equal(payload(result).records[0].student_number,'PRIVATE_STUDENT_NUMBER');
  assert.deepEqual(Object.keys(payload(result).records[0]),['academic_year_text','semester_text','student_number','category_text','amount_text','check_status_text','notes_text']);
  assert.doesNotMatch(JSON.stringify(result),/OFFLINE_|62000000|"version"|"row_order"/u);
  for(const q of ['Show my fee remission. In my student loan, show my student number.','Show my fee remission and my student number in my school profile.']){
    const scoped=await read(history(),q);assert.equal(payload(scoped).selection.studentNumber,false,q);assert.doesNotMatch(JSON.stringify(scoped),/PRIVATE_STUDENT_NUMBER/u);
  }
});

test('exact selected period and latest explicit period override history without relabeling native strings',async()=>{
  const native=history([row(0,{academic_year_text:'114',semester_text:'2'}),row(1),row(2,{academic_year_text:'0115'})]);
  for(const q of ['Show my fee remission for academic year 115 semester 1.','查詢我的115學年度第1學期學雜費減免紀錄。']){
    const result=await read(native,q);assert.equal(result.readState,'ok');assert.deepEqual(payload(result).counts,{available:3,matching:1,included:1,omitted:0});
    assert.equal(payload(result).records[0].academic_year_text,'115');
  }
  const prior=[{role:'user',content:'Show my fee remission for academic year 114 semester 2.'}];
  const following=await read(native,'What is its status?',{route:'/',history:prior});assert.equal(payload(following).records[0].academic_year_text,'114');
  const changed=await read(native,'For academic year 115 and semester 1.',{route:'/',history:prior});assert.equal(payload(changed).records[0].academic_year_text,'115');
});

test('current-period question cannot infer current designation from highest year, wall time or other systems',async()=>{
  const result=await read(history([row(),row(1,{academic_year_text:'9999',semester_text:'9',amount_text:'SECRET_FUTURE_AMOUNT'})]),'Show my current semester fee remission.');
  const p=payload(result);assert.equal(result.reason,'current_term_not_designated');assert.equal(result.readState,'unavailable');
  assert.deepEqual(p.records,[]);assert.equal(p.counts,null);assert.deepEqual(p.periodChoices,[{academic_year_text:'115',semester_text:'1'},{academic_year_text:'9999',semester_text:'9'}]);
  assert.doesNotMatch(JSON.stringify(result),/SECRET_FUTURE_AMOUNT|PRIVATE_STUDENT_NUMBER/u);
});

test('explicit malformed period cannot silently return every row and quoted literal periods preserve their labels',async()=>{
  for(const q of ['Show my fee remission for academic year ABC.','Show my fee remission, academic year ABC.','Show my fee remission for semester summer.','Show my fee remission for semester "".','Show my fee remission for academic year 115 and semester "   ".']){
    let calls=0;const result=await readFeeRemissionEvidence(account,{question:q,route},{load:async()=>{calls++;return history();}});
    assert.equal(result.reason,'invalid_period',q);assert.equal(calls,0);
  }
  const result=await read(history([row(0,{academic_year_text:'0115',semester_text:'01'}),row(1,{academic_year_text:'Local year',semester_text:'Summer'})]),
    'Show my fee remission for academic year "Local year" and semester "Summer".');
  assert.equal(result.readState,'ok');assert.equal(payload(result).records.length,1);assert.equal(payload(result).records[0].semester_text,'Summer');
});

test('leading standalone period scopes the requested source without borrowing another collection period',async()=>{
  const native=history([row(0,{academic_year_text:'114',semester_text:'2'}),row(1)]);
  for(const q of ['For academic year 115 semester 1, show my fee remission amount but do not show my student number.',
    'For academic year 115, semester 1, show my fee remission.', '115學年度第1學期，請顯示我的學雜費減免紀錄。']){
    const result=await read(native,q);assert.equal(payload(result).counts.matching,1,q);assert.equal(payload(result).records[0].academic_year_text,'115',q);
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE_STUDENT_NUMBER/u);
  }
  const unrelated=await read(native,'For academic year 114 semester 2, show my grades. Also show my fee remission.');
  assert.equal(payload(unrelated).selection.academicYear,null);assert.equal(payload(unrelated).counts.matching,2);
  assert.equal((await read(native,'For this semester, show my fee remission.')).reason,'current_term_not_designated');
  assert.equal((await read(native,'For academic year ABC, show my fee remission.')).reason,'invalid_period');
  for(const [q,year,semester] of [['Show my fee remission for academic year 115, semester 1.','115','1'],['Show my fee remission for semester 2, academic year 114.','114','2']]){
    const selected=await read(native,q);assert.equal(payload(selected).counts.matching,1,q);assert.equal(payload(selected).selection.academicYear,year);assert.equal(payload(selected).selection.semester,semester);
  }
});

test('a foreign antecedent cannot be replaced with the caller by an incidental native route',async()=>{
  let calls=0;const prior=[{role:'user',content:"Show Alice's fee remission."}];
  const result=await readFeeRemissionEvidence(account,{question:'What is its status?',route,history:prior},{load:async()=>{calls++;return history();}});
  assert.equal(result.reason,'foreign_request');assert.equal(calls,0);
  assert.equal((await read(history(),'What is my status?',{history:prior})).readState,'ok');
});

test('successful empty, exact nonmatching period and failed reads cannot become each other',async()=>{
  const empty=await read(history([]));assert.equal(empty.readState,'empty');assert.deepEqual(payload(empty).counts,{available:0,matching:0,included:0,omitted:0});
  const unmatched=await read(history(),'Show my fee remission for academic year 113 semester 1.');assert.equal(unmatched.readState,'empty');assert.deepEqual(payload(unmatched).counts,{available:1,matching:0,included:0,omitted:0});
  for(const error of [new Error('PRIVATE_BACKEND_ERROR'),{status:403}]){
    const failed=await readFeeRemissionEvidence(account,{question,route},{load:async()=>{throw error;}});
    assert.equal(failed.readState,'unavailable');assert.equal(payload(failed).counts,null);assert.equal(payload(failed).complete,false);assert.doesNotMatch(JSON.stringify(failed),/PRIVATE_BACKEND_ERROR/u);
  }
});

test('mutations and period conflicts cannot perform native reads while document requests disclose no document capability',async()=>{
  for(const q of ['Delete my fee remission records.','Submit my tuition waiver.','Approve my fee remission.','For academic year 115 semester 1, delete my fee remission records.','Show my fee remission records and approve my fee remission.','Show my fee remission for academic year 114 and academic year 115.']){
    let reads=0;const result=await readFeeRemissionEvidence(account,{question:q,route},{load:async()=>{reads++;return history();}});
    assert.equal(reads,0,q);assert.ok(['unsupported_operation','ambiguous_period'].includes(result.reason!),q);
  }
  const document=await read(history(),'Show my fee remission and its downloadable certificate.');
  assert.equal(payload(document).selection.document,true);assert.equal(payload(document).capability.document,false);
});

test('strict native envelope rejects foreign, duplicate, unordered, malformed, extra and accessor fields',async()=>{
  const invalid:unknown[]=[null,{userId:foreign,records:[row()]},history([row(),row()]),history([row(1),row(0)]),
    history([row(0,{amount_text:0 as unknown as string})]),history([row(0,{notes_text:'\0'})]),
    {...history(),admin:true},history([{...row(),admin:true} as FeeRemissionRecord]),history([row(0,{student_number:'a'.repeat(81)})])];
  let accessed=0;const accessor={...row()};Object.defineProperty(accessor,'amount_text',{enumerable:true,get(){accessed++;throw new Error();}});invalid.push(history([accessor]));
  for(const native of invalid){const result=await read(native);assert.equal(result.reason,'invalid_records');assert.deepEqual(payload(result).records,[]);}
  assert.equal(accessed,0);
});

test('strict context and account validation rejects coercible identity and normalized foreign routes without a native read',async()=>{
  let reads=0,coercions=0;const load=async()=>{reads++;return history();};
  for(const invalidRoute of ['https://evil.invalid/school-affairs/services/21-3','//stu.best/school-affairs/services/21-3','/school-affairs/services/21-2/../21-3','/school-affairs/services/%2e%2e/21-3',route+'?user_id='+foreign,route+'#fragment']){
    assert.equal((await readFeeRemissionEvidence(account,{question,route:invalidRoute},{load})).reason,'invalid_route');
  }
  assert.equal((await readFeeRemissionEvidence({...account,user:{id:{toString(){coercions++;return owner;}}}} as unknown as typeof account,{question,route},{load})).reason,'unauthorized');
  assert.equal((await readFeeRemissionEvidence(account,null as never,{load})).reason,'invalid_options');
  assert.equal(reads,0);assert.equal(coercions,0);
});

test('account credentials are captured synchronously and the injected reader receives no target-user selector',async()=>{
  const mutable={...account,user:{id:owner},role:'admin',targetUserId:foreign};let observed:unknown;
  const promise=readFeeRemissionEvidence(mutable,{question,route},{load:async(...args)=>{assert.equal(args.length,1);observed=args[0];return history();}});
  mutable.user.id=foreign;mutable.token='MUTATED_TOKEN';mutable.url='https://evil.invalid';
  assert.equal((await promise).readState,'ok');assert.deepEqual(Object.keys(observed as object),['url','key','token','user','requestDeadline']);
  assert.deepEqual((observed as typeof account).user,{id:owner});assert.equal((observed as typeof account).token,'OFFLINE_TOKEN');
});

test('whole-row Unicode budgeting never truncates fields or calls an excerpt a complete record history',async()=>{
  const records=Array.from({length:25},(_,index)=>row(index,{notes_text:'教'.repeat(2000),category_text:'Category '+index}));
  const result=await read(history(records)),p=payload(result);
  assert.equal(result.readState,'partial');assert.equal(p.complete,false);assert.ok(p.counts.included>0);assert.ok(p.counts.omitted>0);
  assert.equal(p.counts.included+p.counts.omitted,25);assert.ok(Buffer.byteLength(JSON.stringify(result))<=feeRemissionEvidenceMaxBytes);
  for(const projected of p.records)assert.equal(projected.notes_text,'教'.repeat(2000));
});

test('invalid, expired and ignored read deadlines remain bounded unavailable results',async()=>{
  let calls=0;const load=async()=>{calls++;return history();};
  assert.equal((await readFeeRemissionEvidence(account,{question,route,deadline:NaN},{load})).reason,'invalid_deadline');
  assert.equal((await readFeeRemissionEvidence(account,{question,route,deadline:Date.now()-1},{load})).reason,'deadline_exceeded');assert.equal(calls,0);
  const hung=await readFeeRemissionEvidence(account,{question,route,deadline:Date.now()+20},{load:async()=>new Promise(()=>{})});assert.equal(hung.reason,'deadline_exceeded');
});

test('actual native loader uses exact caller JWT, fixed read RPC and empty argument body',async()=>{
  const original=globalThis.fetch,calls:string[]=[];
  globalThis.fetch=async(input,options)=>{
    const url=new URL(String(input));calls.push(url.pathname);assert.equal(url.origin,account.url);assert.equal(url.pathname,'/rest/v1/rpc/affairs_read_fee_remission');
    assert.equal(options?.method,'POST');assert.equal(options?.redirect,'error');assert.deepEqual(JSON.parse(String(options?.body)),{});
    assert.ok(options);assert.equal((options.headers as Record<string,string>).Authorization,'Bearer OFFLINE_TOKEN');return Response.json(history());
  };
  try{assert.equal((await readFeeRemissionEvidence(account,{question,route})).readState,'ok');assert.equal(calls.length,1);}finally{globalThis.fetch=original;}
});
