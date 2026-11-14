import test from 'node:test';
import assert from 'node:assert/strict';
import {readCounselingEvidence,unavailableCounselingEvidence,type CounselingEvidenceResult} from '../../server/accountCounselingEvidence.js';
import {readFeeRemissionEvidence} from '../../server/accountFeeRemissionEvidence.js';
import {formatSupplementalAccountAnswers as format,supplementalAnswerLimits} from '../../server/supplementalAccountAnswers.js';
import {answerLinksSupported,composeEvidenceAnswer,repairEvidenceAnswer,verifyEvidenceAnswer} from '../../server/answerVerificationModel.js';

const owner='29000000-0000-4000-8000-000000000001',route='/school-affairs/services/29-1/appointments';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_KEY',token:'OFFLINE_TOKEN',user:{id:owner}};
const question='Show my saved counseling appointment history.';
const row=(index=1,status='requested',scheduled_at:string|null=null)=>({id:'29000001-0000-4000-8000-'+String(index).padStart(12,'0'),kind:index===3?'assessment':'counseling',
  status,preferred_on:'2026-11-'+String(20+index).padStart(2,'0'),preferred_period:'morning',scheduled_at,version:1,updated_at:'2026-11-18T03:00:00Z'});
const native=(rows=[row(),row(2,'cancelled','2026-10-22T14:00:00+08:00'),row(3,'closed','2026-09-18T01:00:00Z')])=>({userId:owner,available:false,canCoordinate:false,rows});
const read=(value:unknown=native(),q=question)=>readCounselingEvidence(account,{question:q,route},{read:async()=>value});
const content=(source:CounselingEvidenceResult)=>JSON.parse(source.evidence.content);
const change=(source:CounselingEvidenceResult,update:(value:any)=>void)=>{const copy=structuredClone(source),p=content(copy);update(p);copy.evidence.content=JSON.stringify(p);return copy;};

test('own counseling metadata displays safe status/date cards, preserving null and historical scheduled offsets',async()=>{
  const source=await read(),before=structuredClone(source),out=format([source],{question});
  assert.equal(out.status,'answered');assert.equal(out.complete,true);
  assert.match(out.answer,/Preferred date: ` 2026-11-21 `/u);assert.match(out.answer,/Scheduled time: ` not recorded `/u);
  assert.match(out.answer,/Status: ` cancelled `/u);assert.match(out.answer,/Scheduled time: ` 2026-10-22T14:00:00\+08:00 `/u);
  assert.match(out.answer,/preferred date is a request, not a confirmed scheduled time/u);
  assert.match(out.answer,/Cancelled and closed appointments are historical, not active or upcoming/u);
  assert.match(out.views[0].note,/Closed does not prove attendance or treatment/u);
  assert.deepEqual(out.views[0].columns,['Preferred date','Kind','Status','Preferred period','Scheduled time']);
  assert.deepEqual(out.views[0].rows[1],['2026-11-22','counseling','cancelled','morning','2026-10-22T14:00:00+08:00']);
  assert.equal(out.views[0].total,3);assert.deepEqual(out.citations.map(item=>item.url),[route]);
  assert.doesNotMatch(JSON.stringify(out),/OFFLINE_|2900000|canCoordinate|consent_version|user_id|contact_email|version|storage\/v1/u);
  assert.equal(Object.hasOwn(out,'verification'),false);assert.equal(Object.hasOwn(out,'proposedAction'),false);
  assert.equal(answerLinksSupported(out.answer,[source.evidence]),true);assert.deepEqual(source,before);
});

test('successful empty differs from a native50 cap and displayed row omission',async()=>{
  const empty=format([await read(native([]))]);assert.equal(empty.complete,true);assert.match(empty.answer,/no saved appointments in your stu.best account/u);
  const rows=Array.from({length:50},(_,index)=>({...row(index+1,'closed'),preferred_on:'2026-01-'+String(index%28+1).padStart(2,'0')}));
  const source=await read(native(rows)),out=format([source]);assert.equal(content(source).counts.total,null);assert.equal(out.complete,false);
  assert.match(out.answer,/exact total is unknown; at least 50 saved records exist/u);assert.match(out.answer,/Returned records: 50/u);
  assert.doesNotMatch(out.answer,/Saved appointment-record count: 50|exactly 50|complete history contains 50/u);
  assert.equal(out.views[0].total,50);assert.equal(out.views[0].rows.length,12);assert.ok(out.formatting.omittedViewRows>0);
  assert.ok(out.answer.length<=supplementalAnswerLimits.answerCharacters);assert.ok(Buffer.byteLength(JSON.stringify(out))<=supplementalAnswerLimits.resultBytes);
  assert.match(out.answer,/Display excerpt/u);assert.equal(answerLinksSupported(out.answer,[source.evidence]),true);
});

