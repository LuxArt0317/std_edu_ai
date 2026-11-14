import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readCounselingEvidence,counselingEvidenceMaxBytes,unavailableCounselingEvidence,type CounselingEvidenceResult} from '../../server/accountCounselingEvidence.js';
import {selectCounselingEvidence,isCounselingEvidenceQuestion,isCounselingNavigationQuestion,isCounselingFieldClause,withoutExcludedCounselingClause} from '../../server/counselingEvidenceIntent.js';
const owner='29000000-0000-4000-8000-000000000001',foreign='29000000-0000-4000-8000-000000000002',path='/school-affairs/services/29-1/appointments';
const account=()=>({url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_KEY',token:'OFFLINE_TOKEN',user:{id:owner}});
const question='Show my saved counseling appointments.';
const row=(index=1,extra:Record<string,unknown>={})=>({id:'29000000-0000-4000-8001-'+String(index).padStart(12,'0'),kind:'counseling',status:'requested',preferred_on:'2026-11-20',preferred_period:'morning',scheduled_at:null,version:1,updated_at:'2026-11-14T02:00:00+00:00',...extra});
const dto=(rows:unknown[]=[row()],extra:Record<string,unknown>={})=>({userId:owner,available:true,canCoordinate:false,rows,...extra});
const p=(value:CounselingEvidenceResult)=>JSON.parse(value.evidence.content);
const read=(value:unknown=dto(),q=question,route=path)=>readCounselingEvidence(account(),{question:q,route},{read:async()=>value});

test('own native DTO projects only five literal appointment fields and distinguishes requested date from scheduled instant',async()=>{
  const value=dto([row(1,{kind:'assessment',status:'scheduled',scheduled_at:'2026-11-21T13:30:00+08:00'}),row(2,{status:'cancelled',scheduled_at:'2026-11-10T02:15:00.000000+00:00'}),row(3,{status:'closed'})],{available:false,canCoordinate:true}),original=structuredClone(value);
  const result=await read(value),body=p(result);
  assert.equal(result.readState,'ok');assert.equal(result.evidence.id,'account:counselingAppointments');assert.equal(result.evidence.url,path);
  assert.deepEqual(body.records,[{kind:'assessment',status:'scheduled',preferredOn:'2026-11-20',preferredPeriod:'morning',scheduledAt:'2026-11-21T13:30:00+08:00'},
    {kind:'counseling',status:'cancelled',preferredOn:'2026-11-20',preferredPeriod:'morning',scheduledAt:'2026-11-10T02:15:00.000000+00:00'},
    {kind:'counseling',status:'closed',preferredOn:'2026-11-20',preferredPeriod:'morning',scheduledAt:null}]);
  assert.deepEqual(body.counts,{returned:3,included:3,omitted:0,total:3,totalLowerBound:3,nativeLimit:50,truncationPossible:false});assert.equal(body.complete,true);
  assert.equal(body.provenance.sourceMode,'saved_local');assert.equal(body.capability.write,false);
  assert.doesNotMatch(result.evidence.content,/29000000|OFFLINE_|canCoordinate|consent_version|contact_email|updated_at|"available"/u);
  assert.match(body.rules,/requested preferences, never a confirmed/u);assert.match(body.rules,/Closed does not prove attendance/u);assert.deepEqual(value,original);
});

test('actual native transport requests mine only using captured caller, never queue/access or changes',async()=>{
  const previous=globalThis.fetch,calls:unknown[]=[];
  globalThis.fetch=async(input,options)=>{calls.push(input);assert.equal(String(input),'https://xiftudmvxphxcjtmfmib.supabase.co/rest/v1/rpc/affairs_read_counseling');
    assert.equal(options?.method,'POST');assert.equal(options?.redirect,'error');assert.equal(new Headers(options?.headers).get('authorization'),'Bearer OFFLINE_TOKEN');
    assert.deepEqual(JSON.parse(String(options?.body)),{p_view:'mine'});return Response.json(dto());};
  try{assert.equal((await readCounselingEvidence(account(),{question,route:path})).readState,'ok');assert.equal(calls.length,1);}finally{globalThis.fetch=previous;}
});

test('successful empty, unread failure, and exactly50 native cap remain distinct',async()=>{
  const empty=p(await read(dto([])));assert.equal(empty.readState,'empty');assert.equal(empty.collectionState,'empty');assert.equal(empty.counts.total,0);assert.equal(empty.complete,true);
  const capped=p(await read(dto(Array.from({length:50},(_,i)=>row(i+1,{status:'closed'})))));
  assert.equal(capped.readState,'partial');assert.equal(capped.counts.total,null);assert.equal(capped.counts.totalLowerBound,50);assert.equal(capped.counts.truncationPossible,true);assert.equal(capped.complete,false);
  assert.equal(capped.counts.included+capped.counts.omitted,50);assert.ok(Buffer.byteLength(JSON.stringify(await read(dto(Array.from({length:50},(_,i)=>row(i+1,{status:'closed'}))))))<=counselingEvidenceMaxBytes);
  assert.equal((await read(dto(Array.from({length:50},(_,i)=>row(i+1,{status:'closed'}))),'How many counseling appointment records were returned, and is that my exact complete history?')).readState,'partial');
  for(const reason of ['read_failed','access_denied']){const failed=p(unavailableCounselingEvidence(reason));assert.equal(failed.counts.total,null);assert.equal(failed.counts.returned,null);assert.equal(failed.counts.totalLowerBound,null);assert.equal(failed.complete,false);}
});

test('source validates strict own DTO, exact fields, canonical statuses, dates, timestamps and one-open invariant',async()=>{
  const invalid=[dto([],{userId:foreign}),dto([],{available:null}),dto([],{canCoordinate:'false'}),dto([],{clinicalNotes:'PRIVATE'}),dto(Array.from({length:51},(_,i)=>row(i+1,{status:'closed'}))),dto([row(),row()]),dto([row(),row(2)]),
    ...[{user_id:owner},{contact_email:'PRIVATE'},{clinical_content:'PRIVATE'},{id:null},{kind:'therapy'},{status:'approved'},{status:'scheduled',scheduled_at:null},
      {preferred_on:'2026-02-30'},{preferred_on:'0000-01-01'},{preferred_on:'2026-1-2'},{preferred_period:'evening'},{scheduled_at:''},{scheduled_at:'2026-02-30T12:00:00Z'},
      {scheduled_at:'2026-01-01T24:00:00Z'},{scheduled_at:'2026-01-01T12:00:00+16:00'},{updated_at:'PRIVATE'},{updated_at:'2026-11-14'},
      {version:0},{version:1000001},{version:1.5}].map(extra=>dto([row(1,extra)]))];
  for(const value of invalid){const result=await read(value);assert.equal(result.reason,'invalid_records',JSON.stringify(value));assert.deepEqual(p(result).records,[]);}
  const sparse=dto([]);sparse.rows.length=1;assert.equal((await read(sparse)).reason,'invalid_records');
  const getters=dto();let touched=false;Object.defineProperty(getters,'available',{get(){touched=true;return true;}});assert.equal((await read(getters)).reason,'invalid_records');assert.equal(touched,false);
});

test('foreign and named ownership never substitute caller records',async()=>{
  for(const q of ["Show Alice's counseling appointments.",'What is the counseling appointment status for Alice?','Which counseling appointments does Alice have?',
    'Show counseling appointments that Bob owns.','Show Alice counseling appointments.','Show my friend’s counseling records.','Show her counseling appointments.',
    'Show the counseling appointment available for Alice.','Show counseling appointments booked by Alice.',
    'Show the counseling appointment record for my colleague.','請顯示王小明的諮商預約紀錄。','請顯示王小明諮商預約。']){
    const result=await readCounselingEvidence(account(),{question:q,route:path},{read:async()=>assert.fail('Foreign target must not read')});assert.equal(result.reason,'foreign_request',q);
  }
  for(const q of ['Show my counseling appointments and their dates.','請顯示我自己的諮商預約紀錄。'])assert.equal((await read(dto(),q)).readState,'ok',q);
});

test('write and coordinator views fail before transport, while historical cancelled status is readable',async()=>{
  for(const [q,reason]of [['Cancel my counseling appointment.','unsupported_operation'],['For next week, book my counseling appointment.','unsupported_operation'],
    ['Show my counseling appointments and cancel them.','unsupported_operation'],['Show my counseling appointments, then cancel them.','unsupported_operation'],['Delete my counseling records.','unsupported_operation'],
    ['Show the counseling queue.','restricted_view'],['Show my counseling access list.','restricted_view'],['Show my counseling coordinator details.','restricted_view']] as const){
    assert.equal((await readCounselingEvidence(account(),{question:q,route:path},{read:async()=>assert.fail('No operation transport')})).reason,reason,q);
  }
  assert.equal((await read(dto([row(1,{status:'cancelled'})]),'Show my cancelled counseling appointment history.')).readState,'ok');
  assert.equal((await readCounselingEvidence(account(),{question:'Show my appointments.',route:'/school-affairs/services/29-1/queue'},{read:async()=>assert.fail('No queue fallback')})).reason,'restricted_view');
});

test('only explicit own metadata or bounded latest-user followup selects a read',()=>{
  for(const q of ['What is counseling?','Where can I book a counseling appointment?','How do I access counseling?','Write code for a calendar.','Show my tuition balance.',
    'Do not show my counseling appointments.','Show tuition, never show my counseling appointments.',
    'Show my unpaid balance for QA Counseling Tuition instalment and do not show my counseling appointments.'])assert.equal(selectCounselingEvidence(q,path),null,q);
  assert.equal(selectCounselingEvidence('Show my counseling appointments and tuition balance.',path)?.from,'question');
  assert.equal(isCounselingEvidenceQuestion(question,'/dtm'),true);
  const history=[{role:'user',content:question},{role:'assistant',content:"Alice's appointment is scheduled."}];
  assert.equal(selectCounselingEvidence('What about its status?','/',history)?.from,'history');
  assert.equal(selectCounselingEvidence('What about its status?','/',[{role:'assistant',content:question}]),null);
  assert.equal(selectCounselingEvidence('What about its status?','/',[{role:'user',content:question},{role:'user',content:'Show my tuition balance.'}]),null);
  assert.equal(selectCounselingEvidence('Show my appointments.',path)?.from,'route');
});

test('an incidental native route does not replace the latest explicitly different user antecedent',async()=>{
  const history=[{role:'user',content:'What is my tuition payment due date?'}];
  assert.equal(selectCounselingEvidence('When is it?',path,history),null);
  assert.equal((await readCounselingEvidence(account(),{question:'When is it?',route:path,history},{read:async()=>assert.fail('No unrelated route read')})).reason,'unrelated_question');
  assert.equal(selectCounselingEvidence(question,path,history)?.from,'question');
  assert.equal(selectCounselingEvidence('When is it?',path)?.from,'route');
});

test('own contractions and record possessives read metadata while third-party possessives still deny before transport',async()=>{
  for(const q of ["What's my counseling appointment status?",'What’s my counseling appointment status?',
    "Show my counseling appointment's scheduled time.",'Show my counseling appointment’s scheduled time.']){
    let calls=0;const result=await readCounselingEvidence(account(),{question:q,route:path},{read:async()=>{calls++;return dto();}});
    assert.equal(calls,1,q);assert.equal(result.readState,'ok',q);assert.equal(p(result).records[0].scheduledAt,null);
  }
  for(const q of ["What's Alice's counseling appointment status?",'What’s my friend’s counseling appointment status?',
    "Show Alice's counseling appointment's scheduled time."]){
    const result=await readCounselingEvidence(account(),{question:q,route:path},{read:async()=>assert.fail('No foreign substitution')});
    assert.equal(result.reason,'foreign_request',q);
  }
});

test('natural scheduling followups resolve own latest-user context and never reopen after an independent fee question',async()=>{
  const ownHistory=[{role:'user',content:question},{role:'assistant',content:'A requested appointment has no saved scheduled time.'}];
  const feeHistory=[...ownHistory,{role:'user',content:'What is my tuition payment due date?'},{role:'assistant',content:'See the saved charge.'}];
  for(const q of ['Is it still scheduled?','Did I get a slot?','What about the time?']){
    let calls=0;const result=await readCounselingEvidence(account(),{question:q,route:'/',history:ownHistory},{read:async()=>{calls++;return dto();}});
    assert.equal(calls,1,q);assert.equal(result.readState,'ok');assert.equal(p(result).selection.from,'history');
    assert.equal(p(result).records[0].status,'requested');assert.equal(p(result).records[0].scheduledAt,null);
    for(const route of ['/',path]){
      const skipped=await readCounselingEvidence(account(),{question:q,route,history:feeHistory},{read:async()=>assert.fail('No unrelated fee followup read')});
      assert.equal(skipped.reason,'unrelated_question',q);
    }
    assert.equal(selectCounselingEvidence(q,'/',[{role:'assistant',content:question}]),null,q);
  }
});

test('legacy counseling tracking notes do not become native appointments, while explicit clinical notes remain a metadata limitation',async()=>{
  for(const q of ['What reference is in my counseling note?','Show my saved counseling tracking note','Show my counseling note. Also show my tuition balance.']){
    for(const route of ['/',path]){
      assert.equal(selectCounselingEvidence(q,route),null,q);
      const result=await readCounselingEvidence(account(),{question:q,route},{read:async()=>assert.fail('Legacy tracker must not read appointments')});
      assert.equal(result.reason,'unrelated_question',q);
    }
  }
  for(const q of ['Show my clinical counseling notes.','Show my counselor session notes.','Show my counseling appointment history and clinical notes.']){
    let calls=0;const result=await readCounselingEvidence(account(),{question:q,route:path},{read:async()=>{calls++;return dto();}});
    assert.equal(calls,1,q);assert.equal(result.readState,'ok');assert.equal(p(result).selection.clinical,true,q);
    assert.equal(p(result).capability.clinicalContent,false);assert.equal(Object.hasOwn(p(result).records[0],'notes'),false);
  }
  for(const q of ['Show her counselor session notes.','Show counselor session notes for Alice.']){
    const result=await readCounselingEvidence(account(),{question:q,route:path},{read:async()=>assert.fail('No clinical foreign-subject substitution')});
    assert.equal(result.reason,'foreign_request',q);
  }
  assert.equal(selectCounselingEvidence('When is it?',path,[{role:'user',content:'Show my saved counseling tracking note'}]),null);
});

test('shared residual helpers preserve positive clauses without expanding to unrelated private domains',()=>{
  for(const part of ['preferred date','clinical results','PDF reports and student name','then cancel them','separately from my preferred date',
    'explain whether the saved time makes it active','is that my exact complete history','the clinical notes or psychological diagnosis',
    'download their report files','the counselor contact email','student contact emails'])assert.equal(isCounselingFieldClause(part),true,part);
  for(const part of ['my tuition balance','my DTM grades','my course history','my student loan status','do not include clinical results','never cancel them',''])assert.equal(isCounselingFieldClause(part),false,part);
  const positive='Show my unpaid balance for QA Counseling Tuition instalment';
  assert.equal(withoutExcludedCounselingClause(positive+' and do not show my counseling appointments.'),positive);
  assert.equal(withoutExcludedCounselingClause('Do not show my counseling appointments. '+positive+'.'),positive);
  const included='Show my counseling appointments and my tuition balance.';assert.equal(withoutExcludedCounselingClause(included),included);
  const multiple='Do not show my counseling appointments. Show my tuition balance. Show my grades.';assert.equal(withoutExcludedCounselingClause(multiple),multiple);
  for(const q of ['Where can I view my counseling appointments?','How do I access counseling?','Give me a link to my counseling appointments.'])assert.equal(isCounselingNavigationQuestion(q),true,q);
  for(const q of ['Where can I view my counseling appointments? Also show my tuition balance.','Show my counseling appointments.','Do not show my counseling appointments.',"Where can I view Alice's counseling appointments?",'What is counseling?','Explain counseling.'])assert.equal(isCounselingNavigationQuestion(q),false,q);
});

test('clinical, document and identity questions disclose only metadata capabilities; unrelated compound content does not expand selection',async()=>{
  const q='Show my counseling appointments, clinical results, PDF reports and student name.';
  const result=await read(dto(),q),body=p(result);assert.equal(body.selection.clinical,true);assert.equal(body.selection.document,true);assert.equal(body.selection.identity,true);
  assert.deepEqual(Object.keys(body.records[0]).sort(),['kind','preferredOn','preferredPeriod','scheduledAt','status']);
  assert.deepEqual(body.capability,{appointmentMetadata:true,identity:false,clinicalContent:false,coordinatorAccess:false,documents:false,write:false});
  const mixed=selectCounselingEvidence('Show my counseling appointments. In my student loan, show my student name.',path);
  assert.equal(mixed?.identity,false);
  assert.equal(selectCounselingEvidence('Show my counseling appointments. Do not include clinical results.',path)?.clinical,false);
  assert.equal(selectCounselingEvidence('Show my counseling appointment history and the clinical notes or psychological diagnosis.',path)?.clinical,true);
  assert.equal(selectCounselingEvidence('Show my counseling appointments and download their report files.',path)?.document,true);
  assert.equal(selectCounselingEvidence('Show my counseling appointments with my student identity and the counselor contact email.',path)?.identity,true);
});

test('raw unsafe routes, forbidden query selectors and malformed input never call a reader',async()=>{
  for(const route of ['https://evil.invalid'+path,path+'?userId='+foreign,path+'?view=queue',path+'#secret','/school-affairs/services/29-1/../29-1/appointments',
    '/school-affairs/services/29-1/%2e%2e/29-1/appointments','//stu.best'+path]){
    assert.equal((await readCounselingEvidence(account(),{question,route},{read:async()=>assert.fail('Invalid route read')})).reason,'invalid_route',route);
  }
  for(const options of [null,[],{question}]){
    const identity=account() as any;identity.user.id={toString(){assert.fail('Do not coerce owner');}};
    const result=await readCounselingEvidence(identity,options as any,{read:async()=>assert.fail('Invalid input read')});assert.ok(['invalid_options','unauthorized'].includes(result.reason!));
  }
  assert.equal((await readCounselingEvidence(account(),{question},{read:null as any})).reason,'invalid_options');
});

test('read errors are sanitized and ignored deadlines remain bounded',async()=>{
  for(const status of [401,403,503]){
    const result=await readCounselingEvidence(account(),{question},{read:async()=>{throw Object.assign(new Error('PRIVATE_INTERNAL_ERROR'),{status});}});
    assert.equal(result.reason,status===503?'read_failed':'access_denied');assert.doesNotMatch(JSON.stringify(result),/PRIVATE_INTERNAL_ERROR/u);
  }
  const started=Date.now(),result=await readCounselingEvidence(account(),{question,deadline:Date.now()+20},{read:async()=>new Promise(()=>{})});
  assert.equal(result.reason,'deadline_exceeded');assert.ok(Date.now()-started<500);
  assert.equal((await readCounselingEvidence(account(),{question,deadline:NaN},{read:async()=>assert.fail()})).reason,'invalid_deadline');
  assert.equal((await readCounselingEvidence(account(),{question,deadline:0},{read:async()=>assert.fail()})).reason,'deadline_exceeded');
});

test('mutable caller credentials and deadline are captured before asynchronous transport',async()=>{
  const original=account(),deadline=Date.now()+3000;
  const promise=readCounselingEvidence(original,{question,deadline},{read:async(caller,query)=>{
    assert.deepEqual(caller,{...account(),requestDeadline:deadline});assert.deepEqual(query,{scope:'counseling-appointments',view:'mine'});return dto();}});
  original.url='https://evil.invalid';original.token='OTHER';original.key='OTHER';original.user.id=foreign;
  assert.equal((await promise).readState,'ok');
});

test('source schema confirms own mine50 contract without granting queue, coordinator or write capabilities',async()=>{
  const sql=await readFile(new URL('../../supabase/migrations/20261115000000_counseling_appointments.sql',import.meta.url),'utf8');
  assert.match(sql,/where r\.user_id=caller/u);assert.match(sql,/limit 50/u);assert.match(sql,/where status in \('requested','scheduled'\)/u);
  assert.match(sql,/status<>'scheduled' or scheduled_at is not null/u);
  const source=await readFile(new URL('../../server/accountCounselingEvidence.js',import.meta.url),'utf8');
  assert.match(source,/view:'mine'/u);assert.doesNotMatch(source,/changeCounseling\(/u);
});
