import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {aidPaymentsEvidenceMaxBytes,isAidPaymentsEvidenceQuestion,readAidPaymentsEvidence} from '../../server/accountAidPaymentsEvidence.js';
import {aidPaymentsFields,aidPaymentsPaths} from '../../server/aidPaymentsContract.js';
import type {AidPaymentView} from '../../server/aidPaymentsContract.js';
import {selectAidPaymentsEvidence,isAidPaymentsEvidenceQuestion as browserQuestion,isForeignAidPaymentsQuestion} from '../../server/aidPaymentsEvidenceIntent.js';

const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'PRIVATE-KEY',token:'PRIVATE-TOKEN',user:{id:owner}};
const id=(index=1)=>'33333333-3333-4333-8333-'+String(index).padStart(12,'0');
const row=(view:AidPaymentView,index=1)=>view==='claims'
  ?{id:id(index),reason:'Library assistant grant',amount:0,approval_result:'',approval_status:'Pending'}
  :{id:id(index),...Object.fromEntries(aidPaymentsFields.salary.map(([key])=>[key,null])),appointment_type:'Student assistant',payment_period:'115/9–115/10 (literal)',gross:0,tax:-2,net:0,bank_last4:'0091'};
const native=(view:AidPaymentView,total=1,rows:unknown[]=total?[row(view)]:[])=>({userId:owner,view,total,rows});
const decode=(result:Awaited<ReturnType<typeof readAidPaymentsEvidence>>)=>JSON.parse(result.evidence.content);
const read=(value:unknown,question='Show my student aid claims.',route='')=>readAidPaymentsEvidence(account,{question,route},{read:async()=>value});

test('aid intent is specific, caller-only and preserves both explicit views across a mixed question',()=>{
  for(const question of ['Show my student aid claims.','What is my student salary?','How many financial aid payments are saved?','我的助學金請款','我的工讀薪資',
    'Compare my financial aid claims and salary records.','Show my student salary and tuition balance.'])
    assert.equal(isAidPaymentsEvidenceQuestion(question,'/dtm'),true,question);
  for(const question of ['Show my tuition payments.','Show my scholarship application.','What is my student loan balance?','What is student salary?',
    'Show another student salary.','Show her salary.','Show my friend salary.','Show student aid claims for account '+other,'Show salary for student s12345678.'])
    assert.equal(isAidPaymentsEvidenceQuestion(question,aidPaymentsPaths.salary),false,question);
  const history=[{role:'user',content:'Show my financial aid claims.'}];
  assert.equal(isAidPaymentsEvidenceQuestion('What is the total?','/',history),true);
  assert.equal(isAidPaymentsEvidenceQuestion('What is the total?','/',[...history,{role:'user',content:'Show my grades.'}]),false);
  assert.equal(isAidPaymentsEvidenceQuestion('What is the total?','/',[{role:'assistant',content:history[0].content}]),false);
  assert.equal(isAidPaymentsEvidenceQuestion('What is the total?',aidPaymentsPaths.claims),true);
  for(const route of ['https://evil.invalid'+aidPaymentsPaths.claims,'//evil.invalid'+aidPaymentsPaths.claims,aidPaymentsPaths.claims+'?userId='+other,
    aidPaymentsPaths.claims+'#private','https://user@stu.best'+aidPaymentsPaths.claims,'/school-affairs/services/37-10'])
    assert.equal(isAidPaymentsEvidenceQuestion('What is the total?',route),false,route);
  assert.equal(isAidPaymentsEvidenceQuestion('What is the total?','https://stu.best'+aidPaymentsPaths.salary+'/'),true);
  assert.equal(isAidPaymentsEvidenceQuestion('Show my student salary.','/school-affairs/services/12-3?keyword=Database%20Design&course=321'),true);
  assert.equal(isAidPaymentsEvidenceQuestion('What is the total?',aidPaymentsPaths.salary+'?tab=details&view=claims'),true);
  for(const route of [aidPaymentsPaths.salary+'?owner_id='+other,aidPaymentsPaths.salary+'?token=private',aidPaymentsPaths.salary+'?filter=%00'])
    assert.equal(isAidPaymentsEvidenceQuestion('Show my student salary.',route),false,route);
});