test('failed and malformed reads state unknown history without synthesizing empty appointments',async()=>{
  for(const source of [unavailableCounselingEvidence('read_failed'),unavailableCounselingEvidence('reader_unavailable'),await read({...native(),userId:'29000000-0000-4000-8000-000000000002'})]){
    const out=format([source]);assert.equal(out.status,'answered');assert.equal(out.complete,false);assert.deepEqual(out.views,[]);
    assert.match(out.answer,/record counts and scheduled times remain unknown/u);assert.doesNotMatch(out.answer,/Returned records: 0|Saved appointment-record count:|Preferred date:/u);
    assert.equal(answerLinksSupported(out.answer,[source.evidence]),true);
  }
});

test('clinical, document and identity requests retain metadata and explicitly withhold unsupported details',async()=>{
  for(const [q,flag,pattern]of [
    ['Show my counseling appointment history and the clinical notes or psychological diagnosis.','clinical',/Clinical notes are unavailable/u],
    ['Show my counseling appointments and download their report files.','document',/cannot download or open report files/u],
    ['Show my counseling appointments with my student identity and the counselor contact email.','identity',/Identity fields are not included/u],
  ] as const){
    const source=await read(native(),q),out=format([source],{question:q});assert.equal(content(source).selection[flag],true);
    assert.equal(out.status,'answered');assert.equal(out.complete,false);assert.match(out.answer,pattern);assert.equal(out.views[0].rows.length,3);
    assert.equal(answerLinksSupported(out.answer,[source.evidence]),true);
  }
  const source=await read(),zh=format([source],{language:'zh-TW'});assert.match(zh.answer,/偏好日期: ` 2026-11-21 `/u);assert.match(zh.answer,/不是已確認的安排時間/u);
});

test('foreign, guest, coordinator and write boundaries reveal no data or action',async()=>{
  for(const [q,pattern]of [
    ['Show another student’s counseling appointment history.',/cannot show another student/u],
    ['Show the counseling coordinator queue.',/cannot access coordinator queues/u],
    ['Show the counseling coordinator access roster.',/cannot access coordinator queues/u],
    ['Cancel my counseling appointment.',/cannot change, book, cancel, reschedule or submit/u],
    ['Book a counseling appointment for me.',/No action was performed/u],
  ] as const){
    const source=await readCounselingEvidence(account,{question:q,route},{read:async()=>assert.fail('Denied request must not read')}),out=format([source],{question:q});
    assert.equal(out.status,'answered');assert.equal(out.complete,false);assert.match(out.answer,pattern);assert.deepEqual(out.views,[]);
    assert.doesNotMatch(out.answer,/Preferred date:|2026-11-21/u);assert.equal(Object.hasOwn(out,'proposedAction'),false);
  }
  const guest=await readCounselingEvidence({...account,token:''},{question},{read:async()=>assert.fail('Guest must not read')});
  assert.match(format([guest]).answer,/Sign in to read your own/u);
});

test('strict projected schema rejects identity, impossible state/date arithmetic, access capability and foreign URLs',async()=>{
  const source=await read();
  for(const update of [
    (p:any)=>{p.records[0].id=owner;},(p:any)=>{p.records[0].contact_email='PRIVATE';},(p:any)=>{p.canCoordinate=false;},
    (p:any)=>{p.records[0].clinicalNotes='PRIVATE';},(p:any)=>{p.records[0].status='unknown';},(p:any)=>{p.records[0].kind='medical';},
    (p:any)=>{p.records[0].preferredOn='2026-02-30';},(p:any)=>{p.records[0].scheduledAt='2026-11-21T25:00:00Z';},
    (p:any)=>{p.records[0].scheduledAt='2026-11-21T09:00:00';},(p:any)=>{p.records[0].status='scheduled';},
    (p:any)=>{p.records[1].status='requested';},(p:any)=>{p.records[0].preferredPeriod='evening';},
    (p:any)=>{p.counts.total=null;},(p:any)=>{p.counts.returned=50;},(p:any)=>{p.counts.included=2;},(p:any)=>{p.counts.nativeLimit=100;},
    (p:any)=>{p.counts.totalLowerBound=4;},(p:any)=>{p.counts.truncationPossible=true;},(p:any)=>{p.counts.omitted=1;},
    (p:any)=>{p.selection.reason='restricted_view';},(p:any)=>{p.selection.operation=true;},(p:any)=>{p.capability.write=true;},
    (p:any)=>{p.provenance.synchronized=true;},(p:any)=>{p.complete=false;},
  ])assert.throws(()=>format([change(source,update)]),TypeError);
  for(const url of ['/school-affairs/services/29-1/queue',route+'?owner='+owner,route+'/private.pdf','https://stu.best'+route]){
    const bad=structuredClone(source);bad.evidence.url=url;bad.evidence.urls=[url];assert.throws(()=>format([bad]),TypeError);
  }
  assert.throws(()=>format([change(unavailableCounselingEvidence('read_failed'),p=>{p.counts.total=0;})]),TypeError);
});

test('forged incomplete envelope requires explicit whole-row omission and never invents total knowledge',async()=>{
  const source=await read(),partial=change(source,p=>{p.records=p.records.slice(0,1);p.readState='partial';p.reason='excerpted';p.counts.included=1;p.counts.omitted=2;p.complete=false;});
  partial.readState='partial';partial.reason='excerpted';const out=format([partial]);
  assert.equal(out.complete,false);assert.match(out.answer,/Whole appointment records were omitted/u);assert.equal(out.views[0].total,1);
  assert.doesNotMatch(out.answer,/2026-10-22/u);
});

test('pure formatter retains separate successful source when counseling fails and performs no I/O',async()=>{
  const fee=await readFeeRemissionEvidence(account,{question:'Show my fee remission.'},{load:async()=>({userId:owner,records:[{id:'29000001-0000-4000-8000-000000000099',version:1,row_order:0,academic_year_text:'115',semester_text:'1',student_number:'PRIVATE_NUMBER',category_text:'QA Fee',amount_text:'0.00',check_status_text:'Saved',notes_text:null}]})});
  const oldFetch=globalThis.fetch;globalThis.fetch=async()=>assert.fail('Formatter must perform no I/O');
  try{const out=format([unavailableCounselingEvidence('read_failed'),fee]);assert.deepEqual(out.sourceIds,['account:counselingAppointments','account:feeRemission']);
    assert.match(out.answer,/Amount: ` 0\.00 `/u);assert.match(out.answer,/scheduled times remain unknown/u);assert.equal(out.complete,false);assert.doesNotMatch(JSON.stringify(out),/PRIVATE_NUMBER/u);
  }finally{globalThis.fetch=oldFetch;}
});

test('compose, repair and independent verification receive appointment metadata policy and cannot cite missing clinical fields',async()=>{
  const source=await read(),evidence=[source.evidence],oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY,requests:any[]=[];
  const answer='Your saved local appointment has preferredOn 2026-11-21, requested status and no recorded scheduled time. That preference is not a confirmed booking.';
  const generated={status:'answered',answer,sourceIds:['account:counselingAppointments']};
  const replies:any[]=[generated,generated,{supported:true,answersQuestion:true,claims:[{claim:answer,supported:true,evidenceId:'account:counselingAppointments',quotes:[],
    jsonPaths:['/records/0/preferredOn','/records/0/status','/records/0/scheduledAt','/provenance/sourceMode','/rules']}]}];
  process.env.OPENAI_API_KEY='offline-synthetic';globalThis.fetch=async(_input,init)=>{requests.push(JSON.parse(String(init?.body)));assert.ok(replies.length);
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(replies.shift())}]}]});};
  try{
    const context={question,evidence,deadline:Date.now()+5000},first=await composeEvidenceAnswer(context),candidate=await repairEvidenceAnswer({...context,candidate:first,feedback:['Keep preferred and scheduled dates separate.']});
    assert.equal((await verifyEvidenceAnswer({...context,candidate})).ok,true);assert.equal(requests.length,3);
    for(const request of requests){assert.match(request.instructions,/account:counselingAppointments/u);assert.match(request.instructions,/Exactly 50 returned rows/u);assert.match(request.instructions,/checkedAt/u);assert.doesNotMatch(JSON.stringify(request),/OFFLINE_TOKEN|2900000/u);}
    replies.push({supported:true,answersQuestion:true,claims:[{claim:'Your diagnosis is depression.',supported:true,evidenceId:'account:counselingAppointments',quotes:[],jsonPaths:['/records/0/diagnosis']}]});
    assert.equal((await verifyEvidenceAnswer({...context,candidate:{...candidate,answer:'Your diagnosis is depression.'}})).ok,false);
    assert.equal(answerLinksSupported('Open [report](https://private.invalid/report.pdf)',evidence),false);
  }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
});