test('incidental query filters cannot change owner, native view, selected fields or transport arguments',async()=>{
  for(const [question,route] of [
    ['Show my student salary.','https://stu.best/school-affairs/services/12-3?keyword=Database%20Design&course=321&view=claims&page=99&summary=1'],
    ['What is the net amount?',aidPaymentsPaths.salary+'?view=claims&page=99&summary=1'],
  ]){
    const result=await readAidPaymentsEvidence(account,{question,route},{read:async(caller,query)=>{
      assert.equal(caller.user.id,owner);assert.deepEqual(query,{scope:'aid-payments',view:'salary',page:'1'});return native('salary');
    }});
    assert.equal(result.readState,'ok');assert.deepEqual(decode(result).selection.views,['salary']);assert.deepEqual(result.evidence.urls,[aidPaymentsPaths.salary]);
    assert.equal(JSON.stringify(result).includes('Database'),false);
  }
});

test('shared browser intent excludes negated views without discarding independently positive clauses',async()=>{
  const cases:Array<[string,AidPaymentView[]]>=[
    ['Show my student aid claims, not my salary.',['claims']],
    ['Show my student aid claims, not my salary records.',['claims']],
    ['Do not show my salary; show my student aid claims.',['claims']],
    ['Show my salary without student aid claims.',['salary']],
    ['Do not show student aid claims or my salary.',[]],
    ['Do not show these records.',[]],
    ['Do not show my salary, but show my salary tax.',['salary']],
    ['Show not only my salary but my student aid claims.',['claims','salary']],
    ['查詢助學金請款，不要工讀薪資。',['claims']],
    ['不要助學金請款，但是顯示工讀薪資。',['salary']],
  ];
  for(const [question,expected] of cases){
    assert.deepEqual(selectAidPaymentsEvidence(question,aidPaymentsPaths.salary)?.views??[],expected,question);
    assert.equal(browserQuestion(question,aidPaymentsPaths.salary),expected.length>0,question);
    assert.equal(isAidPaymentsEvidenceQuestion(question,aidPaymentsPaths.salary),expected.length>0,question);
    const called:AidPaymentView[]=[];await readAidPaymentsEvidence(account,{question,route:aidPaymentsPaths.salary},{read:async(_,query)=>{called.push(query.view);return native(query.view);}});
    assert.deepEqual(called,expected,question);
  }
  const source=await readFile(new URL('../../server/aidPaymentsEvidenceIntent.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\b(?:Buffer|process|fetch)\s*\(|from\s+['"](?:node:|\.\/aidPayments\.js)/u);
});

test('foreign payroll routing is explicit and does not turn unrelated foreign requests into aid intent',()=>{
  for(const question of ['Show another student’s salary.','Show another student’s student salary records.','Show her payroll records.','Show my classmate’s financial aid claims.','查詢其他學生的工讀薪資。'])
    assert.equal(isForeignAidPaymentsQuestion(question),true,question);
  for(const question of ['Show my student salary.','Show another student’s grades.','Show her tuition balance.','Show the payroll schema.','What is the scholarship policy?',null])
    assert.equal(isForeignAidPaymentsQuestion(question),false,String(question));
});

test('claim and salary fields remain literal and independent with no bank or identity projection',async()=>{
  for(const view of ['claims','salary'] as const){
    const result=await read(native(view),view==='claims'?'Show my student aid claims.':'Show my student salary.'),value=decode(result);
    assert.equal(result.readState,'ok');assert.equal(result.reason,null);assert.equal(result.evidence.id,'account:aidPayments');
    assert.equal(result.evidence.url,aidPaymentsPaths[view]);assert.deepEqual(result.evidence.urls,[aidPaymentsPaths[view]]);
    assert.equal(result.evidence.provenance,'saved_local');assert.deepEqual(value.provenance,{source:'saved_local',officialUniversityData:false,synchronizationVerified:false,currency:null});
    const projected={...row(view)} as Record<string,unknown>;delete projected.id;delete projected.bank_last4;
    assert.deepEqual(value.views[0].records,[projected]);assert.equal(value.complete,true);assert.equal(value.recordsComplete,true);
    assert.deepEqual(value.counts,{viewsSelected:1,viewsLoaded:1,viewsUnavailable:0,available:1,included:1,omitted:0});
    for(const secret of [owner,other,id(),'PRIVATE-', '0091','bank_last4','userId','rowOrder','storagePath'])assert.ok(!JSON.stringify(result).includes(secret),secret);
    assert.match(value.rules,/null is not zero/);assert.match(value.rules,/do not prove payment reached a bank/);assert.match(value.rules,/No currency/);
  }
});

test('null, zero, negative salary numbers and blank status are not normalized or inferred',async()=>{
  for(const view of ['claims','salary'] as const)for(const literal of [null,0]){
    const source={...row(view),...(view==='claims'?{amount:literal,approval_result:null,approval_status:''}:{net:literal,rate:literal,work_units:literal,student_labor:-3})};
    const value=decode(await read(native(view,1,[source]),view==='claims'?'Show my student aid claims.':'Show my student salary.'));
    assert.equal(value.views[0].records[0][view==='claims'?'amount':'net'],literal);
    assert.equal(Object.hasOwn(value.views[0].records[0],'paid'),false);
    assert.equal(Object.hasOwn(value.views[0].records[0],'currency'),false);
    if(view==='claims')assert.equal(value.views[0].records[0].approval_status,'');else assert.equal(value.views[0].records[0].student_labor,-3);
  }
});

test('count-only positive results are not empty records and detail wording disables summary mode',async()=>{
  for(const question of ['How many student aid claims are saved?','我的助學金請款有幾筆？']){
    const result=await readAidPaymentsEvidence(account,{question},{read:async(_,query)=>{
      assert.deepEqual(query,{scope:'aid-payments',view:'claims',page:'1',summary:'1'});return native('claims',76,[]);
    }}),value=decode(result);
    assert.equal(result.readState,'ok');assert.equal(value.selection.summaryOnly,true);assert.equal(value.complete,true);assert.equal(value.recordsComplete,false);
    assert.equal(value.views[0].counts.available,76);assert.equal(value.views[0].counts.omitted,76);assert.deepEqual(value.views[0].records,[]);
    assert.equal(value.excerpted,false);assert.match(value.rules,/not proof of zero records/);
  }
  for(const question of ['How many student salary records and what is the net amount?','How many student salary records do I have? List them.',
    'How many approved student aid claims do I have?','How many student salary records were paid in November?','How many student salary records for 2026?',
    '我的工讀薪資有幾筆？請列出明細。','我的助學金請款有幾筆已核准？']){
    const detail=await readAidPaymentsEvidence(account,{question},{read:async(_,query)=>{
      assert.equal(query.summary,undefined,question);return native(query.view);
    }});assert.equal(decode(detail).selection.summaryOnly,false);
  }
});

test('successful zero, unavailable and partially successful views are distinct',async()=>{
  const empty=await read(native('claims',0)),emptyValue=decode(empty);
  assert.equal(empty.readState,'empty');assert.equal(emptyValue.complete,true);assert.equal(emptyValue.counts.available,0);
  for(const [error,reason] of [[new Error('PRIVATE failure'),'read_failed'],[{status:401},'unauthorized'],[{status:403},'forbidden']] as const){
    const result=await readAidPaymentsEvidence(account,{question:'Show my student aid claims.'},{read:async()=>{throw error;}}),value=decode(result);
    assert.equal(result.readState,'unavailable');assert.equal(value.views[0].reason,reason);assert.equal(value.complete,false);
    assert.deepEqual(value.views[0].counts,{available:null,returned:null,included:0,omitted:null});assert.equal(value.counts.available,null);
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE failure/);
  }
  const partial=await readAidPaymentsEvidence(account,{question:'Show my student aid claims and salary records.'},{read:async(_,query)=>{
    if(query.view==='salary')throw new Error('private');return native('claims',0);
  }}),value=decode(partial);
  assert.equal(partial.readState,'partial');assert.equal(value.counts.viewsSelected,2);assert.equal(value.counts.viewsLoaded,1);assert.equal(value.counts.viewsUnavailable,1);
  assert.equal(value.counts.available,null);assert.equal(value.complete,false);assert.equal(value.views.find((item:{view:string})=>item.view==='claims').readState,'empty');
});

test('exact owner, view, row shape, first-page completeness and all rows are validated before any projection',async()=>{
  const getter={...row('claims')};let getterCalls=0;Object.defineProperty(getter,'reason',{enumerable:true,get:()=>{getterCalls++;return 'PRIVATE';}});
  const malformed:unknown[]=[{...native('claims'),userId:other},{...native('claims'),view:'salary'},native('claims',26),native('claims',0,[row('claims')]),native('claims',1,[]),
    native('claims',2,[row('claims'),row('claims')]),native('claims',1,[getter]),native('claims',1,new Array(1)),{...native('claims'),adminRows:[]},
    native('claims',1,[{...row('claims'),amount:-1}]),native('claims',1,[{...row('claims'),amount:'0'}]),native('claims',1,[{...row('claims'),user_id:owner}]),
    native('claims',1,[{...row('claims'),id:'invalid'}]),native('claims',1,[{...row('claims'),reason:'x'.repeat(321)}]),native('claims',1,[{...row('claims'),[Symbol('extra')]:true}]),
    native('claims',1,[Object.assign(Object.create({role:'admin'}),row('claims'))]),{...native('claims'),total:Infinity}];
  for(const value of malformed){const result=await read(value);assert.equal(result.readState,'unavailable');assert.equal(decode(result).views[0].reason,'invalid_records');assert.deepEqual(decode(result).views[0].records,[]);}
  assert.equal(getterCalls,0);
  const summary=await read(native('claims'),'How many student aid claims?');assert.equal(decode(summary).views[0].reason,'invalid_records');
  const bank=await read(native('salary',1,[{...row('salary'),bank_last4:'1234567890'}]),'Show my student salary.');assert.equal(decode(bank).views[0].reason,'invalid_records');
});

test('caller and question are captured synchronously, with only the immutable caller sent to the reader',async()=>{
  const mutable={...account,user:{id:owner},role:'admin',requestDeadline:Date.now()+3000};
  const options={question:'Show my student salary.',route:aidPaymentsPaths.salary,deadline:Date.now()+2000};
  const expectedDeadline=options.deadline;let captured:unknown;
  const pending=readAidPaymentsEvidence(mutable,options,{read:async(current,query)=>{
    captured=structuredClone(current);assert.equal(Object.isFrozen(current),true);assert.equal(Object.isFrozen(current.user),true);
    assert.deepEqual(query,{scope:'aid-payments',view:'salary',page:'1'});return native('salary');
  }});
  mutable.user.id=other;mutable.url='https://evil.invalid';mutable.key='CHANGED';mutable.token='CHANGED';mutable.requestDeadline=0;
  options.question='Show another account.';options.route='/';options.deadline=0;
  const result=await pending;assert.equal(result.readState,'ok');assert.deepEqual(captured,{...account,requestDeadline:expectedDeadline});
  assert.deepEqual(decode(result).selection.views,['salary']);
});

test('invalid callers, context and expired inherited deadlines cannot reach a reader',async()=>{
  let calls=0;const dependencies={read:async()=>{calls++;return native('claims',0);}},question='Show my student aid claims.';
  for(const invalid of [{...account,user:{id:'invalid'}},{...account,url:'https://other.supabase.co'},{...account,key:''},{...account,token:''}])
    assert.equal((await readAidPaymentsEvidence(invalid,{question},dependencies)).reason,'unauthorized');
  assert.equal((await readAidPaymentsEvidence({...account,requestDeadline:Date.now()-10},{question},dependencies)).reason,'deadline_exceeded');
  for(const deadline of [NaN,Infinity])assert.equal((await readAidPaymentsEvidence(account,{question,deadline},dependencies)).reason,'invalid_deadline');
  assert.equal((await readAidPaymentsEvidence(account,{question,route:'https://evil.invalid'},dependencies)).reason,'unrelated_question');
  const extra={question,userId:other};assert.equal((await readAidPaymentsEvidence(account,extra,dependencies)).reason,'invalid_context');
  const accessor={...account};Object.defineProperty(accessor,'token',{get:()=>{throw new Error('must not read');}});
  assert.equal((await readAidPaymentsEvidence(accessor,{question},dependencies)).reason,'unauthorized');assert.equal(calls,0);
});

test('two selected reads run concurrently under one clamped deadline without retries',async()=>{
  const calls:AidPaymentView[]=[],deadline=Date.now()+3000;let finish:()=>void=()=>{};const gate=new Promise<void>(resolve=>{finish=resolve;});
  const pending=readAidPaymentsEvidence({...account,requestDeadline:deadline},{question:'Show my student aid claims and my student salary.',deadline:Date.now()+60000},{read:async(caller,query)=>{
    assert.equal(caller.requestDeadline,deadline);calls.push(query.view);if(calls.length===2)finish();await gate;return native(query.view);
  }});
  const result=await pending;assert.equal(result.readState,'ok');assert.deepEqual([...calls].sort(),['claims','salary']);
  assert.deepEqual(decode(result).selection.views,['claims','salary']);assert.equal(decode(result).counts.included,2);
  const before=Date.now();await readAidPaymentsEvidence(account,{question:'Show my student salary.',deadline:before+60000},{read:async caller=>{
    assert.ok(caller.requestDeadline!<=before+8000);return native('salary');
  }});
});

test('hung or late readers finish unavailable and never publish their eventual data',async()=>{
  let calls=0,finish:(value:unknown)=>void=()=>{};
  const delayed=new Promise(resolve=>{finish=resolve;});
  const result=await readAidPaymentsEvidence(account,{question:'Show my student salary.',deadline:Date.now()+100},{read:async()=>{calls++;return delayed;}});
  assert.equal(calls,1);assert.equal(result.readState,'unavailable');assert.equal(decode(result).views[0].reason,'deadline_exceeded');
  const saved=JSON.stringify(result);finish(native('salary'));await Promise.resolve();assert.equal(JSON.stringify(result),saved);
});

test('first-page omissions are explicit and the full envelope budget retains only whole records',async()=>{
  const rows=Array.from({length:25},(_,index)=>({...row('claims',index+1),reason:'課'.repeat(320),approval_result:'\u0001'.repeat(150),approval_status:'簽'.repeat(600)}));
  const result=await read(native('claims',45,rows)),value=decode(result);
  assert.ok(Buffer.byteLength(JSON.stringify(result))<=aidPaymentsEvidenceMaxBytes);assert.equal(result.readState,'partial');
  assert.equal(value.complete,false);assert.equal(value.recordsComplete,false);assert.equal(value.excerpted,true);assert.equal(value.views[0].readState,'partial');
  assert.equal(value.views[0].counts.available,45);assert.equal(value.views[0].counts.returned,25);assert.ok(value.views[0].counts.included>0&&value.views[0].counts.included<25);
  assert.equal(value.views[0].counts.omitted,45-value.views[0].records.length);
  for(const record of value.views[0].records)assert.deepEqual(record,{reason:rows[0].reason,amount:0,approval_result:rows[0].approval_result,approval_status:rows[0].approval_status});
  const invalid=await read(native('claims',25,[...rows.slice(0,24),{...rows[24],amount:'bad'}]));assert.equal(invalid.readState,'unavailable');
});

test('mixed large views retain fair whole-row samples and successful empty reads stay visible',async()=>{
  const result=await readAidPaymentsEvidence(account,{question:'Show my student salary and my student aid claims.'},{read:async(_,query)=>{
    const rows=Array.from({length:25},(_,index)=>({...row(query.view,index+1),...(query.view==='salary'?{appointment_type:'薪'.repeat(600),payment_period:'\u0001'.repeat(150)}:{reason:'款'.repeat(320),approval_status:'簽'.repeat(600)})}));
    return native(query.view,40,rows);
  }}),value=decode(result);
  assert.equal(result.readState,'partial');assert.ok(Buffer.byteLength(JSON.stringify(result))<=aidPaymentsEvidenceMaxBytes);
  assert.equal(value.views.length,2);for(const view of value.views)assert.ok(view.counts.included>0&&view.counts.included<25);
  assert.equal(value.counts.available,80);assert.equal(value.counts.omitted,80-value.counts.included);
});

test('shape-valid responses beyond the raw limit stay unknown rather than silently truncating before validation',async()=>{
  const rows=Array.from({length:25},(_,index)=>({...row('claims',index+1),reason:'課'.repeat(320),approval_result:'\u0001'.repeat(600),approval_status:'簽'.repeat(600)}));
  const source=native('claims',25,rows);assert.ok(Buffer.byteLength(JSON.stringify(source))>128*1024);
  const result=await read(source),value=decode(result);assert.equal(result.readState,'unavailable');assert.equal(value.views[0].reason,'invalid_records');
  assert.equal(value.views[0].counts.available,null);assert.deepEqual(value.views[0].records,[]);assert.equal(value.complete,false);
});

test('payment and bank requests cannot create actions or reveal bank suffixes',async()=>{
  for(const question of ['Pay my student salary now.','Show the bank account on my student salary.','Approve my student aid claims.']){
    const view=question.includes('claims')?'claims':'salary';const result=await read(native(view),question),value=decode(result);
    assert.equal(result.readState,'ok');assert.deepEqual(value.capabilities,{read:true,write:false,approve:false,pay:false,bankAccess:false,verifiedDocument:false});
    assert.equal(Object.hasOwn(result,'action'),false);assert.equal(Object.hasOwn(result,'proposal'),false);assert.doesNotMatch(JSON.stringify(result),/0091|bank_last4/);
  }
});

test('default transport calls only the fixed caller-authorized read RPC with no owner or write argument',async()=>{
  const original=globalThis.fetch;const calls:Array<{view:AidPaymentView;summary:boolean}>=[];
  globalThis.fetch=async(input,init)=>{
    assert.equal(String(input),account.url+'/rest/v1/rpc/affairs_read_aid_payments');assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');
    const headers=new Headers(init?.headers);assert.equal(headers.get('authorization'),'Bearer '+account.token);assert.equal(headers.get('apikey'),account.key);assert.ok(init?.signal);
    const body=JSON.parse(String(init?.body));assert.deepEqual(Object.keys(body).sort(),['p_offset','p_summary','p_view']);assert.equal(body.p_offset,0);
    calls.push({view:body.p_view,summary:body.p_summary});return new Response(JSON.stringify(native(body.p_view,3,[])),{status:200,headers:{'content-type':'application/json'}});
  };
  try{const result=await readAidPaymentsEvidence(account,{question:'How many student aid claims and salary records are saved?'});
    assert.equal(result.readState,'ok');assert.equal(calls.length,2);assert.ok(calls.every(call=>call.summary));assert.equal(decode(result).counts.available,6);
  }finally{globalThis.fetch=original;}
});
